/**
 * A Victory fan chart: `<VictoryArea>` bands drawn between `y0` and `y`, and a
 * `<VictoryLine>` median, each named by its own `name` prop. Rendered by the
 * real Victory components, then extracted, tagged and folded the way
 * `useVictoryAdapter` does on mount.
 */

import type { PercentileBandOption } from '@adapters/shared/percentileBandOption';
import type { Maidr, MaidrLayer, PercentileBandPoint } from '@type/grammar';
import type { ReactElement } from 'react';
import { extractVictoryLayers, foldPercentileBands, toMaidrLayer } from '@adapters/victory/converters';
import { tagLayerElements } from '@adapters/victory/selectors';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VictoryArea, VictoryChart, VictoryLine } from 'victory';
import { withPageDocument } from '../d3/pageDocument';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

const ROWS = [0, 1, 2].map(step => ({ step, p50: step, p5: step - 2, p95: step + 2, p25: step - 1, p75: step + 1 }));

function fan(outer: object = { y0: 'p5', y: 'p95' }): ReactElement {
  return createElement(
    VictoryChart,
    null,
    createElement(VictoryArea, { name: 'p90', data: ROWS, x: 'step', ...outer }),
    createElement(VictoryArea, { name: 'p50', data: ROWS, x: 'step', y0: 'p25', y: 'p75' }),
    createElement(VictoryLine, { name: 'median', data: ROWS, x: 'step', y: 'p50' }),
  );
}

const BANDS: PercentileBandOption[] = [{
  median: 'median',
  bands: [
    { series: 'p50', lower: 0.25, upper: 0.75 },
    { series: 'p90', lower: 0.05, upper: 0.95 },
  ],
}];

function render(children: ReactElement, option?: PercentileBandOption[]): { doc: Document; layers: MaidrLayer[] } {
  const dom = new JSDOM(`<!doctype html><body><div id="mv">${renderToStaticMarkup(children)}</div></body>`);
  const doc = dom.window.document as unknown as Document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  const claimed = new Set<Element>();
  const infos = extractVictoryLayers(children);
  const layers = infos.map((layer, index) => toMaidrLayer(layer, tagLayerElements(svg, layer, index, claimed, '#mv ')));
  return { doc, layers: foldPercentileBands(infos, layers, option) };
}

describe('victory percentile band', () => {
  it('reads a declared fan from each area\'s y0 and y and the median line', () => {
    const { layers } = render(fan(), BANDS);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PERCENTILE_BAND);
    expect((layers[0].data as PercentileBandPoint[])[1]).toEqual({
      x: 1,
      quantiles: [
        { level: 0.05, value: -1 },
        { level: 0.25, value: 0 },
        { level: 0.5, value: 1 },
        { level: 0.75, value: 2 },
        { level: 0.95, value: 3 },
      ],
    });
  });

  it('outlines each band\'s path, outermost first, then the median\'s', () => {
    const { doc, layers } = render(fan(), BANDS);
    const maidr: Maidr = { id: 'fan', subplots: [[{ layers }]] };
    const [outer, inner, median] = (layers[0].selectors as string[]).map(selector => doc.querySelectorAll(selector));

    expect([outer.length, inner.length, median.length]).toEqual([1, 1, 1]);
    withPageDocument(doc.body, () => {
      const figure = new Figure(maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      const trace = figure.subplots[0][0].traces[0][0] as unknown as {
        highlightValues: SVGElement[][][] | null;
      };
      const outlined = trace.highlightValues?.map(row => (row[0] as unknown as SVGElement[])[0]);

      // Levels 0.05, 0.25, 0.5, 0.75 and 0.95.
      expect(outlined).toEqual([outer[0], inner[0], median[0], inner[0], outer[0]]);
    });
  });

  it('reads the components as before when no fan is declared', () => {
    const { layers } = render(fan());

    expect(layers.map(layer => layer.type)).toEqual([TraceType.AREA, TraceType.AREA, TraceType.LINE]);
  });

  it('leaves out a band drawn down to the baseline, and says so', () => {
    const { layers } = render(fan({ y: 'p95' }), BANDS);

    const band = layers.find(layer => layer.type === TraceType.PERCENTILE_BAND);
    expect((band?.data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.25, 0.5, 0.75]);
    expect(layers.map(layer => layer.type)).toContain(TraceType.AREA);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"p90" as a band of "median", which is drawn down to the baseline'));
  });

  it('reads the chart as before when the median names no line', () => {
    const { layers } = render(fan(), [{ median: 'mean', bands: BANDS[0].bands }]);

    expect(layers.map(layer => layer.type)).toEqual([TraceType.AREA, TraceType.AREA, TraceType.LINE]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "mean" as the median'));
  });
});

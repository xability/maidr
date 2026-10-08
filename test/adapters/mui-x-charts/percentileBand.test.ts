/**
 * An MUI X fan chart: each band a hidden base series and an `area` series
 * stacked on it, whose fill MUI draws between the two, and a plain median
 * line. Rendered by the real `<LineChart>`, then converted the way
 * `useMuiChartsAdapter` does on mount.
 */

import type { PercentileBandOption } from '@adapters/shared/percentileBandOption';
import type { Maidr, MaidrLayer, PercentileBandPoint } from '@type/grammar';
import type { ReactElement } from 'react';
import { convertMuiChartsToMaidr, findMuiChartElement } from '@adapters/mui-x-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { LineChart } from '@mui/x-charts/LineChart';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { withPageDocument } from '../d3/pageDocument';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

const MEDIAN = [0, 1, 2];

/** One band as a base series and an area of its width stacked on it. */
function band(id: string, halfWidth: number, area = true): object[] {
  return [
    { id: `${id}-base`, data: MEDIAN.map(m => m - halfWidth), stack: id, showMark: false },
    { id, data: MEDIAN.map(() => 2 * halfWidth), stack: id, area, showMark: false },
  ];
}

function fan(series: object[] = [...band('p90', 2), ...band('p50', 1), { id: 'median', label: 'Median', data: MEDIAN }]): ReactElement {
  return createElement(LineChart, {
    width: 400,
    height: 300,
    skipAnimation: true,
    xAxis: [{ data: [0, 1, 2], label: 'Step' }],
    series,
  });
}

const BANDS: PercentileBandOption[] = [{
  median: 'median',
  bands: [
    { series: 'p50', lower: 0.25, upper: 0.75 },
    { series: 'p90', lower: 0.05, upper: 0.95 },
  ],
}];

function render(chart: ReactElement, option?: PercentileBandOption[]): { doc: Document; maidr: Maidr; layers: MaidrLayer[] } {
  const dom = new JSDOM(`<!doctype html><body><div id="mui">${renderToStaticMarkup(chart)}</div></body>`);
  const doc = dom.window.document as unknown as Document;
  const found = findMuiChartElement(chart);
  const maidr = convertMuiChartsToMaidr({ id: 'c' }, found?.kind, found?.props, '#mui ', option);
  return { doc, maidr, layers: maidr.subplots[0][0].layers };
}

describe('mui percentile band', () => {
  it('reads a declared fan from each stack\'s edges and the median line', () => {
    const { layers } = render(fan(), BANDS);

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PERCENTILE_BAND);
    expect(layers[0].title).toBe('Median');
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

  it('outlines each band\'s fill, outermost first, then the median\'s line', () => {
    const { doc, maidr, layers } = render(fan(), BANDS);
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

  it('reads the stacks as before when no fan is declared', () => {
    const { layers } = render(fan());

    expect(layers.map(layer => layer.type)).toEqual([TraceType.STACKED_AREA, TraceType.STACKED_AREA, TraceType.LINE]);
  });

  it('leaves out a band that is not filled, and says so', () => {
    const { layers } = render(fan([...band('p90', 2, false), ...band('p50', 1), { id: 'median', data: MEDIAN }]), BANDS);

    const read = layers.find(layer => layer.type === TraceType.PERCENTILE_BAND);
    expect((read?.data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.25, 0.5, 0.75]);
    expect(layers.map(layer => layer.type)).toContain(TraceType.STACKED_AREA);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"p90" as a band of "median", which is not drawn with area: true'));
  });

  it('reads the chart as before when the median names no series', () => {
    const { layers } = render(fan(), [{ median: 'mean', bands: BANDS[0].bands }]);

    expect(layers.map(layer => layer.type)).not.toContain(TraceType.PERCENTILE_BAND);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "mean" as the median'));
  });
});

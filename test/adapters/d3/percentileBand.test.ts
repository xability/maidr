import type { PercentileBandPoint } from '@type/grammar';
import { bindD3PercentileBand } from '@adapters/d3/binders/percentileBand';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROWS = [0, 1, 2].map(step => ({
  step,
  p50: step,
  p5: step - 2,
  p95: step + 2,
  p25: step - 1,
  p75: step + 1,
}));

/**
 * The two band areas, outermost drawn first, then the median line -- each a
 * `<path>` whose datum is the rows, as `.datum(rows).attr('d', area)` leaves it.
 */
function buildSvg(bandRows: unknown[] = ROWS): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="fan-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const [cls, rows] of [['band-90', ROWS], ['band-50', bandRows], ['median', ROWS]] as const) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', cls);
    path.setAttribute('d', 'M0,0L10,10');
    (path as unknown as { __data__: unknown }).__data__ = rows;
    svg.appendChild(path);
  }
  return svg;
}

const CONFIG = {
  selector: 'path.median',
  x: 'step',
  y: 'p50',
  bands: [
    { selector: 'path.band-50', lower: 0.25, upper: 0.75, y0: 'p25', y1: 'p75' },
    { selector: 'path.band-90', lower: 0.05, upper: 0.95, y0: 'p5', y1: 'p95' },
  ],
};

describe('bindD3PercentileBand', () => {
  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('reads the median and each band at its declared levels', () => {
    const result = bindD3PercentileBand(buildSvg(), CONFIG);

    expect(result.layer.type).toBe(TraceType.PERCENTILE_BAND);
    expect((result.layer.data as PercentileBandPoint[])[1]).toEqual({
      x: 1,
      quantiles: [
        { level: 0.5, value: 1 },
        { level: 0.05, value: -1 },
        { level: 0.95, value: 3 },
        { level: 0.25, value: 0 },
        { level: 0.75, value: 2 },
      ],
    });
  });

  test('names each band, outermost first, then the median -- and the trace outlines them so', () => {
    const svg = buildSvg();
    const result = bindD3PercentileBand(svg, CONFIG);

    expect(result.layer.selectors).toEqual([
      '#fan-svg path.band-90',
      '#fan-svg path.band-50',
      '#fan-svg path.median',
    ]);
    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      const trace = figure.subplots[0][0].traces[0][0] as unknown as {
        highlightValues: SVGElement[][][] | null;
      };
      const outlined = trace.highlightValues?.map(row => (row[0] as unknown as SVGElement[])[0].getAttribute('class'));

      // Levels 0.05, 0.25, 0.5, 0.75 and 0.95.
      expect(outlined).toEqual(['band-90', 'band-50', 'median', 'band-50', 'band-90']);
    });
  });

  test('leaves a gap where a band draws nothing at the median\'s position', () => {
    const result = bindD3PercentileBand(buildSvg(ROWS.slice(1)), CONFIG);

    const first = (result.layer.data as PercentileBandPoint[])[0].quantiles;
    expect(first.filter(q => q.level === 0.25 || q.level === 0.75).map(q => q.value)).toEqual([null, null]);
  });

  test('reads the median alone when the bands do not nest', () => {
    const result = bindD3PercentileBand(buildSvg(), {
      ...CONFIG,
      bands: [
        { ...CONFIG.bands[0], upper: 0.95 },
        { ...CONFIG.bands[1], upper: 0.75 },
      ],
    });

    expect((result.layer.data as PercentileBandPoint[])[0].quantiles).toEqual([{ level: 0.5, value: 0 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('do not nest'));
  });

  test('emits no selectors when one names more than its own path', () => {
    const result = bindD3PercentileBand(buildSvg(), {
      ...CONFIG,
      bands: [{ ...CONFIG.bands[1], selector: 'path[class^="band"]' }],
    });

    expect(result.layer.selectors).toBeUndefined();
  });
});

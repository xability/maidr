import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One age band: the label, then the two sides as the chart draws them. */
type PyramidRow = [string, number, number];

/**
 * A population pyramid. The left-hand series arrives NEGATED, which is how
 * Google draws it and what makes the chart diverge — the sign is the side.
 */
const ROWS: PyramidRow[] = [
  ['0-14', -2_100_000, 2_000_000],
  ['15-64', -4_300_000, 4_400_000],
  ['65+', -900_000, 1_300_000],
];

function makePyramidDataTable(): GoogleDataTable {
  const labels = ['Age band', 'Men', 'Women'];
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => ROWS[r][c],
    getFormattedValue: (r, c) => String(ROWS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/** Where the fake layout puts the bar of `series` for row `row`. */
function barBox(series: number, row: number): GoogleBoundingBox {
  return { left: series * 200, top: 20 + row * 40, width: 80, height: 24 };
}

const PYRAMID_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => ({
    getBoundingBox: (id) => {
      const match = /^bar#(\d+)#(\d+)$/.exec(id);
      return match ? barBox(Number(match[1]), Number(match[2])) : null;
    },
    getXLocation: value => Number(value),
    getYLocation: value => Number(value),
  }),
};

/** Builds a rendered pyramid: Google draws all of series 0, then series 1. */
function makePyramidContainer(): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="pyramid"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('pyramid') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let series = 0; series < 2; series++) {
    for (let row = 0; row < ROWS.length; row++) {
      const box = barBox(series, row);
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', `${box.left}`);
      rect.setAttribute('y', `${box.top}`);
      rect.setAttribute('width', `${box.width}`);
      rect.setAttribute('height', `${box.height}`);
      svg.appendChild(rect);
    }
  }

  return container;
}

describe('createMaidrFromGoogleChart with a DivergingBarChart', () => {
  it('keeps the sign, because the sign is which side the bar grows towards', () => {
    const container = makePyramidContainer();

    const maidr = createMaidrFromGoogleChart(
      PYRAMID_CHART,
      makePyramidDataTable(),
      container,
      { chartType: 'DivergingBarChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // Stripped to magnitudes, a pyramid would draw both halves on the right;
    // DivergingTrace pitches the size and announces the side itself.
    expect(layer.data).toEqual([
      [
        { x: '0-14', y: -2_100_000, z: 'Men' },
        { x: '15-64', y: -4_300_000, z: 'Men' },
        { x: '65+', y: -900_000, z: 'Men' },
      ],
      [
        { x: '0-14', y: 2_000_000, z: 'Women' },
        { x: '15-64', y: 4_400_000, z: 'Women' },
        { x: '65+', y: 1_300_000, z: 'Women' },
      ],
    ]);
  });

  it('marks the two sides series-first, which is the order Google draws them', () => {
    const container = makePyramidContainer();

    const maidr = createMaidrFromGoogleChart(
      PYRAMID_CHART,
      makePyramidDataTable(),
      container,
      { chartType: 'DivergingBarChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    // Row-major: DivergingTrace reads the flat element list series by series,
    // so the hint has to say so or every highlight lands one bar out.
    expect(layer.domMapping).toEqual({ order: 'row' });

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(2 * ROWS.length);
  });

  it('reads a vertical Likert split through the same path', () => {
    const container = makePyramidContainer();

    const maidr = createMaidrFromGoogleChart(
      PYRAMID_CHART,
      makePyramidDataTable(),
      container,
      { chartType: 'DivergingColumnChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBe(Orientation.VERTICAL);
  });
});

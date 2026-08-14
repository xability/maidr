import type { GoogleChart, GoogleDataTable, GoogleGaugeOptions } from '@adapters/google-charts/types';
import type { GaugePoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One dial: what it measures and where its needle sits. */
type DialRow = [string, number];

/** Google's own gauge example: three dials in one container. */
const DIALS: DialRow[] = [
  ['Memory', 80],
  ['CPU', 55],
  ['Network', 68],
];

function makeGaugeDataTable(rows: DialRow[] = DIALS): GoogleDataTable {
  const labels = ['Label', 'Value'];
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * The gauge package exposes no layout interface, so the adapter must never ask
 * for one — this fake fails loudly if it does.
 */
const GAUGE_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a Gauge has no chart layout interface');
  },
};

/** Builds a rendered gauge: one dial face `<circle>` per measure. */
function makeGaugeContainer(faceCount: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="gauge"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('gauge') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let dial = 0; dial < faceCount; dial++) {
    const face = doc.createElementNS(SVG_NS, 'circle');
    face.setAttribute('cx', `${60 + dial * 140}`);
    face.setAttribute('cy', '60');
    face.setAttribute('r', '55');
    svg.appendChild(face);
  }

  return container;
}

/** The commonest gauge configuration there is: warning bands at the top only. */
const WARNING_BANDS: GoogleGaugeOptions = {
  redFrom: 90,
  redTo: 100,
  yellowFrom: 75,
  yellowTo: 90,
};

// The mismatch case warns on purpose; installing the spy per test would let it
// print on every run instead.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a Gauge', () => {
  it('draws one layer per dial, because a GaugePoint is one measure', () => {
    const container = makeGaugeContainer(DIALS.length);

    const maidr = createMaidrFromGoogleChart(
      GAUGE_CHART,
      makeGaugeDataTable(),
      container,
      { chartType: 'Gauge', gaugeOptions: WARNING_BANDS },
    );

    const layers = maidr.subplots[0][0].layers;
    expect(layers).toHaveLength(DIALS.length);
    expect(layers.every(layer => layer.type === TraceType.GAUGE)).toBe(true);
    // Every dial is a gauge, so only the measure's own name can tell two of
    // them apart on a layer switch.
    expect(layers.map(layer => layer.name)).toEqual(['Memory', 'CPU', 'Network']);
    expect(layers[1].data).toEqual({
      value: 55,
      min: 0,
      max: 100,
      label: 'CPU',
      bands: [
        // Filled in: Google's spans leave the bottom of this dial uncoloured,
        // and without it a value of 12 would be reported as yellow.
        { to: 75, label: 'unbanded' },
        { to: 90, label: 'yellow' },
        { to: 100, label: 'red' },
      ],
    });
  });

  it('falls back to Google\'s own 0-to-100 dial when given no options', () => {
    const container = makeGaugeContainer(1);

    const maidr = createMaidrFromGoogleChart(
      GAUGE_CHART,
      makeGaugeDataTable([['Memory', 80]]),
      container,
      { chartType: 'Gauge' },
    );

    const data = maidr.subplots[0][0].layers[0].data as GaugePoint;
    expect(data.min).toBe(0);
    expect(data.max).toBe(100);
    // No bands were declared, so none are invented.
    expect(data.bands).toBeUndefined();
  });

  it('carries a dial whose bands already cover it through unchanged', () => {
    const container = makeGaugeContainer(1);

    const maidr = createMaidrFromGoogleChart(
      GAUGE_CHART,
      makeGaugeDataTable([['Load', 3]]),
      container,
      {
        chartType: 'Gauge',
        gaugeOptions: {
          min: 0,
          max: 10,
          greenFrom: 0,
          greenTo: 6,
          yellowFrom: 6,
          yellowTo: 8,
          redFrom: 8,
          redTo: 10,
        },
      },
    );

    const data = maidr.subplots[0][0].layers[0].data as GaugePoint;
    expect(data).toEqual({
      value: 3,
      min: 0,
      max: 10,
      label: 'Load',
      bands: [
        { to: 6, label: 'green' },
        { to: 8, label: 'yellow' },
        { to: 10, label: 'red' },
      ],
    });
  });

  it('gives each dial a selector of its own, in row order', () => {
    const container = makeGaugeContainer(DIALS.length);

    const maidr = createMaidrFromGoogleChart(
      GAUGE_CHART,
      makeGaugeDataTable(),
      container,
      { chartType: 'Gauge' },
    );

    const layers = maidr.subplots[0][0].layers;
    const marked = layers.map(layer =>
      container.ownerDocument.querySelector(String(layer.selectors)));
    expect(marked.map(face => face?.getAttribute('cx'))).toEqual(['60', '200', '340']);
  });

  it('drops the selectors when the drawn dials cannot be counted off', () => {
    // A gauge drawing a needle hub as a second circle would otherwise have
    // every dial matched to the wrong measure.
    const container = makeGaugeContainer(2 * DIALS.length);

    const maidr = createMaidrFromGoogleChart(
      GAUGE_CHART,
      makeGaugeDataTable(),
      container,
      { chartType: 'Gauge' },
    );

    const layers = maidr.subplots[0][0].layers;
    expect(layers.every(layer => layer.selectors === undefined)).toBe(true);
    expect(container.querySelectorAll('[data-maidr-dial]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Gauge dial count mismatch'),
    );
  });
});

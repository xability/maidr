import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { PercentileBandOption } from '@adapters/shared/percentileBandOption';
import type { MaidrLayer, PercentileBandPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from '../d3/pageDocument';

/**
 * A fan chart as a Google `LineChart` draws one: a median column and four
 * `role: 'interval'` columns, the 5th, 25th, 75th and 95th percentiles, which
 * Google pairs first-with-last and second-with-second-last. `PLOT` is the
 * clipped plot group Google Charts 51 drew for that table with
 * `intervals: {style: 'area'}`, captured in Chromium (its gridlines removed):
 * one filled path per pair, in pair order, then the median's line.
 */

const PLOT = '<g clip-path="url(#_ABSTRACT_RENDERER_ID_1)"><g><!-- gridlines --></g><g><g><path d="M177.5,185.125L301.5,154.375L424.5,123.625L424.5,262L301.5,292.75L177.5,323.5" stroke="none" stroke-width="0" fill-opacity="0.3" fill="#264d99"></path></g><g><path d="M177.5,231.25L301.5,200.5L424.5,169.75L424.5,231.25L301.5,262L177.5,292.75" stroke="none" stroke-width="0" fill-opacity="0.3" fill="#264d99"></path></g></g><g><rect x="177" y="77" width="1" height="247" stroke="none" stroke-width="0" fill="#333333"></rect><rect x="115" y="262" width="371" height="1" stroke="none" stroke-width="0" fill="#333333"></rect></g><g><g></g><g></g><g></g></g><g><path d="M177.16666666666666,262L300.5,231.25L423.8333333333333,200.5" stroke="#3366cc" stroke-width="2" fill-opacity="1" fill="none"></path></g></g>';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

interface Column {
  label: string;
  role?: string;
  id?: string;
}

const COLUMNS: Column[] = [
  { label: 'Step' },
  { label: 'Median', id: 'median' },
  { label: '', role: 'interval', id: 'p90' },
  { label: '', role: 'interval', id: 'p50' },
  { label: '', role: 'interval', id: 'p50' },
  { label: '', role: 'interval', id: 'p90' },
];

const ROWS = [
  [0, 0, -2, -1, 1, 2.5],
  [1, 1, -1, 0, 2, 3.5],
  [2, 2, 0, 1, 3, 4.5],
];

function makeTable(columns: Column[] = COLUMNS): GoogleDataTable {
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => columns.length,
    getValue: (r, c) => ROWS[r][c],
    getFormattedValue: (r, c) => String(ROWS[r][c]),
    getColumnLabel: c => columns[c].label,
    getColumnType: () => 'number',
    getColumnRole: c => columns[c].role ?? '',
    getColumnId: c => columns[c].id ?? '',
  };
}

const CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
};

function makeContainer(plot = PLOT): HTMLElement {
  const dom = new JSDOM(`<!doctype html><body><div id="fan"><svg width="600" height="400">${plot}</svg></div></body>`);
  return dom.window.document.getElementById('fan') as HTMLElement;
}

const BANDS: PercentileBandOption[] = [{
  median: 'median',
  bands: [
    { series: 'p50', lower: 0.25, upper: 0.75 },
    { series: 'p90', lower: 0.05, upper: 0.95 },
  ],
}];

function layerOf(percentileBands?: PercentileBandOption[], container = makeContainer(), columns = COLUMNS): MaidrLayer {
  return createMaidrFromGoogleChart(CHART, makeTable(columns), container, {
    chartType: 'LineChart',
    percentileBands,
  }).subplots[0][0].layers[0];
}

describe('createMaidrFromGoogleChart with a declared fan chart', () => {
  it('reads each interval pair Google draws as a band at its declared levels', () => {
    const layer = layerOf(BANDS);

    expect(layer.type).toBe(TraceType.PERCENTILE_BAND);
    expect(layer.title).toBe('Median');
    expect((layer.data as PercentileBandPoint[])[1]).toEqual({
      x: '1',
      quantiles: [
        { level: 0.05, value: -1 },
        { level: 0.25, value: 0 },
        { level: 0.5, value: 1 },
        { level: 0.75, value: 2 },
        { level: 0.95, value: 3.5 },
      ],
    });
  });

  it('outlines each band\'s filled path, outermost first, then the median', () => {
    const container = makeContainer();
    const maidr = createMaidrFromGoogleChart(CHART, makeTable(), container, {
      chartType: 'LineChart',
      percentileBands: BANDS,
    });

    withPageDocument(container, () => {
      const figure = new Figure(maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      const trace = figure.subplots[0][0].traces[0][0] as unknown as {
        highlightValues: SVGElement[][][] | null;
      };
      const paths = Array.from(container.querySelectorAll('g[clip-path] path'));
      const outlined = trace.highlightValues?.map(row => paths.indexOf((row[0] as unknown as SVGElement[])[0]));

      // Levels 0.05, 0.25, 0.5, 0.75 and 0.95: the first pair's area, the
      // second's, the line, the second's and the first's.
      expect(outlined).toEqual([0, 1, 2, 1, 0]);
    });
  });

  it('emits no selectors when the intervals are not drawn as areas', () => {
    // The default `'sticks'` style, as Google drew the first row: a stick
    // spanning the outer pair and a tick per interval column.
    const sticks = '<g clip-path="url(#c)"><g>'
      + '<path d="M177,185.125L177,323.5" fill="#264d99"></path><path d="M168,323.5L187,323.5" fill="#264d99"></path>'
      + '<path d="M173,292.75L181,292.75" fill="#264d99"></path><path d="M173,231.25L181,231.25" fill="#264d99"></path>'
      + '<path d="M168,185.125L187,185.125" fill="#264d99"></path>'
      + '</g><g><path d="M177.17,262L300.5,231.25L423.83,200.5" fill="none"></path></g></g>';

    const layer = layerOf(BANDS, makeContainer(sticks));

    expect(layer.type).toBe(TraceType.PERCENTILE_BAND);
    expect(layer.selectors).toBeUndefined();
  });

  it('reads the intervals as error bars, as before, when no fan is declared', () => {
    expect(layerOf().type).toBe(TraceType.ERROR_BAR);
  });

  it('refuses a band whose columns Google does not draw as one pair', () => {
    const crossed: Column[] = COLUMNS.map((column, c) => (c === 3 ? { ...column, id: 'p90' } : c === 5 ? { ...column, id: 'p50' } : column));

    const layer = layerOf([{ median: 'median', bands: [{ series: 'p90', lower: 0.05, upper: 0.95 }] }], makeContainer(), crossed);

    expect((layer.data as PercentileBandPoint[])[0].quantiles.map(q => q.level)).toEqual([0.5]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('it pairs the first interval column with the last'));
  });

  it('reads the chart as before when the median names no column', () => {
    const layer = layerOf([{ median: 'mean', bands: [{ series: 'p90', lower: 0.05, upper: 0.95 }] }]);

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "mean" as the median'));
  });
});

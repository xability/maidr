/**
 * A horizontal Google Charts bar chart had nothing to pitch (#955).
 *
 * `buildBarLayer` and `buildSegmentedLayer` both take an `orientation`, pass
 * it straight into the emitted layer, and built their points `x = category`
 * regardless. A `horz` bar layer is read the other way round — `BarTrace`
 * takes its magnitude from `x` — so the key and the payload contradicted each
 * other and `toBarValue('Apples')` answered `NaN`. `NaN` is how a deliberate
 * gap travels, which is why nothing raised: the chart loaded, navigated and
 * highlighted, and every bar was silent.
 *
 * That covered `BarChart` — the plain horizontal bar chart — along with the
 * stacked, dodged, diverging and funnel variants. Every `Column` variant was
 * unaffected, which is why the vertical cases are pinned here too.
 *
 * The assertions run the emitted layer through the real trace rather than
 * stopping at the payload, because the payload is what looked right before:
 * the defect only shows up once something reads it.
 *
 * The last describe covers the same two builders' `axes` block (#961), which
 * has the same character: nothing about it looks wrong until something reads
 * it aloud.
 */
import type { GoogleChart, GoogleChartType, GoogleDataTable } from '@adapters/google-charts/types';
import type { MaidrLayer } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation } from '@type/grammar';
import { JSDOM } from 'jsdom';

/** Categories that cannot be mistaken for numbers, and values that can. */
const ROWS: [string, number][] = [['Apples', 30], ['Bananas', 70], ['Cherries', 50]];

// The layer under test warns on purpose when it is wrong, so the spy is
// installed once and cleared per test rather than re-installed.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

/** A two-column table: one category column, one value column. */
function table(): GoogleDataTable {
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => 2,
    getValue: (r, c) => ROWS[r][c],
    getFormattedValue: (r, c) => String(ROWS[r][c]),
    getColumnLabel: c => (c === 0 ? 'Fruit' : 'Sales'),
    getColumnType: c => (c === 0 ? 'string' : 'number'),
    getColumnRole: () => '',
  };
}

const chart: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => ({
    getBoundingBox: () => null,
    getXLocation: value => Number(value),
    getYLocation: value => Number(value),
  }),
};

/** A container the layout interface reports nothing for, so no marking runs. */
function container(): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="c"><svg></svg></div></body>');
  return dom.window.document.getElementById('c') as HTMLElement;
}

/**
 * The layer a declared chart type converts to.
 * @param chartType - The type the caller declared
 * @returns The single emitted layer
 */
function layerFor(chartType: string): MaidrLayer {
  const maidr = createMaidrFromGoogleChart(
    chart,
    table(),
    container(),
    { chartType: chartType as GoogleChartType },
  );
  return maidr.subplots[0][0].layers[0];
}

/**
 * What the core makes of a layer at its first bar.
 * @param layer - The emitted layer
 * @returns The magnitude it would pitch, and anything it warned about
 */
function readFirstBar(layer: MaidrLayer): { magnitude: unknown; warnings: string[] } {
  const trace = TraceFactory.create(layer);
  const state = (trace as unknown as { state: { audio: { freq: { raw: unknown } } } }).state;
  return {
    magnitude: state.audio.freq.raw,
    warnings: warnSpy.mock.calls.map(call => String(call[0])),
  };
}

describe('a horizontal google charts bar layer', () => {
  it.each([
    'BarChart',
    'StackedBarChart',
    'DodgedBarChart',
    'DivergingBarChart',
  ])('%s has a magnitude to pitch at its first bar', (chartType) => {
    // Before the fix each of these answered `null` — the whole layer silent.
    const { magnitude, warnings } = readFirstBar(layerFor(chartType));

    expect(magnitude).toBe(30);
    expect(warnings).toEqual([]);
  });

  it('puts the value in x and the category in y', () => {
    expect(layerFor('BarChart').data).toEqual([
      { x: 30, y: 'Apples' },
      { x: 70, y: 'Bananas' },
      { x: 50, y: 'Cherries' },
    ]);
  });

  it('keeps the series label through the swap', () => {
    // The stacked point carries `z` as well, and it is what tells two series
    // apart — a swap that rebuilt the point without it would drop the band.
    const [series] = layerFor('StackedBarChart').data as { z: string }[][];

    expect(series[0]).toEqual({ x: 30, y: 'Apples', z: 'Sales' });
  });

  it('moves the axis labels with the payload', () => {
    // `BarTrace.text` announces each value under the label of the axis it sits
    // on, so labels left behind would report a fruit as a number of sales.
    expect(layerFor('BarChart').axes).toEqual({
      x: { label: 'Sales' },
      y: { label: 'Fruit' },
    });
  });

  it('still declares which way round it is', () => {
    expect(layerFor('BarChart').orientation).toBe(Orientation.HORIZONTAL);
  });
});

describe('a vertical google charts bar layer is untouched', () => {
  it.each([
    'ColumnChart',
    'StackedColumnChart',
    'DodgedColumnChart',
    'DivergingColumnChart',
  ])('%s reads as it always did', (chartType) => {
    const layer = layerFor(chartType);
    const { magnitude, warnings } = readFirstBar(layer);

    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(magnitude).toBe(30);
    expect(warnings).toEqual([]);
  });

  it('keeps its category on x and its labels where they were', () => {
    const layer = layerFor('ColumnChart');

    expect(layer.data).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 70 },
      { x: 'Cherries', y: 50 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Fruit' }, y: { label: 'Sales' } });
  });
});

describe('a stacked layer names its value and its band differently', () => {
  /**
   * What the trace would announce at the first bar of a stack.
   * @param chartType - The declared chart type
   * @returns The value's label and the band's label
   */
  function labels(chartType: string): { value: unknown; band: unknown } {
    const trace = TraceFactory.create(layerFor(chartType));
    const state = (trace as unknown as {
      state: { text: { cross: { label: unknown }; z?: { label: unknown } } };
    }).state;
    return { value: state.text.cross.label, band: state.text.z?.label };
  }

  it.each(['StackedColumnChart', 'DodgedColumnChart', 'DivergingColumnChart'])(
    '%s does not call both of them "Level"',
    (chartType) => {
      // The builder emitted `y: { label: 'Level' }`, which is the label the
      // core already defaults the *band* axis to — so a reader heard "Level is
      // Alpha … Level is 1", one word for the series and for its magnitude.
      const { value, band } = labels(chartType);

      expect(band).toBe('Level');
      expect(value).not.toBe('Level');
    },
  );

  it('leaves a single-series bar chart naming its own columns', () => {
    // Only the stack has no value column to name. A plain bar has one, and it
    // must keep it — this is what stops the fix being "drop the label".
    const trace = TraceFactory.create(layerFor('ColumnChart'));
    const state = (trace as unknown as {
      state: { text: { main: { label: unknown }; cross: { label: unknown } } };
    }).state;

    expect(state.text.main.label).toBe('Fruit');
    expect(state.text.cross.label).toBe('Sales');
  });
});

describe('a funnel, which is horizontal by definition', () => {
  it('names its first stage rather than a count', () => {
    // `FunnelTrace` reports `freq.raw` as a ratio to the first stage, so the
    // magnitude cannot distinguish the two arrangements here — what it
    // announces can. Before the fix this was the stage's count.
    const trace = TraceFactory.create(layerFor('FunnelChart'));
    const state = (trace as unknown as {
      state: { text: { main: { value: unknown } } };
    }).state;

    expect(state.text.main.value).toBe('Apples');
    expect(warnSpy.mock.calls).toHaveLength(0);
  });
});

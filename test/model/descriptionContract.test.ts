import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import type { DescriptionState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * The contract every chart's `d` description keeps, checked across the families
 * at once.
 *
 * Each of these is a defect class the audit found in more than one trace, and
 * each is invisible to a per-trace test that happens not to exercise it: a
 * conditional column added without its header, a placeholder the dialog blanks
 * into an empty line with a stray colon, an `Infinity` reaching the reader as
 * text because the blanking rule only catches numbers.
 *
 * The layers below carry no `selectors`, so the traces need no DOM, and no axis
 * labels beyond the ones under test.
 */

/** Strings the dialog erases, so a stat carrying one renders as a bare label. */
const BLANKED = ['undefined', 'unavailable', 'NaN', ''];

/**
 * The subset of those that are a *leaked placeholder* rather than a deliberate
 * blank. A table cell may legitimately be empty -- that is how an absent value
 * reads -- but never the word for one.
 */
const LEAKED = ['undefined', 'unavailable', 'NaN'];

/** Placeholders `named()` substitutes for an axis the layer never labelled. */
const AXIS_PLACEHOLDERS = ['X', 'Y', 'Level'];

interface Case {
  name: string;
  layer: MaidrLayer;
}

const CASES: Case[] = [];

/**
 * Registers one trace to check.
 * @param name How the case reads in the test output
 * @param layer The layer to build it from
 */
function addCase(name: string, layer: MaidrLayer): void {
  CASES.push({ name, layer });
}

addCase('bar', {
  id: 'bar',
  type: TraceType.BAR,
  axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
  data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 4 }],
});

addCase('bar with a gap', {
  id: 'bar-gap',
  type: TraceType.BAR,
  axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
  data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: null as unknown as number }],
});

addCase('histogram', {
  id: 'hist',
  type: TraceType.HISTOGRAM,
  axes: { x: { label: 'Petal length' }, y: { label: 'Frequency' } },
  data: [
    { x: 1, y: 4, xMin: 0, xMax: 2, yMin: 0, yMax: 4 },
    { x: 3, y: 9, xMin: 2, xMax: 4, yMin: 0, yMax: 9 },
  ],
});

addCase('line', {
  id: 'line',
  type: TraceType.LINE,
  axes: { x: { label: 'Year' }, y: { label: 'Revenue' } },
  data: [[{ x: 2020, y: 1 }, { x: 2021, y: 4 }]],
});

addCase('scatter', {
  id: 'point',
  type: TraceType.SCATTER,
  axes: { x: { label: 'Horsepower' }, y: { label: 'MPG' } },
  data: [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 5 }],
});

addCase('scatter with no points', {
  id: 'point-empty',
  type: TraceType.SCATTER,
  axes: { x: { label: 'Horsepower' }, y: { label: 'MPG' } },
  data: [],
});

addCase('box', {
  id: 'box',
  type: TraceType.BOX,
  axes: { x: { label: 'Group' }, y: { label: 'Value' } },
  data: [{ z: 'A', lowerOutliers: [], min: 1, q1: 2, q2: 3, q3: 4, max: 5, upperOutliers: [] }],
});

addCase('box with no group names', {
  id: 'box-unnamed',
  type: TraceType.BOX,
  axes: { x: { label: 'Group' }, y: { label: 'Value' } },
  data: [
    { lowerOutliers: [], min: 1, q1: 2, q2: 3, q3: 4, max: 5, upperOutliers: [] },
    { lowerOutliers: [], min: 2, q1: 3, q2: 4, q3: 5, max: 6, upperOutliers: [] },
  ] as unknown as MaidrLayer['data'],
});

addCase('pie', {
  id: 'pie',
  type: TraceType.PIE,
  axes: { x: { label: 'Species' }, y: { label: 'Count' } },
  data: [{ x: 'setosa', y: 50 }, { x: 'virginica', y: 50 }],
});

addCase('heatmap', {
  id: 'heat',
  type: TraceType.HEATMAP,
  axes: { x: { label: 'Day' }, y: { label: 'Hour' }, z: { label: 'Count' } },
  data: { x: ['Mon', 'Tue'], y: ['am', 'pm'], points: [[1, 2], [3, 4]] },
});

addCase('dodged bar', {
  id: 'dodged',
  type: TraceType.DODGED,
  axes: { x: { label: 'Quarter' }, y: { label: 'Sales' }, z: { label: 'Region' } },
  data: [
    [{ x: 'Q1', y: 10, z: 'East' }, { x: 'Q2', y: 4, z: 'East' }],
    [{ x: 'Q1', y: 7, z: 'West' }, { x: 'Q2', y: 9, z: 'West' }],
  ],
});

addCase('stacked bar with an unnamed series', {
  id: 'stacked',
  type: TraceType.STACKED,
  axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
  data: [
    [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 4 }],
    [{ x: 'Q1', y: 7 }, { x: 'Q2', y: 9 }],
  ] as unknown as MaidrLayer['data'],
});

addCase('step with a gap', {
  id: 'step',
  type: TraceType.STEP,
  axes: { x: { label: 'Epoch' }, y: { label: 'Concurrency' } },
  data: [[{ x: 1, y: 3 }, { x: 2, y: null }, { x: 3, y: 3 }]],
});

addCase('area', {
  id: 'area',
  type: TraceType.AREA,
  axes: { x: { label: 'Year' }, y: { label: 'Revenue' } },
  data: [[{ x: 2020, y: 1 }, { x: 2021, y: 4 }]],
});

addCase('violin box', {
  id: 'violin-box',
  type: TraceType.VIOLIN_BOX,
  axes: { x: { label: 'Cut' }, y: { label: 'Price' } },
  data: [
    { fill: 'Ideal', lowerOutliers: [], min: 1, q1: 2, q2: 3, q3: 4, max: 5, upperOutliers: [] },
  ] as unknown as MaidrLayer['data'],
});

addCase('boxen', {
  id: 'boxen',
  type: TraceType.BOXEN,
  axes: { x: { label: 'Group' }, y: { label: 'Milliseconds' } },
  data: [
    { z: 'light', median: 50, levels: [{ p: 0.25, lo: 45, hi: 55 }], upperOutliers: [70] },
  ],
});

addCase('candlestick', {
  id: 'candle',
  type: TraceType.CANDLESTICK,
  axes: { x: { label: 'Date' }, y: { label: 'Price' } },
  data: [
    { value: '2024-01-01', open: 1, high: 4, low: 0.5, close: 3, volatility: 3.5 },
    { value: '2024-01-02', open: 3, high: 5, low: 2, close: 4, volatility: 3 },
  ],
});

addCase('error bar', {
  id: 'errorbar',
  type: TraceType.ERROR_BAR,
  axes: { x: { label: 'Dose' }, y: { label: 'Response' } },
  data: [{ x: 1, y: 5, yMin: 4, yMax: 6 }, { x: 2, y: 7, yMin: 6, yMax: 8 }],
});

addCase('gantt', {
  id: 'gantt',
  type: TraceType.GANTT,
  axes: { x: { label: 'Task' }, y: { label: 'Day' } },
  data: {
    points: [[{ x: 'Design', start: 0, end: 3 }], [{ x: 'Build', start: 3, end: 9 }]],
    lanes: ['Design', 'Build'],
  },
});

addCase('waterfall', {
  id: 'waterfall',
  type: TraceType.WATERFALL,
  axes: { x: { label: 'Step' }, y: { label: 'Balance' } },
  data: [
    { x: 'Start', start: 0, end: 100, delta: 100, kind: 'absolute' },
    { x: 'Costs', start: 100, end: 60, delta: -40, kind: 'relative' },
  ] as unknown as MaidrLayer['data'],
});

addCase('dumbbell', {
  id: 'dumbbell',
  type: TraceType.DUMBBELL,
  axes: { x: { label: 'Country' }, y: { label: 'Life expectancy' } },
  data: {
    points: [{ x: 'Norway', start: 70, end: 82 }, { x: 'Kenya', start: 50, end: 66 }],
    startLabel: '1990',
    endLabel: '2020',
  },
});

addCase('word cloud', {
  id: 'words',
  type: TraceType.WORD_CLOUD,
  axes: { x: { label: 'Word' }, y: { label: 'Frequency' } },
  data: [{ x: 'accessible', y: 12 }, { x: 'chart', y: 8 }],
});

addCase('gauge', {
  id: 'gauge',
  type: TraceType.GAUGE,
  title: 'Quarterly progress',
  axes: { x: { label: 'Progress' } },
  data: { value: 42, min: 0, max: 100 },
});

addCase('gauge naming neither its measure nor its chart', {
  id: 'gauge-unnamed',
  type: TraceType.GAUGE,
  axes: { x: { label: 'Progress' } },
  data: { value: 42, min: 0, max: 100 },
});

addCase('sankey', {
  id: 'sankey',
  type: TraceType.SANKEY,
  axes: { x: { label: 'Stage' }, y: { label: 'Flow' } },
  data: [
    { source: 'A', target: 'B', value: 5 },
    { source: 'B', target: 'C', value: 3 },
  ],
});

addCase('treemap', {
  id: 'treemap',
  type: TraceType.TREEMAP,
  axes: { x: { label: 'Region' }, y: { label: 'Sales' } },
  data: [{ x: 'North', y: 10 }, { x: 'South', y: 6 }],
});

addCase('hexbin', {
  id: 'hexbin',
  type: TraceType.HEXBIN,
  axes: { x: { label: 'Carat' }, y: { label: 'Price' }, z: { label: 'Count' } },
  data: [[{ x: 1, y: 2, count: 4 }, { x: 2, y: 3, count: 1 }]],
});

addCase('choropleth', {
  id: 'choropleth',
  type: TraceType.CHOROPLETH,
  axes: { x: { label: 'State' }, y: { label: 'Rate' } },
  data: [{ x: 'CA', y: 4 }, { x: 'NV', y: 9 }],
});

/**
 * Every value the description puts in front of a reader: the stats, the table
 * headers, and every cell.
 * @param description The description under test
 * @returns Each rendered value, as it will be read
 */
function renderedValues(description: DescriptionState): unknown[] {
  return [
    ...description.stats.map(stat => stat.value),
    ...description.dataTable.headers,
    ...description.dataTable.rows.flat(),
  ];
}

describe.each(CASES)('the $name description', ({ layer }) => {
  /**
   * Builds the trace and reads its description.
   *
   * Read inside each case rather than once at module scope: a throw there
   * fails the whole suite with no clue which layer caused it.
   * @returns The description under test
   */
  function describedBy(): DescriptionState {
    // `description` lives on `AbstractTrace` rather than on the `Trace`
    // interface the factory is typed to return, and every trace the factory
    // builds extends it.
    return (TraceFactory.create(layer) as AbstractTrace).description;
  }

  test('names the chart it is describing', () => {
    const description = describedBy();

    expect(description.chartType.trim()).not.toBe('');
  });

  test('gives every column a header', () => {
    const description = describedBy();
    // A conditional column added without its header leaves that column, and
    // every cell under it, unnamed for a screen reader.
    description.dataTable.rows.forEach((row) => {
      expect(row).toHaveLength(description.dataTable.headers.length);
    });
  });

  test('puts no placeholder where a stat value belongs', () => {
    const description = describedBy();
    // The dialog erases these, so the line renders as a bare label and a
    // colon — which reads as a value the reader failed to hear.
    const offenders = description.stats
      .map(stat => stat.value)
      .filter(value => typeof value === 'string' && BLANKED.includes(value.trim()));

    expect(offenders).toEqual([]);
  });

  test('spells an absent cell as a blank, never as the word for one', () => {
    // An empty cell is how the table shows an absent value, and reads as one.
    // The literal text `undefined` is a leaked placeholder, and the dialog
    // erases it — so the cell is blank either way, and the difference is only
    // whether anyone can see that it happened.
    const offenders = describedBy().dataTable.rows.flat().filter(cell => typeof cell === 'string' && LEAKED.includes(cell.trim()));

    expect(offenders).toEqual([]);
  });

  test('names every column it draws', () => {
    const blank = describedBy().dataTable.headers.filter(header => header.trim() === '' || BLANKED.includes(header.trim()));

    expect(blank).toEqual([]);
  });

  test('lets no infinity reach the reader as text', () => {
    const description = describedBy();
    // `safeMin`/`safeMax` answer these for an empty set by design. As a number
    // the dialog blanks it; composed into a string it is printed and spoken.
    const offenders = renderedValues(description)
      .filter(value => typeof value === 'string' && /Infinity|\bNaN\b/.test(value));

    expect(offenders).toEqual([]);
  });

  test('names the axis of every column, or of none', () => {
    const { headers, columnAxes } = describedBy().dataTable;
    if (columnAxes === undefined) {
      return;
    }

    // The description service reads this by column index to decide which
    // cells go through the layer's own formatter. One entry short and the
    // last column silently loses its format; one entry long and the array
    // has drifted from the headers it is meant to describe.
    expect(columnAxes).toHaveLength(headers.length);
    columnAxes.forEach((axis) => {
      expect(axis === undefined || axis === 'x' || axis === 'y' || axis === 'z').toBe(true);
    });
  });

  test('claims only the axes the layer actually labelled', () => {
    const description = describedBy();
    const leaked = Object.entries(description.axes)
      .filter(([, label]) => typeof label === 'string' && AXIS_PLACEHOLDERS.includes(label));

    expect(leaked).toEqual([]);
  });
});

describe('readings the whole dialog shares', () => {
  /**
   * Reads one stat out of a layer's description.
   * @param layer The layer to build
   * @param label Which stat to take
   * @returns The stat's value, or undefined when it is not reported
   */
  function statOf(layer: MaidrLayer, label: string): unknown {
    return (TraceFactory.create(layer) as AbstractTrace).description.stats.find(stat => stat.label === label)?.value;
  }

  test('spells the orientation out rather than reading the payload back', () => {
    // The enum's members are `vert` and `horz`. The entry announcement has
    // always spelled it — "a maidr plot of type: horizontal bar" — and the
    // dialog should not be the one surface that does not.
    const bars: MaidrLayer = {
      id: 'bar',
      type: TraceType.BAR,
      axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
      data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 4 }],
    };

    expect((TraceFactory.create(bars) as AbstractTrace).orientationLabel).toBe('vertical');
    expect(
      (TraceFactory.create({ ...bars, orientation: Orientation.HORIZONTAL }) as AbstractTrace)
        .orientationLabel,
    ).toBe('horizontal');
  });

  test('says nothing about the orientation of a chart that has none', () => {
    const points: MaidrLayer = {
      id: 'point',
      type: TraceType.SCATTER,
      axes: { x: { label: 'Horsepower' }, y: { label: 'MPG' } },
      data: [{ x: 1, y: 2 }, { x: 2, y: 4 }],
    };

    expect((TraceFactory.create(points) as AbstractTrace).orientationLabel).toBeUndefined();
  });

  test('rounds a value it composes into a string itself', () => {
    // `DescriptionService` rounds a bare number and takes a composed string
    // for finished display text, so a stat that builds its own sentence has to
    // round what it puts in it.
    const bars: MaidrLayer = {
      id: 'bar',
      type: TraceType.BAR,
      axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
      data: [{ x: 'a', y: 10000 / 3 }, { x: 'b', y: 1 }],
    };

    expect(statOf(bars, 'Largest')).toBe('3333.33 at a');
  });

  test('names a gap by the mark the chart actually draws', () => {
    // The count of marks already reads "Number of stages"; a gap stat saying
    // "Bars with no value" beside it left one summary using two words for the
    // same objects.
    const funnel: MaidrLayer = {
      id: 'funnel',
      type: TraceType.FUNNEL,
      axes: { x: { label: 'Stage' }, y: { label: 'Visitors' } },
      data: [{ x: 'Visited', y: 100 }, { x: 'Bought', y: null as unknown as number }],
    };

    expect(statOf(funnel, 'Stages with no value')).toBe(1);
    expect(statOf(funnel, 'Bars with no value')).toBeUndefined();
  });

  test('puts the value before the category it belongs to', () => {
    // `Q1, 7` reads as two numbers the moment the category is one. `at` is the
    // word the Go To Extrema dialog already uses for the same pairing.
    const bars: MaidrLayer = {
      id: 'bar',
      type: TraceType.BAR,
      axes: { x: { label: 'Quarter' }, y: { label: 'Sales' } },
      data: [{ x: '1', y: 10 }, { x: '2', y: 4 }],
    };

    expect(statOf(bars, 'Largest')).toBe('10 at 1');
    expect(statOf(bars, 'Smallest')).toBe('4 at 2');
  });
});

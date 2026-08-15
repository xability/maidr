import type { AmXYSeries } from '@adapters/amcharts/types';
import type {
  ErrorBarPoint,
  ForestPoint,
  MaidrLayer,
  ScatterPoint,
  SurvivalPoint,
  VolcanoPoint,
} from '@type/grammar';
import { findCharts, fromAmCharts, fromXYChart } from '@adapters/amcharts/adapter';
import { planDeclarations } from '@adapters/amcharts/declaration';
import { buildNavigationMap } from '@adapters/amcharts/navmap';
import { Orientation, TraceType } from '@type/grammar';
import {
  fakeChart,
  fakeContainer,
  fakeContainerEl,
  fakeFlowSeries,
  fakePieSeries,
  fakeRoot,
  fakeSeries,
} from './helpers';

/**
 * The declared reading is opt-in, so every case here is really two charts: the
 * one amCharts drew, and the one an author said it was. The tests assert the
 * difference between them — a step line that becomes a survival curve, a line
 * series that stops being announced as a line — rather than the declared
 * payload alone, which would pass just as well if the declaration were ignored
 * and the heuristic happened to agree.
 */

const CONTAINER = fakeContainerEl('chartdiv');

/** Build the layers of a one-chart figure. */
function layersOf(series: AmXYSeries[]): MaidrLayer[] {
  const maidr = fromXYChart(fakeChart({ series }), CONTAINER);
  return maidr.subplots[0][0].layers;
}

/** The single layer a chart of these series produces. */
function layerOf(series: AmXYSeries[]): MaidrLayer {
  const layers = layersOf(series);
  expect(layers).toHaveLength(1);
  return layers[0];
}

/** A `StepLineSeries` drawing a curve, with an optional declaration on it. */
function stepSeries(
  name: string,
  data: Array<Record<string, unknown>>,
  config: { maidr?: unknown; id?: string; rows?: Array<Record<string, unknown>> } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'StepLineSeries',
    name,
    id: config.id,
    userData: config.maidr === undefined ? undefined : { maidr: config.maidr },
    settings: { categoryXField: 'time' },
    data,
    rows: config.rows,
  });
}

/**
 * The amCharts scatter recipe: a `LineSeries` on two value axes. Undeclared it
 * falls into the line reading, which is exactly the misannouncement a volcano
 * or Manhattan declaration exists to correct.
 */
function cloudSeries(
  name: string,
  data: Array<Record<string, unknown>>,
  config: { maidr?: unknown; rows?: Array<Record<string, unknown>> } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'LineSeries',
    name,
    userData: config.maidr === undefined ? undefined : { maidr: config.maidr },
    data,
    rows: config.rows,
  });
}

/** A column series of estimates, or of the intervals drawn behind them. */
function columnSeries(
  name: string,
  data: Array<Record<string, unknown>>,
  config: { maidr?: unknown; id?: string; rows?: Array<Record<string, unknown>>; horizontal?: boolean } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    id: config.id,
    userData: config.maidr === undefined ? undefined : { maidr: config.maidr },
    settings: config.horizontal
      ? { categoryYField: 'study' }
      : { categoryXField: 'group' },
    data,
    rows: config.rows,
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

/** Every warning raised so far, joined for a substring assertion. */
function warnings(): string {
  return warn.mock.calls.map(call => String(call[0])).join('\n');
}

describe('declaration precedence', () => {
  const CURVE = [
    { categoryX: 0, valueY: 1 },
    { categoryX: 4, valueY: 0.8 },
  ];

  it('reads an undeclared step line as a step layer', () => {
    expect(layerOf([stepSeries('Arm A', CURVE)]).type).toBe(TraceType.STEP);
  });

  it('reads the same series as a survival curve once it declares one', () => {
    const layer = layerOf([stepSeries('Arm A', CURVE, { maidr: { type: 'survival' } })]);

    expect(layer.type).toBe(TraceType.SURVIVAL);
  });

  it('falls back to the undeclared reading when the type names no trace', () => {
    const layer = layerOf([stepSeries('Arm A', CURVE, { maidr: { type: 'survivial' } })]);

    expect(layer.type).toBe(TraceType.STEP);
    expect(warnings()).toContain('unknown type "survivial"');
  });

  it('falls back when the declared type is one no amCharts series draws', () => {
    const layer = layerOf([stepSeries('Arm A', CURVE, { maidr: { type: 'hexbin' } })]);

    expect(layer.type).toBe(TraceType.STEP);
    expect(warnings()).toContain('which no amCharts series draws');
  });

  it('falls back when the series carries none of the values the type needs', () => {
    const pie = fakePieSeries('Share', [{ category: 'A', value: 3 }]);
    const declared = fakeSeries({
      className: 'PieSeries',
      name: 'Share',
      userData: { maidr: { type: 'survival' } },
      settings: { categoryField: 'category', valueField: 'value' },
      data: [{ category: 'A', value: 3 }],
    });

    expect(layerOf([declared]).type).toBe(layerOf([pie]).type);
    expect(warnings()).toContain('no mark of it carries the values');
  });

  it('drops a key the declared type does not accept and keeps the rest', () => {
    const layer = layerOf([stepSeries('Arm A', CURVE, {
      maidr: { type: 'survival', stepDirection: 'hv', significanse: 7.3 },
    })]);

    expect(layer.type).toBe(TraceType.SURVIVAL);
    expect(layer.stepDirection).toBe('hv');
    expect(warnings()).toContain('unknown key "significanse"');
  });
});

describe('declared alluvials', () => {
  const LINKS = [
    { sourceId: 'Rent', targetId: 'Housing', value: 40 },
    { sourceId: 'Loan', targetId: 'Housing', value: 25 },
  ];

  /** The layer a bare am5flow series produces, found the way discovery finds it. */
  function standaloneLayer(series: AmXYSeries): MaidrLayer {
    const layers = fromAmCharts(fakeRoot([series])).subplots[0][0].layers;
    expect(layers).toHaveLength(1);
    return layers[0];
  }

  it('reads an undeclared Sankey as a sankey', () => {
    expect(standaloneLayer(fakeFlowSeries('Budget', LINKS)).type).toBe(TraceType.SANKEY);
  });

  it('reads the same series as an alluvial once it declares one', () => {
    // amCharts has no alluvial class: an alluvial IS a sankey, drawn with the
    // nodes repeated across stages, so only the author can separate the two.
    const series = fakeFlowSeries('Budget', LINKS, 'Sankey', {
      userData: { maidr: { type: 'alluvial' } },
    });

    const layer = standaloneLayer(series);

    expect(layer.type).toBe(TraceType.ALLUVIAL);
    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Weight' } });
    // The payload is the same weighted graph either way — what the author
    // declared is which of the two readings the drawing stands for.
    expect(layer.data).toEqual([
      { source: 'Rent', target: 'Housing', value: 40 },
      { source: 'Loan', target: 'Housing', value: 25 },
    ]);
  });

  it('is visible through the panel discovery wraps a bare series in', () => {
    // `planDeclarations` iterates `chart.series.values`, and a bare am5flow
    // series has no chart at all — it reaches the plan only through the
    // one-series panel `asStandalonePanel` synthesises around it.
    const series = fakeFlowSeries('Budget', LINKS, 'Sankey', {
      userData: { maidr: { type: 'alluvial' } },
    });
    const chart = findCharts(fakeRoot([fakeContainer([series])]))[0];

    const plan = planDeclarations(chart);

    expect(plan.declared.get(series)?.declaration.type).toBe(TraceType.ALLUVIAL);
  });

  it('keeps the name and title the block declared', () => {
    const series = fakeFlowSeries('Budget', LINKS, 'Sankey', {
      userData: { maidr: { type: 'alluvial', name: 'flows', title: 'Where the money goes' } },
    });

    const layer = standaloneLayer(series);

    expect(layer.name).toBe('flows');
    expect(layer.title).toBe('Where the money goes');
  });

  it('falls back to the undeclared reading on a series that draws no flow', () => {
    // The "wrong construct" check: `type: 'alluvial'` on a pie series is a
    // mistake worth reporting, not a layer to emit with nothing in it.
    const declared = fakeSeries({
      className: 'PieSeries',
      name: 'Share',
      userData: { maidr: { type: 'alluvial' } },
      settings: { categoryField: 'category', valueField: 'value' },
      data: [{ category: 'A', value: 3 }],
    });

    expect(layerOf([declared]).type).toBe(TraceType.PIE);
    expect(warnings()).toContain('no mark of it carries the values');
  });

  it('refuses the block on a column series whose rows merely look like links', () => {
    // The class name is the half of the check the data cannot supply: a bar
    // chart authored from rows with `from`/`to`/`value` columns reads as a
    // perfectly good link list, and reading it as one would announce a graph
    // nobody drew. amCharts drawing a weighted flow is what makes the claim
    // about the DRAWING true, which is what a declaration is.
    const declared = fakeSeries({
      className: 'ColumnSeries',
      name: 'Transfers',
      userData: { maidr: { type: 'alluvial' } },
      settings: { categoryXField: 'category' },
      data: [{ categoryX: 'Rent', from: 'Rent', to: 'Housing', value: 40, valueY: 40 }],
    });

    expect(layerOf([declared]).type).toBe(TraceType.BAR);
    expect(warnings()).toContain('no mark of it carries the values');
  });

  it('falls back when the flow series carries no link the adapter can read', () => {
    const series = fakeFlowSeries('Budget', [{ sourceId: 'Rent' }], 'Sankey', {
      userData: { maidr: { type: 'alluvial' } },
    });

    // No readable link means no flow of any kind, declared or not — so the
    // figure has no layer at all rather than an alluvial of nothing.
    expect(() => fromAmCharts(fakeRoot([series]))).toThrow(/no supported series with data/);
    expect(warnings()).toContain('no mark of it carries the values');
  });

  it('does not absorb the siblings that follow it', () => {
    // An alluvial declares nothing but which reading the drawing stands for,
    // so a second flow beside it is a second figure, not a further arm of one.
    const declared = fakeFlowSeries('Budget', LINKS, 'Sankey', {
      userData: { maidr: { type: 'alluvial' } },
    });
    const sibling = fakeFlowSeries('Energy', LINKS);

    expect(layersOf([declared, sibling]).map(layer => layer.type))
      .toEqual([TraceType.ALLUVIAL, TraceType.SANKEY]);
  });
});

describe('declared survival curves', () => {
  const TIMES = [
    { categoryX: 0, valueY: 1 },
    { categoryX: 4, valueY: 0.8 },
    { categoryX: 9, valueY: 0.6 },
  ];

  it('reads the censoring flag off the author\'s own row', () => {
    const layer = layerOf([stepSeries('Arm A', TIMES, {
      maidr: { type: 'survival' },
      // Only on the row: the chart was never bound to this column, so nothing
      // but `dataContext` can answer for it.
      rows: [
        { time: 0, isCensored: false },
        { time: 4, isCensored: true },
        { time: 9, isCensored: '0' },
      ],
    })]);
    const arms = layer.data as SurvivalPoint[][];

    // '0' is the string a 0/1 indicator arrives as out of a CSV, and it
    // censors nobody however truthy JavaScript finds it.
    expect(arms[0].map(point => point.censored)).toEqual([false, true, false]);
  });

  it('uses an explicit field name verbatim and reports one that misses', () => {
    const layer = layerOf([stepSeries('Arm A', TIMES, {
      maidr: { type: 'survival', censored: 'cens' },
      rows: [
        { time: 0, isCensored: true },
        { time: 4, isCensored: true },
        { time: 9, isCensored: true },
      ],
    })]);
    const arms = layer.data as SurvivalPoint[][];

    expect(arms[0].every(point => point.censored === undefined)).toBe(true);
    expect(warnings()).toContain('names "cens" for censored');
  });

  it('folds a following arm into the same layer', () => {
    const layer = layerOf([
      stepSeries('Treated', TIMES, { maidr: { type: 'survival' } }),
      stepSeries('Control', TIMES),
    ]);
    const arms = layer.data as SurvivalPoint[][];

    expect(layer.type).toBe(TraceType.SURVIVAL);
    expect(arms).toHaveLength(2);
    expect(arms[1][0].z).toBe('Control');
  });

  it('leaves the second arm its own layer when merge is off', () => {
    const layers = layersOf([
      stepSeries('Treated', TIMES, { maidr: { type: 'survival', merge: false } }),
      stepSeries('Control', TIMES),
    ]);

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SURVIVAL, TraceType.STEP]);
  });

  it('absorbs the companion drawing the censoring ticks', () => {
    const ticks = fakeSeries({
      className: 'LineSeries',
      name: 'Censored',
      id: 'ticks',
      settings: { categoryXField: 'time' },
      data: [{ categoryX: 4, valueY: 0.8 }],
    });
    const layers = layersOf([
      stepSeries('Arm A', TIMES, { maidr: { type: 'survival', censoredSeries: 'ticks' } }),
      ticks,
    ]);
    const arms = layers[0].data as SurvivalPoint[][];

    // One layer, not two: the ticks are part of the curve that named them.
    expect(layers).toHaveLength(1);
    expect(arms[0].map(point => point.censored)).toEqual([undefined, true, undefined]);
  });

  it('reports a companion that names no series and emits the curve without it', () => {
    const layer = layerOf([
      stepSeries('Arm A', TIMES, { maidr: { type: 'survival', bandSeries: 'band' } }),
    ]);
    const arms = layer.data as SurvivalPoint[][];

    expect(layer.type).toBe(TraceType.SURVIVAL);
    expect(arms[0].every(point => point.yMin === undefined)).toBe(true);
    expect(warnings()).toContain('names bandSeries "band"');
  });

  it('takes the confidence band from the companion drawing it', () => {
    const band = fakeSeries({
      className: 'LineSeries',
      name: 'CI',
      id: 'band',
      settings: { categoryXField: 'time' },
      data: [
        { categoryX: 4, openValueY: 0.7, valueY: 0.9 },
        { categoryX: 9, openValueY: 0.4, valueY: 0.75 },
      ],
    });
    const layer = layerOf([
      stepSeries('Arm A', TIMES, { maidr: { type: 'survival', bandSeries: 'band' } }),
      band,
    ]);
    const arms = layer.data as SurvivalPoint[][];

    expect(arms[0][0].yMin).toBeUndefined();
    expect(arms[0][1]).toMatchObject({ x: 4, y: 0.8, yMin: 0.7, yMax: 0.9 });
  });
});

describe('declared error bars', () => {
  const ESTIMATES = [
    { categoryX: 'A', valueY: 1.4 },
    { categoryX: 'B', valueY: 2.1 },
  ];

  it('reads absolute bounds off the row under their common spellings', () => {
    const layer = layerOf([columnSeries('Mean', ESTIMATES, {
      maidr: { type: 'error_bar' },
      rows: [
        { group: 'A', lower: 1.1, upper: 1.7 },
        { group: 'B', lower: 1.9 },
      ],
    })]);

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    // A one-sided interval keeps the half it has rather than losing the
    // estimate with it.
    expect(layer.data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 1.4, yMin: 1.1, yMax: 1.7 },
      { x: 'B', y: 2.1, yMin: 1.9 },
    ]);
  });

  it('converts an offset into the absolute bounds the grammar fixes', () => {
    const layer = layerOf([columnSeries('Mean', ESTIMATES, {
      maidr: { type: 'error_bar', error: 'err' },
      rows: [
        { group: 'A', err: 0.2 },
        { group: 'B', err: [0.2, 0.3] },
      ],
    })]);

    expect(layer.data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 1.4, yMin: 1.2, yMax: 1.6 },
      { x: 'B', y: 2.1, yMin: 1.9, yMax: 2.4 },
    ]);
  });

  it('takes the interval from the companion column and suppresses it', () => {
    const interval = columnSeries('CI', [
      { categoryX: 'A', openValueY: 1.1, valueY: 1.7 },
      { categoryX: 'B', openValueY: 1.9, valueY: 2.3 },
    ], { id: 'ci' });
    const layers = layersOf([
      columnSeries('Mean', ESTIMATES, {
        maidr: { type: 'error_bar', intervalSeries: 'ci' },
      }),
      interval,
    ]);

    expect(layers).toHaveLength(1);
    expect(layers[0].data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 1.4, yMin: 1.1, yMax: 1.7 },
      { x: 'B', y: 2.1, yMin: 1.9, yMax: 2.3 },
    ]);
  });

  it('joins the companion on the position rather than by index', () => {
    const interval = columnSeries('CI', [
      { categoryX: 'B', openValueY: 1.9, valueY: 2.3 },
    ], { id: 'ci' });
    const layer = layerOf([
      columnSeries('Mean', ESTIMATES, {
        maidr: { type: 'error_bar', intervalSeries: 'ci' },
      }),
      interval,
    ]);
    const points = layer.data as ErrorBarPoint[];

    expect(points[0].yMin).toBeUndefined();
    expect(points[1]).toMatchObject({ x: 'B', yMin: 1.9, yMax: 2.3 });
  });

  it('refuses a companion another declaration has already absorbed', () => {
    const interval = columnSeries('CI', [
      { categoryX: 'A', openValueY: 1.1, valueY: 1.7 },
      { categoryX: 'B', openValueY: 1.9, valueY: 2.3 },
    ], { id: 'ci' });
    const layers = layersOf([
      columnSeries('Mean', ESTIMATES, {
        maidr: { type: 'error_bar', intervalSeries: 'ci' },
      }),
      columnSeries('Median', ESTIMATES, {
        maidr: { type: 'error_bar', intervalSeries: 'ci' },
      }),
      interval,
    ]);

    // One column of intervals cannot be two layers' intervals: the first claim
    // stands, the second is refused out loud, and the rows are announced once.
    expect(layers).toHaveLength(2);
    expect(layers[0].data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 1.4, yMin: 1.1, yMax: 1.7 },
      { x: 'B', y: 2.1, yMin: 1.9, yMax: 2.3 },
    ]);
    expect(layers[1].data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 1.4 },
      { x: 'B', y: 2.1 },
    ]);
    expect(warnings()).toContain('which another declaration already absorbed');
  });

  it('lets the declaration settle an orientation the drawing does not state', () => {
    const onValueAxes = [{ valueX: 1.4, valueY: 3 }];
    const upright = layerOf([fakeSeries({
      className: 'LineSeries',
      name: 'Mean',
      userData: { maidr: { type: 'error_bar' } },
      data: onValueAxes,
    })]);
    const sideways = layerOf([fakeSeries({
      className: 'LineSeries',
      name: 'Mean',
      userData: { maidr: { type: 'error_bar', orientation: 'horz' } },
      data: onValueAxes,
    })]);

    // Neither axis is categorical, so the drawing says nothing: the samples
    // run along x by default and along y when the author says so, and the
    // estimate is read off the other one either way.
    expect(upright.data as ErrorBarPoint[]).toEqual([{ x: 1.4, y: 3 }]);
    expect(sideways.data as ErrorBarPoint[]).toEqual([{ x: 3, y: 1.4 }]);
  });

  it('reads a chart drawn on its side as horizontal', () => {
    const layer = layerOf([columnSeries('Mean', [
      { categoryY: 'A', valueX: 1.4 },
    ], { horizontal: true, maidr: { type: 'error_bar' } })]);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as ErrorBarPoint[]).toEqual([{ x: 'A', y: 1.4 }]);
  });
});

describe('declared forest plots', () => {
  const STUDIES = [
    { categoryY: 'Ross 1998', valueX: 0.8 },
    { categoryY: 'Patel 2004', valueX: 1.2 },
    { categoryY: 'Pooled', valueX: 0.95 },
  ];

  function forestLayer(maidr: unknown, rows?: Array<Record<string, unknown>>): MaidrLayer {
    return layerOf([columnSeries('Effect', STUDIES, { horizontal: true, maidr, rows })]);
  }

  it('carries the weight and the pooled flag off the rows', () => {
    const layer = forestLayer({ type: 'forest', nullValue: 1 }, [
      { study: 'Ross 1998', w: 0.25 },
      { study: 'Patel 2004', w: 0.35 },
      { study: 'Pooled', w: 0.4, pooled: true },
    ]);

    expect(layer.type).toBe(TraceType.FOREST);
    expect(layer.forestOptions).toEqual({ nullValue: 1 });
    expect((layer.data as ForestPoint[]).map(point => point.weight)).toEqual([0.25, 0.35, 0.4]);
    expect((layer.data as ForestPoint[])[2].pooled).toBe(true);
  });

  it('leaves out a weight reported as a percentage rather than rescaling it', () => {
    const layer = forestLayer({ type: 'forest' }, [
      { study: 'Ross 1998', weight: 25 },
      { study: 'Patel 2004', weight: 35 },
      { study: 'Pooled', weight: 40 },
    ]);

    // Dividing by 100 guesses that the column sums to 100; passing it through
    // announces "weight 2500%". Neither is what the chart said.
    expect((layer.data as ForestPoint[]).every(point => point.weight === undefined)).toBe(true);
  });

  it('makes no claim about significance when no null value is declared', () => {
    expect(forestLayer({ type: 'forest' }).forestOptions).toBeUndefined();
  });

  it('counts pooledIndex over the rows as authored, including dropped ones', () => {
    const layer = layerOf([columnSeries('Effect', [
      { categoryY: 'Ross 1998', valueX: 0.8 },
      // A row the chart drew nothing for: it still counts, because the
      // sequence an author can see is the one they wrote.
      { categoryY: 'Kim 2001', valueX: null },
      { categoryY: 'Pooled', valueX: 0.95 },
    ], { horizontal: true, maidr: { type: 'forest', pooledIndex: 2 } })]);
    const points = layer.data as ForestPoint[];

    expect(points.map(point => point.x)).toEqual(['Ross 1998', 'Pooled']);
    expect(points.map(point => point.pooled)).toEqual([undefined, true]);
  });

  it('reports only the field that missed, not the one another pass resolved', () => {
    const layer = forestLayer({ type: 'forest', yMin: 'lo', weight: 'w' }, [
      { study: 'Ross 1998', lo: 0.6 },
      { study: 'Patel 2004', lo: 0.9 },
      { study: 'Pooled', lo: 0.8 },
    ]);

    expect((layer.data as ForestPoint[])[0].yMin).toBe(0.6);
    expect(warnings()).toContain('names "w" for weight');
    expect(warnings()).not.toContain('for yMin');
  });

  it('appends the companion drawing the pooled summary', () => {
    const summary = columnSeries('Pooled', [
      { categoryY: 'Overall', valueX: 0.95, openValueX: 0.85 },
    ], { id: 'summary', horizontal: true });
    const layers = layersOf([
      columnSeries('Effect', STUDIES.slice(0, 2), {
        horizontal: true,
        maidr: { type: 'forest', pooledSeries: 'summary' },
      }),
      summary,
    ]);
    const points = layers[0].data as ForestPoint[];

    expect(layers).toHaveLength(1);
    expect(points).toHaveLength(3);
    expect(points[2]).toMatchObject({ x: 'Overall', y: 0.95, pooled: true });
  });

  it('fills the pooled summary from the interval companion at its own position', () => {
    const interval = columnSeries('CI', [
      { categoryY: 'Ross 1998', openValueX: 0.6, valueX: 1 },
      { categoryY: 'Overall', openValueX: 0.85, valueX: 1.05 },
    ], { id: 'ci', horizontal: true });
    const summary = columnSeries('Pooled', [
      { categoryY: 'Overall', valueX: 0.95 },
    ], { id: 'summary', horizontal: true });
    const layers = layersOf([
      columnSeries('Effect', STUDIES.slice(0, 2), {
        horizontal: true,
        maidr: { type: 'forest', intervalSeries: 'ci', pooledSeries: 'summary' },
      }),
      interval,
      summary,
    ]);
    const points = layers[0].data as ForestPoint[];

    // A forest plot routinely draws every interval in one column series, the
    // summary's included, so the interval companion stays in scope for the
    // pooled rows too. The join is by position either way: the summary takes
    // the interval drawn at its own category, and the study the companion
    // draws nothing for keeps no bounds at all.
    expect(layers).toHaveLength(1);
    expect(points).toEqual([
      { x: 'Ross 1998', y: 0.8, yMin: 0.6, yMax: 1 },
      { x: 'Patel 2004', y: 1.2 },
      { x: 'Overall', y: 0.95, yMin: 0.85, yMax: 1.05, pooled: true },
    ]);
  });

  it('lets the pooled summary\'s own row outrank the interval companion', () => {
    const interval = columnSeries('CI', [
      { categoryY: 'Ross 1998', openValueX: 0.6, valueX: 1 },
      { categoryY: 'Overall', openValueX: 0.85, valueX: 1.05 },
    ], { id: 'ci', horizontal: true });
    const summary = columnSeries('Pooled', [
      { categoryY: 'Overall', valueX: 0.95 },
    ], { id: 'summary', horizontal: true, rows: [{ study: 'Overall', lower: 0.9 }] });
    const layers = layersOf([
      columnSeries('Effect', STUDIES.slice(0, 2), {
        horizontal: true,
        maidr: { type: 'forest', intervalSeries: 'ci', pooledSeries: 'summary' },
        rows: [{ study: 'Ross 1998' }, { study: 'Patel 2004' }],
      }),
      interval,
      summary,
    ]);
    const points = layers[0].data as ForestPoint[];

    // Row fields → `error` offset → companion, for the summary exactly as for
    // a study: a bound the summary's own row states is the more specific
    // statement, and the companion fills only the half it left unsaid.
    expect(points[2]).toEqual({ x: 'Overall', y: 0.95, yMin: 0.9, yMax: 1.05, pooled: true });
  });
});

describe('declared clouds', () => {
  const GENES = [
    { valueX: -2.4, valueY: 9.1 },
    { valueX: 0.1, valueY: 0.4 },
  ];
  const NAMES = [{ gene: 'BRCA1' }, { gene: 'ACTB' }];

  it('reads an undeclared scatter recipe as a line, and a declared one as a volcano', () => {
    const undeclared = layerOf([cloudSeries('DE', GENES, { rows: NAMES })]);
    const layer = layerOf([cloudSeries('DE', GENES, {
      rows: NAMES,
      maidr: { type: 'volcano', significance: 1.3, effect: 1 },
    })]);

    expect(undeclared.type).toBe(TraceType.LINE);
    expect(layer.type).toBe(TraceType.VOLCANO);
    expect(layer.data as VolcanoPoint[]).toEqual([
      { x: -2.4, y: 9.1, label: 'BRCA1' },
      { x: 0.1, y: 0.4, label: 'ACTB' },
    ]);
    expect(layer.thresholdOptions).toEqual({ significance: 1.3, effect: 1 });
  });

  it('reports no findings when the cutoffs were not declared', () => {
    const layer = layerOf([cloudSeries('DE', GENES, {
      maidr: { type: 'volcano' },
    })]);

    // A guessed line sorts every point onto the wrong side silently, so the
    // layer says nothing about significance at all.
    expect(layer.thresholdOptions).toBeUndefined();
  });

  it('folds every chromosome of a Manhattan into one cloud', () => {
    const layers = layersOf([
      cloudSeries('chr1', [{ valueX: 1, valueY: 3 }], {
        rows: [{ snp: 'rs1', chr: '1' }],
        maidr: { type: 'manhattan', significance: 7.3 },
      }),
      cloudSeries('chr2', [{ valueX: 2, valueY: 8 }], { rows: [{ snp: 'rs2', chr: '2' }] }),
    ]);
    const points = layers[0].data as VolcanoPoint[];

    expect(layers).toHaveLength(1);
    expect(points).toEqual([
      { x: 1, y: 3, label: 'rs1', group: '1' },
      { x: 2, y: 8, label: 'rs2', group: '2' },
    ]);
  });

  it('keeps a volcano\'s sibling series apart, which a Manhattan\'s are not', () => {
    const layers = layersOf([
      cloudSeries('Up', GENES, { maidr: { type: 'volcano' } }),
      cloudSeries('Down', GENES),
    ]);

    expect(layers.map(layer => layer.type)).toEqual([TraceType.VOLCANO, TraceType.LINE]);
  });

  it('reads a plain declared scatter as coordinates alone', () => {
    const layer = layerOf([cloudSeries('Cloud', GENES, {
      rows: NAMES,
      maidr: { type: 'point' },
    })]);

    // `ScatterPoint` has nowhere to put a name, so the declared `label` chain
    // is not read into one: the layer carries what the grammar can carry.
    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([
      { x: -2.4, y: 9.1 },
      { x: 0.1, y: 0.4 },
    ]);
  });
});

describe('declared layers and the highlight', () => {
  /** The navigation map for a one-chart figure, as the binder builds it. */
  function navMapOf(series: AmXYSeries[]): ReturnType<typeof buildNavigationMap> {
    const chart = fakeChart({ series });
    const layers = fromXYChart(chart, CONTAINER).subplots[0][0].layers;
    // Mirrors `groupSeries` in binder.tsx for a chart whose layers are all
    // declared: the plan is what the highlight path walks.
    const plan = planDeclarations(chart);
    return buildNavigationMap([{
      layers,
      chart,
      groups: {
        barSeriesList: [],
        dotSeriesList: [],
        lollipopSeriesList: [],
        lineSeriesList: [],
        stepSeriesList: [],
        areaSeriesList: [],
        radarSeriesList: [],
        polarSeriesList: [],
        histogramSeries: [],
        heatmapSeries: [],
        pieSeriesList: [],
        funnelSeriesList: [],
        waterfallSeriesList: [],
        dumbbellSeriesList: [],
        ganttSeriesList: [],
        hierarchySeriesList: [],
        wordCloudSeriesList: [],
        declaredList: [...plan.declared.values()],
      },
    }]);
  }

  it('points a survival position at the mark of that arm and that sample', () => {
    const treated = stepSeries('Treated', [
      { categoryX: 0, valueY: 1 },
      { categoryX: 4, valueY: 0.8 },
    ], { maidr: { type: 'survival' } });
    const control = stepSeries('Control', [
      { categoryX: 0, valueY: 1 },
      { categoryX: 4, valueY: 0.6 },
    ]);
    const navMap = navMapOf([treated, control]);
    const layerId = layersOf([treated, control])[0].id;

    const targets = navMap.resolve(layerId, 1, 1);

    expect(targets).toHaveLength(1);
    expect(targets[0].series).toBe(control);
    expect(targets[0].dataItem).toBe(control.dataItems[1]);
  });

  it('points every section of an error bar at the sample it belongs to', () => {
    const estimate = columnSeries('Mean', [
      { categoryX: 'A', valueY: 1.4 },
      { categoryX: 'B', valueY: 2.1 },
    ], { maidr: { type: 'error_bar' } });
    const navMap = navMapOf([estimate]);
    const layerId = layersOf([estimate])[0].id;

    // Rows are the lower bound, the estimate and the upper bound; a chart
    // draws one mark per sample, so all three land on it.
    const lower = navMap.resolve(layerId, 0, 1);
    const upper = navMap.resolve(layerId, 2, 1);

    expect(lower[0].dataItem).toBe(estimate.dataItems[1]);
    expect(upper[0].dataItem).toBe(estimate.dataItems[1]);
    expect(lower[0].kind).toBe('column');
  });

  it('resolves a cloud by data index, so a volcano point outlines', () => {
    // A cloud has no row/column position that names a mark -- its braille
    // surface is a binned grid -- so it is addressed by `layer.data` index
    // instead (#897). Before that channel existed this resolver was left
    // unregistered on purpose, and volcano and Manhattan outlined nothing.
    const cloud = cloudSeries('DE', [
      { valueX: 1, valueY: 2 },
      { valueX: 3, valueY: 4 },
    ], {
      maidr: { type: 'volcano' },
    });
    const navMap = navMapOf([cloud]);
    const layerId = layersOf([cloud])[0].id;

    const first = navMap.resolve(layerId, -1, -1, [0]);
    const second = navMap.resolve(layerId, -1, -1, [1]);

    expect(first[0].dataItem).toBe(cloud.dataItems[0]);
    expect(first[0].kind).toBe('point');
    expect(second[0].dataItem).toBe(cloud.dataItems[1]);
  });

  it('resolves every point of a multi-point cloud selection', () => {
    // A scatter column selects every point sharing an X, and a grid cell every
    // point binned into it, so one position routinely covers several marks.
    const cloud = cloudSeries('DE', [
      { valueX: 1, valueY: 2 },
      { valueX: 3, valueY: 4 },
    ], {
      maidr: { type: 'volcano' },
    });
    const navMap = navMapOf([cloud]);
    const layerId = layersOf([cloud])[0].id;

    const both = navMap.resolve(layerId, -1, -1, [0, 1]);

    expect(both.map(target => target.dataItem)).toEqual([
      cloud.dataItems[0],
      cloud.dataItems[1],
    ]);
  });

  it('clears rather than guesses when a cloud carries no point indices', () => {
    // A consumer that has not learned about `pointIndices` sends the -1 pair
    // through. Resolving to nothing keeps #895's honest blank instead of
    // outlining whichever mark sits at that ordinal.
    const cloud = cloudSeries('DE', [{ valueX: 1, valueY: 2 }], {
      maidr: { type: 'volcano' },
    });
    const navMap = navMapOf([cloud]);
    const layerId = layersOf([cloud])[0].id;

    expect(navMap.resolve(layerId, 0, 0)).toEqual([]);
    expect(navMap.resolve(layerId, -1, -1)).toEqual([]);
  });
});

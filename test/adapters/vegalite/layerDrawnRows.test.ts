/**
 * A layer of a layered spec read from the rows its marks are drawn from.
 *
 * A line, area or trail split into series is drawn one group per series, its
 * marks inside each, so its mark dataset is out of `view.data()`'s reach and
 * its rows were found by guessing its pipeline's name from its index. Where
 * the layer computes a column of its own -- a `window` rank, a `calculate` --
 * Vega-Lite gives it a pipeline of its own after its siblings', and the guess
 * for layer 1, `data_1`, is the first layer's. Its rows lack the column, and
 * every value was read as 0. Measured on vega-lite 5.23 with vega 5.33: a dot
 * layer of scores and a bump line ranking them, every rank read as 0.
 *
 * The view below imitates that compiled view: its datasets are named as
 * vega-lite names them, and its scenegraph holds each series' drawn marks.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const SCORES = [
  { team: 'Ash', round: 'R1', score: 10 },
  { team: 'Ash', round: 'R2', score: 2 },
  { team: 'Birch', round: 'R1', score: 8 },
  { team: 'Birch', round: 'R2', score: 9 },
];
const RANKED = SCORES.map(row => ({ ...row, rank: row.round === 'R1' ? (row.team === 'Ash' ? 1 : 2) : (row.team === 'Ash' ? 2 : 1) }));
const RANK = [{ window: [{ op: 'rank', as: 'rank' }], groupby: ['round'], sort: [{ field: 'score', order: 'descending' }] }];
const ROUND = { field: 'round', type: 'ordinal' };

/**
 * A group mark holding other marks, one item per group drawn.
 * @param name - The group's name
 * @param groups - The marks inside each group drawn
 * @returns The group mark
 */
function group(name: string, groups: Array<Array<Record<string, unknown>>>): Record<string, unknown> {
  return { marktype: 'group', name, items: groups.map(marks => ({ items: marks })) };
}

/**
 * A drawn mark, one item per row.
 * @param marktype - What it draws
 * @param name - Its name
 * @param rows - The rows its items are drawn from
 * @returns The mark
 */
function mark(marktype: string, name: string, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return { marktype, name, items: rows.map(datum => ({ datum })) };
}

/**
 * A compiled view of a dot layer of the scores beside a second layer drawn
 * one group per team, its datasets named as vega-lite 5.23 names them: the
 * scores' filtered rows are `data_1`, the second layer's own pipeline
 * `data_2`.
 * @param lineMarks - The second layer's marks' name, as drawn inside each team's group
 * @param lineRows - The rows they are drawn from
 * @param options - What differs from that compiled view
 * @param options.marktype - What the second layer draws; a line by default
 * @param options.data1 - The rows of `data_1`; the scores by default
 * @returns The view
 */
function view(
  lineMarks: string,
  lineRows: Array<Record<string, unknown>>,
  { marktype = 'line', data1 = SCORES }: { marktype?: string; data1?: Array<Record<string, unknown>> } = {},
): VegaView {
  const datasets: Record<string, Array<Record<string, unknown>>> = { source_0: SCORES, data_1: data1, data_2: lineRows };
  const teams = ['Ash', 'Birch'];
  const root = group('root', [[
    mark('symbol', 'layer_0_marks', SCORES),
    group(lineMarks.replace(/_marks$/, '_pathgroup'), teams.map(team => [mark(marktype, lineMarks, lineRows.filter(row => row.team === team))])),
  ]]);
  return {
    data: (name: string) => {
      if (!datasets[name])
        throw new Error(`no dataset ${name}`);
      return datasets[name];
    },
    container: () => null,
    runAsync: async (): Promise<unknown> => undefined,
    scale: () => undefined,
    scenegraph: () => ({ root }),
  } as unknown as VegaView;
}

/**
 * The second layer's values, series by series.
 * @param spec - The layered spec
 * @param compiled - Its compiled view
 * @returns Each series' values
 */
function lineValues(spec: VegaLiteSpec, compiled: VegaView): Array<Array<number | null>> {
  const layer = vegaLiteToMaidr(spec, compiled).subplots[0][0].layers[1];
  return (layer.data as LinePoint[][]).map(series => series.map(point => point.y));
}

const DOTS = { mark: 'point', encoding: { x: ROUND, y: { field: 'score', type: 'quantitative' } } };

describe('vega-lite layers drawn one group per series', () => {
  it('reads a bump line ranking its own rows from the rows it is drawn from', () => {
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, { transform: RANK, mark: 'line', encoding: { x: ROUND, y: { field: 'rank', type: 'ordinal' }, color: { field: 'team', type: 'nominal' } } }],
    } as unknown as VegaLiteSpec;

    const layer = vegaLiteToMaidr(spec, view('layer_1_marks', RANKED)).subplots[0][0].layers[1];

    // Before: every rank 0, read off the scores' rows.
    expect(layer.type).toBe(TraceType.BUMP);
    expect((layer.data as LinePoint[][]).map(series => series.map(point => point.y))).toEqual([[1, 2], [2, 1]]);
  });

  it('reads a line of a column it calculates from the rows it is drawn from', () => {
    const doubled = SCORES.map(row => ({ ...row, double: row.score * 2 }));
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, {
        transform: [{ calculate: 'datum.score * 2', as: 'double' }],
        mark: 'line',
        encoding: { x: ROUND, y: { field: 'double', type: 'quantitative' }, color: { field: 'team', type: 'nominal' } },
      }],
    } as unknown as VegaLiteSpec;

    expect(lineValues(spec, view('layer_1_marks', doubled))).toEqual([[20, 4], [16, 18]]);
  });

  it('reads a line drawn with points from the path a level down', () => {
    // Vega-Lite draws the line of `point: true` as `layer_1_layer_0_marks`
    // and its points as `layer_1_layer_1_marks`.
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, { transform: RANK, mark: { type: 'line', point: true }, encoding: { x: ROUND, y: { field: 'rank', type: 'ordinal' }, color: { field: 'team', type: 'nominal' } } }],
    } as unknown as VegaLiteSpec;

    expect(lineValues(spec, view('layer_1_layer_0_marks', RANKED))).toEqual([[1, 2], [2, 1]]);
  });

  it('reads a trail drawn with points from the path a level down', () => {
    // Vega-Lite overlays points on a trail as on a line, so the trail is
    // `layer_1_layer_0_marks` too.
    const doubled = SCORES.map(row => ({ ...row, double: row.score * 2 }));
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, {
        transform: [{ calculate: 'datum.score * 2', as: 'double' }],
        mark: { type: 'trail', point: true },
        encoding: { x: ROUND, y: { field: 'double', type: 'quantitative' }, color: { field: 'team', type: 'nominal' } },
      }],
    } as unknown as VegaLiteSpec;

    expect(lineValues(spec, view('layer_1_layer_0_marks', doubled, { marktype: 'trail' }))).toEqual([[20, 4], [16, 18]]);
  });

  it('reads an area of a column it calculates from the rows it is drawn from', () => {
    const doubled = SCORES.map(row => ({ ...row, double: row.score * 2 }));
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, {
        transform: [{ calculate: 'datum.score * 2', as: 'double' }],
        mark: 'area',
        encoding: { x: ROUND, y: { field: 'double', type: 'quantitative' }, color: { field: 'team', type: 'nominal' } },
      }],
    } as unknown as VegaLiteSpec;

    expect(lineValues(spec, view('layer_1_marks', doubled, { marktype: 'area' }))).toEqual([[20, 4], [16, 18]]);
  });

  it('reads the guessed rows where the drawn ones lack a column the line reads', () => {
    // The drawn rows are kept only when they carry the line's columns, as a
    // guessed table is; here they lack the rank, and `data_1` has it.
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, { transform: RANK, mark: 'line', encoding: { x: ROUND, y: { field: 'rank', type: 'ordinal' }, color: { field: 'team', type: 'nominal' } } }],
    } as unknown as VegaLiteSpec;

    expect(lineValues(spec, view('layer_1_marks', SCORES, { data1: RANKED }))).toEqual([[1, 2], [2, 1]]);
  });

  it.each([['bar', 'rect'], ['point', 'symbol']])('reads a layered %s layer as before, from the guessed rows', (markType, marktype) => {
    // Only a line, an area or a trail is read off the scenegraph. The drawn
    // rows here differ from the guessed `data_1`, to tell which is read.
    const drawn = SCORES.map(row => ({ ...row, score: row.score + 100 }));
    const spec = {
      data: { values: SCORES },
      layer: [DOTS, { mark: markType, encoding: { x: ROUND, y: { field: 'score', type: 'quantitative' }, color: { field: 'team', type: 'nominal' } } }],
    } as unknown as VegaLiteSpec;

    const layer = vegaLiteToMaidr(spec, view('layer_1_marks', drawn, { marktype })).subplots[0][0].layers[1];

    const values = (layer.data as unknown[]).flat().map(point => (point as { y: number }).y);
    expect([...values].sort((a, b) => a - b)).toEqual([2, 8, 9, 10]);
  });
});

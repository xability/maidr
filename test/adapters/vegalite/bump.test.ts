import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * A three-round league table, ranked by a `window` transform.
 *
 * `data_0` is the compiled pipeline as vega-lite 6.4.3 / vega 6.3.1
 * actually produce it — the source rows with the ranked column appended,
 * still in input order. The view renders three sibling
 * `g.mark-line.role-mark.marks` groups, one `<path>` each.
 *
 * Ash falls from first to last while Cedar does the reverse, so a reading
 * that lost the rank cannot coincide with the right answer.
 */
const RANKED_ROWS = [
  { team: 'Ash', round: 'R1', score: 10, rank: 1 },
  { team: 'Ash', round: 'R2', score: 5, rank: 3 },
  { team: 'Ash', round: 'R3', score: 2, rank: 3 },
  { team: 'Birch', round: 'R1', score: 8, rank: 2 },
  { team: 'Birch', round: 'R2', score: 9, rank: 2 },
  { team: 'Birch', round: 'R3', score: 6, rank: 2 },
  { team: 'Cedar', round: 'R1', score: 3, rank: 3 },
  { team: 'Cedar', round: 'R2', score: 12, rank: 1 },
  { team: 'Cedar', round: 'R3', score: 11, rank: 1 },
];

const BUMP_SPEC: VegaLiteSpec = {
  transform: [
    {
      window: [{ op: 'rank', as: 'rank' }],
      groupby: ['round'],
      sort: [{ field: 'score', order: 'descending' }],
    },
  ],
  mark: 'line',
  encoding: {
    x: { field: 'round', type: 'ordinal', title: 'Round' },
    y: { field: 'rank', type: 'quantitative', title: 'Rank' },
    color: { field: 'team', type: 'nominal', title: 'Team' },
  },
};

/**
 * Convert a spec and assert it produced exactly one layer.
 * @param spec The Vega-Lite spec to convert
 * @param datasets The compiled view's datasets, when the test supplies one
 * @returns The single converted layer
 */
function onlyLayer(
  spec: VegaLiteSpec,
  datasets?: Record<string, unknown[]>,
): MaidrLayer {
  const result = vegaLiteToMaidr(spec, datasets ? makeView(datasets) : undefined);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite lines over a rank window', () => {
  it('converts a ranked line chart into a bump layer', () => {
    const layer = onlyLayer(BUMP_SPEC, { data_0: RANKED_ROWS });

    expect(layer.type).toBe(TraceType.BUMP);
    expect(layer.axes?.x?.label).toBe('Round');
    expect(layer.axes?.y?.label).toBe('Rank');
  });

  it('carries the ranks as a multi-line payload, one row per competitor', () => {
    const layer = onlyLayer(BUMP_SPEC, { data_0: RANKED_ROWS });

    // `BumpTrace` reads the line payload unchanged; what it does
    // differently is invert the pitch, since rank 1 is the best position.
    expect(layer.data as LinePoint[][]).toEqual([
      [
        { x: 'R1', y: 1, z: 'Ash' },
        { x: 'R2', y: 3, z: 'Ash' },
        { x: 'R3', y: 3, z: 'Ash' },
      ],
      [
        { x: 'R1', y: 2, z: 'Birch' },
        { x: 'R2', y: 2, z: 'Birch' },
        { x: 'R3', y: 2, z: 'Birch' },
      ],
      [
        { x: 'R1', y: 3, z: 'Cedar' },
        { x: 'R2', y: 1, z: 'Cedar' },
        { x: 'R3', y: 1, z: 'Cedar' },
      ],
    ]);
  });

  it('emits one line selector per competitor', () => {
    const layer = onlyLayer(BUMP_SPEC, { data_0: RANKED_ROWS });

    // Vega renders one sibling `mark-line` group per colour, each holding
    // a single `<path>`; the caller resolves the rth in document order.
    expect(layer.selectors).toEqual([
      'g.mark-line.role-mark.marks > path, g.mark-line.role-mark.layer_0_marks > path',
      'g.mark-line.role-mark.marks > path, g.mark-line.role-mark.layer_0_marks > path',
      'g.mark-line.role-mark.marks > path, g.mark-line.role-mark.layer_0_marks > path',
    ]);
  });

  it('accepts a dense rank', () => {
    const layer = onlyLayer(
      {
        ...BUMP_SPEC,
        transform: [{ window: [{ op: 'dense_rank', as: 'rank' }], groupby: ['round'] }],
      },
      { data_0: RANKED_ROWS },
    );

    expect(layer.type).toBe(TraceType.BUMP);
  });

  it('leaves a line a line when the rank is computed but not plotted', () => {
    // The same window transform is how a spec picks a top-n before drawing
    // the underlying magnitude, which is an ordinary line chart.
    const layer = onlyLayer(
      {
        ...BUMP_SPEC,
        encoding: { ...BUMP_SPEC.encoding, y: { field: 'score', type: 'quantitative' } },
      },
      { data_0: RANKED_ROWS },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves a line a line when nothing ranks', () => {
    const layer = onlyLayer(
      { ...BUMP_SPEC, transform: undefined },
      { data_0: RANKED_ROWS },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('does not read a row counter as a rank', () => {
    // `row_number` counts rows in whatever order they arrive and says
    // nothing about the values, so a line against it is not a bump chart.
    const layer = onlyLayer(
      {
        ...BUMP_SPEC,
        transform: [{ window: [{ op: 'row_number', as: 'rank' }] }],
      },
      { data_0: RANKED_ROWS },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('keeps a stepped rank line a step chart', () => {
    // The staircase is what the mark draws, and losing it would misreport
    // the chart in a way the rank reading does not make up for.
    const layer = onlyLayer(
      { ...BUMP_SPEC, mark: { type: 'line', interpolate: 'step-after' } },
      { data_0: RANKED_ROWS },
    );

    expect(layer.type).toBe(TraceType.STEP);
  });
});

/** A compiled scale: the pixel it draws a value at, and its domain. */
type ScaleStub = ((value: unknown) => number | undefined) & { domain: () => unknown[] };

/**
 * A continuous scale from `domain` onto `range`, as Vega's linear scale.
 * @param domain The domain's two ends
 * @param range The pixels they are drawn at
 * @returns The scale
 */
function linear(domain: [number, number], range: [number, number]): ScaleStub {
  const scale = (value: unknown): number =>
    range[0] + (Number(value) - domain[0]) * (range[1] - range[0]) / (domain[1] - domain[0]);
  return Object.assign(scale, { domain: () => domain });
}

/**
 * A discrete scale placing each value of `domain` at a pixel of `at`, as
 * Vega's point scale.
 * @param domain The values, in the order the scale lays them out
 * @param at The pixel each is drawn at
 * @returns The scale
 */
function point(domain: unknown[], at: number[]): ScaleStub {
  const scale = (value: unknown): number | undefined => at[domain.indexOf(value)];
  return Object.assign(scale, { domain: () => domain });
}

/**
 * The test view, with a compiled y scale of its own.
 * @param y The y scale
 * @returns The view
 */
function viewWithY(y: ScaleStub): VegaView {
  return viewWithScales({ y });
}

/**
 * The test view, with compiled scales of its own, throwing as Vega does for
 * a name it does not know.
 * @param scales The scales, by name
 * @returns The view
 */
function viewWithScales(scales: Record<string, ScaleStub>): VegaView {
  return {
    ...makeView({ data_0: RANKED_ROWS }),
    scale: (name: string) => {
      if (!(name in scales))
        throw new Error(`Unrecognized scale or projection: ${name}`);
      return scales[name];
    },
  };
}

/**
 * The bump spec with its y channel changed.
 * @param y The channel's changes
 * @returns The spec
 */
function withY(y: Record<string, unknown>): VegaLiteSpec {
  return { ...BUMP_SPEC, encoding: { ...BUMP_SPEC.encoding, y: { ...BUMP_SPEC.encoding?.y, ...y } } } as VegaLiteSpec;
}

/**
 * Where the one layer a spec converts to says first place is drawn.
 * @param spec The spec
 * @param view The compiled view, if any
 * @returns The layer's `firstPlace`
 */
function firstPlace(spec: VegaLiteSpec, view?: VegaView): MaidrLayer['firstPlace'] {
  return vegaLiteToMaidr(spec, view).subplots[0][0].layers[0].firstPlace;
}

/**
 * Where the one bump layer a spec converts to, among others, says first
 * place is drawn.
 * @param spec The spec
 * @param view The compiled view, if any
 * @returns The bump layer's `firstPlace`
 */
function bumpFirstPlace(spec: VegaLiteSpec, view?: VegaView): MaidrLayer['firstPlace'] {
  const layers = vegaLiteToMaidr(spec, view).subplots.flat().flatMap(subplot => subplot.layers);
  const bumps = layers.filter(layer => layer.type === TraceType.BUMP);
  expect(bumps).toHaveLength(1);
  return bumps[0].firstPlace;
}

/** A dot layer of the scores beside the bump line, as a second layer to share a scale with. */
const SCORES = { mark: 'point', encoding: { x: { field: 'round', type: 'ordinal' }, y: { field: 'score', type: 'quantitative' } } };

/** The bump line on a `rank:O` axis listing the ranks last first, which draws rank 1 at the bottom. */
const RANKS_LISTED_LAST_FIRST = {
  mark: 'line',
  encoding: { ...BUMP_SPEC.encoding, y: { field: 'rank', type: 'ordinal', sort: [3, 2, 1] } },
};

/** The scores and the ranks, each on a y scale of its own. */
const INDEPENDENT_LAYERS = {
  transform: BUMP_SPEC.transform,
  resolve: { scale: { y: 'independent' } },
  layer: [SCORES, RANKS_LISTED_LAST_FIRST],
} as unknown as VegaLiteSpec;

// The three places on a 200-pixel axis where vega 5.33 draws them. `rank:Q`
// includes zero in its domain; `rank:O` lays its values out top first.
const RANK_Q = linear([0, 3], [200, 0]);
const RANK_Q_REVERSED = linear([0, 3], [0, 200]);
const RANK_O = point([1, 2, 3], [33, 100, 167]);
const RANK_O_REVERSED = point([1, 2, 3], [167, 100, 33]);

/**
 * Without a view: the ways a spec turns each scale type round, and where
 * vega-lite 5.23 then draws first place.
 */
const FROM_THE_SPEC: Array<[string, Record<string, unknown>, 'top' | 'bottom']> = [
  ['rank:Q', {}, 'bottom'],
  ['rank:Q reversed', { scale: { reverse: true } }, 'top'],
  ['rank:Q with its domain written largest first', { scale: { domain: [3, 1] } }, 'top'],
  ['rank:Q with its domain written largest first, reversed', { scale: { domain: [3, 1], reverse: true } }, 'bottom'],
  // A continuous scale's descending sort is compiled to `reverse`.
  ['rank:Q sorted descending', { sort: 'descending' }, 'top'],
  ['rank:O', { type: 'ordinal' }, 'top'],
  ['rank:O reversed', { type: 'ordinal', scale: { reverse: true } }, 'bottom'],
  ['rank:O sorted descending', { type: 'ordinal', sort: 'descending' }, 'bottom'],
  ['rank:O sorted descending, reversed', { type: 'ordinal', sort: 'descending', scale: { reverse: true } }, 'top'],
  ['rank:O with its domain written largest first', { type: 'ordinal', scale: { domain: [3, 2, 1] } }, 'bottom'],
  // A domain written out is the order a discrete scale draws, sorted or not.
  ['rank:O with its domain written largest first, sorted descending', { type: 'ordinal', sort: 'descending', scale: { domain: [3, 2, 1] } }, 'bottom'],
  // Rank 1 is drawn below rank 3 though the domain does not end with it.
  ['rank:O with its domain written 2, 3, 1', { type: 'ordinal', scale: { domain: [2, 3, 1] } }, 'bottom'],
  // A `reverse` written out wins over a descending sort's.
  ['rank:Q sorted descending, not reversed', { sort: 'descending', scale: { reverse: false } }, 'bottom'],
  ['rank:Q reversed, without zero', { scale: { reverse: true, zero: false } }, 'top'],
  ['rank:O padded', { type: 'ordinal', scale: { padding: 0.2 } }, 'top'],
];

/**
 * Without a view: specs whose y channel draws first place somewhere the spec
 * alone does not say for certain, and which therefore say nothing.
 */
const NOT_CERTAIN_FROM_THE_SPEC: Array<[string, Record<string, unknown>]> = [
  ['rank:O sorted by a list of its ranks', { type: 'ordinal', sort: [3, 2, 1] }],
  ['rank:O sorted by another field', { type: 'ordinal', sort: { field: 'score' } }],
  ['a range written out', { scale: { range: [0, 200] } }],
  ['a reverse given as an expression', { scale: { reverse: { expr: 'true' } } }],
  ['no type, which Vega-Lite infers', { type: undefined }],
  ['a continuous domain of three values', { scale: { domain: [1, 2, 3] } }],
  ['a domain written as strings', { type: 'ordinal', scale: { domain: ['3', '2', '1'] } }],
];

describe('vega-Lite bump charts saying where first place is drawn', () => {
  it('says first place is at the top on a reversed rank:Q axis', () => {
    const spec = withY({ scale: { reverse: true } });

    expect(firstPlace(spec, viewWithY(RANK_Q_REVERSED))).toBe('top');
  });

  it('says first place is at the bottom on a rank:Q axis drawn the usual way up', () => {
    expect(firstPlace(BUMP_SPEC, viewWithY(RANK_Q))).toBe('bottom');
  });

  it('says first place is at the top on a rank:O axis, which lays its first value out at the top', () => {
    // The bump chart of the Vega-Lite and Altair galleries: unreversed, and
    // first place at the top all the same.
    const spec = withY({ type: 'ordinal' });

    expect(firstPlace(spec, viewWithY(RANK_O))).toBe('top');
  });

  it('says first place is at the bottom on a reversed rank:O axis', () => {
    const spec = withY({ type: 'ordinal', scale: { reverse: true } });

    expect(firstPlace(spec, viewWithY(RANK_O_REVERSED))).toBe('bottom');
  });

  it('goes by the drawn scale where the spec orders the axis in a way it does not read', () => {
    // A `sort` listing the ranks lays them out in that order, rank 1 last and
    // so at the bottom, which only the compiled scale knows.
    const spec = withY({ type: 'ordinal', sort: [3, 2, 1] });

    expect(firstPlace(spec, viewWithY(point([3, 2, 1], [33, 100, 167])))).toBe('bottom');
  });

  it('reads ranks written as strings as the numbers they are', () => {
    // The line's points read them as numbers, and this scale draws '1' lowest.
    const spec = withY({ type: 'ordinal', sort: ['3', '2', '1'] });

    expect(firstPlace(spec, viewWithY(point(['3', '2', '1'], [33, 100, 167])))).toBe('bottom');
  });

  it('reads ranks written as strings in their own order', () => {
    // '1', '2', '3', laid out from the top, as an unsorted rank:O of strings is.
    const spec = withY({ type: 'ordinal' });

    expect(firstPlace(spec, viewWithY(point(['1', '2', '3'], [33, 100, 167])))).toBe('top');
  });

  it('says nothing where the compiled domain holds one rank', () => {
    // One place says nothing about which way the axis runs.
    const spec = withY({ type: 'ordinal' });

    expect(firstPlace(spec, viewWithY(point([1], [100])))).toBeUndefined();
  });

  it('says nothing where the compiled domain holds no ranks', () => {
    const spec = withY({ type: 'ordinal' });

    expect(firstPlace(spec, viewWithY(point(['first', 'second', 'third'], [33, 100, 167])))).toBeUndefined();
  });

  it('says first place is at the top on an axis with no scale', () => {
    // Each rank is drawn its own number of pixels down the page, whatever
    // other scale the view holds.
    const spec = withY({ scale: null });

    expect(firstPlace(spec, makeView({ data_0: RANKED_ROWS }))).toBe('top');
    expect(firstPlace(spec)).toBe('top');
  });

  it('reads a layer\'s own scale where its layers\' y scales are independent', () => {
    const view = viewWithScales({
      layer_0_y: linear([0, 12], [200, 0]),
      layer_1_y: point([3, 2, 1], [33, 100, 167]),
    });

    expect(bumpFirstPlace(INDEPENDENT_LAYERS, view)).toBe('bottom');
  });

  it('reads the own scale of a layer of a concat child', () => {
    const child = { ...INDEPENDENT_LAYERS, transform: undefined, layer: [SCORES, { ...RANKS_LISTED_LAST_FIRST, transform: BUMP_SPEC.transform }] };
    const view = viewWithScales({
      concat_0_layer_0_y: linear([0, 12], [200, 0]),
      concat_0_layer_1_y: point([3, 2, 1], [33, 100, 167]),
    });

    expect(bumpFirstPlace({ hconcat: [child] } as unknown as VegaLiteSpec, view)).toBe('bottom');
  });

  it('reads a layer\'s shared scale where its layers share one', () => {
    const shared = { ...INDEPENDENT_LAYERS, resolve: undefined } as unknown as VegaLiteSpec;

    expect(bumpFirstPlace(shared, viewWithY(point([3, 2, 1], [33, 100, 167])))).toBe('bottom');
  });

  it('says nothing for a layer of a layered spec without a view', () => {
    // The scale it shares also takes in its siblings' settings.
    const shared = { ...INDEPENDENT_LAYERS, resolve: undefined, layer: [SCORES, withY({ type: 'ordinal' })] } as unknown as VegaLiteSpec;

    expect(bumpFirstPlace(shared)).toBeUndefined();
  });

  it.each(FROM_THE_SPEC)('reads %s from the spec without a view', (_label, y, expected) => {
    expect(firstPlace(withY(y))).toBe(expected);
  });

  it.each(NOT_CERTAIN_FROM_THE_SPEC)('says nothing from the spec without a view on %s', (_label, y) => {
    expect(firstPlace(withY(y))).toBeUndefined();
  });

  it('says nothing on a line that is not a bump chart', () => {
    const spec = { ...BUMP_SPEC, transform: undefined };

    expect(firstPlace(spec, viewWithY(RANK_Q))).toBeUndefined();
  });
});

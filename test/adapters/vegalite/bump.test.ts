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
function point(domain: number[], at: number[]): ScaleStub {
  const scale = (value: unknown): number | undefined => at[domain.indexOf(Number(value))];
  return Object.assign(scale, { domain: () => domain });
}

/**
 * The test view, with a compiled y scale of its own.
 * @param y The y scale
 * @returns The view
 */
function viewWithY(y: ScaleStub): VegaView {
  return {
    ...makeView({ data_0: RANKED_ROWS }),
    scale: (name: string) => {
      if (name !== 'y')
        throw new Error(`Unrecognized scale or projection: ${name}`);
      return y;
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

// The three places on a 200-pixel axis where vega 5.33 draws them. `rank:Q`
// includes zero in its domain; `rank:O` lays its values out top first.
const RANK_Q = linear([0, 3], [200, 0]);
const RANK_Q_REVERSED = linear([0, 3], [0, 200]);
const RANK_O = point([1, 2, 3], [33, 100, 167]);
const RANK_O_REVERSED = point([1, 2, 3], [167, 100, 33]);

/** Without a view: each way up of each scale type, and where it puts first place. */
const FROM_THE_SPEC: Array<[string, Record<string, unknown>, 'top' | 'bottom']> = [
  ['rank:Q', {}, 'bottom'],
  ['rank:Q reversed', { scale: { reverse: true } }, 'top'],
  ['rank:O', { type: 'ordinal' }, 'top'],
  ['rank:O reversed', { type: 'ordinal', scale: { reverse: true } }, 'bottom'],
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

  it('goes by the drawn scale where the spec turns the axis round some other way', () => {
    // A domain written largest first draws rank 1 at the top without
    // `reverse`, which only the compiled scale knows.
    const spec = withY({ scale: { domain: [3, 1] } });

    expect(firstPlace(spec, viewWithY(linear([3, 1], [200, 0])))).toBe('top');
  });

  it.each(FROM_THE_SPEC)('reads %s from the spec without a view', (_label, y, expected) => {
    expect(firstPlace(withY(y))).toBe(expected);
  });

  it('says nothing on a line that is not a bump chart', () => {
    const spec = { ...BUMP_SPEC, transform: undefined };

    expect(firstPlace(spec, viewWithY(RANK_Q))).toBeUndefined();
  });
});

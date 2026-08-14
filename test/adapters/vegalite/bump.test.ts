import type { VegaLiteSpec } from '@adapters/vegalite/types';
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

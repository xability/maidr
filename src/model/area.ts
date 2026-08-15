import type { LinePoint, MaidrLayer, StepDirection } from '@type/grammar';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import { TraceType } from '@type/grammar';
import { LineTrace } from './line';
import { STEP_DIRECTION_LABEL, stepDataVertices } from './step';

/** Label the running total is announced under. */
const TOTAL = 'Total';

/** Spoken plot type, per variant, for the instruction and layer-switch cues. */
const PLOT_TYPE_LABEL: Record<AreaVariant, string> = {
  area: 'area',
  stacked: 'stacked area',
  normalized: '100% stacked area',
};

/**
 * How a layer's bands relate to one another.
 *
 * `area` bands are independent and may overlap; `stacked` bands sit on one
 * another so their heights add up; `normalized` is `stacked` with the totals
 * scaled to a common whole.
 */
type AreaVariant = 'area' | 'stacked' | 'normalized';

/**
 * Reads a layer's type as an {@link AreaVariant}.
 *
 * @param type - The layer's declared trace type
 * @returns The variant, defaulting to `area` for a plain area layer
 */
function variantOf(type: TraceType): AreaVariant {
  switch (type) {
    case TraceType.STACKED_AREA:
      return 'stacked';
    case TraceType.NORMALIZED_AREA:
      return 'normalized';
    default:
      return 'area';
  }
}

/**
 * Drop a stepped band's return journey along the baseline, if it has one.
 *
 * A closed band walks its top edge and then comes back along the baseline,
 * adding exactly one vertex per sample. So a closed staircase is `3N - 1`
 * vertices for `hv`/`vh` and `3N` for `mid`, against `2N - 1` and `2N` for a
 * top edge stroked on its own.
 *
 * Matched exactly rather than by "longer than a top edge", which is what this
 * was and which misread a `mid` band: its `2N` top edge is already longer than
 * the `2N - 1` an `hv` one has, so the test fired on a path with no baseline
 * at all and sliced away real samples. Plotly strokes the edge separately —
 * `path.js-line` carries no baseline — so that case is the common one, not the
 * exotic one.
 *
 * A count matching neither is left whole: {@link stepDataVertices} answers
 * `null` for it and the caller falls back to interpolation, which is the right
 * recovery for geometry this does not recognise.
 *
 * @param coordinates - Vertices parsed from the path
 * @param expected - How many samples the series has
 * @returns The vertices with any baseline removed
 */
function withoutBaseline(coordinates: LinePoint[], expected: number): LinePoint[] {
  if (expected <= 0) {
    return coordinates;
  }
  const closedLengths = [3 * expected - 1, 3 * expected];
  return closedLengths.includes(coordinates.length)
    ? coordinates.slice(0, coordinates.length - expected)
    : coordinates;
}

/**
 * Whether a magnitude is a real number the totals may include.
 *
 * A gap travels as `NaN`, and `NaN` spreads: summing one into a column total
 * would make the total `NaN` and announce a stack height for the whole column
 * that no part of the chart draws. Mirrors `isMeasured` in `bar.ts`, which
 * guards `SegmentedTrace`'s summary level for the same reason.
 *
 * @param value - A magnitude read off a point
 * @returns True when the value can be added to a total
 */
function isMeasured(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Trace implementation for area charts — a line with the region between it
 * and a baseline filled in.
 *
 * For a plain area layer the fill is decoration: the navigable data is one
 * value per sample, exactly as for a line, and everything numeric is
 * inherited from {@link LineTrace} unchanged. What this class adds there is
 * an honest chart-type announcement, so a reader is told they are on an area
 * chart rather than on a line.
 *
 * The stacked variants are why this is a trace type rather than a flag. A
 * stacked area draws *two* magnitudes per sample — the band's height is its
 * own series' value, the band's top edge is the running total of every series
 * at that x — and a line reading collapses them to one, with nothing in the
 * announcement to say which. This class recovers the second: the running
 * total, and the point's share of it, ride alongside the value in
 * {@link TextState.stack}.
 *
 * The total is computed here rather than expected from the producer. Charting
 * libraries disagree about whether a stacked layer's `y` is the series value
 * or the already-accumulated edge, and asking every adapter to normalise that
 * would put the same arithmetic in each of them. Summing the series MAIDR was
 * given keeps one definition in one place.
 */
export class AreaTrace extends LineTrace {
  private readonly variant: AreaVariant;

  /**
   * Stack height at each x, keyed by the x value itself, or `null` for an
   * unstacked layer which has no total to report.
   *
   * Keyed rather than indexed, and that is load-bearing. `this.col` is the
   * cursor's position *within its own series*, so on a series that starts
   * late — the very case the totals are matched by x to survive — column 0 is
   * not the first x of the chart. An array indexed off another series' order
   * would answer with a neighbouring column's total, and the share it implied
   * could exceed 100%, which no stacked chart can draw.
   *
   * Computed once because trace data is immutable; a live-data update
   * rebuilds the trace rather than mutating it.
   */
  private readonly columnTotals: Map<string, number> | null;

  /**
   * How the boundary moves between samples, when the producer says.
   *
   * `line.shape` and a fill are independent in every library that has both,
   * so a filled band can be a staircase — a stacked step area is the standard
   * way to draw a cumulative count that changes at discrete events. Read as a
   * smoothly interpolated band it tells a reader the wrong thing about every
   * interval: that the value slid between samples when it in fact held and
   * then jumped.
   *
   * Carried alongside the fill rather than replacing it, because the two
   * facts are orthogonal and a reader needs both. `undefined` for an ordinary
   * area, which is the shape of every producer that does not say.
   */
  private readonly stepDirection?: StepDirection;

  /**
   * Creates a new area trace.
   *
   * @param layer - The MAIDR layer carrying the area data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.variant = variantOf(layer.type);
    this.columnTotals = this.variant === 'area' ? null : this.computeColumnTotals();
    this.stepDirection = layer.stepDirection;
  }

  /**
   * Maps the vertices of a rendered band back onto the data points.
   *
   * A plain band needs nothing from here: its path draws the data out along
   * the top edge and then returns along the baseline, so the surplus is
   * trailing* and the inherited trim-from-the-end keeps exactly the samples.
   * `areaHighlight.test.ts` pins that, and it is why this override guards on
   * `stepDirection` rather than running for every area.
   *
   * A stepped band carries both kinds of surplus at once. Its top edge has the
   * corner vertices the steps introduce — `2N - 1` for `hv`/`vh`, `2N` for
   * `mid` — and its return journey adds `N` more, so trimming from the end
   * removes the baseline and leaves the corners interleaved among the samples.
   * The highlight then lands on a corner: measured with a four-sample `hv`
   * band, the second highlight sat on the held value at the next x rather than
   * on the sample, and every one after it was displaced too.
   *
   * So {@link withoutBaseline} drops the return journey first, and what
   * remains is handed to the same {@link stepDataVertices} that `StepTrace`
   * uses. Sharing that rather than repeating it keeps the two from disagreeing
   * about which vertex is a sample, which is the failure this method exists to
   * prevent — and it is why a band whose edge is stroked on its own, carrying
   * no baseline to drop, needs no separate handling here.
   *
   * @param coordinates - Vertices parsed from the path, mutated in place
   * @param row - Index of the series these coordinates belong to
   */
  protected override reconcilePathCoordinates(
    coordinates: LinePoint[],
    row: number,
  ): void {
    // `this.layer`, not `this.stepDirection`, and that is load-bearing for
    // the same reason `StepTrace` reads `this.points` here rather than its own
    // field: this method runs during `super(layer)` -- LineTrace's constructor
    // calls mapToSvgElements, which reaches this override -- so nothing this
    // class assigns exists yet. Reading the field instead made it `undefined`
    // for every band and fell straight through to the inherited trim, which is
    // precisely the bug this override was added to fix. `AbstractTrace`
    // assigns `layer` before any subclass work, so it is readable.
    if (this.layer.stepDirection === undefined) {
      super.reconcilePathCoordinates(coordinates, row);
      return;
    }

    const expected = this.points[row]?.length ?? 0;
    const dataVertices = stepDataVertices(
      withoutBaseline(coordinates, expected),
      expected,
    );
    if (dataVertices !== null) {
      coordinates.length = 0;
      coordinates.push(...dataVertices);
      return;
    }

    super.reconcilePathCoordinates(coordinates, row);
  }

  /**
   * Sums every series at each x position.
   *
   * Series are matched by x value rather than by column index. Stacking is
   * only defined when the series share their x samples, but a producer may
   * still emit them ragged — a series that starts late, or drops a gap — and
   * indexing by column would then add one series' value at 2019 to another's
   * at 2020 and announce the result as that column's total. Matching by x
   * lets a series that has nothing at this x contribute nothing, which is the
   * honest reading.
   *
   * Every x any series carries gets an entry, not only those the first series
   * happens to have: a chart whose later series run past the first one still
   * draws a stack over those columns, and a cursor that can reach a point can
   * ask what stack it is in.
   *
   * @returns The stack height at each x, keyed by that x
   */
  private computeColumnTotals(): Map<string, number> {
    const totals = new Map<string, number>();
    for (const series of this.points) {
      for (const point of series) {
        const key = String(point.x);
        const value = Number(point.y);
        const running = totals.get(key);
        if (!isMeasured(value)) {
          // A column reached only by gaps has no total, only an absence.
          // Reporting 0 would announce a stack height the chart never drew.
          if (running === undefined) {
            totals.set(key, Number.NaN);
          }
          continue;
        }
        const carried = running !== undefined && isMeasured(running) ? running : 0;
        totals.set(key, carried + value);
      }
    }
    return totals;
  }

  /**
   * Announces this trace as an area chart — and, for a stacked layer, says so
   * — rather than falling back to the raw layer type.
   *
   * @returns The trace state with `plotType` set for the variant
   */
  public override get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty) {
      return baseState;
    }

    return { ...baseState, plotType: PLOT_TYPE_LABEL[this.variant] };
  }

  /**
   * Adds the running total, and the point's share of it, to the announcement
   * of a stacked layer. An unstacked area has no total to add and is
   * announced exactly as a line is.
   *
   * @returns The text state for the current point
   */
  protected override get text(): TextState {
    const baseText = super.text;
    if (this.columnTotals === null) {
      return baseText;
    }

    // Look the total up by the x under the cursor, never by `this.col` —
    // that index is local to the current series, so on a series that starts
    // late it names a different x than it does on the first one.
    const point = this.points[this.row]?.[this.col];
    const total = point === undefined
      ? undefined
      : this.columnTotals.get(String(point.x));
    if (total === undefined || !isMeasured(total)) {
      return baseText;
    }

    const value = Number(point.y);
    // A zero total is reachable — series that cancel out, or a column of
    // zeros — and dividing by it yields Infinity or NaN. Report the total and
    // stay silent about the share rather than announcing a share of nothing.
    const share = isMeasured(value) && total !== 0 ? value / total : undefined;

    return { ...baseText, stack: { label: TOTAL, value: total, share } };
  }

  /**
   * Adds the range of the running total to the chart description of a stacked
   * layer.
   *
   * The aggregate is the reason a stacked area is drawn rather than a set of
   * separate ones, and it is exactly what the inherited per-series statistics
   * cannot show: `Min value` and `Max value` describe the tallest single band,
   * not the tallest stack.
   *
   * @returns The description state for this trace
   */
  public override get description(): DescriptionState {
    const baseDescription = super.description;
    const stats = [...baseDescription.stats];

    // Announced for every variant, not only a stacked one. How the boundary
    // moves between samples is a fact about the shape, and an unstacked step
    // area is as misread without it as a stacked one.
    if (this.stepDirection !== undefined) {
      stats.push({
        label: 'Step direction',
        value: STEP_DIRECTION_LABEL[this.stepDirection],
      });
    }

    const totals
      = this.columnTotals === null
        ? []
        : [...this.columnTotals.values()].filter(isMeasured);
    if (totals.length > 0) {
      stats.push(
        { label: 'Minimum total', value: Math.min(...totals) },
        { label: 'Maximum total', value: Math.max(...totals) },
      );
    }

    return stats.length === baseDescription.stats.length
      ? baseDescription
      : { ...baseDescription, stats };
  }
}

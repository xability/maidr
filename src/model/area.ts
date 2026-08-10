import type { MaidrLayer } from '@type/grammar';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import { TraceType } from '@type/grammar';
import { LineTrace } from './line';

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
   * Running total per column — the stack height at each x — or `null` for an
   * unstacked layer, which has no total to report.
   *
   * Computed once because trace data is immutable; a live-data update
   * rebuilds the trace rather than mutating it.
   */
  private readonly columnTotals: number[] | null;

  /**
   * Creates a new area trace.
   *
   * @param layer - The MAIDR layer carrying the area data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.variant = variantOf(layer.type);
    this.columnTotals = this.variant === 'area' ? null : this.computeColumnTotals();
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
   * @returns The stack height at each column of the first series
   */
  private computeColumnTotals(): number[] {
    const reference = this.points[0] ?? [];
    return reference.map((point) => {
      const key = String(point.x);
      let total = 0;
      let measured = false;
      for (const series of this.points) {
        const match = series.find(candidate => String(candidate.x) === key);
        const value = Number(match?.y);
        if (match !== undefined && isMeasured(value)) {
          total += value;
          measured = true;
        }
      }
      // A column where every series is a gap has no total, only an absence.
      // Reporting 0 there would announce a stack height the chart never drew.
      return measured ? total : Number.NaN;
    });
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

    const total = this.columnTotals[this.col];
    if (!isMeasured(total)) {
      return baseText;
    }

    const value = Number(this.points[this.row]?.[this.col]?.y);
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
    if (this.columnTotals === null) {
      return baseDescription;
    }

    const totals = this.columnTotals.filter(isMeasured);
    if (totals.length === 0) {
      return baseDescription;
    }

    return {
      ...baseDescription,
      stats: [
        ...baseDescription.stats,
        { label: 'Minimum total', value: Math.min(...totals) },
        { label: 'Maximum total', value: Math.max(...totals) },
      ],
    };
  }
}

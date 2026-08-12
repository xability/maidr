import type { MaidrLayer } from '@type/grammar';
import type { AudioState, DescriptionState, TextState, TraceState } from '@type/state';
import { MathUtil } from '@util/math';
import { isMeasured } from './bar';
import { SegmentedTrace } from './segmented';

/** What the summary row is called, in place of the segmented bar's "Sum". */
const BALANCE = 'Balance';

/**
 * Trace implementation for population pyramids and diverging bar charts.
 *
 * Two series drawn back to back across a shared category axis, one growing
 * left and one growing right -- a population pyramid by age band, or a Likert
 * scale split around a neutral midpoint. The category navigation is the
 * segmented bar's, so what is new is entirely in how a signed value is read.
 *
 * **The sign is a direction, not a magnitude.** A producer emits the values
 * as the chart draws them, so the left-hand series is negative. Pitched that
 * way, the biggest bar on the left becomes the lowest note on the chart: a
 * cohort of two million men sounds smaller than a cohort of ten thousand
 * women, and the pyramid is heard as a chart that sags on one side. The pitch
 * takes the magnitude and the announcement names the side, which is how a
 * sighted reader takes it in -- length from the bar, side from which way it
 * points.
 *
 * **The balance is the finding.** A pyramid is drawn back to back so the two
 * sides can be compared at a glance, and that comparison is a subtraction a
 * listener cannot do by ear across every band. Because the values arrive
 * signed, the summary row the segmented bar already builds -- the sum down a
 * category -- *is* that comparison: `(-left) + right` is what one side has
 * over the other. It is renamed rather than recomputed, since "Sum is
 * -40,000" invites a reader to hear a total that came out negative.
 */
export class DivergingTrace extends SegmentedTrace {
  /** Largest magnitude anywhere in the chart, ignoring which side it is on. */
  private readonly widest: number;

  /**
   * Creates a new diverging bar trace.
   *
   * @param layer - The MAIDR layer carrying the two sides
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    // Over every row, balance included. On a well-formed two-sided chart the
    // balance can never raise this -- one side is negative and the other
    // positive, so |left + right| never exceeds the larger of the two -- but
    // taking the flat rather than slicing the balance off keeps the reading
    // inside the register for a chart that is shaped otherwise, at no cost.
    const magnitudes = this.barValues
      .flat()
      .filter(isMeasured)
      .map(value => Math.abs(value));
    this.widest = magnitudes.length > 0 ? MathUtil.safeMax(magnitudes) : 0;
  }

  /**
   * A diverging chart's sides are drawn in the order they are declared.
   *
   * `SegmentedTrace` defaults to reverse because a stacked bar's producers
   * draw its segments bottom-up. A diverging chart is not stacked -- the two
   * sides sit either side of a baseline rather than on top of one another --
   * so there is no stacking order to inherit, and a producer emits the left
   * bar then the right one, which is the order the data declares them in.
   *
   * The first example authored for this type got it wrong by following that
   * natural order, which is the evidence: an author who has to know about the
   * stacked bar's convention to draw a pyramid will not know about it. The
   * failure is silent and visual-only -- audio, text and braille never go
   * through the element mapping, so every announcement stays correct while
   * the highlight sits on the opposite bar.
   *
   * `domMapping.groupDirection` still overrides this in either direction.
   *
   * @returns True unless the layer asks for the reverse
   */
  protected override get groupsRunForward(): boolean {
    return this.layer.domMapping?.groupDirection !== 'reverse';
  }

  /**
   * Renames the summary row the segmented bar builds.
   *
   * @param row - Which row
   * @returns True when it is the appended summary
   */
  private isBalanceRow(row: number): boolean {
    return row === this.barValues.length - 1;
  }

  /**
   * Which row grows in a given direction.
   *
   * Resolved by reading the values rather than by index. Nothing obliges a
   * producer to declare the left-hand side first, and a fixed index names the
   * **wrong winner** for a chart that declares the right-hand side first --
   * a fluent, confident sentence with the two sides swapped, which on this
   * trace is the worst available failure: the sign is the one clue the
   * announcement deliberately removes, so a reader has nothing left to check
   * it against.
   *
   * @param positive - True for the side that grows right
   * @returns The row, or null when no side grows that way
   */
  private sideGrowing(positive: boolean): number | null {
    for (let row = 0; row < this.barValues.length - 1; row++) {
      const measured = this.barValues[row]?.find(
        value => isMeasured(value) && value !== 0,
      );
      if (measured !== undefined && (measured > 0) === positive) {
        return row;
      }
    }
    return null;
  }

  /**
   * Whether the chart is the two-sided one the balance reading assumes.
   *
   * "X ahead" is a comparison between exactly two sides. Nothing in the
   * grammar holds a diverging layer to two, and a chart with three would get
   * a winner named out of a sum that is not a two-way difference -- so a
   * chart that is not two-sided keeps the segmented bar's plain summary,
   * which stays true whatever the shape.
   *
   * @returns True when there are exactly two sides, one growing each way
   */
  private get isTwoSided(): boolean {
    return this.barValues.length - 1 === 2
      && this.sideGrowing(true) !== null
      && this.sideGrowing(false) !== null;
  }

  protected override get audio(): AudioState {
    const base = super.audio;
    const value = this.barValues[this.row][this.col];

    // Zero to widest, and the magnitude against it. The parent scales from the
    // chart's minimum, which on a diverging chart is the largest left-hand bar
    // -- so the left series would occupy the bottom of the register in reverse
    // order and the right series the top, and neither side's bars would be
    // comparable with the other's by ear.
    return {
      ...base,
      freq: {
        min: 0,
        max: this.widest,
        raw: isMeasured(value) ? Math.abs(value) : value,
      },
    };
  }

  protected override get text(): TextState {
    const base = super.text;
    const value = this.barValues[this.row][this.col];
    if (!isMeasured(value)) {
      return base;
    }

    const side = this.sideNameAt(this.row);
    const magnitude = Math.abs(value);
    // `cross` carries the bar's length in BOTH orientations -- the parent
    // swaps which point field feeds it, not which half of the announcement it
    // is -- so there is one slot to replace rather than two.
    const sized = (state: TextState): TextState => ({
      ...state,
      cross: { ...state.cross, value: magnitude },
    });

    if (this.isBalanceRow(this.row)) {
      if (!this.isTwoSided) {
        // Not a two-way difference, so it is a sum and says so.
        return base;
      }

      // Which side is ahead, and by how much. Signed, the same number reads as
      // a total that came out negative -- and on the balance row a minus sign
      // is not a smaller number, it is the other side winning.
      const ahead = this.sideGrowing(value > 0);
      return {
        ...sized(base),
        z: {
          label: BALANCE,
          value: magnitude === 0 || ahead === null
            ? 'level'
            : `${this.sideNameAt(ahead)} ahead`,
        },
      };
    }

    // The bar's own size. A reader hearing "-1,240,000" has to strip a sign
    // that says which side they are on, which the label beside it already
    // said.
    return { ...sized(base), z: { label: this.z, value: side } };
  }

  /**
   * What one side of the chart is called.
   *
   * The series' own name, which every segment carries. Falls back to the
   * direction it grows, so an unnamed chart still says which way a bar points
   * rather than leaving the sign as the only clue -- and the sign is exactly
   * what this trace removes from the announcement.
   *
   * @param row - Which series
   * @returns Its name
   */
  private sideNameAt(row: number): string {
    const authored = this.points[row]?.[0]?.z;
    if (authored !== undefined && authored !== null && String(authored) !== '') {
      return String(authored);
    }
    const measured = this.barValues[row]?.find(isMeasured) ?? 0;
    return measured < 0 ? 'left' : 'right';
  }

  public override get description(): DescriptionState {
    const base = super.description;
    const stats = [...base.stats];

    // One total per side, which is the number a pyramid is captioned with and
    // the one a reader cannot accumulate by ear across twenty age bands.
    for (let row = 0; row < this.barValues.length - 1; row++) {
      const total = this.barValues[row]
        .filter(isMeasured)
        .reduce((sum, value) => sum + Math.abs(value), 0);
      stats.push({ label: `${this.sideNameAt(row)} total`, value: total });
    }

    return { ...base, stats };
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    return { ...base, plotType: 'diverging bar' };
  }
}

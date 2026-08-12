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

    // Computed over every row INCLUDING the balance row the parent appends,
    // so a category whose balance exceeds either side's own bar still lands
    // inside the register rather than off the top of it.
    const magnitudes = this.barValues
      .flat()
      .filter(isMeasured)
      .map(value => Math.abs(value));
    this.widest = magnitudes.length > 0 ? MathUtil.safeMax(magnitudes) : 0;
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
      // Which side is ahead, and by how much. Signed, the same number reads as
      // a total that came out negative -- and on the balance row a minus sign
      // is not a smaller number, it is the other side winning.
      return {
        ...sized(base),
        z: {
          label: BALANCE,
          value: magnitude === 0
            ? 'level'
            : `${this.sideNameAt(value > 0 ? 1 : 0)} ahead`,
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

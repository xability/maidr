import type { MaidrLayer } from '@type/grammar';
import type { AudioState, DescriptionState, TextState, TraceState } from '@type/state';
import { Orientation } from '@type/grammar';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { isMeasured } from './bar';
import { SegmentedTrace } from './segmented';

/**
 * What the summary row is called, in place of the segmented bar's "Sum".
 *
 * @returns The label in the active language
 */
function balanceLabel(): string {
  return t('model.asideBalance');
}

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
    // is -- so there is one slot to replace rather than two. The clause is
    // optional on `TextState` for the traces that have no cross axis at all
    // (#1153); a diverging bar always has one, so a state arriving without it
    // is passed through rather than given a label invented here.
    const sized = (state: TextState): TextState => (
      state.cross === undefined
        ? state
        : { ...state, cross: { ...state.cross, value: magnitude } }
    );

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
          label: balanceLabel(),
          value: magnitude === 0 || ahead === null
            ? t('model.divergingLevel')
            : t('model.divergingAhead', { side: this.sideNameAt(ahead) }),
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
    // The whole row, not its first point alone. A producer that names only the
    // bands it drew a legend entry for leaves point 0 unnamed, and reading it
    // by itself then called the side `left` where the parent's own series list
    // -- which scans the row -- called it `Men`, two names for one side in one
    // dialog.
    const authored = this.points[row]?.find(point => point.z?.trim())?.z?.trim();
    if (authored !== undefined) {
      return authored;
    }
    // The direction is a name only where it picks out one side and one side
    // only. With three of them two grow the same way, so `right` stops
    // identifying a series and starts standing for two -- twice in the totals,
    // and twice down the table's own series column, where the parent's
    // numbering had given each of them a name of its own.
    if (!this.isTwoSided) {
      return t('model.nounSeriesNumbered', { index: row + 1 });
    }
    const measured = this.barValues[row]?.find(isMeasured) ?? 0;
    return t(measured < 0 ? 'model.divergingSideLeft' : 'model.divergingSideRight');
  }

  /**
   * What a category is called, as the chart's own axis holds it.
   *
   * @param col - Which category
   * @returns Its label
   */
  private bandNameAt(col: number): string {
    const point = this.points[0]?.[col];
    if (point === undefined) {
      return `${col + 1}`;
    }
    return String(this.orientation === Orientation.VERTICAL ? point.x : point.y);
  }

  /**
   * Every drawn bar's length, with the direction taken out.
   *
   * The balance row is left out: it is a difference between the sides rather
   * than a bar anybody drew, which is why the parent takes its own range over
   * the segments alone.
   *
   * @returns The magnitudes, one row per side
   */
  private magnitudes(): number[][] {
    return this.barValues
      .slice(0, -1)
      .map(row => row.map(value => (isMeasured(value) ? Math.abs(value) : value)));
  }

  public override get description(): DescriptionState {
    const base = super.description;

    // The parent's range is signed, and here the sign is which way a bar points
    // -- so `Min segment value: -1,200` reads as a negative population, and it
    // is the first number a reader meets, above the unsigned totals that
    // contradict it and against everything the pitch, the text and the braille
    // say. Replaced where the parent put it, so the range still sits where a
    // reader of any other bar chart looks for it.
    //
    // `Largest bar total` and `Smallest bar total` go entirely. They are taken
    // over the summary row, which on this chart is `(-left) + right`, so on a
    // pyramid whose bands hold thousands they report a largest bar total of a
    // hundred. `Widest gap` below is what those two numbers actually measure.
    const sizes = this.rangeStats(
      { min: 'model.statMinBarSize', max: 'model.statMaxBarSize' },
      this.magnitudes(),
    );
    const stats = base.stats.flatMap((stat) => {
      if (stat.label === t('model.statMinSegmentValue')) {
        return [sizes[0]];
      }
      if (stat.label === t('model.statMaxSegmentValue')) {
        return [sizes[1]];
      }
      if (
        stat.label === t('model.statLargestBarTotal')
        || stat.label === t('model.statSmallestBarTotal')
      ) {
        return [];
      }
      if (stat.label === this.seriesNamesLabel) {
        // Through this chart's own naming, which is what every other surface
        // uses: the totals below, the table's series column, and `get text` on
        // every move. An unnamed pyramid listed `Series 1, Series 2` here and
        // then reported `left total` and `right total` under it -- two naming
        // schemes for the same two sides, three lines apart, with nothing to
        // say they were the same sides.
        return [{
          label: stat.label,
          value: this.points
            .slice(0, -1)
            .map((_, row) => this.sideNameAt(row))
            .join(', '),
        }];
      }
      return [stat];
    });

    // One total per side, which is the number a pyramid is captioned with and
    // the one a reader cannot accumulate by ear across twenty age bands.
    const totals: { row: number; total: number }[] = [];
    for (let row = 0; row < this.barValues.length - 1; row++) {
      const total = this.barValues[row]
        .filter(isMeasured)
        .reduce((sum, value) => sum + Math.abs(value), 0);
      totals.push({ row, total });
      stats.push({ label: t('model.statSideTotal', { side: this.sideNameAt(row) }), value: total });
    }

    if (this.isTwoSided && totals.length === 2) {
      // The comparison the chart is drawn for. Its two operands are on the
      // lines above, but the subtraction across them is the one a listener
      // cannot do by ear -- and the per-band balance navigation announces
      // never accumulates into it.
      const [first, second] = totals;
      const leader = first.total >= second.total ? first : second;
      const gap = Math.abs(first.total - second.total);
      stats.push({
        label: t('model.statOverallBalance'),
        value: gap === 0
          ? t('model.divergingLevel')
          : t('model.divergingAheadBy', {
              side: this.sideNameAt(leader.row),
              gap: defaultFormat(gap),
            }),
      });
    }

    const widest = this.widestGap();
    if (widest !== null) {
      // Where the imbalance is, which the overall balance cannot say: a
      // pyramid whose sides match everywhere except one cohort and one that
      // leans the same way throughout have the same overall balance.
      stats.push({
        label: t('model.statWidestGap'),
        value: t('model.divergingWidestGapValue', {
          side: this.sideNameAt(widest.ahead),
          gap: defaultFormat(Math.abs(widest.balance)),
          band: this.bandNameAt(widest.col),
        }),
      });
    }

    return { ...base, stats, dataTable: { ...base.dataTable, rows: this.balancedRows(base) } };
  }

  /**
   * The label the parent files its series names under.
   *
   * Derived the same way {@link SegmentedTrace.description} derives it, since
   * the stat has to be found before it can be rewritten. A parent that renamed
   * it would leave the parent's own list standing rather than break anything,
   * which is the failure to prefer here.
   *
   * @returns The label to match on
   */
  private get seriesNamesLabel(): string {
    const zLabel = this.layer.axes?.z?.label?.trim();
    return zLabel
      ? t('model.statAxisCategoriesNamed', { axis: zLabel })
      : t('model.statSeriesNamesFallback');
  }

  /**
   * What the summary row's series cell says on a two-sided chart.
   *
   * The magnitude column has had the sign taken out of it, and on this row the
   * sign was the only thing carrying which side the lead belongs to -- so a
   * band where men lead by a hundred and one where women do printed as the
   * same two cells. `get text` names the side in words on exactly this row, so
   * the table says the same words, behind the row's own name so it is still
   * findable as the summary.
   *
   * @param col - Which category
   * @returns The cell text
   */
  private balanceNameAt(col: number): string {
    const balance = this.barValues.at(-1)?.[col] ?? Number.NaN;
    if (!isMeasured(balance)) {
      // Every segment of the band is a gap. The value cell beside this one
      // already says `missing`, and "level" would claim a comparison that was
      // never made.
      return balanceLabel();
    }
    if (balance === 0) {
      return t('model.divergingBalanceLevel', { balance: balanceLabel() });
    }
    const ahead = this.sideGrowing(balance > 0);
    return ahead === null
      ? balanceLabel()
      : t('model.divergingBalanceAhead', {
          balance: balanceLabel(),
          side: this.sideNameAt(ahead),
        });
  }

  /**
   * The category where one side leads the other by the most.
   *
   * Only for the two-sided chart, for the reason {@link isTwoSided} exists: on
   * any other shape the summary row is a sum, and the larger of two sums is
   * not a lead. A chart level in every band answers null -- `Overall balance`
   * already says level, and "ahead by 0" would not.
   *
   * @returns The winning side, its margin and the category, or null
   */
  private widestGap(): { ahead: number; balance: number; col: number } | null {
    if (!this.isTwoSided) {
      return null;
    }

    let widest: { balance: number; col: number } | null = null;
    for (const [col, balance] of (this.barValues.at(-1) ?? []).entries()) {
      if (isMeasured(balance)
        && (widest === null || Math.abs(balance) > Math.abs(widest.balance))) {
        widest = { balance, col };
      }
    }
    if (widest === null || widest.balance === 0) {
      return null;
    }

    const ahead = this.sideGrowing(widest.balance > 0);
    return ahead === null ? null : { ahead, balance: widest.balance, col: widest.col };
  }

  /**
   * The parent's table, read the way this chart's announcements read it.
   *
   * Two disagreements to settle. The magnitude column arrives signed, so a
   * reader checking `Men total: 2,800` against the table met -1200, -900, -700
   * and had to reconstruct the convention themselves -- while every
   * announcement, the pitch and the braille had already taken the sign out.
   * And the summary row a reader reaches with PageUp announces itself as the
   * balance and was then filed under the parent's `Sum`.
   *
   * Both follow `get text`: the balance keeps its sign and its name on a chart
   * that is not two-sided, because there the summary really is a sum and a
   * minus sign there really is a smaller number.
   *
   * @param base - The description the parent built
   * @returns The rows, unsigned and renamed
   */
  private balancedRows(base: DescriptionState): DescriptionState['dataTable']['rows'] {
    // Which cell each flattened row came from, built by flattening `points`
    // the way the parent flattens it, so the two cannot fall out of step.
    const cellOf = this.points.flatMap((group, row) =>
      group.map((_, col) => ({ row, col })));
    // Hoisted: it scans both sides to answer, and it is asked of every row of
    // the table twice over.
    const twoSided = this.isTwoSided;

    return base.dataTable.rows.map((row, index) => {
      const cell = cellOf[index];
      const balance = this.isBalanceRow(cell.row);
      const value = row[1];
      return [
        row[0],
        typeof value === 'number' && (!balance || twoSided)
          ? Math.abs(value)
          : value,
        balance
          ? (twoSided ? this.balanceNameAt(cell.col) : row[2])
          : this.sideNameAt(cell.row),
      ];
    });
  }

  public override get state(): TraceState {
    const base = super.state;
    if (base.empty) {
      return base;
    }

    return { ...base, plotType: t('model.plotTypeDivergingBarSpoken') };
  }
}

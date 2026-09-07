import type { MaidrLayer, VolcanoPoint } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import type { RotorFilterUnit } from './abstract';
import { defaultFormat } from '@util/format';
import { ScatterTrace } from './scatter';

/** Rotor unit that restricts navigation to the points clearing the threshold. */
const SIGNIFICANT_ROTOR_UNIT: RotorFilterUnit = {
  key: 'significant',
  label: 'Significant',
  noun: 'significant points',
};

/** How many named hits the description lists before it stops. */
const NAMED_HITS = 10;

/**
 * Trace implementation for volcano and Manhattan plots.
 *
 * A volcano puts effect size against significance; a Manhattan puts genomic
 * position against it. Both are scatters, so the navigation, the pitch and
 * the braille all transfer -- and both are read almost entirely through a
 * **threshold**, which is what a scatter has no notion of.
 *
 * **Point-by-point navigation is not a viable path here.** These charts
 * routinely carry tens of thousands of points of which a few dozen matter. A
 * reader who has to walk them has not been given access to the chart; they
 * have been given a very long list. So two things carry the weight:
 *
 * **The summary on entry.** "43 of 12,000 points above the significance
 * threshold" is the first thing a sighted reader takes from the shape of the
 * cloud, and the last thing a per-point reading would ever assemble.
 *
 * **A rotor filter over the points that clear it**, so the few dozen that
 * matter are reachable in a few dozen keystrokes rather than twelve thousand.
 *
 * **Identity is the payload.** A reader told "x is 2.3, y is 14.1" has been
 * given the two numbers the axes already describe and withheld the one thing
 * they came for, which is *which gene that is*. The label travels as an
 * aside, so it survives every one of the scatter's navigation modes and is
 * never run through an axis formatter -- a gene name is not a value on an
 * axis.
 *
 * **The threshold is declared, never guessed.** These charts sit on
 * transformed axes whose conventions differ by field and by tool: -log10(p)
 * at 1.3 for p < 0.05, at 7.3 for genome-wide significance, and a raw p axis
 * runs the other way entirely. A guessed line would sort every point on the
 * figure onto the wrong side of it, silently. A layer that declares none gets
 * the scatter's reading and no claim about significance.
 */
export class VolcanoTrace extends ScatterTrace {
  /** The significance cutoff on the y axis, when the layer declares one. */
  private readonly significance: number | null;

  /** The effect-size cutoff, applied to the magnitude of x. */
  private readonly effect: number | null;

  /**
   * Whether the significant points sit above the cutoff or below it.
   *
   * A transformed axis puts them above; a raw p axis puts them below. Fixed
   * to one of those, the other chart selects exactly the points that failed
   * to reach significance and announces them as the finding -- not a degraded
   * reading but the inverse of one.
   */
  private readonly significantAbove: boolean;

  /** Every point's identity and region, in the order the layer declared them. */
  private readonly declared: VolcanoPoint[];

  /** Indices into `flatPoints` of the points that clear the threshold. */
  private readonly significantIndices: number[];

  /**
   * Creates a new volcano trace.
   *
   * @param layer - The MAIDR layer carrying the points
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.declared = layer.data as VolcanoPoint[];
    this.significance = VolcanoTrace.declaredNumber(
      layer.thresholdOptions?.significance,
    );
    this.effect = VolcanoTrace.declaredNumber(layer.thresholdOptions?.effect);
    this.significantAbove
      = layer.thresholdOptions?.significanceDirection !== 'below';

    // Precomputed in reading order, because the rotor service asks twice per
    // keystroke and the points are fixed at construction -- the candlestick's
    // reasoning, and it matters more here where the list is long.
    this.significantIndices = this.readingOrder.filter(index =>
      this.clearsThreshold(index));
  }

  /**
   * A threshold the layer actually declared.
   *
   * @param value - Whatever the layer put there
   * @returns The number, or null
   */
  private static declaredNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /**
   * Whether a point clears every declared threshold.
   *
   * The effect cutoff is applied to the **magnitude** of x, because a volcano
   * is symmetric: a fold change of -2 is as large an effect as one of +2, and
   * a reading that only looked rightwards would drop half the findings.
   *
   * @param index - Index into `flatPoints`
   * @returns True when the point is one the chart was drawn to find
   */
  private clearsThreshold(index: number): boolean {
    if (this.significance === null && this.effect === null) {
      return false;
    }
    const point = this.flatPoints[index];
    if (point === undefined) {
      return false;
    }
    if (this.significance !== null) {
      const clears = this.significantAbove
        ? point.y >= this.significance
        : point.y <= this.significance;
      if (!clears) {
        return false;
      }
    }
    if (this.effect !== null && !(Math.abs(point.x) >= this.effect)) {
      return false;
    }
    return true;
  }

  /**
   * The point the cursor is on, when it is on exactly one.
   *
   * A label names a point, so it is announced only where the cursor
   * identifies one. The scatter's column and row modes sit on a whole stack
   * of points at once, and naming any of them there would name the wrong one.
   *
   * @returns The declared point, or null
   */
  private currentPoint(): VolcanoPoint | null {
    if (!this.isInPointMode) {
      return null;
    }
    return this.declared[this.pointModeIndex] ?? null;
  }

  protected override get text(): TextState {
    const base = super.text;
    const point = this.currentPoint();
    if (point === null) {
      return base;
    }

    // Asides rather than `z`: `z` is the scatter's density and is formatted
    // on an axis, and a gene name is not a value on one.
    const asides: { label: string; value: string }[] = [];
    if (typeof point.label === 'string' && point.label !== '') {
      asides.push({ label: 'Name', value: point.label });
    }
    if (typeof point.group === 'string' && point.group !== '') {
      asides.push({ label: 'Region', value: point.group });
    }
    if (this.significance !== null || this.effect !== null) {
      // Which side of the line the point is on, said the way the line is
      // declared. A raw p axis puts its findings *below* the cutoff, so the
      // word "above" named the wrong side of it on exactly the charts
      // `significanceDirection` exists for -- and named it while the cursor
      // stood on a point that had cleared it.
      asides.push({
        label: 'Threshold',
        value: this.clearsThreshold(this.pointModeIndex) ? 'cleared' : 'not cleared',
      });
    }

    return asides.length > 0 ? { ...base, asides } : base;
  }

  /**
   * Offers the significant points when the chart declares a threshold.
   *
   * Withheld when no threshold is declared -- there is nothing to filter on
   * -- and withheld when one is declared but nothing clears it, since a mode
   * whose only possible answer is "none found" is worse than not offering it.
   * That second case is a real reading of the chart, and the description says
   * so in words.
   *
   * @returns The significant unit alongside whatever the scatter offers
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const inherited = super.getRotorFilterUnits();
    return this.significantIndices.length > 0
      ? [...inherited, SIGNIFICANT_ROTOR_UNIT]
      : inherited;
  }

  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== SIGNIFICANT_ROTOR_UNIT.key) {
      return super.moveToRotorFilter(key, direction);
    }

    if (this.isInitialEntry) {
      // The scatter owns this, not its movable: MovablePlane is a stub and
      // the real entry sets the mode as well as the position.
      this.handleInitialEntry();
    }

    // `readingPos` is the scatter's precomputed inverse of `readingOrder`, so
    // each lookup is O(1). Scanning `readingOrder` instead would be O(n) per
    // candidate and O(n*k) per keystroke -- on exactly the charts this mode
    // exists for, where n is hundreds of thousands of SNPs and k the
    // thousands that clear genome-wide significance. Precomputing the
    // candidate list and then linear-scanning to place each one would have
    // undone the point of precomputing it.
    const here = this.isInPointMode ? this.readingPos[this.pointModeIndex] : -1;

    let target: number | undefined;
    if (direction === 'right') {
      target = this.significantIndices.find(index =>
        here < 0 || this.readingPos[index] > here);
    } else {
      for (let i = this.significantIndices.length - 1; i >= 0; i--) {
        const candidate = this.significantIndices[i];
        if (here >= 0 && this.readingPos[candidate] < here) {
          target = candidate;
          break;
        }
      }
    }

    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    this.isInPointMode = true;
    this.pointModeIndex = target;
    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  public override get description(): DescriptionState {
    const base = super.description;

    // A volcano is symmetric about x = 0 by construction, so its Pearson r is
    // near zero however strongly effect and significance are related; a
    // Manhattan's x is a genomic coordinate, so the coefficient describes the
    // order the chromosomes were laid out in. Either way the dialog states a
    // linear relationship over two axes that were never drawn to have one,
    // and states it confidently. `BumpTrace` drops the line's Min and Max on
    // the same grounds.
    const stats = base.stats.filter(stat => stat.label !== 'Correlation');

    if (this.significance !== null || this.effect !== null) {
      // The finding, and the one thing a per-point reading of twelve thousand
      // points would never assemble. First, because it is what a sighted
      // reader takes from the shape of the cloud before anything else.
      //
      // Neither "above" nor "below": the direction is the layer's to declare,
      // and a raw p axis clears its threshold downwards. The word for one of
      // those charts is the inverse of the reading on the other.
      stats.unshift(
        {
          label: 'Points clearing the threshold',
          value: `${this.significantIndices.length} of ${this.flatPoints.length}`,
        },
        // Where the line actually sits. -log10(p) at 1.3, -log10(p) at 7.3 and
        // raw p at 0.05 are three different cutoffs, and "43 of 12,000" with
        // none of them named cannot be told apart from noise -- a sighted
        // reader has the dashed line and the axis under it.
        ...this.thresholdStats(),
      );

      const named = this.bySignificance()
        .map(index => this.declared[index]?.label)
        .filter((name): name is string => typeof name === 'string' && name !== '');

      if (named.length > 0) {
        // Identity, which is the payload. Capped, because a chart with three
        // hundred hits would otherwise read the reader a list rather than
        // telling them anything.
        const shown = named.slice(0, NAMED_HITS);
        stats.push({
          label: named.length > NAMED_HITS
            ? `Top ${NAMED_HITS} by significance`
            : 'Clearing the threshold, named',
          value: shown.join(', '),
        });
      }

      // Which regions the findings fall in. `Regions` below counts the whole
      // chart -- twenty-two chromosomes, whether the hits sit on one of them
      // or on all of them -- and "which chromosome is it on" is the second
      // question a Manhattan is read for.
      const hits = this.hitsByRegion();
      if (hits.length > 0) {
        stats.push({
          label: 'Regions with hits',
          value: hits
            .slice(0, NAMED_HITS)
            .map(([region, count]) => `${region} (${count})`)
            .join(', '),
        });
      }
    }

    const regions = this.regionCount();
    if (regions !== null) {
      stats.push({ label: 'Regions', value: regions });
    }

    return { ...base, stats };
  }

  /**
   * The clearing points, strongest finding first.
   *
   * `significantIndices` is held in reading order because navigation walks it,
   * and reading order is y descending -- which is most-significant-first only
   * on a transformed axis. On a raw p axis it is the exact reverse, so the cap
   * below `Top 10 by significance` kept the ten weakest hits and dropped the
   * strongest, under a label claiming the opposite.
   *
   * @returns A copy of the clearing indices, ordered by significance
   */
  private bySignificance(): number[] {
    return [...this.significantIndices].sort((a, b) => this.significantAbove
      ? this.flatPoints[b].y - this.flatPoints[a].y
      : this.flatPoints[a].y - this.flatPoints[b].y);
  }

  /**
   * The cutoffs the layer declared, in the axes' own words.
   *
   * Formatted here rather than left to the description service, which rounds a
   * value that is a number and passes a composed string through untouched.
   *
   * @returns One stat per declared threshold
   */
  private thresholdStats(): DescriptionState['stats'] {
    const stats: DescriptionState['stats'] = [];
    if (this.significance !== null) {
      stats.push({
        label: 'Significance threshold',
        value: `${this.yAxis} ${this.significantAbove ? 'at or above' : 'at or below'} ${defaultFormat(this.significance)}`,
      });
    }
    if (this.effect !== null) {
      // "of magnitude": the cutoff is applied to |x|, so a fold change of -3
      // clears an effect threshold of 2 as surely as one of +3 does, and a
      // reader told only "2 or more" would expect half the hits it names.
      stats.push({
        label: 'Effect threshold',
        value: `${this.xAxis} of magnitude ${defaultFormat(this.effect)} or more`,
      });
    }
    return stats;
  }

  /**
   * How many of the clearing points fall in each named region.
   *
   * @returns Region and count pairs, most hits first
   */
  private hitsByRegion(): [string, number][] {
    const counts = new Map<string, number>();
    for (const index of this.significantIndices) {
      const group = this.declared[index]?.group;
      if (typeof group === 'string' && group !== '') {
        counts.set(group, (counts.get(group) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  /**
   * How many distinct regions the points fall into.
   *
   * A Manhattan plot's chromosomes, when the layer names them. Answers null
   * for a chart that names none, which is the ordinary volcano.
   *
   * @returns The count, or null
   */
  private regionCount(): number | null {
    const seen = new Set<string>();
    for (const point of this.declared) {
      if (typeof point.group === 'string' && point.group !== '') {
        seen.add(point.group);
      }
    }
    return seen.size > 0 ? seen.size : null;
  }
}

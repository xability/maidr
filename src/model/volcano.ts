import type { MaidrLayer, VolcanoPoint } from '@type/grammar';
import type { DescriptionState, TextState } from '@type/state';
import type { RotorFilterUnit } from './abstract';
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
    if (this.significance !== null && !(point.y >= this.significance)) {
      return false;
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
      asides.push({
        label: 'Threshold',
        value: this.clearsThreshold(this.pointModeIndex) ? 'above' : 'below',
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

    const from = this.isInPointMode ? this.pointModeIndex : -1;
    const here = this.readingOrder.indexOf(from);

    let target: number | undefined;
    if (direction === 'right') {
      target = this.significantIndices.find(index =>
        here < 0 || this.readingOrder.indexOf(index) > here);
    } else {
      for (let i = this.significantIndices.length - 1; i >= 0; i--) {
        const candidate = this.significantIndices[i];
        if (here >= 0 && this.readingOrder.indexOf(candidate) < here) {
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
    const stats = [...base.stats];

    if (this.significance !== null || this.effect !== null) {
      // The finding, and the one thing a per-point reading of twelve thousand
      // points would never assemble. First, because it is what a sighted
      // reader takes from the shape of the cloud before anything else.
      stats.unshift({
        label: 'Above the threshold',
        value: `${this.significantIndices.length} of ${this.flatPoints.length}`,
      });

      const named = this.significantIndices
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
            : 'Above the threshold, named',
          value: shown.join(', '),
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

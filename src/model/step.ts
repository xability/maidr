import type { LinePoint, MaidrLayer, StepDirection, StepPoint } from '@type/grammar';
import type { DescriptionState, TextState, TraceState } from '@type/state';
import type { RotorFilterUnit } from './abstract';
import { LineTrace } from './line';

/** Rotor unit that restricts navigation to the points where the level changes. */
const TRANSITION_ROTOR_UNIT: RotorFilterUnit = {
  key: 'transition',
  label: 'Transitions',
  noun: 'transitions',
};

/** Spoken description of each step convention, used in the description modal. */
const STEP_DIRECTION_LABEL: Record<StepDirection, string> = {
  hv: 'value holds until the next x value, then jumps',
  vh: 'value jumps at the current x value, then holds',
  mid: 'value jumps midway between x values',
};

/**
 * Trace implementation for step (stairs) charts, where the value is piecewise
 * constant: it is held across an interval and then jumps, rather than being
 * interpolated between samples as a line chart implies.
 *
 * Everything numeric is inherited from {@link LineTrace} unchanged. In
 * particular the audio stays one discrete tone per point, which is already the
 * right sonification for piecewise-constant data — a run of equal levels sounds
 * as a repeated pitch, and a transition is an audible jump. The continuous
 * glissando that `SmoothTrace` uses would interpolate between levels, which is
 * exactly what a step chart does not do.
 *
 * What this class adds is the two things a step chart has that a line chart
 * does not: ordinal level names ("REM" rather than "3"), and navigation by
 * transition rather than by sample.
 */
export class StepTrace extends LineTrace {
  private readonly stepPoints: StepPoint[][];

  /**
   * The authored step convention, or undefined when the data does not say.
   * Left undefined rather than defaulted so the description never claims a
   * direction the producing library did not actually report.
   */
  private readonly stepDirection?: StepDirection;

  /**
   * Column indices, per series, at which the level differs from the previous
   * column — that is, the first point of every run after the first. Computed
   * once because trace data is immutable (live-data updates rebuild the trace).
   */
  private readonly transitionIndices: number[][];

  /**
   * Creates a new step trace instance.
   * @param layer - The MAIDR layer containing step plot data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);

    this.stepPoints = layer.data as StepPoint[][];
    this.stepDirection = layer.stepDirection;
    this.transitionIndices = this.stepPoints.map((series) => {
      const indices = new Array<number>();
      for (let col = 1; col < series.length; col++) {
        if (series[col].y !== series[col - 1].y) {
          indices.push(col);
        }
      }
      return indices;
    });
  }

  /**
   * Announces this trace as a step plot in the instruction text, layer-switch
   * cue and subplot entry cue, rather than falling back to the raw layer type.
   * @returns The trace state with `plotType` set to 'step'
   */
  public override get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty) {
      return baseState;
    }

    return {
      ...baseState,
      plotType: 'step',
    };
  }

  /**
   * Substitutes the ordinal level name for the raw numeric level, so a
   * hypnogram announces "Sleep stage is REM" rather than "Sleep stage is 3".
   * Points without a `label` keep the inherited numeric announcement.
   * @returns The text state for the current point
   */
  protected override get text(): TextState {
    const baseText = super.text;
    const label = this.stepPoints[this.row]?.[this.col]?.label;
    if (label === undefined || label === '') {
      return baseText;
    }

    return {
      ...baseText,
      cross: { label: baseText.cross.label, value: label },
    };
  }

  /**
   * Describes the step chart in terms of its runs rather than its points: how
   * many times the level changes, which levels occur, and how long the longest
   * unbroken run is. That is the shape of the data a step chart encodes, and
   * it is what the point-by-point data table cannot show at a glance.
   * @returns The description state containing chart metadata and data table
   */
  public override get description(): DescriptionState {
    const baseDescription = super.description;
    const series = this.stepPoints[this.row] ?? [];

    const stats: DescriptionState['stats'] = [
      ...baseDescription.stats,
      {
        label: 'Transitions',
        value: this.transitionIndices[this.row]?.length ?? 0,
      },
      { label: 'Longest run', value: this.longestRunLength(series) },
    ];

    if (this.stepDirection !== undefined) {
      stats.push({
        label: 'Step direction',
        value: STEP_DIRECTION_LABEL[this.stepDirection],
      });
    }

    const levelNames = this.levelNames(series);
    if (levelNames.length > 0) {
      stats.push({ label: 'Levels', value: levelNames.join(', ') });
    }

    return { ...baseDescription, stats };
  }

  /**
   * Distinct level names in the order they first occur. Empty when the data
   * carries no `label`, so a purely numeric step chart says nothing about
   * levels rather than listing bare numbers the stats already cover.
   * @param series - The points of the series being described
   * @returns The distinct level names, first-occurrence order
   */
  private levelNames(series: readonly StepPoint[]): string[] {
    const names = new Array<string>();
    const seen = new Set<string>();
    for (const point of series) {
      if (point.label !== undefined && point.label !== '' && !seen.has(point.label)) {
        seen.add(point.label);
        names.push(point.label);
      }
    }
    return names;
  }

  /**
   * Length, in samples, of the longest run of consecutive equal levels.
   * @param series - The points of the series being described
   * @returns The run length, or 0 for an empty series
   */
  private longestRunLength(series: readonly StepPoint[]): number {
    let longest = 0;
    let current = 0;
    for (let col = 0; col < series.length; col++) {
      current = col > 0 && series[col].y === series[col - 1].y ? current + 1 : 1;
      longest = Math.max(longest, current);
    }
    return longest;
  }

  /**
   * Maps the vertices of a rendered step path back onto the data points.
   *
   * A step chart is drawn with the corner vertices the steps introduce, so the
   * rendered path carries more vertices than the series has points — matplotlib
   * emits `2N - 1` for `hv`/`vh` and `2N` for `mid`. The inherited
   * reconciliation drops the surplus from the end, which would place every
   * highlight on the first half of the chart. Here the surplus is *interleaved*
   * rather than trailing, so it is removed by stride instead:
   *
   * - `2N - 1` vertices (`hv`/`vh`): the even-indexed vertices are exactly the
   *   data points; the odd-indexed ones are the corners.
   * - `2N` vertices (`mid`): each data point owns a horizontal pair, and sits
   *   at its midpoint.
   *
   * Any other count is left to the inherited handling — a library that
   * simplifies collinear vertices (a long flat run in a hypnogram is exactly
   * that) produces neither shape, and interpolating along the surviving
   * segments is the right recovery there.
   * @param coordinates - Vertices parsed from the path, mutated in place
   * @param row - Index of the series these coordinates belong to
   */
  protected override reconcilePathCoordinates(
    coordinates: LinePoint[],
    row: number,
  ): void {
    // `this.points`, not `this.stepPoints`, and that is load-bearing: this
    // method runs during `super(layer)` — LineTrace's constructor calls
    // mapToSvgElements, which reaches this override — so `stepPoints` has not
    // been assigned yet and reading it throws, leaving MAIDR unmounted and the
    // chart unusable. `points` is the same array, is assigned by LineTrace
    // before mapToSvgElements, and is what the base class itself indexes here.
    // Optional-chaining `stepPoints` instead would not fix it: `expected` would
    // be 0 during construction and fall through to the trim-from-the-end
    // branch, silently highlighting the wrong vertices.
    const expected = this.points[row]?.length ?? 0;

    if (expected > 1 && coordinates.length === 2 * expected - 1) {
      const dataVertices = coordinates.filter((_, index) => index % 2 === 0);
      coordinates.length = 0;
      coordinates.push(...dataVertices);
      return;
    }

    if (expected > 0 && coordinates.length === 2 * expected) {
      const dataVertices = new Array<LinePoint>();
      for (let i = 0; i < expected; i++) {
        const left = coordinates[2 * i];
        const right = coordinates[2 * i + 1];
        dataVertices.push({
          x: (Number(left.x) + Number(right.x)) / 2,
          y: Number(left.y),
        });
      }
      coordinates.length = 0;
      coordinates.push(...dataVertices);
      return;
    }

    super.reconcilePathCoordinates(coordinates, row);
  }

  /**
   * Offers a "Transitions" rotor mode whenever the current series actually
   * changes level. Point-by-point navigation across a long step chart — a
   * whole night of sleep epochs, say — is unusable; jumping between the
   * moments the level changes is the navigation this chart type calls for.
   * @returns The transition rotor unit, or none when the series never changes
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    const hasTransition = this.transitionIndices.some(indices => indices.length > 0);
    return hasTransition ? [TRANSITION_ROTOR_UNIT] : [];
  }

  /**
   * Jumps to the previous or next point at which the level changes, staying
   * within the current series.
   * @param key - The {@link RotorFilterUnit.key} of the active unit
   * @param direction - The direction to search
   * @returns True if the cursor moved, false when no further transition exists
   */
  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== TRANSITION_ROTOR_UNIT.key) {
      return super.moveToRotorFilter(key, direction);
    }

    // Establish the entry position on the first move so this jump highlights
    // and the initial-entry branch of moveOnce doesn't later swallow a
    // keypress (mirrors Candlestick.moveToRotorFilter).
    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }

    const indices = this.transitionIndices[this.row] ?? [];
    let target: number | undefined;
    if (direction === 'right') {
      target = indices.find(index => index > this.col);
    } else {
      // Walk backwards for the largest index below the cursor. A reverse loop
      // avoids Array.prototype.findLast (ES2023) and the array allocation a
      // [...indices].reverse() would introduce — same reasoning as
      // LineTrace.moveToPrevIntersection.
      for (let i = indices.length - 1; i >= 0; i--) {
        if (indices[i] < this.col) {
          target = indices[i];
          break;
        }
      }
    }

    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }

    this.col = target;
    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }
}

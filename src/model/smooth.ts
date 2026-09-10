import type { MaidrLayer } from '@type/grammar';
import type { AudioState, TraceState } from '@type/state';
import { t } from '@util/i18n';
import { LineTrace } from './line';

/**
 * Trace implementation for smooth plots with continuous audio feedback.
 *
 * The description is {@link LineTrace}'s, save for the vocabulary below: the
 * chart type resolves from `TraceType.SMOOTH` through `getChartTypeLabel()`,
 * and everything else a fitted curve has to say -- the samples, the band
 * around them -- the line already reports.
 */
export class SmoothTrace extends LineTrace {
  /**
   * Creates a new smooth trace instance.
   * @param layer - The MAIDR layer containing smooth plot data
   */
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  /**
   * Get the state for this smooth trace.
   * Overrides the parent state to set plotType to 'smooth' for proper identification
   * in instruction text and layer announcements.
   * @returns The trace state with plotType set to 'smooth'
   */
  public override get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty)
      return baseState;

    return {
      ...baseState,
      plotType: t('model.plotTypeSmooth'),
    };
  }

  /**
   * What one series is called wherever an announcement names it.
   *
   * A curve, announced beside its own name on every move; inheriting the
   * line's "Group" puts two words for one referent in one sentence.
   *
   * @returns The fallback label
   */
  protected override get groupFallbackLabel(): string {
    return t('model.nounCurve');
  }

  /**
   * The vocabulary the description dialog is rendered with.
   *
   * These are samples along a fitted curve, not observations -- the data the
   * curve was fitted to is not in the layer at all. A reader told "Points per
   * line: 80" takes them for eighty measurements, and then reads a table of
   * eighty evenly spaced x values that are the fit's resolution rather than
   * anything that was measured.
   *
   * @returns The four labels the description uses
   */
  protected override get seriesLabels(): {
    count: string;
    perSeries: string;
    names: string;
    column: string;
  } {
    return {
      count: t('model.statNumberOfCurves'),
      perSeries: t('model.statSamplesPerCurve'),
      names: t('model.statCurveNames'),
      column: t('model.nounCurve'),
    };
  }

  /**
   * Sonifies the curve as a glissando rather than as one tone per sample.
   * @returns The audio state, carrying the neighbouring samples too
   */
  protected override get audio(): AudioState {
    const rowYValues = this.lineValues[this.row];
    const getY = (i: number): number => {
      return rowYValues[Math.max(0, Math.min(i, rowYValues.length - 1))];
    };

    const prev = getY(this.col - 1);
    const curr = getY(this.col);
    const next = getY(this.col + 1);

    return {
      freq: {
        min: this.min[this.row],
        max: this.max[this.row],
        raw: [prev, curr, next],
      },
      panning: {
        y: this.row,
        x: this.col,
        rows: this.lineValues.length,
        cols: this.lineValues[this.row].length,
      },
      isContinuous: true,
    };
  }
}

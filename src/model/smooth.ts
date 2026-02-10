import type { MaidrLayer } from '@type/grammar';
import type { AudioState, TraceState } from '@type/state';
import { LineTrace } from './line';

/**
 * Trace implementation for smooth plots with continuous audio feedback.
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
  public get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty)
      return baseState;

    return {
      ...baseState,
      plotType: 'smooth',
    };
  }

  protected get audio(): AudioState {
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

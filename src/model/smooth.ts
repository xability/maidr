import type { MaidrLayer } from '@type/grammar';
import type { AudioState } from '@type/state';
import { LineTrace } from './line';

export class SmoothTrace extends LineTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  protected audio(): AudioState {
    const rowYValues = this.lineValues[this.row];
    const col = this.col;

    const getY = (i: number): number =>
      rowYValues[Math.max(0, Math.min(i, rowYValues.length - 1))];

    const prev = col > 0 ? getY(col - 1) : getY(col);
    const curr = getY(col);
    const next = col < rowYValues.length - 1 ? getY(col + 1) : getY(col);

    // Calculate slope based on navigation direction
    let slope = 0;
    if (this.lastNavigationDirection === 'FORWARD') {
      // Moving right: calculate slope from previous to current point
      slope = curr - prev;
    } else if (this.lastNavigationDirection === 'BACKWARD') {
      // Moving left: calculate slope from current to next point (reversed direction)
      slope = next - curr;
    } else {
      // Default: calculate forward slope
      slope = next - curr;
    }

    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: rowYValues.length,
      index: col,
      value: [prev, curr, next],
      isContinuous: true,
      slope,
      navigationDirection: this.lastNavigationDirection || 'FORWARD',
      // Only use groupIndex if there are multiple lines (actual multiline smooth plot)
      ...this.getAudioGroupIndex(),
    };
  }
}

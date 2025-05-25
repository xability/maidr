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

    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: rowYValues.length,
      index: col,
      value: [prev, curr, next],
      isContinuous: true,
      // Only use groupIndex if there are multiple lines (actual multiline smooth plot)
      ...(this.lineValues.length > 1 ? { groupIndex: this.row } : {}),
    };
  }
}

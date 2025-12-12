import type { MaidrLayer } from '@type/grammar';
import type { Trace } from './plot';
import { TraceType } from '@type/grammar';
import { BarTrace } from './bar';
import { BoxTrace } from './box';
import { Candlestick } from './candlestick';
import { Heatmap } from './heatmap';
import { Histogram } from './histogram';
import { LineTrace } from './line';
import { ScatterTrace } from './scatter';
import { SegmentedTrace } from './segmented';
import { createSmoothTrace } from './smoothtraceFactory';

/**
 * Abstract factory class for creating appropriate trace instances based on layer type.
 */
export abstract class TraceFactory {
  /**
   * Factory method for creating trace instances.
   *
   * This method is intentionally kept lightweight and only receives
   * trace-local data (`layer`) plus minimal plot-level hints via `options`.
   * It must **not** receive or inspect the full layers array to keep
   * construction decoupled from subplot-wide state.
   */
  public static create(
    layer: MaidrLayer,
    options?: {
      /**
       * Hint that this subplot structurally represents a violin plot,
       * i.e. it contains both BOX and SMOOTH layers.
       *
       * The detection of this condition is performed by the caller
       * (e.g. `Subplot`), not by the factory itself.
       */
      isViolinPlot?: boolean;
    },
  ): Trace {
    const isViolinPlot = options?.isViolinPlot === true;

    switch (layer.type) {
      case TraceType.BAR:
        return new BarTrace(layer);

      case TraceType.BOX:
        return new BoxTrace(layer, isViolinPlot);

      case TraceType.CANDLESTICK:
        return new Candlestick(layer);

      case TraceType.HEATMAP:
        return new Heatmap(layer);

      case TraceType.HISTOGRAM:
        return new Histogram(layer);

      case TraceType.LINE:
        return new LineTrace(layer);

      case TraceType.SCATTER:
        return new ScatterTrace(layer);

      case TraceType.SMOOTH:
        return createSmoothTrace(layer, isViolinPlot);

      case TraceType.DODGED:
      case TraceType.NORMALIZED:
      case TraceType.STACKED:
        return new SegmentedTrace(layer);

      default:
        throw new Error(`Invalid trace type: ${layer.type}`);
    }
  }
}

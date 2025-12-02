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
   * Creates and returns the appropriate trace instance based on the layer's trace type.
   * @param layer - The MAIDR layer containing trace data and type information
   * @returns A trace instance specific to the layer's type
   * @throws Error if the trace type is invalid or unsupported
   */
  public static create(layer: MaidrLayer): Trace {
    switch (layer.type) {
      case TraceType.BAR:
        return new BarTrace(layer);

      case TraceType.BOX:
        return new BoxTrace(layer);

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
        return createSmoothTrace(layer);

      case TraceType.DODGED:
      case TraceType.NORMALIZED:
      case TraceType.STACKED:
        return new SegmentedTrace(layer);

      default:
        throw new Error(`Invalid trace type: ${layer.type}`);
    }
  }
}

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

export abstract class TraceFactory {
  public static create(layer: MaidrLayer, allLayers?: MaidrLayer[]): Trace {
    switch (layer.type) {
      case TraceType.BAR:
        return new BarTrace(layer);

      case TraceType.BOX:
        return new BoxTrace(layer, allLayers);

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
        return createSmoothTrace(layer, allLayers);

      case TraceType.DODGED:
      case TraceType.NORMALIZED:
      case TraceType.STACKED:
        return new SegmentedTrace(layer);

      default:
        throw new Error(`Invalid trace type: ${layer.type}`);
    }
  }
}

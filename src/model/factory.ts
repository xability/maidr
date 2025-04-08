import type { MaidrLayer } from '@type/maidr';
import type { Trace } from '@type/plot';
import { TraceType } from '@type/plot';
import { BarPlot } from './bar';
import { BoxPlot } from './box';
import { Candlestick } from './candlestick';
import { Heatmap } from './heatmap';
import { Histogram } from './histogram';
import { LinePlot } from './line';
import { ScatterPlot } from './scatter';
import { SegmentedPlot } from './segmented';

export abstract class TraceFactory {
  public static create(layer: MaidrLayer): Trace {
    switch (layer.type) {
      case TraceType.BAR:
        return new BarPlot(layer);

      case TraceType.BOX:
        return new BoxPlot(layer);

      case TraceType.CANDLESTICK:
        return new Candlestick(layer);

      case TraceType.HEATMAP:
        return new Heatmap(layer);

      case TraceType.HISTOGRAM:
        return new Histogram(layer);

      case TraceType.LINE:
        return new LinePlot(layer);

      case TraceType.SCATTER:
        return new ScatterPlot(layer);

      case TraceType.DODGED:
      case TraceType.NORMALIZED:
      case TraceType.STACKED:
        return new SegmentedPlot(layer);

      default:
        throw new Error(`Invalid trace type: ${layer.type}`);
    }
  }
}

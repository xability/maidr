import type { MaidrLayer } from '@type/grammar';
import type { Trace } from './plot';
import { BarPlot } from './bar';
import { BoxPlot } from './box';
import { Heatmap } from './heatmap';
import { Histogram } from './histogram';
import { LinePlot } from './line';
import { ScatterPlot } from './scatter';
import { SegmentedPlot } from './segmented';

enum TraceType {
  BAR = 'bar',
  BOX = 'box',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  SCATTER = 'point',
  STACKED = 'stacked_bar',
}

export abstract class TraceFactory {
  public static create(layer: MaidrLayer): Trace {
    switch (layer.type) {
      case TraceType.BAR:
        return new BarPlot(layer);

      case TraceType.BOX:
        return new BoxPlot(layer);

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

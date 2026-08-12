import type { MaidrLayer } from '@type/grammar';
import type { Trace } from './plot';
import { TraceType } from '@type/grammar';
import { AreaTrace } from './area';
import { BarTrace } from './bar';
import { BoxTrace } from './box';
import { BoxenTrace } from './boxen';
import { BumpTrace } from './bump';
import { Candlestick } from './candlestick';
import { DivergingTrace } from './diverging';
import { DumbbellTrace } from './dumbbell';
import { ErrorBarTrace } from './errorBar';
import { FunnelTrace } from './funnel';
import { GanttTrace } from './gantt';
import { GaugeTrace } from './gauge';
import { Heatmap } from './heatmap';
import { HexbinTrace } from './hexbin';
import { Histogram } from './histogram';
import { LineTrace } from './line';
import { ParallelTrace } from './parallel';
import { PieTrace } from './pie';
import { RadarTrace } from './radar';
import { RidgelineTrace } from './ridgeline';
import { ScatterTrace } from './scatter';
import { SegmentedTrace } from './segmented';
import { createSmoothTrace } from './smoothtraceFactory';
import { StepTrace } from './step';
import { ViolinKdeTrace } from './violin';
import { ViolinBoxTrace } from './violinBox';
import { WaterfallTrace } from './waterfall';
import { WordCloudTrace } from './wordCloud';

/**
 * Abstract factory class for creating appropriate trace instances based on layer type.
 */
export abstract class TraceFactory {
  /**
   * Factory method for creating trace instances.
   *
   * Each layer's type maps directly to a trace class. No heuristic detection needed.
   */
  public static create(layer: MaidrLayer): Trace {
    switch (layer.type) {
      // All three area variants share one class: the stacking is a property
      // of the layer it reads off `layer.type`, not a different navigation
      // model. Contrast the bar family, where DODGED/STACKED/NORMALIZED all
      // route to SegmentedTrace while BAR does not.
      case TraceType.AREA:
      case TraceType.NORMALIZED_AREA:
      case TraceType.STACKED_AREA:
        return new AreaTrace(layer);

      // One class, three marks. A dot plot draws a point where a bar chart
      // draws a bar and a lollipop adds a stem to the baseline; a reader
      // navigates one category and one value either way, so the difference
      // is in what the chart is called rather than in how it is read.
      case TraceType.BAR:
      case TraceType.DOT:
      case TraceType.LOLLIPOP:
        return new BarTrace(layer);

      case TraceType.BOX:
        return new BoxTrace(layer);

      case TraceType.BUMP:
        return new BumpTrace(layer);
      case TraceType.BOXEN:
        return new BoxenTrace(layer);

      case TraceType.CANDLESTICK:
        return new Candlestick(layer);

      case TraceType.DUMBBELL:
        return new DumbbellTrace(layer);

      case TraceType.ERROR_BAR:
        return new ErrorBarTrace(layer);

      case TraceType.DIVERGING:
        return new DivergingTrace(layer);

      case TraceType.FUNNEL:
        return new FunnelTrace(layer);

      case TraceType.GANTT:
        return new GanttTrace(layer);

      case TraceType.GAUGE:
        return new GaugeTrace(layer);

      case TraceType.HEATMAP:
        return new Heatmap(layer);

      case TraceType.HEXBIN:
        return new HexbinTrace(layer);

      case TraceType.HISTOGRAM:
        return new Histogram(layer);

      case TraceType.LINE:
        return new LineTrace(layer);

      case TraceType.PARALLEL:
        return new ParallelTrace(layer);

      case TraceType.PIE:
        return new PieTrace(layer);

      // One class, two marks. A polar area draws its values as wedges and a
      // radar joins them into an outline; a reader navigates the same spokes
      // either way.
      case TraceType.POLAR_AREA:
      case TraceType.RADAR:
        return new RadarTrace(layer);

      case TraceType.RIDGELINE:
        return new RidgelineTrace(layer);

      case TraceType.SCATTER:
        return new ScatterTrace(layer);

      case TraceType.SMOOTH:
        return createSmoothTrace(layer);

      case TraceType.STEP:
        return new StepTrace(layer);

      case TraceType.WATERFALL:
        return new WaterfallTrace(layer);

      case TraceType.WORD_CLOUD:
        return new WordCloudTrace(layer);

      case TraceType.DODGED:
      case TraceType.NORMALIZED:
      case TraceType.STACKED:
        return new SegmentedTrace(layer);

      case TraceType.VIOLIN_KDE:
        return new ViolinKdeTrace(layer);

      case TraceType.VIOLIN_BOX:
        return new ViolinBoxTrace(layer);

      default:
        throw new Error(`Invalid trace type: ${layer.type}`);
    }
  }
}

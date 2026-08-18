import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  ErrorBarPoint,
  HistogramPoint,
  LinePoint,
  Orientation,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  WaterfallPoint,
} from '@type/grammar';
import type { ReactNode } from 'react';

/**
 * Row-major grid layout for multi-panel figures (two or more top-level
 * `<VictoryChart>` children). When omitted, panels form a single row in
 * children order.
 */
export interface VictoryPanelLayout {
  /**
   * Number of grid rows. Used to derive the panels-per-row count when
   * `columns` is omitted.
   */
  rows?: number;
  /** Number of panels per row. Takes precedence over `rows`. */
  columns?: number;
}

/**
 * Configuration accepted by both the {@link MaidrVictory} wrapper component
 * and the `useVictoryAdapter` hook.
 */
export interface VictoryAdapterConfig {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /** Victory chart components to make accessible. */
  children: ReactNode;
  /**
   * Grid layout for multi-panel figures. Only consulted when `children`
   * contains two or more top-level `<VictoryChart>` components; single-chart
   * figures are unaffected.
   */
  layout?: VictoryPanelLayout;
}

/**
 * Props for the MaidrVictory component (identical to {@link VictoryAdapterConfig}).
 */
export type MaidrVictoryProps = VictoryAdapterConfig;

/**
 * Victory chart component types that MAIDR can extract data from.
 *
 * VictoryStack and VictoryGroup are container components (handled separately
 * from the individual data components) that map to a stacked and a dodged bar
 * chart respectively.
 */
export type VictoryComponentType
  = | 'VictoryArea'
    | 'VictoryBar'
    | 'VictoryLine'
    | 'VictoryScatter'
    | 'VictoryBoxPlot'
    | 'VictoryCandlestick'
    | 'VictoryErrorBar'
    | 'VictoryHistogram'
    | 'VictoryPie'
    | 'VictoryStack'
    | 'VictoryGroup';

/**
 * Discriminated union of all supported layer data shapes.
 *
 * Using a discriminated union instead of `unknown` ensures that each
 * layer's data is validated at extraction time and carries the correct
 * type through to the MAIDR schema conversion.
 */
export type VictoryLayerData
  = | { kind: 'bar'; points: BarPoint[] }
    /**
     * A `VictoryLine`. `stepDirection` is set when its `interpolation` draws
     * a staircase, making the layer a step rather than a line.
     */
    | { kind: 'line'; points: LinePoint[][]; stepDirection?: StepDirection }
    /**
     * A `VictoryArea` — a line whose region down to the baseline is filled.
     * The fill is what the chart is called rather than a second magnitude, so
     * the payload is a line's.
     */
    | { kind: 'area'; points: LinePoint[][] }
    /**
     * A `VictoryStack` of `VictoryArea` children, one row per band. Each
     * band carries its own untransformed value; the running total is the
     * trace's to compute. `normalized` marks a stack whose columns are shares
     * of a common whole.
     */
    | { kind: 'stackedArea'; points: LinePoint[][]; normalized: boolean }
    /** A `VictoryBar` drawn `polar` — values as wedges around a circle. */
    | { kind: 'polarArea'; points: LinePoint[][] }
    | { kind: 'scatter'; points: ScatterPoint[] }
    /**
     * A `VictoryScatter` whose x values name categories — a Cleveland dot
     * plot. One magnitude per category is what a reader navigates, so the
     * payload is a bar's rather than a scatter's.
     */
    | { kind: 'dot'; points: BarPoint[] }
    /** A `VictoryErrorBar`, with Victory's error deltas resolved to bounds. */
    | { kind: 'errorBar'; points: ErrorBarPoint[] }
    /** A `VictoryBar` whose bars float between a per-datum `y0` and `y`. */
    | { kind: 'waterfall'; points: WaterfallPoint[] }
    | { kind: 'box'; points: BoxPoint[] }
    | { kind: 'candlestick'; points: CandlestickPoint[] }
    | { kind: 'histogram'; points: HistogramPoint[] }
    /** A `VictoryPie` (or a doughnut — the same component with an `innerRadius`). */
    | { kind: 'pie'; points: PiePoint[] }
    | { kind: 'segmented'; points: SegmentedPoint[][] }
    /**
     * A `VictoryGroup` of `VictoryBar` children -- the grouped bar chart that
     * is `VictoryStack`'s direct counterpart, and that used to emit no layer
     * at all because the walk never descended into the group (#1057).
     *
     * The same per-series points a stack carries: what differs is that the
     * bars sit side by side rather than on one another, so nothing accumulates
     * and the values are read as they are.
     */
    | { kind: 'dodged'; points: SegmentedPoint[][] }
    /**
     * A `VictoryStack` of two `VictoryBar` children signed against each other
     * — a population pyramid. The values stay signed as the chart draws them,
     * and the two sides are listed in the order Victory paints them.
     */
    | { kind: 'diverging'; points: SegmentedPoint[][] };

/**
 * Intermediate representation of a Victory data layer before conversion
 * to the MAIDR schema.
 */
export interface VictoryLayerInfo {
  /** Index-based layer ID. */
  id: string;
  /** The Victory component type that produced this layer. */
  victoryType: VictoryComponentType;
  /** Extracted and validated data points from the Victory component. */
  data: VictoryLayerData;
  /** X-axis label (from VictoryAxis or fallback). */
  xAxisLabel?: string;
  /** Y-axis label (from VictoryAxis or fallback). */
  yAxisLabel?: string;
  /** Number of data elements expected in the DOM (used for selector validation). */
  dataCount: number;
  /** Legend labels for multi-series segmented charts. */
  legend?: string[];
  /**
   * Set when the layer's points were turned round to match an inverted
   * independent axis (#1018).
   *
   * The marks themselves are not reordered -- Victory renders them in data
   * order whichever way the axis runs -- so the tagger has to name them one
   * by one instead of leaving a single selector to resolve positionally, or
   * the reading and the highlight would point at opposite ends of the chart.
   */
  categoriesReversed?: boolean;
  /**
   * Whether this layer's points were turned round for an inverted axis.
   *
   * The line half of the same fix `categoriesReversed` serves for the bar
   * family, and separate from it because the two halves move differently. A
   * bar names each mark with its own attribute so the highlight can be
   * permuted; a line is one `<path>`, and there is nothing to permute -- the
   * layer declares `domMapping.pointOrder` instead and `LineTrace` reverses
   * the vertices it parsed (#1007, #1031).
   */
  pointsReversed?: boolean;
  /**
   * Which way the layer is drawn, when the chart says so.
   *
   * Victory turns a bar chart on its side with `horizontal`, on the component
   * or on the enclosing `<VictoryChart>`. Only the bar family carries this
   * onward -- see {@link MaidrLayer.orientation} for why, and for the fact
   * that Victory's own data stays `x = category, y = value` either way, so
   * nothing is swapped alongside it.
   */
  orientation?: Orientation;
}

/**
 * Intermediate representation of one subplot panel (one top-level
 * `<VictoryChart>` in multi-panel mode) before conversion to the MAIDR
 * schema.
 */
export interface VictorySubplotInfo {
  /** Extracted data layers belonging to this panel. */
  layers: VictoryLayerInfo[];
  /**
   * Panel display name, read from the `<VictoryChart title="...">` prop.
   * Emitted as the first layer's title, which MAIDR uses as the panel name
   * in subplot summaries.
   */
  title?: string;
  /**
   * Ordinal of this chart's `<svg>` among ALL top-level Victory components
   * (each renders its own standalone `<svg role="img">`, including standalone
   * data components, legends, and unsupported components). Used to bind the
   * panel to the correct rendered svg even when non-chart Victory siblings
   * precede it. Absent in single-panel mode.
   */
  svgIndex?: number;
}

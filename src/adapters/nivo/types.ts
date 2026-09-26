import type {
  AxisFormat,
  BarPoint,
  BoxPoint,
  HeatmapData,
  LinePoint,
  MaidrLayer,
  Orientation,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
} from '@type/grammar';
import type { ReactNode } from 'react';

/**
 * The Nivo chart kinds this adapter reads, one per `@nivo/*` package.
 *
 * Declared by the caller rather than sniffed off the element: Nivo exports its
 * components as `memo`/`forwardRef` objects with no `displayName`, so the
 * element type cannot say which chart it draws, and the adapter never imports
 * a `@nivo/*` package to compare against (they stay optional for consumers).
 *
 * - `'bar'` → `@nivo/bar` (`Bar`, `ResponsiveBar`)
 * - `'line'` → `@nivo/line` (`Line`, `ResponsiveLine`)
 * - `'scatterplot'` → `@nivo/scatterplot` (`ScatterPlot`, `ResponsiveScatterPlot`)
 * - `'pie'` → `@nivo/pie` (`Pie`, `ResponsivePie`)
 * - `'heatmap'` → `@nivo/heatmap` (`HeatMap`, `ResponsiveHeatMap`)
 * - `'boxplot'` → `@nivo/boxplot` (`BoxPlot`, `ResponsiveBoxPlot`)
 *
 * Only the SVG components are highlighted. The `*Canvas` variants draw no
 * elements to outline: their data is still read, and the adapter says in the
 * console that the highlight is unavailable.
 */
export type NivoChartType = 'bar' | 'line' | 'scatterplot' | 'pie' | 'heatmap' | 'boxplot';

/**
 * Configuration accepted by the `useNivoAdapter` hook and the pure
 * {@link nivoToMaidr} converter.
 */
export interface NivoAdapterConfig {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /** Which Nivo chart `props` belong to. */
  type: NivoChartType;
  /**
   * The props the Nivo chart is rendered with — `data`, `keys`, `indexBy`,
   * `layout`, the axis objects, and so on. Read, never mutated.
   */
  props: Readonly<Record<string, unknown>>;
}

/**
 * Props for the {@link MaidrNivo} wrapper component.
 */
export interface MaidrNivoProps {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /** Which Nivo chart the child is. */
  type: NivoChartType;
  /**
   * The one Nivo chart element to make accessible, e.g.
   * `<ResponsiveBar data={...} keys={...} indexBy="..." />`. Its props are
   * read as the chart's data; a fragment around it is looked through.
   */
  children: ReactNode;
}

/**
 * How the drawn marks of a layer are found in the rendered SVG.
 *
 * Nivo stamps most of its marks with a stable attribute of its own, which a
 * selector can name outright. Lines and scatter nodes carry none that covers
 * every configuration, so those marks are tagged by the adapter after render.
 */
export type NivoMarks
  /** One `rect[data-testid="bar.item.<key>.<index>"]` per drawn bar. */
  = | { kind: 'bar'; testIds: string[] }
    /**
     * One test id per cell, `[series][category]`; `null` where Nivo drew no
     * bar (a missing or `null` value).
     */
    | { kind: 'barGrid'; testIds: (string | null)[][] }
    /** One `path[data-testid="arc.<id>"]` per slice, in document order. */
    | { kind: 'arcs'; testIds: string[]; ordered: boolean }
    /** One `g[data-testid="cell.<row>.<x>"]` per cell, `[row][column]`, rows top-first. */
    | { kind: 'cells'; testIds: (string | null)[][] }
    /**
     * One `g[data-key="boxplot.<group>.<subGroup>"]` per box, in payload
     * order. A horizontal box is drawn as a vertical one inside a group
     * rotated by -90°.
     */
    | { kind: 'boxes'; keys: string[]; whiskerCaps: boolean; horizontal: boolean }
    /**
     * Line series, tagged after render. `points[s]` lists the test ids of the
     * point markers of series `s` in data order, and is null when Nivo draws
     * no points; the series' `<path>`s are the fallback, which Nivo draws in
     * the reverse of data order.
     */
    | { kind: 'lines'; points: string[][] | null; seriesCount: number }
    /**
     * Scatter nodes, tagged after render: Nivo draws one `<circle>` per datum
     * of every visible series, series by series, in data order, directly
     * under the plot's `<g>`. `drawn` is how many it draws; `kept[i]` the
     * drawn positions whose datum made it into the payload.
     */
    | { kind: 'nodes'; drawn: number; offset: number; kept: number[] };

/**
 * Discriminated union of the layer payloads this adapter produces.
 */
export type NivoLayerData
  = | { kind: 'bar'; points: BarPoint[] }
    | { kind: 'stacked'; points: SegmentedPoint[][] }
    | { kind: 'dodged'; points: SegmentedPoint[][] }
    | { kind: 'line'; points: LinePoint[][]; stepDirection?: StepDirection }
    | { kind: 'scatter'; points: ScatterPoint[] }
    | { kind: 'pie'; points: PiePoint[]; dial: Pick<MaidrLayer, 'startAngle' | 'direction'> }
    | { kind: 'heatmap'; points: HeatmapData }
    /** `whiskerQuantiles` is set unless the whiskers end at the extremes. */
    | { kind: 'box'; points: BoxPoint[]; whiskerQuantiles?: [number, number] };

/**
 * Intermediate representation of one Nivo layer before conversion to the
 * MAIDR schema.
 */
export interface NivoLayerInfo {
  /** Index-based layer id. */
  id: string;
  /** The payload. */
  data: NivoLayerData;
  /** Label of the axis drawn across the page (Nivo's bottom or top axis). */
  xAxisLabel?: string;
  /** Label of the axis drawn up the page (Nivo's left or right axis). */
  yAxisLabel?: string;
  /** How the across-the-page axis announces its values (a time scale's dates). */
  xAxisFormat?: AxisFormat;
  /** How the up-the-page axis announces its values (a time scale's dates). */
  yAxisFormat?: AxisFormat;
  /** Set when the magnitude runs across the page. */
  orientation?: Orientation;
  /** Names the layer when a chart splits into several of the same type. */
  name?: string;
  /** Legend labels, for multi-series layers. */
  legend?: string[];
  /** How the layer's marks are found in the rendered SVG. */
  marks: NivoMarks;
}

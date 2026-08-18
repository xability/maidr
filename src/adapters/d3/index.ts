/**
 * MAIDR D3.js Binder
 *
 * Provides functions to extract data from D3.js-rendered SVG charts and convert
 * them to the MAIDR JSON schema for accessible, non-visual chart interaction.
 *
 * D3.js is the most widely used low-level SVG-based data visualization library
 * on the web. This binder bridges D3 charts to MAIDR's accessibility features
 * including audio sonification, text descriptions, braille output, and keyboard
 * navigation.
 *
 * ## Supported Chart Types
 *
 * - **Bar charts** via {@link bindD3Bar}
 * - **Dot plots** via {@link bindD3Dot}
 * - **Lollipop charts** via {@link bindD3Lollipop}
 * - **Funnel charts** via {@link bindD3Funnel}
 * - **Line charts** (single and multi-line) via {@link bindD3Line}
 * - **Area charts** (plain, stacked, 100% stacked) via {@link bindD3Area}
 * - **Bump / rank charts** via {@link bindD3Bump}
 * - **Pie and doughnut charts** via {@link bindD3Pie}
 * - **Scatter plots** via {@link bindD3Scatter}
 * - **Heatmaps** via {@link bindD3Heatmap}
 * - **Box plots** via {@link bindD3Box}
 * - **Violin plots** via {@link bindD3Violin}
 * - **Boxen / letter-value plots** via {@link bindD3Boxen}
 * - **Histograms** via {@link bindD3Histogram}
 * - **Candlestick charts** via {@link bindD3Candlestick}
 * - **Segmented bar charts** (stacked, dodged, normalized) via {@link bindD3Segmented}
 * - **Diverging bars / population pyramids** via {@link bindD3Diverging}
 * - **Error-bar / point-range charts** via {@link bindD3ErrorBar}
 * - **Forest plots** via {@link bindD3Forest}
 * - **Dumbbell charts** via {@link bindD3Dumbbell}
 * - **Waterfall / bridge charts** via {@link bindD3Waterfall}
 * - **Word clouds** via {@link bindD3WordCloud}
 * - **Gantt / timeline / swimlane charts** via {@link bindD3Gantt}
 * - **Gauges and bullet charts** via {@link bindD3Gauge}
 * - **Manhattan plots** via {@link bindD3Manhattan}
 * - **Volcano plots** via {@link bindD3Volcano}
 * - **Radar / spider charts** via {@link bindD3Radar}
 * - **Polar area / coxcomb charts** via {@link bindD3PolarArea}
 * - **Mosaic / marimekko plots** via {@link bindD3Mosaic}
 * - **Force-directed networks** via {@link bindD3Network}
 * - **Treemaps** via {@link bindD3Treemap}
 * - **Sunbursts** via {@link bindD3Sunburst}
 * - **Icicles** via {@link bindD3Icicle}
 * - **Sankey diagrams** via {@link bindD3Sankey}
 * - **Alluvial diagrams** via {@link bindD3Alluvial}
 * - **Chord diagrams** via {@link bindD3Chord}
 * - **Kaplan-Meier survival curves** via {@link bindD3Survival}
 * - **Parallel coordinates plots** via {@link bindD3Parallel}
 * - **Ridgeline / joy plots** via {@link bindD3Ridgeline}
 * - **Hexbin density plots** via {@link bindD3Hexbin}
 * - **Choropleth maps** via {@link bindD3Choropleth}
 * - **Contour plots** via {@link bindD3Contour}
 * - **Smooth/regression curves** via {@link bindD3Smooth}
 *
 * ## Multi-Panel Charts
 *
 * - **Faceted small multiples** (one chart type repeated per panel inside a
 *   single SVG) via {@link bindD3Facets}
 * - **Heterogeneous subplot grids** (different chart types per panel) via
 *   {@link bindD3Subplots}
 *
 * ## How It Works
 *
 * D3.js binds data to DOM elements via the `__data__` property during `.data()`
 * joins. The binder functions query the SVG for chart elements using CSS selectors
 * and extract the bound data to generate the MAIDR schema.
 *
 * ## Usage
 *
 * ### With Script Tag (vanilla JS)
 * ```html
 * <script src="maidr/dist/d3.js"></script>
 * <script>
 *   // After D3 renders the chart: the binder writes the `maidr-data`
 *   // attribute for you by default (pass `autoApply: false` to opt out).
 *   maidrD3.bindD3Bar(svgElement, {
 *     selector: 'rect.bar',
 *     title: 'My Chart',
 *     axes: { x: 'Category', y: 'Value' },
 *   });
 * </script>
 * ```
 *
 * ### With ES Modules
 * ```ts
 * import { bindD3Bar } from 'maidr/d3';
 *
 * const result = bindD3Bar(svgElement, {
 *   selector: 'rect.bar',
 *   title: 'My Chart',
 *   axes: { x: 'Category', y: 'Value' },
 * });
 * ```
 *
 * ### With React
 * ```tsx
 * import { Maidr } from 'maidr/react';
 * import { bindD3Bar } from 'maidr/d3';
 *
 * function AccessibleBarChart() {
 *   const svgRef = useRef(null);
 *   const [maidrData, setMaidrData] = useState(null);
 *
 *   useEffect(() => {
 *     // After D3 renders into svgRef.current:
 *     const result = bindD3Bar(svgRef.current, { ... });
 *     setMaidrData(result.maidr);
 *   }, []);
 *
 *   return maidrData ? (
 *     <Maidr data={maidrData}>
 *       <svg ref={svgRef}>...</svg>
 *     </Maidr>
 *   ) : <svg ref={svgRef} />;
 * }
 * ```
 *
 * @packageDocumentation
 */

// Re-export commonly needed MAIDR types for convenience
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from '../../type/grammar';
export { Orientation, TraceType } from '../../type/grammar';

// Binder functions
export { bindD3Area } from './binders/area';
export { bindD3Bar, bindD3Dot, bindD3Funnel, bindD3Lollipop } from './binders/bar';
export { bindD3Box } from './binders/box';
export { bindD3Boxen } from './binders/boxen';
export { bindD3Candlestick } from './binders/candlestick';
export { bindD3Choropleth } from './binders/choropleth';
export { bindD3Contour } from './binders/contour';
export { bindD3Dumbbell } from './binders/dumbbell';
export { bindD3ErrorBar, bindD3Forest } from './binders/errorBar';
export { bindD3Alluvial, bindD3Chord, bindD3Sankey } from './binders/flow';
export { bindD3Gantt } from './binders/gantt';
export { bindD3Gauge } from './binders/gauge';
export { bindD3Heatmap } from './binders/heatmap';
export { bindD3Hexbin } from './binders/hexbin';
export { bindD3Histogram } from './binders/histogram';
export { bindD3Bump, bindD3Line, bindD3Radar } from './binders/line';
export { bindD3Network } from './binders/network';
export { bindD3Parallel } from './binders/parallel';
export { bindD3Pie, bindD3PolarArea } from './binders/pie';
export { bindD3Ridgeline } from './binders/ridgeline';
export { bindD3Manhattan, bindD3Scatter, bindD3Volcano } from './binders/scatter';
export { bindD3Diverging, bindD3Mosaic, bindD3Segmented } from './binders/segmented';
export { bindD3Smooth } from './binders/smooth';
export { bindD3Facets, bindD3Subplots } from './binders/subplots';
export { bindD3Survival } from './binders/survival';
export { bindD3Icicle, bindD3Sunburst, bindD3Treemap } from './binders/treemap';
export { bindD3Violin } from './binders/violin';
export { bindD3Waterfall } from './binders/waterfall';
export { bindD3WordCloud } from './binders/wordCloud';

// Types
export type {
  AreaTraceType,
  BarMarkTraceType,
  D3AreaConfig,
  D3BarConfig,
  D3BinderConfig,
  D3BinderResult,
  D3BoxConfig,
  D3BoxenConfig,
  D3CandlestickConfig,
  D3ChoroplethConfig,
  D3ContourConfig,
  D3DumbbellConfig,
  D3ErrorBarConfig,
  D3FacetsConfig,
  D3FlowConfig,
  D3ForestConfig,
  D3GanttConfig,
  D3GaugeConfig,
  D3GridTransform,
  D3HeatmapConfig,
  D3HexbinConfig,
  D3HistogramConfig,
  D3LineConfig,
  D3ManhattanConfig,
  D3MosaicConfig,
  D3MultiPanelResult,
  D3NetworkConfig,
  D3PanelChartSpec,
  D3PanelLayout,
  D3ParallelConfig,
  D3PieConfig,
  D3PolarAreaConfig,
  D3RidgelineConfig,
  D3ScatterConfig,
  D3SegmentedConfig,
  D3SmoothConfig,
  D3SubplotEntry,
  D3SubplotsConfig,
  D3SurvivalConfig,
  D3TreemapConfig,
  D3ViolinConfig,
  D3VolcanoConfig,
  D3WaterfallConfig,
  D3WordCloudConfig,
  DataAccessor,
  FlowTraceType,
  LineMarkTraceType,
  ScatterMarkTraceType,
  SegmentedTraceType,
  TreemapTraceType,
} from './types';

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
 * - **Line charts** (single and multi-line) via {@link bindD3Line}
 * - **Scatter plots** via {@link bindD3Scatter}
 * - **Heatmaps** via {@link bindD3Heatmap}
 * - **Box plots** via {@link bindD3Box}
 * - **Histograms** via {@link bindD3Histogram}
 * - **Candlestick charts** via {@link bindD3Candlestick}
 * - **Segmented bar charts** (stacked, dodged, normalized) via {@link bindD3Segmented}
 * - **Smooth/regression curves** via {@link bindD3Smooth}
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
 *   // After D3 renders the chart:
 *   const result = maidrD3.bindD3Bar(svgElement, {
 *     selector: 'rect.bar',
 *     title: 'My Chart',
 *     axes: { x: 'Category', y: 'Value' },
 *   });
 *   svgElement.setAttribute('maidr-data', JSON.stringify(result.maidr));
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
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from '../type/grammar';
export { Orientation, TraceType } from '../type/grammar';

// Binder functions
export { bindD3Bar } from './bindBar';
export { bindD3Box } from './bindBox';
export { bindD3Candlestick } from './bindCandlestick';
export { bindD3Heatmap } from './bindHeatmap';
export { bindD3Histogram } from './bindHistogram';
export { bindD3Line } from './bindLine';
export { bindD3Scatter } from './bindScatter';
export { bindD3Segmented } from './bindSegmented';
export { bindD3Smooth } from './bindSmooth';

// Types
export type {
  D3BarConfig,
  D3BinderConfig,
  D3BinderResult,
  D3BoxConfig,
  D3CandlestickConfig,
  D3HeatmapConfig,
  D3HistogramConfig,
  D3LineConfig,
  D3ScatterConfig,
  D3SegmentedConfig,
  D3SmoothConfig,
  DataAccessor,
  SegmentedTraceType,
} from './types';

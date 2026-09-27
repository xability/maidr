/**
 * CSS selectors for MUI X Charts' SVG marks.
 *
 * MUI X Charts renders every series inside an element carrying
 * `data-series="<series id>"`, and names each mark with a class that survives
 * minification because it is a string literal in MUI's own code. The
 * selectors below lean on the attribute first and the class only where the
 * attribute alone would also match something that is not a mark.
 *
 * SVG structure reference (`@mui/x-charts` v9):
 *
 * BarChart:
 *   g.MuiBarChart-series[data-series] > rect.MuiBarChart-element
 *   With `borderRadius`, each rect is wrapped in its own `<g clip-path>`:
 *   g.MuiBarChart-series[data-series] > g > rect.MuiBarChart-element
 *   A bar whose value is `null` is not drawn at all, so the n-th child is the
 *   n-th DRAWN bar, not the bar at data index n.
 *
 * LineChart:
 *   path.MuiLineChart-line[data-series]   -- one path per series; its vertices
 *                                            are the samples, in x order
 *   path.MuiLineChart-area[data-series]   -- the fill of an `area` series,
 *                                            which includes the baseline and
 *                                            is therefore NOT read
 *
 * ScatterChart:
 *   g.MuiScatterChart-series[data-series] > circle.MuiScatterChart-marker
 *
 * PieChart:
 *   g.MuiPieChart-series[data-series] path.MuiPieChart-arc  -- one per slice,
 *                                                             in data order
 *
 * SparkLineChart:
 *   the same marks as a LineChart or (with `plotType="bar"`) a BarChart
 *
 * Gauge:
 *   path.MuiGauge-referenceArc   -- the whole dial
 *   path.MuiGauge-valueArc       -- the part the measure fills
 *
 * RadarChart:
 *   path.MuiRadarChart-seriesArea[data-series]   -- one polygon per series,
 *                                                   a vertex per spoke
 *
 * Heatmap (Pro):
 *   g.MuiHeatmap-root > rect.MuiHeatmap-cell     -- one per data entry that
 *                                                   has a value, in data order
 *
 * FunnelChart (Pro):
 *   g[data-series] > path.MuiFunnelChart-section -- one per stage, in data order
 *
 * SankeyChart (Pro):
 *   path.MuiSankeyChart-link[data-link-source][data-link-target] -- one per link
 *
 * The legend items also carry `data-series`, on `<li>` elements, which is why
 * every selector here names the SVG element type as well as the attribute.
 */

/** Escapes a value for a double-quoted CSS attribute selector. */
function attrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')}"`;
}

/**
 * The group element holding one bar, scatter or pie series.
 *
 * @param scope - Container scope, e.g. `"#chart "` (trailing space included)
 * @param seriesId - The series id MUI stamped on the group
 */
function seriesGroup(scope: string, seriesId: string): string {
  return `${scope}g[data-series=${attrValue(seriesId)}]`;
}

/**
 * Every drawn bar of one series, in data order.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the group
 */
export function barSeriesSelector(scope: string, seriesId: string): string {
  return `${seriesGroup(scope, seriesId)} rect`;
}

/**
 * The n-th drawn bar of one series.
 *
 * Written as a selector list because MUI wraps each bar in a clipping `<g>`
 * when the chart has a `borderRadius`: whichever form the chart used, exactly
 * one of the two alternatives matches.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the group
 * @param drawnIndex - Zero-based position of the bar among the series' drawn bars
 */
export function barCellSelector(scope: string, seriesId: string, drawnIndex: number): string {
  const group = seriesGroup(scope, seriesId);
  const nth = `:nth-child(${drawnIndex + 1})`;
  return `${group} > rect${nth}, ${group} > g${nth} > rect`;
}

/**
 * The line of one series, whose path vertices are its samples.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the path
 */
export function lineSeriesSelector(scope: string, seriesId: string): string {
  return `${scope}path.MuiLineChart-line[data-series=${attrValue(seriesId)}]`;
}

/**
 * Every marker of one scatter series.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the group
 */
export function scatterSeriesSelector(scope: string, seriesId: string): string {
  return `${seriesGroup(scope, seriesId)} .MuiScatterChart-marker`;
}

/**
 * Every arc of one pie series, one per slice in data order.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the group
 */
export function pieSeriesSelector(scope: string, seriesId: string): string {
  return `${seriesGroup(scope, seriesId)} path.MuiPieChart-arc`;
}

/**
 * The arc a gauge's measure fills.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 */
export function gaugeValueSelector(scope: string): string {
  return `${scope}path.MuiGauge-valueArc`;
}

/**
 * The polygon of one radar series, whose vertices are its spokes' values.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the path
 */
export function radarSeriesSelector(scope: string, seriesId: string): string {
  return `${scope}path.MuiRadarChart-seriesArea[data-series=${attrValue(seriesId)}]`;
}

/**
 * The n-th drawn cell of a heatmap.
 *
 * By type rather than by child: a server render interleaves Emotion's
 * `<style>` elements with the cells.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param drawnIndex - Zero-based position of the cell among the drawn cells
 */
export function heatmapCellSelector(scope: string, drawnIndex: number): string {
  return `${scope}g.MuiHeatmap-root > rect:nth-of-type(${drawnIndex + 1})`;
}

/**
 * Every stage of one funnel series, in data order.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param seriesId - The series id MUI stamped on the group
 */
export function funnelSeriesSelector(scope: string, seriesId: string): string {
  return `${seriesGroup(scope, seriesId)} path.MuiFunnelChart-section`;
}

/**
 * The ribbon of one sankey link.
 *
 * @param scope - Container scope, e.g. `"#chart "`
 * @param source - The link's source node id
 * @param target - The link's target node id
 */
export function sankeyLinkSelector(scope: string, source: string, target: string): string {
  return `${scope}path.MuiSankeyChart-link[data-link-source=${attrValue(source)}][data-link-target=${attrValue(target)}]`;
}

/**
 * Class names MUI stamps on the root of each chart kind's plot, in the order
 * they are tried when the kind has to be read off the rendered SVG. The
 * kinds with a class of their own come first; a sparkline draws a line or bar
 * plot and is told apart by its props instead.
 */
export const KIND_ROOT_CLASSES = [
  ['heatmap', 'MuiHeatmap-root'],
  ['funnel', 'MuiFunnelChart-root'],
  ['sankey', 'MuiSankeyChart-root'],
  ['radar', 'MuiRadarChart-seriesArea'],
  ['gauge', 'MuiGauge-root'],
  // A `<GaugeContainer>` stamps no root class, only its arcs' own.
  ['gauge', 'MuiGauge-valueArc'],
  ['gauge', 'MuiGauge-referenceArc'],
  ['bar', 'MuiBarChart-root'],
  ['line', 'MuiLineChart-linePlot'],
  ['scatter', 'MuiScatterChart-root'],
  ['pie', 'MuiPieChart-root'],
] as const;

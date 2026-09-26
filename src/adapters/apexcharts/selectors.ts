/**
 * CSS selector builders for ApexCharts 7 SVG output.
 *
 * Every selector is scoped to the chart's own wrapper,
 * `div#apexcharts<chartID>.apexcharts-canvas`, so two charts on one page never
 * see each other's marks, and every per-series selector goes through the
 * series group's `data:realIndex` attribute. That attribute is the only
 * reliable series identity ApexCharts writes:
 *
 * - `rel` repeats in combo charts (every group of a column + line chart is
 *   `rel="1"`);
 * - `seriesName` replaces every non-alphanumeric character with `x`;
 * - document order is not series order — a heat map draws its last series
 *   first, a stacked area chart draws its bands in reverse, and a combo chart
 *   groups series by renderer.
 *
 * In CSS the colon of `data:realIndex` has to be escaped, which is what
 * {@link REAL_INDEX_ATTRIBUTE} holds.
 *
 * Selectors that are resolved with `querySelectorAll` and counted skip the
 * hidden copies MAIDR inserts next to every element it highlights
 * (`data-maidr-owned`): those copies carry every attribute and class of the
 * original, so a count taken while they exist would double.
 */

import { cssEscape } from '../shared/selectorUtil';

/** `data:realIndex`, escaped for use in a CSS attribute selector. */
const REAL_INDEX_ATTRIBUTE = 'data\\:realIndex';

/** Excludes MAIDR's own hidden highlight copies from a counted match. */
const NOT_OWNED = ':not([data-maidr-owned])';

/** Attribute naming which part of a split box or candle a synthetic path is. */
export const PART_ATTRIBUTE = 'data-maidr-part';

/** Attribute carrying the data index (ApexCharts' `j`) of a synthetic path. */
export const PART_INDEX_ATTRIBUTE = 'data-maidr-index';

/**
 * The selector for a chart's wrapper element.
 *
 * @param wrapperId - The wrapper's id, `apexcharts<chartID>`
 * @returns `#<escaped id>`
 */
export function rootSelector(wrapperId: string): string {
  return `#${cssEscape(wrapperId)}`;
}

/**
 * The selector for one series' group.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @returns A selector matching exactly that series' `g.apexcharts-series`
 */
export function seriesGroupSelector(root: string, realIndex: number): string {
  return `${root} g.apexcharts-series[${REAL_INDEX_ATTRIBUTE}="${realIndex}"]`;
}

/**
 * The selector for one bar of a bar, column or funnel series.
 *
 * ApexCharts draws a path for every point, a null one included (at zero
 * size), and stamps it with its data index `j`, so a bar is addressed by
 * index rather than by position in the document.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @param j         - The point's index in the series
 * @returns A selector matching that one bar
 */
export function barSelector(root: string, realIndex: number, j: number): string {
  return `${seriesGroupSelector(root, realIndex)} path.apexcharts-bar-area[j="${j}"]`;
}

/**
 * The selector for one interval of a range bar series.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @param j         - The interval's index in the series
 * @returns A selector matching that one interval
 */
export function rangeBarSelector(root: string, realIndex: number, j: number): string {
  return `${seriesGroupSelector(root, realIndex)} path.apexcharts-rangebar-area[j="${j}"]`;
}

/**
 * The selector for every per-point marker of a line, area, scatter or bubble
 * series.
 *
 * Two kinds of look-alike are excluded. The legend's swatches carry the
 * `apexcharts-marker` class too, and are outside every series group. The
 * hover placeholder ApexCharts draws for a chart without markers sits inside
 * the first series' `.apexcharts-series-markers` group, but carries no `j` —
 * and an isolated point's duplicate marker sits in a plain `<g>`, which the
 * child combinator skips. What is left is one marker per non-null point, in
 * data order.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @returns A selector matching the series' markers
 */
export function markerSelector(root: string, realIndex: number): string {
  return `${seriesGroupSelector(root, realIndex)} .apexcharts-series-markers > path.apexcharts-marker[j]${NOT_OWNED}`;
}

/**
 * The selector for one marker of a scatter series, by its data index.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @param j         - The point's index in the series
 * @returns A selector matching that one marker
 */
export function markerAtSelector(root: string, realIndex: number, j: number): string {
  return `${seriesGroupSelector(root, realIndex)} .apexcharts-series-markers > path.apexcharts-marker[j="${j}"]${NOT_OWNED}`;
}

/**
 * The selector for every spoke marker of a radar series.
 *
 * A radar draws one marker per point whatever `markers.size` says —
 * transparent at size 0, and one for a null point too — each in a
 * `.apexcharts-series-markers` group of its own, so the descendant combinator
 * is needed here where {@link markerSelector} uses the child one.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @returns A selector matching the series' spoke markers
 */
export function radarMarkerSelector(root: string, realIndex: number): string {
  return `${seriesGroupSelector(root, realIndex)} path.apexcharts-marker[j]${NOT_OWNED}`;
}

/**
 * The selector for a line series' stroke.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @returns A selector matching the series' one `path.apexcharts-line`
 */
export function linePathSelector(root: string, realIndex: number): string {
  return `${seriesGroupSelector(root, realIndex)} path.apexcharts-line${NOT_OWNED}`;
}

/**
 * The selector for an area series' top edge.
 *
 * Each area series draws two `path.apexcharts-area`: the fill and then the
 * stroke along the band's top (`fill="none"`). The stroke has exactly one
 * vertex per point, where the fill carries the baseline as well.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @returns A selector matching the series' stroke path
 */
export function areaPathSelector(root: string, realIndex: number): string {
  return `${seriesGroupSelector(root, realIndex)} path.apexcharts-area[fill="none"]${NOT_OWNED}`;
}

/**
 * The selector for the slices of a pie, donut or polar area chart.
 *
 * Each slice sits in a series group of its own and is drawn in data order —
 * a zero-value slice and a slice hidden through the legend included, at zero
 * sweep — so one selector matches exactly one path per value. When some
 * slices are left out (hidden through the legend), the others are listed by
 * their series group, which still matches them in data order.
 *
 * @param root - The chart's {@link rootSelector}
 * @param only - The slices to match, by index; all of them when omitted
 * @returns A selector matching the slices
 */
export function pieSelector(root: string, only?: number[]): string {
  if (!only) {
    return `${root} path.apexcharts-pie-area${NOT_OWNED}`;
  }
  return only.map(j => `${seriesGroupSelector(root, j)} path.apexcharts-pie-area${NOT_OWNED}`).join(', ');
}

/**
 * The selector for one heat map cell.
 *
 * ApexCharts stamps each cell with its series (`i`, which is the series'
 * `realIndex`) and its column (`j`), so a cell is addressed by both rather
 * than by position: rects are interleaved with data-label groups, and the
 * rows are drawn from the last series up.
 *
 * @param root - The chart's {@link rootSelector}
 * @param i    - The series (row) index in `w.config.series`
 * @param j    - The column index
 * @returns A selector matching that one cell
 */
export function heatCellSelector(root: string, i: number, j: number): string {
  return `${root} rect.apexcharts-heatmap-rect[i="${i}"][j="${j}"]`;
}

/**
 * The selector for one treemap tile.
 *
 * @param root - The chart's {@link rootSelector}
 * @param i    - The series index
 * @param j    - The tile's index in the series' data (not its drawn size order)
 * @returns A selector matching that one tile
 */
export function treemapSelector(root: string, i: number, j: number): string {
  return `${root} rect.apexcharts-treemap-rect[i="${i}"][j="${j}"]`;
}

/**
 * The selector for one ring of a radial bar chart.
 *
 * The two background tracks also carry `apexcharts-radialbar-area`, and a
 * gauge layer uses the first match, so the slice-specific class is what
 * keeps the highlight off the track.
 *
 * @param root - The chart's {@link rootSelector}
 * @param j    - The ring's index
 * @returns A selector matching that one ring
 */
export function gaugeSelector(root: string, j: number): string {
  return `${root} path.apexcharts-radialbar-area.apexcharts-radialbar-slice-${j}`;
}

/**
 * The selector for one synthetic part of a split box or candle.
 *
 * ApexCharts draws a box as two paths that each mix a whisker with half the
 * body, and a candle as one path holding the body and both wicks, so neither
 * has an element MAIDR could highlight a quartile, a median or a wick with.
 * The adapter splits them (see `split.ts`) into stamped sibling paths, which
 * this addresses.
 *
 * @param root      - The chart's {@link rootSelector}
 * @param realIndex - The series' index in `w.config.series`
 * @param j         - The box or candle's data index
 * @param part      - Which part, e.g. `'iq'` or `'wick-high'`
 * @returns A selector matching that one synthetic path
 */
export function partSelector(root: string, realIndex: number, j: number, part: string): string {
  return `${seriesGroupSelector(root, realIndex)} path[${PART_INDEX_ATTRIBUTE}="${j}"][${PART_ATTRIBUTE}="${part}"]`;
}

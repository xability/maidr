/**
 * Marks for a chart ECharts drew to a canvas.
 *
 * `selectors.ts` locates marks in the SVG ECharts draws, and a canvas has
 * none -- so a canvas chart read correctly and highlighted nothing. That is
 * ECharts' default renderer, and the only one some hosts register: Apache
 * Superset's `Echart.tsx` calls `use([CanvasRenderer, …])` and nothing else,
 * so every Superset chart is a canvas (#1304).
 *
 * The chart's model already knows where every mark is. Measured on echarts
 * 6.1.0, after a render:
 *
 * | series | `data.getItemLayout(i)` |
 * |---|---|
 * | `bar`, `pictorialBar` | `{ x, y, width, height }`, `height` signed; a sector on a polar grid |
 * | `scatter` | `[x, y]` |
 * | `pie` | `{ cx, cy, r0, r, startAngle, endAngle, clockwise }` |
 * | `sunburst` | the same, per tree node, from `node.getLayout()` |
 * | `line` | `null` -- the whole polyline is `data.getLayout('points')`, flat `[x0, y0, x1, y1, …]` |
 *
 * all in the chart's CSS pixels from its top-left corner, and a datum with no
 * value comes back with a `null` coordinate rather than being left out --
 * `{ …, height: null }`, `[x, null]`, `startAngle: null`. So "has a finite
 * layout" is exactly "was drawn", which is the same thing the readings count.
 *
 * So the marks are drawn from that, into an SVG laid over the canvas, painted
 * the way the SVG renderer paints them: a filled shape per datum, a stroked
 * path of `stroke-width: 2` per line, one filled band per area. The pass that
 * stamps an SVG chart's marks then finds them unchanged -- the same count
 * check, the same stamps, the same selector shapes -- and a canvas chart is
 * held to the same discipline: a drawing that disagrees with the model loses
 * its outline rather than outlining the wrong datum. The shapes are painted
 * at zero opacity, so the chart looks as it did; `Svg.createHighlightElement`
 * raises an outline's opacity to one whatever its original's was.
 *
 * A series type not in the table draws nothing here. Its marks are missing
 * from the count, which is how such a chart loses its outline -- as it did
 * before there was an overlay.
 */

import type { EChartsList, EChartsSeriesModel, EChartsTreeNode } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Marks the overlay, so a later pass replaces it rather than adding one, and
 * holds what it drew, so a pass that would draw the same leaves it alone.
 */
const OVERLAY_ATTRIBUTE = 'data-maidr-echart-overlay';

/** What a mark is painted with when the model names no plain colour. */
const FALLBACK_PAINT = '#808080';

/**
 * Lays an SVG of the chart's marks over a canvas-rendered chart.
 *
 * Does nothing to a chart ECharts drew as SVG: its marks are already in the
 * document, and a second set would be counted twice. Replaces the overlay a
 * previous pass drew, because the chart may have been resized or given new
 * data since -- unless the new one is identical, so that the elements a
 * mounted MAIDR instance already resolved stay in the document.
 *
 * @param container - The element the chart was rendered into
 * @param series    - Every series the adapter reads, in declaration order
 */
export function drawCanvasMarks(
  container: HTMLElement,
  series: EChartsSeriesModel[],
): void {
  const canvas = container.querySelector('canvas');
  const drawnAsSvg = Array.from(container.querySelectorAll('svg'))
    .some(svg => !svg.hasAttribute(OVERLAY_ATTRIBUTE));
  if (!canvas || drawnAsSvg) {
    return;
  }

  // The canvas sits in a positioned `<div>` ECharts creates and owns; the
  // overlay goes beside it, so the two share an origin and move together.
  const host = canvas.parentElement ?? container;
  const overlay = container.ownerDocument.createElementNS(SVG_NS, 'svg');
  overlay.setAttribute(OVERLAY_ATTRIBUTE, '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('width', `${canvas.clientWidth || canvas.width}`);
  overlay.setAttribute('height', `${canvas.clientHeight || canvas.height}`);
  overlay.setAttribute(
    'style',
    'position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none;',
  );

  for (const seriesModel of series) {
    drawSeries(overlay, seriesModel);
  }

  // Compared by what was drawn rather than by the markup in the document,
  // which the stamps and a line's hidden markers have been added to since.
  const geometry = overlay.innerHTML;
  overlay.setAttribute(OVERLAY_ATTRIBUTE, geometry);

  const previous = host.querySelector(`:scope > svg[${OVERLAY_ATTRIBUTE}]`);
  if (previous?.getAttribute(OVERLAY_ATTRIBUTE) === geometry) {
    return;
  }
  previous?.remove();
  host.appendChild(overlay);
}

/**
 * Draws one series' marks into the overlay.
 *
 * @param overlay     - The overlay being built
 * @param seriesModel - The series to draw
 */
function drawSeries(overlay: SVGSVGElement, seriesModel: EChartsSeriesModel): void {
  const data = seriesModel.getData();

  switch (seriesModel.subType) {
    case 'bar':
    case 'pictorialBar':
      eachLayout(data, (layout, index) => {
        // A bar on a polar grid is laid out as a sector, not a rectangle.
        const rect = rectOf(layout);
        const d = rect ? undefined : wedgeOf(layout);
        if (rect) {
          overlay.appendChild(filled(overlay, 'rect', rect, paintOf(data, index)));
        } else if (d) {
          overlay.appendChild(filled(overlay, 'path', { d }, paintOf(data, index)));
        }
      });
      return;
    case 'scatter':
      eachLayout(data, (layout, index) => {
        const at = pointOf(layout);
        if (at) {
          const circle = { cx: at[0], cy: at[1], r: radiusOf(data, index) };
          overlay.appendChild(filled(overlay, 'circle', circle, paintOf(data, index)));
        }
      });
      return;
    case 'pie':
      eachLayout(data, (layout, index) => {
        const d = wedgeOf(layout);
        if (d) {
          overlay.appendChild(filled(overlay, 'path', { d }, paintOf(data, index)));
        }
      });
      return;
    case 'sunburst':
      drawSunburst(overlay, data);
      return;
    case 'line':
      drawLine(overlay, seriesModel, data);
  }
}

/**
 * Draws a sunburst's slices, one per node, in the order the reading walks
 * them.
 *
 * `hierarchy.ts` names a sunburst's marks by walking its tree depth first
 * and skipping the synthetic root, because that is the order the SVG
 * renderer paints them in and not the order of the data list. The overlay is
 * drawn by the same walk so the two agree. Metabase draws its pie charts as a
 * one-level sunburst, and Superset has a sunburst of its own (#1304).
 *
 * @param overlay - The overlay being built
 * @param data    - The sunburst's data list
 */
function drawSunburst(overlay: SVGSVGElement, data: EChartsList): void {
  const root = data.tree?.root;
  if (!root) {
    return;
  }
  const visit = (node: EChartsTreeNode): void => {
    if (node !== root) {
      const d = wedgeOf(node.getLayout?.());
      if (d) {
        overlay.appendChild(filled(overlay, 'path', { d }, FALLBACK_PAINT));
      }
    }
    (node.children ?? []).forEach(visit);
  };
  visit(root);
}

/**
 * Draws a line's stroke, and its band when it fills one.
 *
 * @param overlay     - The overlay being built
 * @param seriesModel - The line series
 * @param data        - Its data list
 */
function drawLine(
  overlay: SVGSVGElement,
  seriesModel: EChartsSeriesModel,
  data: EChartsList,
): void {
  const points = pairs(data.getLayout?.('points'));
  if (points.length === 0) {
    return;
  }
  const paint = paintOf(data);

  if (seriesModel.get('areaStyle')) {
    // One filled mark for the whole band, which is what the reading counts
    // for an area. It is never outlined, only counted, so its shape is the
    // curve closed on itself: measured on 6.1.0, `getLayout` has no
    // `stackedOnPoints` to close it down to, stacked or not.
    const edge = points.filter(isPlaced);
    if (edge.length > 0) {
      overlay.appendChild(filled(overlay, 'path', { d: `${polyline(edge)} Z` }, paint));
    }
  }

  const stroke = overlay.ownerDocument.createElementNS(SVG_NS, 'path');
  stroke.setAttribute('d', polyline(points));
  stroke.setAttribute('fill', 'none');
  stroke.setAttribute('stroke', paint);
  stroke.setAttribute('stroke-width', '2');
  stroke.setAttribute('stroke-opacity', '0');
  overlay.appendChild(stroke);
}

/**
 * Visits every datum's layout, in data order.
 *
 * @param data  - The series' data list
 * @param visit - Called with each layout and its index
 */
function eachLayout(
  data: EChartsList,
  visit: (layout: unknown, index: number) => void,
): void {
  if (!data.getItemLayout) {
    return;
  }
  for (let index = 0; index < data.count(); index++) {
    visit(data.getItemLayout(index), index);
  }
}

/**
 * A filled shape, painted invisibly.
 *
 * @param overlay    - The overlay it is drawn for
 * @param tag        - `rect`, `circle` or `path`
 * @param attributes - Its geometry
 * @param paint      - Its series colour
 * @returns The element
 */
function filled(
  overlay: SVGSVGElement,
  tag: 'rect' | 'circle' | 'path',
  attributes: Record<string, number | string>,
  paint: string,
): SVGElement {
  const element = overlay.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, `${value}`);
  }
  element.setAttribute('fill', paint);
  element.setAttribute('fill-opacity', '0');
  return element;
}

/**
 * A bar's rectangle, with its height made positive.
 *
 * ECharts signs a bar's `height` (and a horizontal bar's `width`) by the
 * direction it grows from its base -- measured, `-182` for a bar standing up
 * from `y: 247` -- and SVG draws nothing for a negative one.
 *
 * @param layout - The datum's layout
 * @returns The rectangle, or `undefined` when the datum drew nothing
 */
function rectOf(layout: unknown): Record<string, number> | undefined {
  if (!isRecord(layout)) {
    return undefined;
  }
  const { x, y, width, height } = layout;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
    return undefined;
  }
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/**
 * A symbol's centre.
 *
 * @param layout - The datum's layout
 * @returns The point, or `undefined` when the datum drew nothing
 */
function pointOf(layout: unknown): [number, number] | undefined {
  if (!Array.isArray(layout) || !finite(layout[0]) || !finite(layout[1])) {
    return undefined;
  }
  return [layout[0], layout[1]];
}

/**
 * A pie slice's outline.
 *
 * ECharts measures angles in radians with `y` pointing down, which is SVG's
 * convention too, so a point on the circle is `cx + r·cos a, cy + r·sin a`
 * in either. A slice of `2π` or more is drawn as two halves, because an arc
 * whose ends meet draws nothing.
 *
 * @param layout - The datum's layout
 * @returns The path's `d`, or `undefined` when the datum drew nothing
 */
function wedgeOf(layout: unknown): string | undefined {
  if (!isRecord(layout)) {
    return undefined;
  }
  const { cx, cy, r0, r, startAngle, endAngle } = layout;
  if (!finite(cx) || !finite(cy) || !finite(r) || !finite(startAngle) || !finite(endAngle)) {
    return undefined;
  }
  const inner = finite(r0) ? r0 : 0;
  const sweep = endAngle - startAngle;
  const middle = startAngle + sweep / 2;
  const at = (radius: number, angle: number): string =>
    `${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}`;
  const clockwise = sweep >= 0 ? 1 : 0;
  const arc = (radius: number, from: number, to: number, direction: number): string => {
    const large = Math.abs(to - from) > Math.PI ? 1 : 0;
    return `A ${radius} ${radius} 0 ${large} ${direction} ${at(radius, to)}`;
  };

  const outer = `M ${at(r, startAngle)} ${arc(r, startAngle, middle, clockwise)} ${arc(r, middle, endAngle, clockwise)}`;
  if (inner <= 0) {
    return `${outer} L ${cx} ${cy} Z`;
  }
  const back = 1 - clockwise;
  return `${outer} L ${at(inner, endAngle)} ${arc(inner, endAngle, middle, back)} ${arc(inner, middle, startAngle, back)} Z`;
}

/**
 * A symbol's radius, from the size ECharts resolved for it.
 *
 * @param data  - The series' data list
 * @param index - Which datum
 * @returns Half its `symbolSize`, or ECharts' default when it names none
 */
function radiusOf(data: EChartsList, index: number): number {
  const size = data.getItemVisual?.(index, 'symbolSize');
  const width = Array.isArray(size) ? size[0] : size;
  return finite(width) && width > 0 ? width / 2 : 5;
}

/**
 * The colour ECharts resolved for a datum, or for the whole series.
 *
 * Kept rather than replaced with a stock colour so a highlight is worked out
 * against the colour the reader sees, as it is on an SVG chart. A gradient or
 * a pattern is an object rather than a string, and is drawn in a neutral grey.
 *
 * @param data  - The series' data list
 * @param index - Which datum, or none for the series' own colour
 * @returns A CSS colour
 */
function paintOf(data: EChartsList, index?: number): string {
  const style = index === undefined
    ? data.getVisual?.('style')
    : data.getItemVisual?.(index, 'style');
  if (!isRecord(style)) {
    return FALLBACK_PAINT;
  }
  const paint = index === undefined ? style.stroke ?? style.fill : style.fill;
  return typeof paint === 'string' && paint !== 'none' ? paint : FALLBACK_PAINT;
}

/**
 * A flat `[x0, y0, x1, y1, …]` as points, a gap kept as a `null`.
 *
 * @param flat - What `getLayout('points')` returned
 * @returns One entry per vertex
 */
function pairs(flat: unknown): ([number, number] | null)[] {
  if (!isList(flat)) {
    return [];
  }
  const points: ([number, number] | null)[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const x = flat[index];
    const y = flat[index + 1];
    points.push(finite(x) && finite(y) ? [x, y] : null);
  }
  return points;
}

/**
 * A path through the points, lifting the pen over each gap.
 *
 * @param points - The vertices, a gap as `null`
 * @returns The path's `d`
 */
function polyline(points: ([number, number] | null)[]): string {
  let pen = 'M';
  const commands: string[] = [];
  for (const point of points) {
    if (!point) {
      pen = 'M';
      continue;
    }
    commands.push(`${pen} ${point[0]} ${point[1]}`);
    pen = 'L';
  }
  return commands.join(' ');
}

function isPlaced(point: [number, number] | null): point is [number, number] {
  return point !== null;
}

function isList(value: unknown): value is ArrayLike<unknown> {
  return Array.isArray(value) || value instanceof Float32Array || value instanceof Float64Array;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

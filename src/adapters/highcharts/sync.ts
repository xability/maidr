/**
 * Visual synchronization between MAIDR navigation and Highcharts.
 *
 * As the reader moves through the chart with MAIDR, Highcharts' own hover
 * state and tooltip follow: the point MAIDR is on is set to its hover state
 * and its tooltip is shown. A sighted reader working alongside sees the value
 * in the chart's own tooltip, and a tooltip a pointer left behind is moved or
 * hidden rather than left naming a mark the reader is no longer on.
 *
 * ## How it follows MAIDR
 *
 * MAIDR runs as its own script and tells the page nothing directly about
 * where the reader is, but it draws its highlight into the chart: a copy of
 * the mark the reader is on, inserted into the chart's SVG with an id that
 * starts `maidr-highlight`. The sync watches the chart's container for those
 * copies and finds the Highcharts point whose mark was copied: the mark MAIDR
 * keeps its own hidden copy beside, which the highlight is drawn next to, or
 * failing that the point drawn with the same shape. A line's points have no
 * mark of their own, and MAIDR draws a dot at the vertex instead, so a dot is
 * matched to the series point at its centre.
 *
 * When MAIDR is on something no single Highcharts point draws -- a stacked
 * total, a whole row of points, a mark the chart has redrawn since -- the
 * tooltip is hidden rather than left on another point. When MAIDR takes its
 * highlight away, as the reader leaves the chart, the tooltip goes with it.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { createHighchartsSync, highchartsToMaidr } from 'maidr/highcharts';
 *
 * const chart = Highcharts.chart('container', { ... });
 * const maidrData = highchartsToMaidr(chart);
 * const sync = createHighchartsSync(chart);
 *
 * // Clean up when the chart is destroyed:
 * sync.dispose();
 * ```
 */

import type { HighchartsChart, HighchartsPoint, HighchartsSeries } from './types';

/**
 * Manages visual synchronization between MAIDR and a Highcharts chart.
 */
export interface HighchartsSync {
  /**
   * Highlights a specific point in the chart by setting its hover state
   * and refreshing the tooltip.
   *
   * @param seriesIndex - Index of the series within the chart.
   * @param pointIndex - Index of the point within the series.
   */
  highlightPoint: (seriesIndex: number, pointIndex: number) => void;

  /**
   * Clears all active highlights and hides the tooltip.
   */
  clearHighlight: () => void;

  /**
   * Stops following MAIDR and resets chart state.
   */
  dispose: () => void;
}

/** What the id of every highlight MAIDR draws over a mark starts with. */
const MAIDR_HIGHLIGHT_ID = 'maidr-highlight';

/** The attribute MAIDR marks every element it adds to a chart with. */
const MAIDR_OWNED = 'data-maidr-owned';

/**
 * The attributes that fix where and how big a mark is drawn. A highlight
 * copies all of them from its mark and restyles only its paint.
 */
const SHAPE_ATTRIBUTES = ['d', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'points', 'transform'];

/**
 * How far, in pixels, a dot MAIDR draws on a line may sit from the point it
 * marks. MAIDR places it on the line's own vertex, so this only absorbs the
 * rounding of the path's coordinates.
 */
const VERTEX_TOLERANCE_PX = 2;

/**
 * Creates a {@link HighchartsSync} for the given chart, which starts
 * following MAIDR at once.
 *
 * @param chart - A rendered Highcharts chart instance.
 * @returns A sync controller with `highlightPoint`, `clearHighlight`, and `dispose` methods.
 */
export function createHighchartsSync(chart: HighchartsChart): HighchartsSync {
  let activePoint: HighchartsPoint | null = null;

  /**
   * Returns a point the sync highlighted to its normal state, unless a
   * redraw has destroyed it since: the point is no longer drawn, and setting
   * its state would throw out of the observer and leave the tooltip behind.
   */
  function release(point: HighchartsPoint): void {
    if (point.destroyed !== true) {
      point.setState?.('');
    }
  }

  function show(point: HighchartsPoint): void {
    // Clear previous highlight.
    if (activePoint && activePoint !== point) {
      release(activePoint);
    }

    // Highlight the new point.
    point.setState?.('hover');
    chart.tooltip?.refresh(point);
    activePoint = point;
  }

  function highlightPoint(seriesIndex: number, pointIndex: number): void {
    const point = chart.series[seriesIndex]?.data[pointIndex];
    if (point) {
      show(point);
    }
  }

  function clearHighlight(): void {
    if (activePoint) {
      release(activePoint);
      activePoint = null;
    }
    chart.tooltip?.hide();
  }

  const stopFollowing = followMaidr(chart, (point) => {
    if (point === null) {
      clearHighlight();
    } else {
      show(point);
    }
  });

  function dispose(): void {
    stopFollowing();
    clearHighlight();
  }

  return { highlightPoint, clearHighlight, dispose };
}

/**
 * Calls back with the point MAIDR highlights each time its highlight moves,
 * and with null when it highlights nothing one point draws or takes its
 * highlight away.
 *
 * @param chart - The chart MAIDR is reading
 * @param onMove - What to do with the point, or with null
 * @returns A function that stops watching
 */
function followMaidr(
  chart: HighchartsChart,
  onMove: (point: HighchartsPoint | null) => void,
): () => void {
  const root = chart.container;
  // The container's own window, so a chart in a frame is watched from it.
  const Observer = root?.ownerDocument?.defaultView?.MutationObserver;
  if (!root || Observer === undefined) {
    return () => {};
  }

  const observer = new Observer((records) => {
    const drawn: Element[] = [];
    let erased = false;
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (isMaidrHighlight(node)) {
          drawn.push(node);
        }
      });
      record.removedNodes.forEach((node) => {
        erased ||= isMaidrHighlight(node);
      });
    }

    if (drawn.length > 0) {
      // Several at once is MAIDR on a group of marks -- a column of a
      // scatter, a whole series -- which no one tooltip describes.
      onMove(drawn.length === 1 ? pointDrawnAs(chart, drawn[0]) : null);
    } else if (erased && root.querySelector(`[id^="${MAIDR_HIGHLIGHT_ID}"]`) === null) {
      onMove(null);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Whether a node is a highlight MAIDR drew over a mark.
 *
 * @param node - An added or removed node
 * @returns True for one of MAIDR's highlights
 */
function isMaidrHighlight(node: Node): node is Element {
  return node.nodeType === 1 && (node as Element).id.startsWith(MAIDR_HIGHLIGHT_ID);
}

/**
 * The point whose mark a highlight was copied from.
 *
 * @param chart - The chart
 * @param highlight - The highlight MAIDR drew
 * @returns The point, or null when no one point draws it
 */
function pointDrawnAs(chart: HighchartsChart, highlight: Element): HighchartsPoint | null {
  return pointBeside(chart, highlight)
    ?? pointShaped(chart, highlight)
    ?? pointAtVertex(chart, highlight);
}

/**
 * The point whose mark the highlight sits beside.
 *
 * MAIDR keeps a hidden copy of each mark straight after the mark, and draws
 * the highlight straight after that copy, so the first element before the
 * highlight that is not one of MAIDR's own is the mark itself. Found that way
 * the mark is the chart's own element, whatever the chart has done to its
 * geometry since MAIDR copied it -- Highcharts draws a marker larger while
 * the pointer is over it -- where a match by shape would miss it.
 *
 * @param chart - The chart
 * @param highlight - The highlight MAIDR drew
 * @returns The point, or null when the highlight is not beside such a copy
 */
function pointBeside(chart: HighchartsChart, highlight: Element): HighchartsPoint | null {
  const copy = highlight.previousElementSibling;
  if (copy === null || !copy.hasAttribute(MAIDR_OWNED) || shapeOf(copy) !== shapeOf(highlight)) {
    return null;
  }
  let mark = copy.previousElementSibling;
  while (mark !== null && mark.hasAttribute(MAIDR_OWNED)) {
    mark = mark.previousElementSibling;
  }
  if (mark === null) {
    return null;
  }
  for (const series of chart.series) {
    for (const point of series.data) {
      const graphic = point.graphic?.element;
      // A mark can also be a part of the point's: a box plot's box, or one of
      // its whiskers.
      if (graphic !== undefined && graphic.contains(mark)) {
        return point;
      }
    }
  }
  return null;
}

/**
 * The point drawn with the highlight's shape, for a highlight MAIDR drew
 * straight over the chart's own mark rather than beside a copy of it: a
 * heatmap cell, or a mark made of several shapes.
 *
 * Two points drawn alike -- columns of one size at one place in two series
 * that do not stack -- are a shape no one tooltip can name, so neither is
 * returned.
 *
 * @param chart - The chart
 * @param highlight - The highlight MAIDR drew
 * @returns The point, or null when no one point draws that shape
 */
function pointShaped(chart: HighchartsChart, highlight: Element): HighchartsPoint | null {
  const shape = shapeOf(highlight);
  const drawing = chart.series.flatMap(series => series.data).filter((point) => {
    const graphic = point.graphic?.element;
    return graphic !== undefined && (shapeOf(graphic) === shape
      || Array.from(graphic.querySelectorAll('*')).some(part => shapeOf(part) === shape));
  });
  return drawing.length === 1 ? drawing[0] : null;
}

/**
 * The point a dot MAIDR drew on a line marks: the line's point at the dot's
 * centre. MAIDR draws the dot into the line's own series group, in the
 * coordinates the series places its points in.
 *
 * @param chart - The chart
 * @param highlight - The highlight MAIDR drew
 * @returns The point, or null when the highlight is no such dot
 */
function pointAtVertex(chart: HighchartsChart, highlight: Element): HighchartsPoint | null {
  if (highlight.tagName.toLowerCase() !== 'circle') {
    return null;
  }
  const cx = Number.parseFloat(highlight.getAttribute('cx') ?? '');
  const cy = Number.parseFloat(highlight.getAttribute('cy') ?? '');
  const series = chart.series.find((candidate: HighchartsSeries) =>
    candidate.group?.element.contains(highlight) === true);
  if (series === undefined || !Number.isFinite(cx) || !Number.isFinite(cy)) {
    return null;
  }

  let nearest: HighchartsPoint | null = null;
  let distance = VERTEX_TOLERANCE_PX;
  for (const point of series.data) {
    if (typeof point.plotX !== 'number' || typeof point.plotY !== 'number') {
      continue;
    }
    const away = Math.hypot(point.plotX - cx, point.plotY - cy);
    if (away <= distance) {
      nearest = point;
      distance = away;
    }
  }
  return nearest;
}

/**
 * Where and how big an element draws, with everything it contains: the part
 * of a mark a highlight copies exactly, since MAIDR restyles only its paint.
 *
 * @param element - A mark, a part of one, or a highlight
 * @returns A key two elements share only when they draw the same shape
 */
function shapeOf(element: Element): string {
  const own = [element.tagName.toLowerCase(), ...SHAPE_ATTRIBUTES.map(name => element.getAttribute(name) ?? '')]
    .join('|');
  return element.children.length === 0
    ? own
    : `${own}[${Array.from(element.children).map(shapeOf).join(',')}]`;
}

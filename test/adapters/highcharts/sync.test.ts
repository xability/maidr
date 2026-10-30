import type { HighchartsChart, HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import { createHighchartsSync } from '@adapters/highcharts/sync';
import { describe, expect, it, jest } from '@jest/globals';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { JSDOM } from 'jsdom';
import { fakeChart, fakeSeries } from './helpers';

/**
 * `createHighchartsSync(chart)`, which every Highcharts example page calls,
 * did nothing by itself: it returned `highlightPoint` and `clearHighlight` for
 * the page to call, and no page called them. So Highcharts' tooltip and hover
 * state never followed MAIDR, as docs/highcharts.md said they would, and a
 * tooltip a pointer left behind went on naming a mark the reader had moved
 * off.
 *
 * MAIDR draws its highlight into the chart as a copy of the mark the reader is
 * on, with an id starting `maidr-highlight`; these cases draw such copies the
 * way it does and check what the chart's own tooltip does. They name the
 * copies with core's own `Constant.MAIDR_HIGHLIGHT` and `Svg.markOwned`, which
 * the adapter bundle matches by their literals, so a rename in core fails
 * here rather than leaving the sync watching for something MAIDR no longer
 * draws.
 */

const SVG = 'http://www.w3.org/2000/svg';

/** A chart drawn into a document of its own, with its tooltip recorded. */
interface Drawn {
  chart: HighchartsChart;
  document: Document;
  group: SVGElement;
  points: HighchartsPoint[];
  refresh: jest.Mock<(point: HighchartsPoint | HighchartsPoint[]) => void>;
  hide: jest.Mock<() => void>;
}

/**
 * An SVG element with the given attributes.
 *
 * @param document - The document to create it in
 * @param tag - Its tag
 * @param attributes - Its attributes
 * @returns The element
 */
function svg(document: Document, tag: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * A one-series chart whose marks are the given elements, in a document of its
 * own, with the series' group holding them.
 *
 * @param marks - Builds each point's mark, or none for a point that has none
 * @param plot - Where each point is placed, for a line
 * @returns The chart, and what it was drawn with
 */
function drawChart(
  marks: (document: Document) => (SVGElement | null)[],
  plot: { plotX: number; plotY: number }[] = [],
): Drawn {
  const dom = new JSDOM('<!doctype html><div id="chart"></div>');
  const document = dom.window.document;
  const container = document.getElementById('chart') as HTMLElement;
  const root = svg(document, 'svg', {});
  const group = svg(document, 'g', { class: 'highcharts-series highcharts-series-0' });
  container.appendChild(root);
  root.appendChild(group);

  const elements = marks(document);
  for (const element of elements) {
    if (element) {
      group.appendChild(element);
    }
  }
  const setStates = elements.map(() => jest.fn());
  const series: HighchartsSeries = fakeSeries({
    index: 0,
    data: elements.map((element, i) => ({
      y: i,
      ...(element ? { graphic: { element } } : {}),
      ...plot[i],
      setState: setStates[i],
    })),
  });
  series.group = { element: group };

  const refresh = jest.fn<(point: HighchartsPoint | HighchartsPoint[]) => void>();
  const hide = jest.fn<() => void>();
  const chart = fakeChart({ series: [series] });
  chart.container = container;
  chart.tooltip = { refresh, hide };

  return { chart, document, group, points: series.data, refresh, hide };
}

/** Three bars, as a column series draws them. */
function bars(document: Document): SVGElement[] {
  return [40, 70, 55].map((height, i) => svg(document, 'rect', {
    x: 10 + 30 * i,
    y: 100 - height,
    width: 20,
    height,
  }));
}

let drawnCount = 0;

/**
 * Draws a highlight over a mark the way MAIDR does: a hidden copy beside the
 * mark, and the highlight, a copy carrying its id, beside that.
 *
 * @param mark - The mark the reader is on
 * @returns The highlight
 */
function highlight(mark: Element): Element {
  const hidden = Svg.markOwned(mark.cloneNode(true) as SVGElement);
  hidden.setAttribute('visibility', 'hidden');
  mark.after(hidden);
  const copy = hidden.cloneNode(true) as Element;
  copy.id = `${Constant.MAIDR_HIGHLIGHT}-${drawnCount++}`;
  copy.setAttribute('visibility', 'visible');
  hidden.after(copy);
  return copy;
}

/** Lets the chart's mutation observer run. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Destroys a point the way a Highcharts redraw does: its own properties are
 * deleted, `series` among them, and `setState`, which Highcharts keeps on the
 * prototype, then throws for want of the series.
 *
 * @param point - The point
 */
function destroy(point: HighchartsPoint): void {
  for (const key of Object.keys(point)) {
    delete (point as unknown as Record<string, unknown>)[key];
  }
  Object.setPrototypeOf(point, {
    setState(): void {
      throw new TypeError('Cannot read properties of undefined (reading \'chart\')');
    },
  });
  point.destroyed = true;
}

describe('createHighchartsSync', () => {
  it('shows the tooltip of the point MAIDR is on, and moves it as MAIDR moves', async () => {
    const drawn = drawChart(bars);
    createHighchartsSync(drawn.chart);
    const marks = drawn.points.map(point => point.graphic?.element as SVGElement);

    const first = highlight(marks[1]);
    await settle();
    first.remove();
    highlight(marks[2]);
    await settle();

    expect(drawn.refresh).toHaveBeenCalledTimes(2);
    expect(drawn.refresh.mock.calls[0][0]).toBe(drawn.points[1]);
    expect(drawn.refresh.mock.calls[1][0]).toBe(drawn.points[2]);
    expect(drawn.points[1].setState).toHaveBeenNthCalledWith(1, 'hover');
    expect(drawn.points[1].setState).toHaveBeenLastCalledWith('');
    expect(drawn.points[2].setState).toHaveBeenLastCalledWith('hover');
  });

  it('moves on from a point a redraw has destroyed since it was shown', async () => {
    // Setting the destroyed point's state threw out of the observer, so the
    // point MAIDR moved to was never shown and the tooltip stayed behind.
    const drawn = drawChart(bars);
    createHighchartsSync(drawn.chart);
    const marks = drawn.points.map(point => point.graphic?.element as SVGElement);
    const next = drawn.points[1];

    const first = highlight(marks[0]);
    await settle();
    destroy(drawn.points[0]);
    first.remove();
    highlight(marks[1]);
    await settle();

    expect(drawn.refresh).toHaveBeenLastCalledWith(next);
    expect(next.setState).toHaveBeenLastCalledWith('hover');
  });

  it('hides the tooltip when MAIDR takes its highlight away', async () => {
    const drawn = drawChart(bars);
    createHighchartsSync(drawn.chart);

    const shown = highlight(drawn.points[0].graphic?.element as SVGElement);
    await settle();
    shown.remove();
    await settle();

    expect(drawn.hide).toHaveBeenCalledTimes(1);
    expect(drawn.points[0].setState).toHaveBeenLastCalledWith('');
  });

  it('hides the tooltip, rather than leave it on another point, when no one point draws the highlight', async () => {
    // A stacked total, for one, is drawn as no mark of its own.
    const drawn = drawChart(bars);
    createHighchartsSync(drawn.chart);

    const shown = highlight(drawn.points[0].graphic?.element as SVGElement);
    await settle();
    const total = svg(drawn.document, 'rect', { x: 0, y: 0, width: 80, height: 5 });
    drawn.group.appendChild(total);
    shown.remove();
    highlight(total);
    await settle();

    expect(drawn.refresh).toHaveBeenCalledTimes(1);
    expect(drawn.hide).toHaveBeenCalledTimes(1);
  });

  it('hides the tooltip, rather than name one of them, when two points are drawn with the highlighted shape', async () => {
    // Columns of one size at one place in two series that do not stack. MAIDR
    // draws this highlight straight over the mark, with no copy of its own
    // beside it, so only the shape says which point it is on.
    const drawn = drawChart(document => [0, 1].map(() => svg(document, 'rect', { x: 10, y: 40, width: 20, height: 60 })));
    createHighchartsSync(drawn.chart);

    const over = svg(drawn.document, 'rect', { x: 10, y: 40, width: 20, height: 60 });
    over.id = `${Constant.MAIDR_HIGHLIGHT}-over`;
    drawn.group.appendChild(over);
    await settle();

    expect(drawn.refresh).not.toHaveBeenCalled();
    expect(drawn.hide).toHaveBeenCalledTimes(1);
  });

  it('hides the tooltip while MAIDR is on several marks at once', async () => {
    const drawn = drawChart(bars);
    createHighchartsSync(drawn.chart);

    drawn.points.forEach(point => highlight(point.graphic?.element as SVGElement));
    await settle();

    expect(drawn.refresh).not.toHaveBeenCalled();
    expect(drawn.hide).toHaveBeenCalledTimes(1);
  });

  it('finds the point a box plot\'s highlighted box belongs to', async () => {
    // A box plot's point is a group, and MAIDR highlights its parts.
    const drawn = drawChart(document => [0, 1].map((i) => {
      const box = svg(document, 'g', { class: 'highcharts-point' });
      box.appendChild(svg(document, 'path', { d: `M ${10 + 40 * i} 20 L ${30 + 40 * i} 20 L ${30 + 40 * i} 60 Z` }));
      box.appendChild(svg(document, 'path', { d: `M ${20 + 40 * i} 5 L ${20 + 40 * i} 20` }));
      return box;
    }));
    createHighchartsSync(drawn.chart);

    highlight(drawn.points[1].graphic?.element.firstElementChild as Element);
    await settle();

    expect(drawn.refresh).toHaveBeenCalledTimes(1);
    expect(drawn.refresh.mock.calls[0][0]).toBe(drawn.points[1]);
  });

  it('finds the point of a line by the dot MAIDR draws at its vertex', async () => {
    const plot = [{ plotX: 10, plotY: 80 }, { plotX: 60, plotY: 30 }, { plotX: 110, plotY: 55 }];
    const drawn = drawChart(() => plot.map(() => null), plot);
    drawn.group.appendChild(svg(drawn.document, 'path', { d: 'M 10 80 L 60 30 L 110 55' }));
    createHighchartsSync(drawn.chart);

    // MAIDR draws its dots into the line's group, from the path's vertices,
    // and marks them as its own.
    const dot = Svg.markOwned(svg(drawn.document, 'circle', { cx: 60, cy: 30, r: 4 }));
    drawn.group.appendChild(dot);
    highlight(dot);
    await settle();

    expect(drawn.refresh).toHaveBeenCalledTimes(1);
    expect(drawn.refresh.mock.calls[0][0]).toBe(drawn.points[1]);
  });

  it('finds a marker the pointer has drawn larger since MAIDR copied it', async () => {
    // Highcharts redraws a marker larger while the pointer is over it, so the
    // highlight, copied from MAIDR's hidden copy, no longer has its shape.
    const drawn = drawChart(document => [0, 1].map(i => svg(document, 'path', {
      d: `M ${20 + 40 * i} 50 A 4 4 0 1 1 ${20 + 40 * i} 50.1 Z`,
    })));
    createHighchartsSync(drawn.chart);
    const marker = drawn.points[1].graphic?.element as SVGElement;
    const hidden = Svg.markOwned(marker.cloneNode(true) as SVGElement);
    marker.after(hidden);

    marker.setAttribute('d', 'M 60 50 A 6 6 0 1 1 60 50.1 Z');
    const copy = hidden.cloneNode(true) as Element;
    copy.id = `${Constant.MAIDR_HIGHLIGHT}-hovered`;
    hidden.after(copy);
    await settle();

    expect(drawn.refresh).toHaveBeenCalledTimes(1);
    expect(drawn.refresh.mock.calls[0][0]).toBe(drawn.points[1]);
  });

  it('hides the tooltip and stops following MAIDR once disposed', async () => {
    const drawn = drawChart(bars);
    const sync = createHighchartsSync(drawn.chart);

    sync.dispose();
    highlight(drawn.points[1].graphic?.element as SVGElement);
    await settle();

    expect(drawn.hide).toHaveBeenCalledTimes(1);
    expect(drawn.refresh).not.toHaveBeenCalled();
  });

  it('still shows the point the page names on a chart it cannot watch', () => {
    // A document made with createHTMLDocument has no window, so no
    // MutationObserver to watch the chart with.
    const drawn = drawChart(bars);
    drawn.chart.container = drawn.document.implementation.createHTMLDocument('').createElement('div');
    const sync = createHighchartsSync(drawn.chart);

    sync.highlightPoint(0, 2);

    expect(drawn.refresh).toHaveBeenCalledWith(drawn.points[2]);
    expect(drawn.points[2].setState).toHaveBeenLastCalledWith('hover');
  });
});

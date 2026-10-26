import type { HighchartsChart, HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import { createHighchartsSync } from '@adapters/highcharts/sync';
import { describe, expect, it, jest } from '@jest/globals';
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
 * way it does and check what the chart's own tooltip does.
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
  const hidden = mark.cloneNode(true) as Element;
  hidden.setAttribute('data-maidr-owned', 'true');
  hidden.setAttribute('visibility', 'hidden');
  mark.after(hidden);
  const copy = hidden.cloneNode(true) as Element;
  copy.id = `maidr-highlight-${drawnCount++}`;
  copy.setAttribute('visibility', 'visible');
  hidden.after(copy);
  return copy;
}

/** Lets the chart's mutation observer run. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
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
    const dot = svg(drawn.document, 'circle', { 'cx': 60, 'cy': 30, 'r': 4, 'data-maidr-owned': 'true' });
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
    const hidden = marker.cloneNode(true) as Element;
    hidden.setAttribute('data-maidr-owned', 'true');
    marker.after(hidden);

    marker.setAttribute('d', 'M 60 50 A 6 6 0 1 1 60 50.1 Z');
    const copy = hidden.cloneNode(true) as Element;
    copy.id = 'maidr-highlight-hovered';
    hidden.after(copy);
    await settle();

    expect(drawn.refresh).toHaveBeenCalledTimes(1);
    expect(drawn.refresh.mock.calls[0][0]).toBe(drawn.points[1]);
  });

  it('stops following MAIDR once disposed', async () => {
    const drawn = drawChart(bars);
    const sync = createHighchartsSync(drawn.chart);

    sync.dispose();
    highlight(drawn.points[1].graphic?.element as SVGElement);
    await settle();

    expect(drawn.refresh).not.toHaveBeenCalled();
  });
});

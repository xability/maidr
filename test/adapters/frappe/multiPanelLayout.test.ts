import type { FrappeChart, FrappePanel } from '@adapters/frappe/types';
import type { Subplot } from '@model/plot';
import type { MaidrSubplot } from '@type/grammar';
import { createMaidrFromFrappeCharts } from '@adapters/frappe/converters';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resolveSubplotLayout } from '@util/subplotLayout';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

/**
 * Contract test for the multi-panel visual-layout pipeline.
 *
 * `resolveSubplotLayout` (src/util/subplotLayout.ts) can only compute the
 * visual ordering and vertical-inversion flag for a multi-row grid when every
 * emitted subplot resolves to a real, measurable per-panel DOM element —
 * either via `MaidrSubplot.selector` or via the first layer's first selector.
 * The Frappe adapter documents rows in visual reading order (top row first),
 * so without that geometry the core's data-order fallback would leave the
 * Up/Down arrow keys inverted (MovableGrid maps UPWARD to row + 1).
 *
 * The Frappe adapter deliberately emits NO subplot selector (a hidden clone
 * of the whole `svg.frappe-chart` would double each panel's height on focus),
 * so these tests pin the fallback side of the contract: each panel's first
 * layer selector must resolve to an element inside that panel, and feeding
 * those elements through the core layout pass must yield
 * `invertVertical: true` with reading-order subplot numbering.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const globals = globalThis as unknown as { document?: Document };
let savedDocument: Document | undefined;
let dom: JSDOM;

beforeEach(() => {
  savedDocument = globals.document;
  dom = new JSDOM('<!doctype html><body><div id="dashboard"></div></body>');
  globals.document = dom.window.document as Document;
});

afterEach(() => {
  globals.document = savedDocument;
});

const VALUES = [10, 20, 30];

function makeChart(values: number[] = VALUES, name = 'Series'): FrappeChart {
  return {
    data: {
      labels: ['A', 'B', 'C'].slice(0, values.length),
      datasets: [{ name, values }],
    },
  };
}

/**
 * Builds one rendered panel inside `wrapper`, mimicking the Frappe v1.6.2 SVG
 * structure the adapter's selectors target: `svg.frappe-chart` containing a
 * `g.dataset-units.dataset-{bars|line}.dataset-0` group with one mark
 * (`rect.bar` or `circle`) per data point.
 */
function makePanel(
  wrapper: HTMLElement,
  chartType: 'bar' | 'line',
  title: string,
): FrappePanel {
  const doc = wrapper.ownerDocument;
  const container = doc.createElement('div');
  wrapper.appendChild(container);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'frappe-chart chart');
  container.appendChild(svg);

  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute(
    'class',
    chartType === 'bar'
      ? 'dataset-units dataset-bars dataset-0'
      : 'dataset-units dataset-line dataset-0',
  );
  svg.appendChild(group);

  VALUES.forEach(() => {
    const mark = chartType === 'bar'
      ? doc.createElementNS(SVG_NS, 'rect')
      : doc.createElementNS(SVG_NS, 'circle');
    if (chartType === 'bar') {
      mark.setAttribute('class', 'bar');
    }
    group.appendChild(mark);
  });

  return { chart: makeChart(), container, chartType, title };
}

/**
 * Extracts the first layer's first selector string exactly as the core does
 * (`Subplot` constructor, src/model/plot.ts) before handing it to
 * `resolveSubplotLayout` as the panel-geometry fallback.
 */
function firstLayerSelector(subplot: MaidrSubplot): string {
  const selectors = subplot.layers[0].selectors;
  const first = typeof selectors === 'string'
    ? selectors
    : Array.isArray(selectors) && typeof selectors[0] === 'string'
      ? selectors[0]
      : null;
  expect(first).not.toBeNull();
  return first as string;
}

function mockRect(el: Element, rect: { top: number; left: number }): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      left: rect.left,
      width: 20,
      height: 20,
      right: rect.left + 20,
      bottom: rect.top + 20,
      x: rect.left,
      y: rect.top,
    }),
    configurable: true,
  });
}

function make2x2Grid(wrapper: HTMLElement): FrappePanel[][] {
  return [
    [makePanel(wrapper, 'bar', 'top-left'), makePanel(wrapper, 'line', 'top-right')],
    [makePanel(wrapper, 'line', 'bottom-left'), makePanel(wrapper, 'bar', 'bottom-right')],
  ];
}

describe('createMaidrFromFrappeCharts × resolveSubplotLayout (vertical navigation)', () => {
  it('resolves each panel\'s first layer selector to an element inside that panel', () => {
    const wrapper = document.getElementById('dashboard') as HTMLElement;
    const grid = make2x2Grid(wrapper);

    const maidr = createMaidrFromFrappeCharts(grid, wrapper);

    maidr.subplots.forEach((row, r) => row.forEach((subplot, c) => {
      // No subplot selector — a hidden clone of the whole panel <svg> would
      // corrupt the page layout (see converters.test.ts).
      expect(subplot.selector).toBeUndefined();

      // Fallback contract: the first layer's first selector resolves to a
      // mark inside this panel's own container, giving the core layout pass
      // real per-panel geometry.
      const element = document.querySelector(firstLayerSelector(subplot));
      expect(element).not.toBeNull();
      expect(grid[r][c].container.contains(element)).toBe(true);
    }));
  });

  it('drives the core layout pass to inverted vertical keys and reading-order numbering', () => {
    const wrapper = document.getElementById('dashboard') as HTMLElement;
    const grid = make2x2Grid(wrapper);

    const maidr = createMaidrFromFrappeCharts(grid, wrapper);

    // Give each panel's first mark the geometry of a 2x2 CSS grid (rows in
    // visual reading order, matching the adapter's documented emission order).
    const rects = [
      [{ top: 40, left: 10 }, { top: 40, left: 310 }],
      [{ top: 340, left: 10 }, { top: 340, left: 310 }],
    ];
    const subplots: Subplot[][] = maidr.subplots.map((row, r) => row.map((subplot, c) => {
      const selector = firstLayerSelector(subplot);
      const el = document.querySelector(selector) as SVGElement;
      mockRect(el, rects[r][c]);
      // Stand-in exposing the two accessors the layout utility consumes; the
      // real Subplot emits no highlight element (no subplot selector) and
      // caches the same first layer selector string.
      return {
        getHighlightElement: () => null,
        getLayerSelector: () => selector,
      } as unknown as Subplot;
    }));

    const layout = resolveSubplotLayout(subplots);

    // With top-first rows, UPWARD (row + 1 in MovableGrid) must be inverted
    // so the Up arrow moves visually up.
    expect(layout.invertVertical).toBe(true);
    expect(layout.topLeftRow).toBe(0);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.visualOrderMap.get('0,1')).toBe(2);
    expect(layout.visualOrderMap.get('1,0')).toBe(3);
    expect(layout.visualOrderMap.get('1,1')).toBe(4);
  });
});

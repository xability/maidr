import type { GoogleChartPanel } from '@adapters/google-charts/converters';
import type { GoogleBoundingBox, GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { Subplot } from '@model/plot';
import { createMaidrFromGoogleCharts } from '@adapters/google-charts/converters';
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
 * The Google Charts adapter emits rows in visual reading order (top row
 * first), so without that geometry the core's data-order fallback would leave
 * the Up/Down arrow keys inverted (MovableGrid maps UPWARD to row + 1).
 *
 * These tests pin the adapter's side of the contract: the emitted selectors
 * must resolve to distinct elements inside each panel, and feeding those
 * elements through the core layout pass must yield `invertVertical: true`
 * with reading-order subplot numbering.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const globals = globalThis as unknown as { document?: Document };
let savedDocument: Document | undefined;

beforeEach(() => {
  savedDocument = globals.document;
  const dom = new JSDOM('<!doctype html><body><div id="grid"></div></body>');
  globals.document = dom.window.document as Document;
});

afterEach(() => {
  globals.document = savedDocument;
});

type BarRow = [string, number];

const ROWS: BarRow[] = [['Sat', 40], ['Sun', 60]];

function makeBarDataTable(rows: BarRow[]): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => 2,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => (c === 0 ? 'Day' : 'Tips'),
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/** Builds one rendered bar-chart panel inside `parent` (see multiPanel.test.ts). */
function makeBarPanel(parent: HTMLElement, title: string): GoogleChartPanel {
  const doc = parent.ownerDocument;
  const container = doc.createElement('div');
  parent.appendChild(container);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);

  const bboxes = new Map<string, GoogleBoundingBox>();
  ROWS.forEach(([, value], i) => {
    const bbox: GoogleBoundingBox = { left: i * 30, top: 100 - value, width: 20, height: value };
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(bbox.left));
    rect.setAttribute('y', String(bbox.top));
    rect.setAttribute('width', String(bbox.width));
    rect.setAttribute('height', String(bbox.height));
    group.appendChild(rect);
    bboxes.set(`bar#0#${i}`, bbox);
  });

  const chart: GoogleChart = {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: id => bboxes.get(id) ?? null,
      getXLocation: () => 0,
      getYLocation: () => 0,
    }),
  };

  return { chart, dataTable: makeBarDataTable(ROWS), container, chartType: 'ColumnChart', title };
}

function mockRect(el: Element, rect: { top: number; left: number }): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      left: rect.left,
      width: 100,
      height: 100,
      right: rect.left + 100,
      bottom: rect.top + 100,
      x: rect.left,
      y: rect.top,
    }),
    configurable: true,
  });
}

describe('createMaidrFromGoogleCharts × resolveSubplotLayout (vertical navigation)', () => {
  it('emits a subplot selector resolving to a real element inside each panel', () => {
    const root = document.getElementById('grid') as HTMLElement;
    const panels = [
      makeBarPanel(root, 'top-left'),
      makeBarPanel(root, 'top-right'),
      makeBarPanel(root, 'bottom-left'),
      makeBarPanel(root, 'bottom-right'),
    ];

    const maidr = createMaidrFromGoogleCharts(panels, { root, layout: { columns: 2 } });

    const flatPanels = [panels[0], panels[1], panels[2], panels[3]];
    maidr.subplots.flat().forEach((subplot, i) => {
      // Subplot selector resolves to this panel's own <svg> — the element the
      // core layout pass measures (via its hidden clone) for visual ordering.
      expect(subplot.selector).toBeDefined();
      const panelElement = document.querySelector(subplot.selector!);
      expect(panelElement).toBe(flatPanels[i].container.querySelector('svg'));

      // Fallback contract: the first layer's first selector also resolves to
      // an element inside the same panel.
      const layerSelector = subplot.layers[0].selectors as string;
      const layerElement = document.querySelector(layerSelector);
      expect(layerElement).not.toBeNull();
      expect(flatPanels[i].container.contains(layerElement)).toBe(true);
    });
  });

  it('drives the core layout pass to inverted vertical keys and reading-order numbering', () => {
    const root = document.getElementById('grid') as HTMLElement;
    const panels = [
      makeBarPanel(root, 'top-left'),
      makeBarPanel(root, 'top-right'),
      makeBarPanel(root, 'bottom-left'),
      makeBarPanel(root, 'bottom-right'),
    ];

    const maidr = createMaidrFromGoogleCharts(panels, { root, layout: { columns: 2 } });

    // Give each panel's svg the geometry of a 2x2 CSS grid (rows in visual
    // reading order, matching the adapter's documented emission order).
    const rects = [
      [{ top: 0, left: 0 }, { top: 0, left: 300 }],
      [{ top: 300, left: 0 }, { top: 300, left: 300 }],
    ];
    const subplots: Subplot[][] = maidr.subplots.map((row, r) => row.map((subplot, c) => {
      const el = document.querySelector(subplot.selector!) as SVGElement;
      mockRect(el, rects[r][c]);
      // Stand-in exposing the two accessors the layout utility consumes; the
      // real Subplot resolves the same selector to a hidden clone with
      // equivalent geometry.
      return {
        getHighlightElement: () => el,
        getLayerSelector: () => subplot.layers[0].selectors as string,
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

/**
 * Which cell of an AnyChart heat map each drawn shape belongs to.
 *
 * The stamper derived a cell's coordinates from its position in the DOM —
 * `row = i / cols`, `col = i % cols` — which is only right when the rows are
 * dense AND written row-major. AnyChart draws one shape per row it was given,
 * in the order it was given them, so the coordinates belong to the row, not to
 * the count.
 *
 * Both departures are ordinary. A heat map written `for x: for y:` is drawn
 * column-major, and one that names only the pairs it has a value for is the
 * sparse case #1191 already recognises on the data side.
 */

import type { AnyChartInstance } from '@adapters/anychart/types';
import type { MaidrLayer } from '@type/grammar';
import { bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEATMAP_ATTR = 'data-maidr-anychart-heatmap-cell';

interface Row { x: string; y: string; heat: number }

/**
 * A drawn heat map: one `ac_rect_` path per row, in the order the rows were
 * written, which is the order AnyChart draws them in.
 */
function createHeatChart(rows: Row[], id: string): {
  chart: AnyChartInstance;
  container: HTMLElement;
  cells: SVGElement[];
} {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  // `findHeatmapCellLayer` only considers clipped layers, which is what tells
  // the plot area from the chrome around it.
  layer.setAttribute('clip-path', 'url(#c)');
  svg.appendChild(layer);
  container.appendChild(svg);
  document.body.appendChild(container);

  const cells = rows.map((row, i) => {
    const cell = document.createElementNS(SVG_NS, 'path');
    cell.id = `ac_rect_${i}`;
    cell.setAttribute('fill', '#4269d0');
    // Names the datum the shape was drawn for, so the assertions can say which
    // cell each resolved element is.
    cell.setAttribute('data-heat', String(row.heat));
    layer.appendChild(cell);
    return cell as unknown as SVGElement;
  });

  let cursor = -1;
  const chart = {
    title: () => 'Heat',
    container: () => container,
    getType: () => 'heat-map',
    getSeriesCount: () => 0,
    getSeriesAt: () => null,
    data: () => ({
      getIterator: () => ({
        reset: () => {
          cursor = -1;
        },
        advance: () => {
          cursor += 1;
          return cursor < rows.length;
        },
        get: (key: string) => (rows[cursor] as unknown as Record<string, unknown>)[key],
      }),
    }),
  } as unknown as AnyChartInstance;

  return { chart, container, cells };
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

/** The `data-heat` of whatever one cell selector resolves to. */
function heatAt(selector: string | null): string | null {
  if (selector === null) {
    return null;
  }
  return document.querySelector(selector)?.getAttribute('data-heat') ?? null;
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('an anychart heat map written column-major', () => {
  it('takes each cell\'s coordinates from its own row, not from its position', () => {
    // `for x: for y:` — X1Y1, X1Y2, X2Y1, X2Y2. Counting off row-major calls
    // the second shape (0, 1) when it is really (1, 0), and the third (1, 0)
    // when it is really (0, 1): the two are swapped for the whole grid.
    const { chart, container, cells } = createHeatChart([
      { x: 'X1', y: 'Y1', heat: 1 },
      { x: 'X1', y: 'Y2', heat: 2 },
      { x: 'X2', y: 'Y1', heat: 3 },
      { x: 'X2', y: 'Y2', heat: 4 },
    ], 'heat-colmajor');

    bindAnyChart(chart);

    expect(cells.map(cell => cell.getAttribute(HEATMAP_ATTR)))
      .toEqual(['0-0', '1-0', '0-1', '1-1']);

    cleanUp(container);
  });
});

describe('an anychart heat map whose rows do not fill the grid', () => {
  /** Y1 has only X1; Y2 has both. The (X2, Y1) cell is never drawn. */
  const SPARSE: Row[] = [
    { x: 'X1', y: 'Y1', heat: 3 },
    { x: 'X1', y: 'Y2', heat: 5 },
    { x: 'X2', y: 'Y2', heat: 6 },
  ];

  it('names every drawn cell by the pair its row carries', () => {
    const { chart, container, cells } = createHeatChart(SPARSE, 'heat-sparse-stamp');

    bindAnyChart(chart);

    expect(cells.map(cell => cell.getAttribute(HEATMAP_ATTR)))
      .toEqual(['0-0', '1-0', '1-1']);

    cleanUp(container);
  });

  it('emits a per-cell selector grid with a hole where nothing was drawn', () => {
    // One prefix selector resolves to three elements for a 2x2 grid, and
    // `Heatmap.mapToSvgElements` withdraws the whole mapping on that count
    // mismatch — so a sparse heat map loses highlighting on every cell,
    // including the ones that were drawn.
    const { chart, container } = createHeatChart(SPARSE, 'heat-sparse-grid');

    const maidr = bindAnyChart(chart);
    const layer = maidr?.subplots[0][0].layers[0] as MaidrLayer;
    const grid = layer.selectors as (string | null)[][];

    // `Heatmap` reverses the payload's rows so row 0 is the foot of the grid,
    // which is the direction navigation counts in — so the selector grid is
    // written bottom-first too, as the echarts heat map's is.
    expect(grid.map(row => row.map(heatAt))).toEqual([
      ['5', '6'],
      ['3', null],
    ]);

    cleanUp(container);
  });
});

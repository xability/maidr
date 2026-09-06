/**
 * A Google scatter's circles are paired with its points by **position**, and
 * that pairing has to be checked before it is shipped.
 *
 * `markSeriesPointElements` -- the volcano and Manhattan path -- already does:
 * it withdraws the marks when it could not match every point, and again when
 * the chart drew its circles in an order other than the data's, "so a
 * highlight would sit on a different point from the one being announced --
 * silently, and only in the highlight". A plain scatter and a bubble go
 * through `markScatterElements`, which shipped whatever it managed to stamp.
 *
 * Two ways that goes wrong, both routine:
 *
 * - **Coincident points.** Two rows at the same x and y are ordinary in
 *   binned or rounded data. The search answers with the first circle at that
 *   position for both, the already-marked guard skips the second, and the
 *   selector then resolves to one circle fewer than there are points --
 *   which `ScatterTrace.buildGridCells` declines outright, with nothing said
 *   anywhere.
 * - **Circles out of data order.** A single attribute selector is resolved in
 *   document order while the marks are made in data order, so every highlight
 *   lands on someone else's point.
 */

import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { MaidrLayer } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Four points, the last two drawn at the same place as the first two. */
const SPREAD: [number, number][] = [[1, 10], [2, 20], [3, 30], [4, 40]];

/** Minimal DataTable fake for a two-column scatter. */
function makeDataTable(rows: [number, number][]): GoogleDataTable {
  const labels = ['Weight', 'Height'];
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: () => 'number',
  };
}

/** Where the fake layout puts the marker for row `index`. */
function pointBox(index: number): GoogleBoundingBox {
  return { left: 20 + index * 30, top: 40, width: 6, height: 6 };
}

/** A chart whose layout places one marker per row. */
function makeChart(rowCount: number): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const match = /^point#0#(\d+)$/.exec(id);
        if (!match || Number(match[1]) >= rowCount) {
          return null;
        }
        return pointBox(Number(match[1]));
      },
      getXLocation: value => Number(value),
      getYLocation: value => Number(value),
    }),
  };
}

/**
 * A rendered scatter whose circles sit at the boxes named by `drawn`.
 *
 * @param drawn - The row each circle was drawn for, in document order
 * @returns The container
 */
function makeContainer(drawn: number[]): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="scatter-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('scatter-chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (const row of drawn) {
    const box = pointBox(row);
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', `${box.left + box.width / 2}`);
    circle.setAttribute('cy', `${box.top + box.height / 2}`);
    circle.setAttribute('data-datum', `${row}`);
    svg.appendChild(circle);
  }

  return container;
}

function build(drawn: number[], rows = SPREAD): {
  layer: MaidrLayer;
  container: HTMLElement;
} {
  const container = makeContainer(drawn);
  const maidr = createMaidrFromGoogleChart(
    makeChart(rows.length),
    makeDataTable(rows),
    container,
    { chartType: 'ScatterChart' },
  );
  return { layer: maidr.subplots[0][0].layers[0], container };
}

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('a google scatter whose circles pair with its points', () => {
  it('names them when every point found its own circle, in order', () => {
    const { layer, container } = build([0, 1, 2, 3]);

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked.map(circle => circle.getAttribute('data-datum')))
      .toEqual(['0', '1', '2', '3']);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('a google scatter the circles cannot be paired with', () => {
  it('withdraws the marks when two points share a circle', () => {
    // Rows 2 and 3 are drawn where rows 0 and 1 are, so the search answers
    // with the same circle twice and two points end up with no mark of their
    // own. A short list is not a pairing, and it is the highlight that would
    // be wrong rather than the reading.
    const { layer, container } = build([0, 1, 0, 1]);

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-point]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('count mismatch'),
    );
  });

  it('withdraws the marks when the circles run against the data', () => {
    // Every point finds a circle, so the count agrees -- and the selector is
    // still resolved in document order, which here is the reverse of the
    // data's. Shipped, every move would outline someone else's point.
    const { layer, container } = build([3, 2, 1, 0]);

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-point]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('order mismatch'),
    );
  });
});

/**
 * @jest-environment jsdom
 */

/**
 * A Vega-Lite segmented bar's columns follow the axis, not the data (#994).
 *
 * `extractSegmentedData` groups the rows by fill and pushes each series' points
 * in data-flow order. Vega sorts a nominal domain rather than keeping that
 * order — the same fact `orderedHeatmapAxis` documents for the heatmap (#977)
 * and `sortSimpleBarsByVisualOrder` fixes for a plain bar — and neither reached
 * a segmented layer, whose two existing passes reorder *series* and never
 * columns.
 *
 * Not a `sort`-only case, which is what makes it worth its own pass. Compiled
 * with vega-lite 6 and run through vega, rows listed `charlie, alpha, bravo`:
 *
 *   spec                      x scale domain          drawn left → right
 *   no sort at all            alpha, bravo, charlie   alpha@5,   bravo@105, charlie@205
 *   sort: '-y'                charlie, bravo, alpha   charlie@5, bravo@105, alpha@205
 *   sort: ['bravo','charlie'] bravo, charlie, alpha   bravo@5,   charlie@105, alpha@205
 *   dodged, sort: '-y'        charlie, bravo, alpha   charlie@19, bravo@113, alpha@206
 *
 * The first row is the one that matters: no `sort` anywhere, and the announced
 * order still is not the drawn one. Any spec whose rows are not already listed
 * in the scale's order was affected.
 *
 * The marks below imitate `view.toSVG()` for that spec — `<path>` rather than
 * `<rect>`, series-major, each series in its own data order:
 *
 *   <g class="mark-rect role-mark marks">
 *     <path aria-label="cat: charlie; v: 3;  grp: A" d="M205,…"/>
 *     <path aria-label="cat: alpha;   v: 1;  grp: A" d="M5,…"/>
 *     <path aria-label="cat: bravo;   v: 2;  grp: A" d="M105,…"/>
 *     …
 *
 * jsdom lays nothing out, so every mark's rect is stubbed with the measured x;
 * without that `isLaidOutForSort` declines and no pass runs at all.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { Maidr, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Rows listed out of the order Vega draws them in. */
const ROWS = [
  { cat: 'charlie', grp: 'A', v: 3 },
  { cat: 'alpha', grp: 'A', v: 1 },
  { cat: 'bravo', grp: 'A', v: 2 },
  { cat: 'charlie', grp: 'B', v: 30 },
  { cat: 'alpha', grp: 'B', v: 10 },
  { cat: 'bravo', grp: 'B', v: 20 },
];

/** Where Vega drew each category, measured. */
const DRAWN_X: Record<string, number> = { alpha: 5, bravo: 105, charlie: 205 };

/**
 * The same six cells emitted subject-major — every series of one category
 * before the next — which is what `detectSegmentedDomOrder` reports as
 * `order: 'column'`, the branch a dodged chart takes.
 */
const COLUMN_MAJOR_ROWS = [
  { cat: 'charlie', grp: 'A', v: 3 },
  { cat: 'charlie', grp: 'B', v: 30 },
  { cat: 'alpha', grp: 'A', v: 1 },
  { cat: 'alpha', grp: 'B', v: 10 },
  { cat: 'bravo', grp: 'A', v: 2 },
  { cat: 'bravo', grp: 'B', v: 20 },
];

/**
 * The same six cells listed in the order Vega draws them: series-major, each
 * series' categories ascending. Written out rather than derived, so what
 * "already in the drawn order" means is visible.
 */
const SORTED_ROWS = [
  { cat: 'alpha', grp: 'A', v: 1 },
  { cat: 'bravo', grp: 'A', v: 2 },
  { cat: 'charlie', grp: 'A', v: 3 },
  { cat: 'alpha', grp: 'B', v: 10 },
  { cat: 'bravo', grp: 'B', v: 20 },
  { cat: 'charlie', grp: 'B', v: 30 },
];

/**
 * A stacked bar over the given rows.
 * @param values     - The rows the spec carries
 * @param horizontal - Whether the bars grow sideways
 * @returns The spec
 */
function specFor(values: typeof ROWS, horizontal = false): VegaLiteSpec {
  const category = { field: 'cat', type: 'nominal' };
  const measure = { field: 'v', type: 'quantitative' };
  return {
    data: { values },
    mark: 'bar',
    encoding: {
      x: horizontal ? measure : category,
      y: horizontal ? category : measure,
      color: { field: 'grp', type: 'nominal' },
    },
  } as unknown as VegaLiteSpec;
}

/**
 * A rendered Vega chart: one mark group holding a path per cell, in the order
 * the rows are listed, with the measured x on each.
 * @param rows - The cells to draw, in emission order
 * @returns The container and a view that reports it
 */
function chart(
  rows: typeof ROWS = ROWS,
  horizontal = false,
): { container: HTMLElement; view: VegaView } {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  const marks = document.createElementNS(SVG_NS, 'g');
  marks.setAttribute('class', 'mark-rect role-mark marks');

  for (const row of rows) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('aria-label', `cat: ${row.cat}; v: ${row.v}; grp: ${row.grp}`);
    // `detectSegmentedDomOrder` reads the first two marks' fills to tell
    // series-major emission from subject-major, and reports nothing at all
    // when a mark has no fill — which is how `domMapping` comes to be set.
    path.setAttribute('fill', row.grp === 'A' ? '#4c78a8' : '#f58518');
    // Turned on its side the categories run down the page, so the measured
    // position rides y instead of x.
    const along = DRAWN_X[row.cat];
    path.getBoundingClientRect = (): DOMRect => (horizontal
      ? {
          x: 0,
          y: along,
          width: row.v,
          height: 90,
          top: along,
          left: 0,
          right: row.v,
          bottom: along + 90,
        }
      : {
          x: along,
          y: 0,
          width: 90,
          height: row.v,
          top: 0,
          left: along,
          right: along + 90,
          bottom: row.v,
        }) as DOMRect;
    marks.appendChild(path);
  }
  svg.appendChild(marks);
  container.appendChild(svg);
  document.body.appendChild(container);

  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: () => undefined,
  } as unknown as VegaView;
  return { container, view };
}

/**
 * Bind the chart and hand back the layer it produced.
 * @returns The emitted layer
 */
function boundLayer(): MaidrLayer {
  const { view } = chart();
  bindVegaLite(view, specFor(ROWS));
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

/** The categories the bound chart announces, one row per series. */
function announced(): unknown[][] {
  return (boundLayer().data as SegmentedPoint[][]).map(series =>
    series.map(point => point.x));
}

/** The category each mark carries, in the order the DOM now holds them. */
function domOrder(): string[] {
  return Array.from(document.querySelectorAll('path')).map((mark) => {
    const label = mark.getAttribute('aria-label') ?? '';
    return label.replace(/^cat: ([^;]+);.*$/, '$1');
  });
}

describe('a Vega-Lite segmented bar', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('announces its categories in the order they are drawn', () => {
    expect(announced()).toEqual([
      ['alpha', 'bravo', 'charlie'],
      ['alpha', 'bravo', 'charlie'],
    ]);
  });

  it('permutes every series the same way, keeping the columns aligned', () => {
    // A segmented layer is read *by column*: column `c` is one category across
    // every series, and the summary row sums down it. Per-series sorting would
    // satisfy the case above and still break this.
    const [first, second] = announced();

    expect(first).toEqual(second);
  });

  it('moves the DOM with the data', () => {
    // The half that would otherwise repeat #990: `SegmentedTrace` chunks the
    // flat element list into cells by position, so data reordered on its own
    // would announce one bar and outline another. Vega positions marks by
    // their path data, so re-appending changes nothing on screen.
    boundLayer();

    expect(domOrder()).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'alpha',
      'bravo',
      'charlie',
    ]);
  });

  it('reads a sideways chart off the axis its categories are on', () => {
    // The categories ride y when the bars grow sideways, so a pass that only
    // ever compared x would leave every horizontal segmented chart untouched
    // and this case in the data's order.
    const { view } = chart(ROWS, true);
    bindVegaLite(view, specFor(ROWS, true));

    expect(domOrder()).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'alpha',
      'bravo',
      'charlie',
    ]);
  });

  it('permutes inside a subject-major DOM without breaking its grouping', () => {
    // `domMapping` says how the flat element list chunks back into cells, and
    // `detectSegmentedDomOrder` reads it off the marks' fills at runtime — so
    // both branches are reachable and only one was covered above. Emitted
    // subject-major, the columns still have to come out drawn-order *and*
    // every category's series must stay adjacent, or the chunking that
    // reading depends on no longer describes the DOM.
    const { view } = chart(COLUMN_MAJOR_ROWS);
    bindVegaLite(view, specFor(COLUMN_MAJOR_ROWS));

    expect(domOrder()).toEqual([
      'alpha',
      'alpha',
      'bravo',
      'bravo',
      'charlie',
      'charlie',
    ]);
  });

  it('leaves a chart already in the drawn order in that order', () => {
    // The overwhelmingly common spec, listed in the scale's own order.
    //
    // Not a test of the "already sorted" short circuit: re-appending in the
    // identity order is observationally a no-op, so removing that branch
    // leaves every case here green. Falsified to find out what this does
    // catch — a sort in the wrong direction, which the cases above cannot
    // distinguish from no sort at all on a chart that starts correct.
    const { view } = chart(SORTED_ROWS);
    bindVegaLite(view, specFor(SORTED_ROWS));

    expect(domOrder()).toEqual(SORTED_ROWS.map(row => row.cat));
  });
});

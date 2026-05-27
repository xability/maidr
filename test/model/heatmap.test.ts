import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

/**
 * Provision the globals the model touches when resolving SVG selectors.
 * `Svg.selectAllElements` uses `document.querySelectorAll`, and the heatmap
 * model branches on `instanceof SVGRectElement` / `SVGPathElement` /
 * `SVGImageElement`, so all three must be wired to the JSDOM window.
 */
function installDom(html: string): void {
  const dom = new JSDOM(html);
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = dom.window.document;
  g.SVGElement = dom.window.SVGElement;
  // jsdom@22 does NOT expose SVGRectElement / SVGPathElement / SVGImageElement
  // as distinct constructors — every SVG element is just an SVGElement.
  // To exercise the heatmap model's `instanceof` branches, alias
  // SVGRectElement to SVGElement (so <rect> nodes match the rect branch),
  // and use disjoint stub classes for the other two so they never match.
  g.SVGRectElement = dom.window.SVGRectElement ?? dom.window.SVGElement;
  g.SVGPathElement = dom.window.SVGPathElement ?? class SVGPathElementStub {};
  g.SVGImageElement = dom.window.SVGImageElement ?? class SVGImageElementStub {};
}

function uninstallDom(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.SVGElement;
  delete g.SVGRectElement;
  delete g.SVGPathElement;
  delete g.SVGImageElement;
}

/**
 * Build an SVG containing `numRows * numCols` rects in row-major DOM order,
 * each tagged with `data-row` / `data-col` matching its visual cell so
 * tests can assert which DOM rect the model picked.
 */
function buildRowMajorHeatmapSvg(numRows: number, numCols: number): string {
  const cells: string[] = [];
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      cells.push(`<rect class="cell" data-row="${r}" data-col="${c}"/>`);
    }
  }
  return `<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="hm-svg">${cells.join('')}</svg>`;
}

function makeHeatmapLayer(
  data: HeatmapData,
  domMappingOrder: 'row' | 'column' | undefined,
): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    title: 'test',
    selectors: '#hm-svg .cell',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
    ...(domMappingOrder ? { domMapping: { order: domMappingOrder } } : {}),
  };
}

describe('Heatmap row-major DOM mapping', () => {
  afterEach(() => {
    uninstallDom();
  });

  test('domMapping.order === "row" mirrors DOM row index so trace row 0 = DOM bottom row', () => {
    // Visual layout (3 rows, 2 cols), values laid out with top-left highest:
    //   row 0 (visual top)   : [10, 11]
    //   row 1                : [20, 21]
    //   row 2 (visual bottom): [30, 31]
    //
    // The model reverses both `y` and `points`, so internal coords are:
    //   trace row 0 (UP-most navigation) = visual bottom row → values [30,31]
    //   trace row 2                       = visual top row    → values [10,11]
    //
    // DOM rects are emitted row-major top-to-bottom. With the row-major fix,
    // trace row 0 (Cartesian "up") must point at the LAST DOM row (data-row=2),
    // not the first.
    installDom(buildRowMajorHeatmapSvg(3, 2));

    const data: HeatmapData = {
      x: ['c0', 'c1'],
      y: ['top', 'mid', 'bottom'],
      points: [
        [10, 11],
        [20, 21],
        [30, 31],
      ],
    };

    const trace = new Heatmap(makeHeatmapLayer(data, 'row'));
    // Expose the protected highlightValues for assertion.
    const highlightValues = (trace as unknown as { highlightValues: SVGElement[][] | null }).highlightValues;

    expect(highlightValues).not.toBeNull();
    expect(highlightValues!).toHaveLength(3);
    expect(highlightValues![0]).toHaveLength(2);

    // trace row 0 = visual BOTTOM row = DOM data-row="2"
    expect(highlightValues![0][0].getAttribute('data-row')).toBe('2');
    expect(highlightValues![0][1].getAttribute('data-row')).toBe('2');
    expect(highlightValues![0][0].getAttribute('data-col')).toBe('0');
    expect(highlightValues![0][1].getAttribute('data-col')).toBe('1');

    // trace row 2 = visual TOP row = DOM data-row="0"
    expect(highlightValues![2][0].getAttribute('data-row')).toBe('0');
    expect(highlightValues![2][1].getAttribute('data-row')).toBe('0');
  });

  test('default (no domMapping) uses column-major mapping (matplotlib path-element convention)', () => {
    // The default branch reads DOM as column-major: domElements[c * numRows + r].
    // We don't need to verify the visual convention here — just that the
    // row-major fix is gated on `domMapping.order === 'row'` and not the
    // default behaviour.
    installDom(buildRowMajorHeatmapSvg(2, 2));

    const data: HeatmapData = {
      x: ['c0', 'c1'],
      y: ['top', 'bottom'],
      points: [[1, 2], [3, 4]],
    };

    const trace = new Heatmap(makeHeatmapLayer(data, undefined));
    const highlightValues = (trace as unknown as { highlightValues: SVGElement[][] | null }).highlightValues;

    expect(highlightValues).not.toBeNull();
    // Without the row-major hint, the rect at trace[0][0] is taken from the
    // column-major-indexed DOM position, which differs from the row-major
    // result — confirming the fix is actually opt-in via domMapping.
    expect(highlightValues![0][0].getAttribute('data-row')).toBe('0');
    expect(highlightValues![0][0].getAttribute('data-col')).toBe('0');
  });
});

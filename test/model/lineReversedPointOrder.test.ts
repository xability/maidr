/**
 * @jest-environment jsdom
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * A three-point series on a reversed category axis, measured on Highcharts
 * 12.6: `categories: ['alpha','bravo','charlie']` with `xAxis.reversed`
 * draws `alpha` at x=438 and `charlie` at x=88, and strokes the path in the
 * series' own data order -- so its vertices come out right to left.
 */
const VERTEX_X = [438, 263, 88];
const VERTEX_Y = [300, 200, 100];

/**
 * What the adapter emits for that chart: the categories in the order they are
 * drawn*, which is the reverse of the order they were written (#1007).
 */
const DRAWN_ORDER: LinePoint[] = [
  { x: 'charlie', y: 30 },
  { x: 'bravo', y: 20 },
  { x: 'alpha', y: 10 },
];

/**
 * Build a line layer over {@link DRAWN_ORDER}.
 *
 * @param selector - The selector the trace resolves its marks through
 * @param pointOrder - The `domMapping.pointOrder` hint, omitted when absent
 * @returns A line layer definition
 */
function createLayer(
  selector: string,
  pointOrder?: 'data' | 'reverse',
): MaidrLayer {
  return {
    id: 'reversed-line',
    type: TraceType.LINE,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    selectors: [selector],
    ...(pointOrder ? { domMapping: { pointOrder } } : {}),
    data: [DRAWN_ORDER],
  };
}

/** Put a stroked path in the document, drawn from the far end. */
function renderPath(): void {
  const d = VERTEX_X
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${VERTEX_Y[i]}`)
    .join(' ');
  document.body.innerHTML = `
    <svg id="chart" xmlns="http://www.w3.org/2000/svg">
      <g id="series"><path d="${d}"></path></g>
    </svg>`;
}

/** Put one marker per point in the document, in the series' data order. */
function renderMarkers(): void {
  const circles = VERTEX_X
    .map((x, i) => `<circle class="pt" cx="${x}" cy="${VERTEX_Y[i]}" r="4"></circle>`)
    .join('');
  document.body.innerHTML = `
    <svg id="chart" xmlns="http://www.w3.org/2000/svg">
      <g id="series">${circles}</g>
    </svg>`;
}

/**
 * The x coordinate of the element the trace would outline at each column.
 *
 * Reads `highlightValues` rather than driving navigation because that is the
 * pairing under test: the announcement follows `layer.data`, which the
 * adapter has already put in drawn order, so only the mark can disagree.
 *
 * @param trace - The trace to inspect
 * @returns One x coordinate per column of the single series
 */
function highlightedX(trace: LineTrace): number[] {
  const { highlightValues } = trace as unknown as {
    highlightValues: SVGElement[][] | null;
  };
  return (highlightValues?.[0] ?? []).map(el =>
    Number(el.getAttribute('cx')));
}

/**
 * jsdom implements `SVGElement` but none of the per-tag SVG interfaces, so
 * the `instanceof SVGPathElement` branch `LineTrace` uses to recognise a path
 * throws. Defined here to match a browser rather than to change it.
 */
function defineSvgPathElement(): void {
  if ('SVGPathElement' in globalThis) {
    return;
  }
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
}

describe('a line drawn against its axis', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('pairs a reversed payload with the far end of the path', () => {
    renderPath();
    const trace = new LineTrace(createLayer('g#series path', 'reverse'));

    // Column 0 announces "charlie", which is drawn leftmost.
    expect(highlightedX(trace)).toEqual([88, 263, 438]);
  });

  test('leaves the pairing alone when the hint is absent', () => {
    renderPath();
    const trace = new LineTrace(createLayer('g#series path'));

    // Path order is the library's data order, which is what a chart drawn the
    // ordinary way round wants -- and every existing producer relies on.
    expect(highlightedX(trace)).toEqual([438, 263, 88]);
  });

  test('treats an explicit "data" hint as the default', () => {
    renderPath();
    const trace = new LineTrace(createLayer('g#series path', 'data'));

    expect(highlightedX(trace)).toEqual([438, 263, 88]);
  });

  test('reverses per-point markers too', () => {
    // A library that renders one marker per point puts them in the DOM in the
    // order it drew them, which is the same order the path's vertices run in.
    renderMarkers();
    const trace = new LineTrace(createLayer('g#series circle.pt', 'reverse'));

    expect(highlightedX(trace)).toEqual([88, 263, 438]);
  });

  test('leaves per-point markers alone without the hint', () => {
    renderMarkers();
    const trace = new LineTrace(createLayer('g#series circle.pt'));

    expect(highlightedX(trace)).toEqual([438, 263, 88]);
  });
});

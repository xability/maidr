/**
 * @jest-environment jsdom
 */
import type { PrCurveTrace } from '@model/prCurve';
import type { RocTrace } from '@model/roc';
import type { MaidrLayer, PrCurvePoint, RocPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A precision-recall or ROC curve drawn as a staircase, the way scikit-learn's
 * `PrecisionRecallDisplay` and `ax.step` draw one, is outlined at its points.
 */

type Vertex = [number, number];

/**
 * jsdom implements `SVGElement` but none of the per-tag SVG interfaces, so
 * the `instanceof SVGPathElement` test `LineTrace` reads a mark's vertices
 * with throws. Defined here to match a browser rather than to change it.
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

/**
 * The path matplotlib writes for `drawstyle="steps-post"`: each y held to the
 * next x, so a corner between every two points and `2N - 1` vertices.
 * @param points - The points, in the order they are drawn
 * @returns The path's `d`
 */
function stepsPost(points: readonly Vertex[]): string {
  const vertices: Vertex[] = [];
  points.forEach(([x, y], i) => {
    if (i > 0) {
      vertices.push([x, points[i - 1][1]]);
    }
    vertices.push([x, y]);
  });
  return polyline(vertices);
}

/**
 * The path through a list of vertices, one straight segment after another.
 * @param vertices - The vertices, in drawing order
 * @returns The path's `d`
 */
function polyline(vertices: readonly Vertex[]): string {
  return vertices.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

/**
 * Put one path per curve on the page, each in a group of its own as
 * matplotlib writes a line.
 * @param paths - Each curve's `d`
 * @returns One selector per curve
 */
function draw(paths: readonly string[]): string[] {
  document.body.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg">
      ${paths.map((d, i) => `<g id="curve-${i}"><path d="${d}" fill="none"></path></g>`).join('')}
    </svg>`;
  return paths.map((_, i) => `g[id='curve-${i}'] path`);
}

/**
 * Where a trace outlines each point, curve by curve.
 * @param trace - The trace to inspect
 * @returns The centre of the mark drawn for each point, in reading order
 */
function outlined(trace: PrCurveTrace | RocTrace): Vertex[][] {
  const { highlightValues } = trace as unknown as {
    highlightValues: SVGElement[][] | null;
  };
  return (highlightValues ?? []).map(row => row.map(mark => [
    Number(mark.getAttribute('cx')),
    Number(mark.getAttribute('cy')),
  ]));
}

/**
 * A layer of one type.
 * @param type - The layer type
 * @param data - The curves
 * @param selectors - One selector per curve
 * @param reversed - Whether the curves are drawn in the reverse of their listed order
 * @returns The layer definition
 */
function layer(
  type: TraceType.PR_CURVE | TraceType.ROC,
  data: PrCurvePoint[][] | RocPoint[][],
  selectors: string[],
  reversed = false,
): MaidrLayer {
  return {
    id: 'curves',
    type,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
    selectors,
    ...(reversed ? { domMapping: { pointOrder: 'reverse' as const } } : {}),
  };
}

/**
 * Two classifiers listed as `precision_recall_curve` returns them, from a
 * recall of 1 down to 0; the logistic regression holds a recall of 0.8 at
 * two precisions.
 */
const LOGISTIC: PrCurvePoint[] = [
  { x: 1, y: 0.3, threshold: 0.05, z: 'Logistic', prevalence: 0.3 },
  { x: 0.8, y: 0.5, threshold: 0.2, z: 'Logistic' },
  { x: 0.8, y: 0.7, threshold: 0.4, z: 'Logistic' },
  { x: 0.5, y: 0.9, threshold: 0.6, z: 'Logistic' },
  { x: 0, y: 1, z: 'Logistic' },
];
const FOREST: PrCurvePoint[] = [
  { x: 1, y: 0.3, threshold: 0.1, z: 'Forest', prevalence: 0.3 },
  { x: 0.6, y: 0.56, threshold: 0.5, z: 'Forest' },
  { x: 0, y: 1, z: 'Forest' },
];

/**
 * Where a point is drawn: recall 0 at x 100 and 1 at x 600, precision 1 at
 * y 100 and 0 at y 400.
 * @param point - The point
 * @returns Its position on the page
 */
function at(point: PrCurvePoint | RocPoint): Vertex {
  return [100 + 500 * Number(point.x), 400 - 300 * Number(point.y)];
}

describe('a precision-recall curve drawn as a staircase', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('listed as drawn, from a recall of 1 down, each point is outlined at its own vertex', () => {
    const selectors = draw([stepsPost(LOGISTIC.map(at)), stepsPost(FOREST.map(at))]);

    const trace = TraceFactory.create(layer(TraceType.PR_CURVE, [LOGISTIC, FOREST], selectors)) as PrCurveTrace;

    // Read from recall 0 up, as the curve is turned to be read.
    expect(outlined(trace)).toEqual([
      [...LOGISTIC].reverse().map(at),
      [...FOREST].reverse().map(at),
    ]);
  });

  test('listed from a recall of 0 up, with the drawn order declared reversed, the same', () => {
    const selectors = draw([stepsPost(LOGISTIC.map(at))]);
    const listedUp = [...LOGISTIC].reverse();

    const trace = TraceFactory.create(layer(TraceType.PR_CURVE, [listedUp], selectors, true)) as PrCurveTrace;

    expect(outlined(trace)).toEqual([listedUp.map(at)]);
  });

  test('drawn as a line, a vertex per point, it is outlined as before', () => {
    const selectors = draw([polyline(LOGISTIC.map(at))]);

    const trace = TraceFactory.create(layer(TraceType.PR_CURVE, [LOGISTIC], selectors)) as PrCurveTrace;

    expect(outlined(trace)).toEqual([[...LOGISTIC].reverse().map(at)]);
  });
});

describe('a ROC curve drawn as a staircase', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('each point is outlined at its own vertex', () => {
    const roc: RocPoint[] = [
      { x: 0, y: 0, threshold: 1, z: 'Logistic' },
      { x: 0.1, y: 0.6, threshold: 0.7, z: 'Logistic' },
      { x: 0.4, y: 0.8, threshold: 0.4, z: 'Logistic' },
      { x: 1, y: 1, threshold: 0, z: 'Logistic' },
    ];
    const selectors = draw([stepsPost(roc.map(at))]);

    const trace = TraceFactory.create(layer(TraceType.ROC, [roc], selectors)) as RocTrace;

    expect(outlined(trace)).toEqual([roc.map(at)]);
  });
});

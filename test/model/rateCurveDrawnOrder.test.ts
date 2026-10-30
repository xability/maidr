/**
 * @jest-environment jsdom
 */
import type { PrCurveTrace } from '@model/prCurve';
import type { RocTrace } from '@model/roc';
import type { LinePoint, MaidrLayer, PrCurvePoint, RocPoint } from '@type/grammar';
import type { LineBrailleState, NonEmptyTraceState } from '@type/state';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A precision-recall curve listed the way `precision_recall_curve` returns
 * it: from a recall of 1 down to 0, the last point without a threshold. The
 * curve is drawn from (0, 1) at the top left down to (1, 0.3) at the bottom
 * right.
 */
const LISTED_DOWN: PrCurvePoint[] = [
  { x: 1, y: 0.3, threshold: 0.05, z: 'Logistic', prevalence: 0.3 },
  { x: 0.9, y: 0.5, threshold: 0.2, z: 'Logistic' },
  { x: 0.8, y: 0.7, threshold: 0.4, z: 'Logistic' },
  { x: 0.6, y: 0.85, threshold: 0.6, z: 'Logistic' },
  { x: 0.3, y: 0.95, threshold: 0.8, z: 'Logistic' },
  { x: 0, y: 1, z: 'Logistic' },
];

/** The same curve listed from a recall of 0 up. */
const LISTED_UP: PrCurvePoint[] = [...LISTED_DOWN].reverse();

/** A second classifier, listed from a recall of 1 down. */
const FOREST_DOWN: PrCurvePoint[] = [
  { x: 1, y: 0.3, threshold: 0.1, z: 'Forest', prevalence: 0.3 },
  { x: 0.8, y: 0.4, threshold: 0.3, z: 'Forest' },
  { x: 0.6, y: 0.56, threshold: 0.5, z: 'Forest' },
  { x: 0.35, y: 0.72, threshold: 0.7, z: 'Forest' },
  { x: 0, y: 1, z: 'Forest' },
];

/**
 * A precision-recall layer.
 * @param data - The curves the layer carries
 * @param selectors - The selectors naming each curve's marks
 * @returns The layer definition
 */
function prLayer(data: PrCurvePoint[][], selectors?: string[]): MaidrLayer {
  return {
    id: 'pr',
    type: TraceType.PR_CURVE,
    axes: { x: { label: 'Recall' }, y: { label: 'Precision' } },
    data,
    ...(selectors ? { selectors } : {}),
  };
}

/**
 * Build a trace and enter it, as the first arrow key does.
 * @param layer - The layer to build
 * @returns The trace, on its first point
 */
function entered(layer: MaidrLayer): PrCurveTrace | RocTrace {
  const trace = TraceFactory.create(layer) as PrCurveTrace | RocTrace;
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The trace's state, asserting it is populated.
 * @param trace - The trace to read
 * @returns The state
 */
function stateOf(trace: PrCurveTrace | RocTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * The x the cursor is on.
 * @param trace - The trace to read
 * @returns The announced x
 */
function xOf(trace: PrCurveTrace | RocTrace): unknown {
  return stateOf(trace).text.main.value;
}

/**
 * Press Right until it is refused, reading the x after each press.
 * @param trace - The trace, cursor placed
 * @returns Every x the cursor reached, the starting one first
 */
function walkRight(trace: PrCurveTrace | RocTrace): unknown[] {
  const xs = [xOf(trace)];
  while (trace.moveOnce('FORWARD')) {
    xs.push(xOf(trace));
  }
  return xs;
}

describe('a curve listed from its right end is read from its left end', () => {
  test('right moves toward a higher recall', () => {
    const trace = entered(prLayer([LISTED_DOWN]));

    expect(walkRight(trace)).toEqual([0, 0.3, 0.6, 0.8, 0.9, 1]);
  });

  test('control + left and right go to the two ends as drawn', () => {
    const trace = entered(prLayer([LISTED_DOWN]));

    trace.moveToExtreme('FORWARD');
    expect(xOf(trace)).toBe(1);
    expect(trace.isMovable('FORWARD')).toBe(false);

    trace.moveToExtreme('BACKWARD');
    expect(xOf(trace)).toBe(0);
    expect(trace.isMovable('BACKWARD')).toBe(false);
  });

  test('the braille row runs as the curve is drawn', () => {
    const braille = stateOf(entered(prLayer([LISTED_DOWN]))).braille as LineBrailleState;

    expect(braille.values[0]).toEqual([1, 0.95, 0.85, 0.7, 0.5, 0.3]);
    expect(braille.col).toBe(0);
  });

  test('a curve reads the same whichever way it is listed', () => {
    const down = entered(prLayer([LISTED_DOWN]));
    const up = entered(prLayer([LISTED_UP]));

    expect(walkRight(down)).toEqual(walkRight(up));
    expect(stateOf(down).braille).toEqual(stateOf(up).braille);
  });

  test('each point keeps its own threshold', () => {
    const trace = entered(prLayer([LISTED_DOWN]));
    trace.moveOnce('FORWARD');

    expect(stateOf(trace).text.main.value).toBe(0.3);
    expect(stateOf(trace).text.asides?.[0]).toEqual({ label: 'Threshold', value: '0.8' });
  });

  test('every curve is turned on its own', () => {
    // One curve listed each way round: both are read from their left end.
    const trace = TraceFactory.create(prLayer([LISTED_UP, FOREST_DOWN])) as PrCurveTrace;
    trace.moveToIndex(1, 0);

    expect(walkRight(trace)).toEqual([0, 0.35, 0.6, 0.8, 1]);
    trace.moveToIndex(0, 0);
    expect(walkRight(trace)).toEqual([0, 0.3, 0.6, 0.8, 0.9, 1]);
  });

  test('the data table lists the points from the left end', () => {
    const { rows } = (TraceFactory.create(prLayer([LISTED_DOWN])) as PrCurveTrace).description.dataTable;

    expect(rows[0]).toEqual([0, 1, '']);
    expect(rows[rows.length - 1]).toEqual([1, 0.3, 0.05]);
  });

  test('a ROC curve listed from (1, 1) down is read from (0, 0)', () => {
    const listedDown: RocPoint[] = [
      { x: 1, y: 1, threshold: 0 },
      { x: 0.25, y: 0.6, threshold: 0.5 },
      { x: 0.1, y: 0.4, threshold: 0.7 },
      { x: 0, y: 0, threshold: 1 },
    ];
    const trace = entered({
      id: 'roc',
      type: TraceType.ROC,
      axes: { x: { label: 'False positive rate' }, y: { label: 'True positive rate' } },
      data: [listedDown],
    });

    expect(walkRight(trace)).toEqual([0, 0.1, 0.25, 1]);
  });

  test('a line is still walked in the order it is listed', () => {
    // On a category axis the listed order is the drawing.
    const listed: LinePoint[] = [{ x: 3, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 3 }];
    const trace = entered({
      id: 'line',
      type: TraceType.LINE,
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: [listed],
    });

    expect(walkRight(trace)).toEqual([3, 2, 1]);
  });
});

describe('the highlight turns round with the curve', () => {
  /**
   * The x of the mark the trace outlines at each point of its first curve.
   * @param trace - The trace to inspect
   * @returns One x per point
   */
  function highlightedX(trace: PrCurveTrace): number[] {
    const { highlightValues } = trace as unknown as {
      highlightValues: SVGElement[][] | null;
    };
    return (highlightValues?.[0] ?? []).map(element => Number(element.getAttribute('cx')));
  }

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

  // The curve's vertices as `examples/pr-curve.html` draws them: in the
  // order the points are listed, from recall 1 at the right to recall 0 at
  // the left.
  const DRAWN_X = [660, 604, 548, 436, 268, 100];
  const DRAWN_Y = [312, 240, 168, 114, 78, 60];

  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('a polyline drawn from the right end is marked from its left end', () => {
    const points = DRAWN_X.map((x, i) => `${x},${DRAWN_Y[i]}`).join(' ');
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="curves"><polyline points="${points}" fill="none"></polyline></g>
      </svg>`;
    const trace = TraceFactory.create(prLayer([LISTED_DOWN], ['g#curves > polyline'])) as PrCurveTrace;

    expect(highlightedX(trace)).toEqual([...DRAWN_X].reverse());
  });

  test('one mark per point, in listed order, is marked from the left end', () => {
    const circles = DRAWN_X.map((x, i) => `<circle class="pt" cx="${x}" cy="${DRAWN_Y[i]}" r="4"></circle>`).join('');
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="curves">${circles}</g>
      </svg>`;
    const trace = TraceFactory.create(prLayer([LISTED_DOWN], ['g#curves > circle.pt'])) as PrCurveTrace;

    expect(highlightedX(trace)).toEqual([...DRAWN_X].reverse());
  });

  test('a curve listed from its left end keeps its marks as they are', () => {
    const points = [...DRAWN_X].reverse().map((x, i) => `${x},${[...DRAWN_Y].reverse()[i]}`).join(' ');
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="curves"><polyline points="${points}" fill="none"></polyline></g>
      </svg>`;
    const trace = TraceFactory.create(prLayer([LISTED_UP], ['g#curves > polyline'])) as PrCurveTrace;

    expect(highlightedX(trace)).toEqual([...DRAWN_X].reverse());
  });
});

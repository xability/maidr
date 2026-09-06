/**
 * Merging censoring ticks into a registry-scale Kaplan-Meier curve.
 *
 * The merge ran once per tick, and each run scanned the whole arm twice — a
 * `findIndex` for the time and a second full pass for the insertion point,
 * with no early exit even though the arm is in ascending time order — and then
 * spliced, shifting the tail. For an arm of S vertices and T ticks that is
 * O(T x S) comparisons plus O(T x S) element moves, all inside a synchronous
 * bind that re-runs on every React re-bind. Two thousand event times with
 * eight hundred ticks is millions of both.
 *
 * The arm is already sorted, so the whole merge is one linear pass. These
 * cases pin the shape (the tail is never shifted per tick) and the reading it
 * has to keep producing: every tick placed at its own time, in order, holding
 * the estimate the curve carries across the interval it falls in.
 */
import type { SurvivalPoint } from '@type/grammar';
import { bindD3Survival } from '@adapters/d3/binders/survival';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One curve vertex, as `.data(arms).join('path')` binds it. */
interface Sample {
  time: number;
  surv: number;
}

/** One censoring tick's datum. */
interface Tick {
  time: number;
}

const BASE = {
  selector: 'path.km',
  censoredSelector: 'line.censor',
  x: 'time',
  y: 'surv',
} as const;

/**
 * A single-arm curve plus a separate join of censoring ticks.
 * @param arm - The curve's vertices, in ascending time order
 * @param ticks - The ticks, in the order the join appended them
 * @returns The SVG root
 */
function buildSvg(arm: Sample[], ticks: Tick[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="km"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'km');
  (path as unknown as { __data__: unknown }).__data__ = arm;
  svg.appendChild(path);
  for (const tick of ticks) {
    const mark = doc.createElementNS(SVG_NS, 'line');
    mark.setAttribute('class', 'censor');
    (mark as unknown as { __data__: unknown }).__data__ = tick;
    svg.appendChild(mark);
  }
  return svg;
}

/** A curve dropping by a hundredth at every even time. */
const CURVE: Sample[] = Array.from({ length: 400 }, (_, index) => ({
  time: index * 2,
  surv: 1 - index / 1000,
}));

/** One tick between each pair of vertices, appended latest-first. */
const TICKS: Tick[] = Array.from({ length: 399 }, (_, index) => ({
  time: (398 - index) * 2 + 1,
}));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('merging many censoring ticks', () => {
  test('does not shift the curve tail once per tick', () => {
    const splice = jest.spyOn(Array.prototype, 'splice');

    bindD3Survival(buildSvg(CURVE, TICKS), BASE);

    // A per-tick `splice` is what makes the merge quadratic in element moves.
    // Any single-pass merge builds the row instead, so the count cannot grow
    // with the number of ticks.
    expect(splice.mock.calls.length).toBeLessThan(TICKS.length);
  });

  test('still places every tick at its own time, in order', () => {
    const arm = (bindD3Survival(buildSvg(CURVE, TICKS), BASE)
      .layer.data as SurvivalPoint[][])[0];

    expect(arm).toHaveLength(CURVE.length + TICKS.length);
    expect(arm.map(point => point.x)).toEqual(
      [...CURVE.map(sample => sample.time), ...TICKS.map(tick => tick.time)]
        .sort((a, b) => a - b),
    );
    // A tick is not a step: it holds the estimate the curve carries across the
    // interval it falls in, which is the vertex before it.
    expect(arm[3]).toEqual({ x: 3, y: CURVE[1].surv, censored: true });
    expect(arm[2].censored).toBeUndefined();
  });
});

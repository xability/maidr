/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, StepPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { StepTrace } from '@model/step';
import { TraceType } from '@type/grammar';

/**
 * Four samples with one repeated level — enough that the rendered staircase
 * has a different vertex count from the data, which is the whole point here.
 */
const POINTS: StepPoint[] = [
  { x: 0, y: 3, label: 'Awake' },
  { x: 1, y: 1, label: 'N2' },
  { x: 2, y: 1, label: 'N2' },
  { x: 3, y: 2, label: 'REM' },
];

/** SVG y coordinate a level is drawn at, so assertions can name real pixels. */
const PIXEL_FOR_LEVEL: Record<number, number> = { 1: 300, 2: 200, 3: 100 };

/** SVG x coordinate a sample is drawn at. */
const PIXEL_FOR_SAMPLE = [10, 20, 30, 40];

/**
 * Render a `steps-post` staircase through {@link POINTS} the way matplotlib
 * and ggplot2 do: hold the level to the next x, then jump. That is `2N - 1`
 * vertices for `N` samples, with the samples on the even indices.
 * @returns The `d` attribute of the staircase path
 */
function staircasePath(): string {
  const commands = [`M ${PIXEL_FOR_SAMPLE[0]} ${PIXEL_FOR_LEVEL[POINTS[0].y]}`];
  for (let i = 1; i < POINTS.length; i++) {
    // Horizontal to the next x at the old level, then vertical to the new one.
    commands.push(`L ${PIXEL_FOR_SAMPLE[i]} ${PIXEL_FOR_LEVEL[POINTS[i - 1].y]}`);
    commands.push(`L ${PIXEL_FOR_SAMPLE[i]} ${PIXEL_FOR_LEVEL[POINTS[i].y]}`);
  }
  return commands.join(' ');
}

/**
 * Render a `steps-mid` staircase through {@link POINTS} the way matplotlib
 * does (`cbook.pts_to_midstep`): the jump happens midway between two samples,
 * so the x sequence is `x0, m0, m0, m1, m1, ..., m(N-2), m(N-2), x(N-1)` and
 * each sample owns one horizontal run. That is `2N` vertices, and — the part
 * an average over the run gets wrong — the first and last runs are half-width,
 * with their sample at the outer end rather than at the centre.
 * @returns The `d` attribute of the staircase path
 */
function midStaircasePath(): string {
  const xs = [PIXEL_FOR_SAMPLE[0]];
  for (let i = 0; i < POINTS.length - 1; i++) {
    const midpoint = (PIXEL_FOR_SAMPLE[i] + PIXEL_FOR_SAMPLE[i + 1]) / 2;
    xs.push(midpoint, midpoint);
  }
  xs.push(PIXEL_FOR_SAMPLE[POINTS.length - 1]);

  const ys = POINTS.flatMap(point => [
    PIXEL_FOR_LEVEL[point.y],
    PIXEL_FOR_LEVEL[point.y],
  ]);

  return xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
}

/**
 * Create a step layer whose selector resolves against the document.
 * @param stepDirection - The step convention the rendered path was drawn with
 * @returns Step layer definition for StepTrace
 */
function createStepLayer(stepDirection: 'hv' | 'mid' = 'hv'): MaidrLayer {
  return {
    id: 'test-step-layer',
    type: TraceType.STEP,
    title: 'Hypnogram',
    axes: { x: { label: 'Time' }, y: { label: 'Sleep stage' } },
    stepDirection,
    selectors: ['g#step-series path'],
    data: [POINTS],
  };
}

/**
 * Read back the highlight circles MAIDR synthesised for the rendered path.
 * @returns One point per circle, in document order
 */
function highlightCircles(): { x: number; y: number }[] {
  return Array.from(document.querySelectorAll('circle')).map(circle => ({
    x: Number(circle.getAttribute('cx')),
    y: Number(circle.getAttribute('cy')),
  }));
}

/**
 * Put a rendered staircase in the document for the trace to resolve against.
 * @param pathD - The `d` attribute of the staircase path
 */
function renderStaircase(pathD: string): void {
  document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="step-series"><path d="${pathD}"></path></g>
      </svg>`;
}

/**
 * jsdom implements `SVGElement` but none of the per-tag SVG interfaces, so
 * `element instanceof SVGPathElement` — the branch `LineTrace` uses to decide
 * it is looking at a path — throws `SVGPathElement is not defined`. Define it
 * here so the branch is reachable, matching a browser's behaviour rather than
 * changing it: only a `<path>` satisfies the check.
 */
function defineSvgPathElement(): void {
  if ('SVGPathElement' in globalThis) {
    return;
  }
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    // Writable so a suite that assigns its own stub — test/model/heatmap.test.ts
    // does — is never blocked by ours having been defined first.
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
}

describe('step trace highlight mapping', () => {
  beforeEach(() => {
    defineSvgPathElement();
    renderStaircase(staircasePath());
  });

  test('constructs against a rendered staircase without throwing', () => {
    // A regression guard with real teeth: reconcilePathCoordinates runs during
    // `super(layer)`, before StepTrace's own fields exist. Reading a field
    // assigned after `super()` throws there, MAIDR never mounts, and the chart
    // is unusable — while every model test that passes no selectors still
    // passes, because the path-parsing branch is never reached.
    expect(() => new StepTrace(createStepLayer())).not.toThrow();
  });

  test('places one highlight per sample, on the sample, not on a step corner', () => {
    const trace = new StepTrace(createStepLayer());
    const circles = highlightCircles();

    // 7 vertices are rendered for 4 samples; only the 4 samples get a circle.
    expect(circles).toHaveLength(POINTS.length);
    expect(circles).toEqual(
      POINTS.map((point, i) => ({
        x: PIXEL_FOR_SAMPLE[i],
        y: PIXEL_FOR_LEVEL[point.y],
      })),
    );

    // Trimming the surplus from the end — the inherited behaviour a step path
    // must not fall back to — would put sample 2 on the first corner instead.
    expect(circles[1]).not.toEqual({ x: PIXEL_FOR_SAMPLE[1], y: PIXEL_FOR_LEVEL[3] });

    trace.dispose();
  });

  test('places every sample of a steps-mid staircase on its own x', () => {
    renderStaircase(midStaircasePath());

    const trace = new StepTrace(createStepLayer('mid'));
    const circles = highlightCircles();

    // 8 vertices are rendered for 4 samples. The two half-width end runs are
    // the ones an average over the pair gets wrong: sample 0 would land a
    // quarter of the sample interval to the right of x[0], and the last sample
    // the same distance to the left of x[N-1].
    expect(circles).toHaveLength(POINTS.length);
    expect(circles).toEqual(
      POINTS.map((point, i) => ({
        x: PIXEL_FOR_SAMPLE[i],
        y: PIXEL_FOR_LEVEL[point.y],
      })),
    );

    trace.dispose();
  });
  test('keeps an irregularly spaced steps-mid sample inside its own run', () => {
    // Interior runs of a steps-mid path span midpoint to midpoint, so their
    // centre is the sample only when the spacing either side is equal. With
    // uneven spacing the highlight is offset — the guarantee that matters is
    // that it stays within the sample's own horizontal run rather than
    // drifting onto a neighbour's, so it still reads as the right sample.
    const unevenX = [10, 20, 60, 80];
    const midpoints = unevenX.slice(0, -1).map((x, i) => (x + unevenX[i + 1]) / 2);
    const xs = [unevenX[0]];
    for (const midpoint of midpoints) {
      xs.push(midpoint, midpoint);
    }
    xs.push(unevenX[unevenX.length - 1]);
    const ys = POINTS.flatMap(point => [
      PIXEL_FOR_LEVEL[point.y],
      PIXEL_FOR_LEVEL[point.y],
    ]);
    renderStaircase(xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' '));

    const trace = new StepTrace(createStepLayer('mid'));
    const circles = highlightCircles();

    expect(circles).toHaveLength(POINTS.length);
    // The two half-width end runs are read off directly, so they are exact.
    expect(circles[0].x).toBe(unevenX[0]);
    expect(circles[POINTS.length - 1].x).toBe(unevenX[unevenX.length - 1]);

    circles.forEach((circle, i) => {
      const runStart = i === 0 ? unevenX[0] : midpoints[i - 1];
      const runEnd = i === POINTS.length - 1 ? unevenX[unevenX.length - 1] : midpoints[i];
      expect(circle.x).toBeGreaterThanOrEqual(runStart);
      expect(circle.x).toBeLessThanOrEqual(runEnd);
      expect(circle.y).toBe(PIXEL_FOR_LEVEL[POINTS[i].y]);
    });

    trace.dispose();
  });
});

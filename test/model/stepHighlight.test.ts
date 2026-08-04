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
 * Create a step layer whose selector resolves against the document.
 * @returns Step layer definition for StepTrace
 */
function createStepLayer(): MaidrLayer {
  return {
    id: 'test-step-layer',
    type: TraceType.STEP,
    title: 'Hypnogram',
    axes: { x: { label: 'Time' }, y: { label: 'Sleep stage' } },
    stepDirection: 'hv',
    selectors: ['g#step-series path'],
    data: [POINTS],
  };
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
    document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="step-series"><path d="${staircasePath()}"></path></g>
      </svg>`;
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
    const circles = Array.from(
      document.querySelectorAll('circle'),
    ).map(circle => ({
      x: Number(circle.getAttribute('cx')),
      y: Number(circle.getAttribute('cy')),
    }));

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
});

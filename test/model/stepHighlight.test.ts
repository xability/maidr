/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, StepPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { stepDataVertices, StepTrace } from '@model/step';
import { TraceType } from '@type/grammar';
import { Svg } from '@util/svg';

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
  const commands = [`M ${PIXEL_FOR_SAMPLE[0]} ${PIXEL_FOR_LEVEL[POINTS[0].y!]}`];
  for (let i = 1; i < POINTS.length; i++) {
    // Horizontal to the next x at the old level, then vertical to the new one.
    commands.push(`L ${PIXEL_FOR_SAMPLE[i]} ${PIXEL_FOR_LEVEL[POINTS[i - 1].y!]}`);
    commands.push(`L ${PIXEL_FOR_SAMPLE[i]} ${PIXEL_FOR_LEVEL[POINTS[i].y!]}`);
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
    PIXEL_FOR_LEVEL[point.y!],
    PIXEL_FOR_LEVEL[point.y!],
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
        y: PIXEL_FOR_LEVEL[point.y!],
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
        y: PIXEL_FOR_LEVEL[point.y!],
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
      PIXEL_FOR_LEVEL[point.y!],
      PIXEL_FOR_LEVEL[point.y!],
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
      expect(circle.y).toBe(PIXEL_FOR_LEVEL[POINTS[i].y!]);
    });

    trace.dispose();
  });
});

describe('a staircase plotly draws with its risers midway between samples', () => {
  // `examples/plotly-step.html`'s `hvh` chart as plotly.js 2.35.2 draws it:
  // staff of 2, 2, 5, 5, 5, 3, 3, 6 and 6 at the hours 8 to 16, 67.5 px apart.
  // Each step is `H` to the midway x, `V` to the next level and `H` on to the
  // sample, and between two samples of one level the `V` rises by nothing.
  const HVH = 'M0,209H33.75V209H67.5H101.25V60.5H135H168.75V60.5H202.5H236.25V60.5'
    + 'H270H303.75V159.5H337.5H371.25V159.5H405H438.75V11H472.5H506.25V11H540';
  const STAFF = [2, 2, 5, 5, 5, 3, 3, 6, 6];
  const LEVEL: Record<number, number> = { 2: 209, 3: 159.5, 5: 60.5, 6: 11 };
  const SAMPLES = STAFF.map((staff, i) => ({ x: 67.5 * i, y: LEVEL[staff] }));

  beforeEach(() => {
    defineSvgPathElement();
  });

  test('reads every sample off the path, the repeated ones too', () => {
    expect(stepDataVertices(Svg.pathVertices(HVH), STAFF.length)).toEqual(SAMPLES);
  });

  test('outlines each hour at its own sample', () => {
    renderStaircase(HVH);

    const trace = new StepTrace({
      id: 'staff',
      type: TraceType.STEP,
      axes: { x: { label: 'Hour' }, y: { label: 'Staff' } },
      stepDirection: 'mid',
      selectors: ['g#step-series path'],
      data: [STAFF.map((y, i) => ({ x: 8 + i, y }))],
    });

    expect(highlightCircles()).toEqual(SAMPLES);

    trace.dispose();
  });

  test('a staircase with no repeated level reads as it did', () => {
    // 2, 5, 3 and 6: every riser has a height, so no vertex repeats.
    const path = 'M0,209H33.75V60.5H67.5H101.25V159.5H135H168.75V11H202.5';

    expect(stepDataVertices(Svg.pathVertices(path), 4)).toEqual([
      { x: 0, y: 209 },
      { x: 67.5, y: 60.5 },
      { x: 135, y: 159.5 },
      { x: 202.5, y: 11 },
    ]);
  });
});

describe('a staircase plotly draws with three moves to a step', () => {
  // `examples/plotly-step.html`'s staff drawn `vhv` by plotly.js 2.35.2: `V`
  // to the level midway to the next sample, `H` across and `V` on to the
  // sample, each `V` moving by nothing between two samples of one level.
  const VHV = 'M0,209V209H67.5V209V134.75H135V60.5V60.5H202.5V60.5V60.5H270V60.5'
    + 'V110H337.5V159.5V159.5H405V159.5V85.25H472.5V11V11H540V11';
  const STAFF = [2, 2, 5, 5, 5, 3, 3, 6, 6];
  const LEVEL: Record<number, number> = { 2: 209, 3: 159.5, 5: 60.5, 6: 11 };
  const SAMPLES = STAFF.map((staff, i) => ({ x: 67.5 * i, y: LEVEL[staff] }));

  beforeEach(() => {
    defineSvgPathElement();
  });

  test('reads each sample of a vhv staircase at the end of its riser', () => {
    expect(stepDataVertices(Svg.pathVertices(VHV), STAFF.length)).toEqual(SAMPLES);
  });

  test('outlines each hour of a vhv staircase at its own sample', () => {
    renderStaircase(VHV);

    // A vhv line names no step direction (see the plotly adapter).
    const trace = new StepTrace({
      id: 'staff',
      type: TraceType.STEP,
      axes: { x: { label: 'Hour' }, y: { label: 'Staff' } },
      selectors: ['g#step-series path'],
      data: [STAFF.map((y, i) => ({ x: 8 + i, y }))],
    });

    expect(highlightCircles()).toEqual(SAMPLES);

    trace.dispose();
  });

  test('reads the second of two samples drawn vhv at its own level', () => {
    // Four vertices, as many as a two-sample steps-mid path has, but the run
    // across is at the level midway between the two.
    const path = 'M0,209V134.75H67.5V60.5';

    expect(stepDataVertices(Svg.pathVertices(path), 2)).toEqual([
      { x: 0, y: 209 },
      { x: 67.5, y: 60.5 },
    ]);
  });

  test('reads an unevenly spaced hvh staircase at its samples exactly', () => {
    // Samples at x 0, 20 and 100: the run of the middle one spans 10 to 60,
    // and its centre, 35, is not where it is drawn.
    const path = 'M0,209H10V60.5H20H60V159.5H100';

    expect(stepDataVertices(Svg.pathVertices(path), 3)).toEqual([
      { x: 0, y: 209 },
      { x: 20, y: 60.5 },
      { x: 100, y: 159.5 },
    ]);
  });
});

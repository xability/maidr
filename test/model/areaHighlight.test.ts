/**
 * @jest-environment jsdom
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { AreaTrace } from '@model/area';
import { TraceType } from '@type/grammar';

/**
 * Four samples of one band. Distinct y values throughout, so a highlight that
 * landed on the wrong vertex cannot coincide with the right one.
 */
const POINTS: LinePoint[] = [
  { x: 0, y: 3 },
  { x: 1, y: 1 },
  { x: 2, y: 4 },
  { x: 3, y: 2 },
];

/** SVG x coordinate each sample is drawn at. */
const SAMPLE_X = [10, 20, 30, 40];

/** SVG y coordinate each sample's value is drawn at. */
const SAMPLE_Y = [100, 300, 60, 200];

/** SVG y coordinate of the band's baseline. */
const BASELINE_Y = 380;

/**
 * Render an area band the way Vega, D3 and matplotlib all draw one: out along
 * the top edge through every sample, then back along the baseline, then close.
 *
 * That is `2N` vertices for `N` samples, and only the first `N` are data. This
 * is the geometry the highlight mapping has to survive, and it is the reason
 * this file exists separately from the model tests: an area is the first trace
 * whose rendered path carries a whole return journey the data knows nothing
 * about.
 * @returns The `d` attribute of the closed area path
 */
function areaPath(): string {
  const top = POINTS.map((_, i) =>
    `${i === 0 ? 'M' : 'L'} ${SAMPLE_X[i]} ${SAMPLE_Y[i]}`,
  );
  // The baseline is walked in reverse, as a closed fill must be.
  const bottom = [...POINTS].map((_, i) => POINTS.length - 1 - i).map(i => `L ${SAMPLE_X[i]} ${BASELINE_Y}`);
  return [...top, ...bottom, 'Z'].join(' ');
}

/**
 * Create an area layer whose selector resolves against the document.
 * @param type - The area variant to author
 * @returns Area layer definition for AreaTrace
 */
function createAreaLayer(type: TraceType = TraceType.AREA): MaidrLayer {
  return {
    id: 'test-area-layer',
    type,
    title: 'Revenue',
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    selectors: ['g#area-series path'],
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
 * Put a rendered band in the document for the trace to resolve against.
 * @param pathD - The `d` attribute of the area path
 */
function renderArea(pathD: string): void {
  document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="area-series"><path d="${pathD}"></path></g>
      </svg>`;
}

/**
 * jsdom implements `SVGElement` but none of the per-tag SVG interfaces, so
 * `element instanceof SVGPathElement` — the branch `LineTrace` uses to decide
 * it is looking at a path — throws. Define it here so the branch is reachable,
 * matching a browser rather than changing it: only a `<path>` satisfies it.
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

describe('area trace highlight mapping', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('maps the top edge of a closed band onto the data points', () => {
    // `LineTrace.reconcilePathCoordinates` drops surplus vertices from the
    // END, which is exactly right here: an area path draws its data first and
    // its return journey afterwards, so the survivors are the samples. That is
    // load-bearing rather than incidental — a renderer that emitted the
    // baseline first would put every highlight on the baseline — so it is
    // pinned here rather than left to be discovered visually.
    renderArea(areaPath());
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer());

    expect(highlightCircles()).toEqual(
      POINTS.map((_, i) => ({ x: SAMPLE_X[i], y: SAMPLE_Y[i] })),
    );
  });

  test('never places a highlight on the baseline', () => {
    renderArea(areaPath());
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer());

    const onBaseline = highlightCircles().filter(c => c.y === BASELINE_Y);
    expect(onBaseline).toHaveLength(0);
  });

  test('maps an unclosed band the same way a line is mapped', () => {
    // Some producers stroke the top edge as its own path and fill separately,
    // so the selector resolves to a plain N-vertex polyline. That path needs
    // no reconciliation at all and must come through unchanged.
    const topOnly = POINTS
      .map((_, i) => `${i === 0 ? 'M' : 'L'} ${SAMPLE_X[i]} ${SAMPLE_Y[i]}`)
      .join(' ');
    renderArea(topOnly);
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer());

    expect(highlightCircles()).toEqual(
      POINTS.map((_, i) => ({ x: SAMPLE_X[i], y: SAMPLE_Y[i] })),
    );
  });

  test('maps a stacked band the same way', () => {
    // Stacking changes what is announced, not how the band is drawn, so the
    // geometry handling must not diverge between the variants.
    renderArea(areaPath());
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer(TraceType.STACKED_AREA));

    expect(highlightCircles()).toEqual(
      POINTS.map((_, i) => ({ x: SAMPLE_X[i], y: SAMPLE_Y[i] })),
    );
  });
});

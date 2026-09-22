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
 * @param selector - What the layer names as its band
 * @returns Area layer definition for AreaTrace
 */
function createAreaLayer(
  type: TraceType = TraceType.AREA,
  selector = 'g#area-series path',
): MaidrLayer {
  return {
    id: 'test-area-layer',
    type,
    title: 'Revenue',
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    selectors: [selector],
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

describe('stepped area highlight mapping (#413)', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  /**
   * A stepped band, drawn the way a renderer draws one: out along the top edge
   * with a corner vertex between every pair of samples, then back along the
   * baseline, then close.
   *
   * That is `(2N - 1) + N` vertices for `N` samples, and the surplus is both
   * interleaved* (the corners) and *trailing* (the return journey). The
   * inherited reconciliation removes surplus from the end only, which is
   * exactly right for a plain band and cannot separate the corners here.
   * @returns The `d` attribute of the closed stepped area path
   */
  function steppedAreaPath(): string {
    const top: string[] = [`M ${SAMPLE_X[0]} ${SAMPLE_Y[0]}`];
    for (let i = 1; i < POINTS.length; i++) {
      // `hv`: hold the previous value across to this x, then jump to it.
      top.push(`L ${SAMPLE_X[i]} ${SAMPLE_Y[i - 1]}`);
      top.push(`L ${SAMPLE_X[i]} ${SAMPLE_Y[i]}`);
    }
    const bottom = [...POINTS]
      .map((_, i) => POINTS.length - 1 - i)
      .map(i => `L ${SAMPLE_X[i]} ${BASELINE_Y}`);
    return [...top, ...bottom, 'Z'].join(' ');
  }

  test('the highlights land on the samples, not on the step corners', () => {
    renderArea(steppedAreaPath());
    // eslint-disable-next-line no-new
    new AreaTrace({ ...createAreaLayer(), stepDirection: 'hv' });

    expect(highlightCircles()).toEqual(
      POINTS.map((_, i) => ({ x: SAMPLE_X[i], y: SAMPLE_Y[i] })),
    );
  });
});

describe('a band gridSVG drew as a polygon (#1273)', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  /** How far either side of a sample `stat_align()` puts its extra vertices. */
  const ALIGN = 1;

  /**
   * Put a rendered polygon in the document for the trace to resolve against.
   *
   * gridSVG writes a filled band as `<polygon points="x,y x,y …">`: the same
   * vertices a path would carry, in the same order, with no `d` to parse.
   * @param vertices - The polygon's vertices in drawing order
   */
  function renderPolygon(vertices: readonly { x: number; y: number }[]): void {
    const points = vertices.map(v => `${v.x},${v.y}`).join(' ');
    document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="area-series"><polygon points="${points}"></polygon></g>
      </svg>`;
  }

  /** The samples alone, out along the edge. */
  const SAMPLES = POINTS.map((_, i) => ({ x: SAMPLE_X[i], y: SAMPLE_Y[i] }));

  /**
   * The edge ggplot2 draws after `stat_align()`: a vertex a hair either side
   * of every sample, at a y that is not the sample's, and a zero-height pad
   * past the last one. Eleven vertices for four samples.
   * @returns The way out
   */
  function alignedEdge(): { x: number; y: number }[] {
    const edge: { x: number; y: number }[] = [];
    SAMPLES.forEach((sample, i) => {
      if (i > 0) {
        edge.push({ x: sample.x - ALIGN, y: sample.y + 2 });
      }
      edge.push(sample);
      if (i < SAMPLES.length - 1) {
        edge.push({ x: sample.x + ALIGN, y: sample.y - 2 });
      }
    });
    edge.push({ x: SAMPLE_X[SAMPLE_X.length - 1] + ALIGN, y: BASELINE_Y });
    return edge;
  }

  /**
   * The way back along the band's underside, over the aligned x positions in
   * reverse, ending on the leading pad.
   * @param underside - The y of the underside at an x
   * @returns The way back
   */
  function alignedBack(underside: (x: number) => number): { x: number; y: number }[] {
    const xs = alignedEdge().slice(0, -1).map(v => v.x).reverse();
    return [
      ...xs.map(x => ({ x, y: underside(x) })),
      { x: SAMPLE_X[0] - ALIGN, y: BASELINE_Y },
    ];
  }

  test('reads the vertices of a polygon as it reads a path', () => {
    // One vertex per sample out, one per sample back: the shape D3 and Base
    // R's `cdplot()` draw. Before this a polygon fell through both element
    // branches with no vertices at all, so the band announced every point and
    // outlined nothing.
    const back = [...SAMPLES].reverse().map(s => ({ x: s.x, y: BASELINE_Y }));
    renderPolygon([...SAMPLES, ...back]);
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer(TraceType.AREA, 'g#area-series polygon'));

    expect(highlightCircles()).toEqual(SAMPLES);
  });

  test('finds the samples among the vertices stat_align() adds', () => {
    // Twenty-two vertices for four samples. Trimming to the first four would
    // outline the first sample, both of its neighbours and the second sample,
    // and announce all four samples against them.
    renderPolygon([...alignedEdge(), ...alignedBack(() => BASELINE_Y)]);
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer(TraceType.AREA, 'g#area-series polygon'));

    expect(highlightCircles()).toEqual(SAMPLES);
  });

  test('finds them on a band stacked over another', () => {
    // The way back is the band below, not the baseline, so only the pads
    // touch the baseline. The band's own value sits on its top edge.
    renderPolygon([...alignedEdge(), ...alignedBack(() => 250)]);
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer(TraceType.STACKED_AREA, 'g#area-series polygon'));

    expect(highlightCircles()).toEqual(SAMPLES);
  });

  test('finds them when the edge ends in a drop rather than a pad', () => {
    // A normalized band spans the whole x range, so ggplot2 pads neither end
    // and the edge turns back with a vertical drop at the last sample's x.
    // The drop shares that x, and it is the start of the way back, not one
    // more edge vertex.
    const edge = alignedEdge().slice(0, -1);
    const back = alignedBack(() => 250).slice(0, -1);
    renderPolygon([...edge, ...back]);
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer(TraceType.NORMALIZED_AREA, 'g#area-series polygon'));

    expect(highlightCircles()).toEqual(SAMPLES);
  });

  test('leaves an edge that never turns back to the line mapping', () => {
    // A stroked top edge with the aligned vertices and no way back is not a
    // band; it gets the interpolation a simplified line gets, and that lands
    // on the samples too because their x positions are vertices.
    const edge = alignedEdge().slice(0, -1);
    const points = edge.map(v => `${v.x},${v.y}`).join(' ');
    document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="area-series"><polyline points="${points}"></polyline></g>
      </svg>`;
    // eslint-disable-next-line no-new
    new AreaTrace(createAreaLayer(TraceType.AREA, 'g#area-series polyline'));

    expect(highlightCircles()).toHaveLength(POINTS.length);
  });
});

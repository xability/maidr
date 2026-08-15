/**
 * @jest-environment jsdom
 *
 * A staircase highlighted nothing because the path parser read only `M`, `L`
 * and `C` (#907).
 *
 * Every segment of a staircase is axis-aligned, so a renderer draws one with
 * `H` and `V` — and those were invisible to the parser. A four-sample Plotly
 * step chart therefore parsed to its single `M` and nothing else: one vertex
 * against four samples, padded to `NaN`, the series marked failed, and
 * `mapToSvgElements` returning null. Correct audio, correct braille, correct
 * text, no highlight, and nothing anywhere saying why.
 *
 * The `d` attributes below are not invented. Each was read out of Chromium
 * from real Plotly.js output, four samples per trace, off the `path.js-line`
 * element py-maidr's selectors address.
 */
import type { LinePoint, MaidrLayer, StepPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { AreaTrace } from '@model/area';
import { LineTrace } from '@model/line';
import { StepTrace } from '@model/step';
import { TraceType } from '@type/grammar';

/** Four samples, distinct throughout so a misplaced highlight cannot hide. */
const POINTS: LinePoint[] = [
  { x: 1, y: 1 },
  { x: 2, y: 3 },
  { x: 3, y: 2 },
  { x: 4, y: 4 },
];

/**
 * Where Plotly draws each sample, in SVG coordinates.
 *
 * The x values are the plot area walked in four equal steps; the y values are
 * `POINTS`' magnitudes inverted onto it. Both are read off the rendered chart
 * rather than derived, so an assertion below is comparing against the pixels
 * a sighted reader sees.
 */
const PLOTLY_X = [0, 246.67, 493.33, 740];
const PLOTLY_Y = [399, 147, 273, 21];

/** Measured `path.js-line` geometry, by `line.shape`. */
const PLOTLY_PATHS = {
  hv: 'M0,399H246.67V147H493.33V273H740V21',
  vh: 'M0,399V147H246.67V273H493.33V21H740',
  linear: 'M0,399L246.67,147L493.33,273L740,21',
  spline:
    'M0,399Q158.85,161.34 246.67,147C324.5,134.29 415.5,285.71 493.33,273Q581.15,258.66 740,21',
};

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
        return value instanceof SVGElement && (value as Element).tagName === 'path';
      }
    },
  });
}

/**
 * Put a rendered path in the document for a trace to resolve against.
 * @param pathD - The `d` attribute to render
 */
function render(pathD: string): void {
  document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g id="series"><path d="${pathD}"></path></g>
      </svg>`;
}

/**
 * Read back the highlight circles MAIDR synthesised.
 * @returns One point per circle, in document order
 */
function circles(): { x: number; y: number }[] {
  return Array.from(document.querySelectorAll('circle')).map(circle => ({
    x: Number(circle.getAttribute('cx')),
    y: Number(circle.getAttribute('cy')),
  }));
}

/**
 * Build a layer whose single selector resolves against the rendered path.
 * @param type - The trace type to author
 * @param extra - Additional layer fields, e.g. `stepDirection`
 * @returns A layer definition over {@link POINTS}
 */
function layer(type: TraceType, extra: Partial<MaidrLayer> = {}): MaidrLayer {
  return {
    id: 'test-layer',
    type,
    title: 'Measurement',
    axes: { x: { label: 'Time' }, y: { label: 'Value' } },
    selectors: ['g#series path'],
    data: [POINTS as StepPoint[]],
    ...extra,
  } as MaidrLayer;
}

/** The SVG position of every sample, which is where the highlights belong. */
function samplePositions(): { x: number; y: number }[] {
  return POINTS.map((_, i) => ({ x: PLOTLY_X[i], y: PLOTLY_Y[i] }));
}

describe('svg path command parsing (#907)', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  describe('a plotly staircase', () => {
    test('highlights every sample rather than nothing at all', () => {
      render(PLOTLY_PATHS.hv);
      // eslint-disable-next-line no-new
      new StepTrace(layer(TraceType.STEP, { stepDirection: 'hv' }));

      expect(circles()).toEqual(samplePositions());
    });

    test('reads a vh staircase the same way', () => {
      // `vh` jumps at the x value and then holds, so its path opens with a `V`
      // where `hv` opens with an `H`. Both are unreadable to an M/L parser,
      // and for the same reason.
      render(PLOTLY_PATHS.vh);
      // eslint-disable-next-line no-new
      new StepTrace(layer(TraceType.STEP, { stepDirection: 'vh' }));

      expect(circles()).toEqual(samplePositions());
    });

    test('never leaves a series without a highlight', () => {
      // The failure this file exists for, asserted directly: a NaN anywhere in
      // the reconciled vertices makes `mapViaPathParsing` drop the whole
      // series, and with one series that means no highlight at all.
      render(PLOTLY_PATHS.hv);
      // eslint-disable-next-line no-new
      new StepTrace(layer(TraceType.STEP, { stepDirection: 'hv' }));

      const highlights = circles();
      expect(highlights).toHaveLength(POINTS.length);
      expect(highlights.filter(c => Number.isNaN(c.x) || Number.isNaN(c.y))).toEqual([]);
    });
  });

  describe('what already worked keeps working', () => {
    test('a linear plotly line is unchanged', () => {
      // `M`/`L` only, so this path was already parsed correctly. Pinned so the
      // rewrite is provably additive rather than a re-derivation.
      render(PLOTLY_PATHS.linear);
      // eslint-disable-next-line no-new
      new LineTrace(layer(TraceType.LINE));

      expect(circles()).toEqual(samplePositions());
    });

    test('a cubic contributes its endpoint, not its control points', () => {
      // The one piece of curve handling the old parser had. A control point
      // recorded as a vertex would put the highlight off the drawn line.
      render('M 0 0 C 10 90 20 90 30 0');
      // eslint-disable-next-line no-new
      new LineTrace(layer(TraceType.LINE, { data: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] }));

      expect(circles()).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }]);
    });
  });

  describe('curves the old parser could not see', () => {
    test('a plotly spline lands on its samples', () => {
      // Quadratics were as invisible as H/V: this path parsed to its `M` and
      // one `C` endpoint, two vertices for four samples, so the highlights
      // were interpolated along that chord instead of sitting on the data.
      render(PLOTLY_PATHS.spline);
      // eslint-disable-next-line no-new
      new LineTrace(layer(TraceType.LINE));

      expect(circles()).toEqual(samplePositions());
    });
  });

  describe('the rest of the path grammar', () => {
    /**
     * Drive a line over a path and read back the vertices parsed from it.
     *
     * `sampleCount` has to match the number of vertices the path is expected
     * to yield, because `reconcilePathCoordinates` runs afterwards and trims
     * any surplus from the end — a mismatch would hide a vertex the parser
     * read correctly, or invent one it did not.
     *
     * @param pathD - The `d` attribute to parse
     * @param sampleCount - How many vertices the path should yield
     * @returns The highlight positions
     */
    function parse(pathD: string, sampleCount: number): { x: number; y: number }[] {
      const data = Array.from({ length: sampleCount }, (_, i) => ({ x: i, y: i }));
      render(pathD);
      // eslint-disable-next-line no-new
      new LineTrace(layer(TraceType.LINE, { data: [data] }));
      return circles();
    }

    test('relative commands accumulate against the current point', () => {
      expect(parse('m 10 10 l 5 5', 2)).toEqual([{ x: 10, y: 10 }, { x: 15, y: 15 }]);
    });

    test('relative h and v move one axis at a time', () => {
      expect(parse('M 10 10 h 5 v -4', 3)).toEqual([
        { x: 10, y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 6 },
      ]);
    });

    test('a repeated argument list is several commands', () => {
      // `L1 2 3 4` is two linetos, per the path grammar. Reading it as one
      // would drop every second vertex of a compactly serialised path.
      expect(parse('M 0 0 L 1 2 3 4', 3)).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]);
    });

    test('pairs after a moveto are implicit linetos', () => {
      expect(parse('M 0 0 1 2', 2)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 2 }]);
    });

    test('closepath returns to the subpath start without adding a vertex', () => {
      // `Z` draws back to a vertex already recorded. Emitting one would
      // duplicate the start and push the count past the shape checks that
      // read it.
      expect(parse('M 0 0 L 5 5 Z', 2)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
    });

    test('a closepath moves the pen back for the command after it', () => {
      // The reason `Z` is tracked rather than skipped: a relative command
      // following one is measured from the subpath start, not from where the
      // pen last drew.
      expect(parse('M 10 10 L 50 50 Z l 5 5', 3)).toEqual([
        { x: 10, y: 10 },
        { x: 50, y: 50 },
        { x: 15, y: 15 },
      ]);
    });

    test('exponent notation parses as one number', () => {
      expect(parse('M 1e2 2e1 L 3 4', 2)).toEqual([{ x: 100, y: 20 }, { x: 3, y: 4 }]);
    });

    test('a smooth cubic contributes its endpoint', () => {
      // `S x2 y2 x y` — four numbers, the first pair a control point. Reading
      // the wrong pair would put the highlight off the drawn curve.
      expect(parse('M 0 0 C 5 20 10 20 15 0 S 25 -20 30 0', 3)).toEqual([
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 30, y: 0 },
      ]);
    });

    test('a smooth quadratic contributes its endpoint', () => {
      // `T x y` — the control point is implied from the previous command, so
      // both numbers are the endpoint.
      expect(parse('M 0 0 Q 5 20 10 0 T 20 0', 3)).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ]);
    });

    test('an arc is skipped without corrupting the commands around it', () => {
      // An arc's endpoint cannot be located by a number scan — its flags are
      // legally written without separators — so it contributes nothing. What
      // it must not do is contribute something *wrong*: with `A` missing from
      // the command class its tokens were swept into the preceding `L`'s
      // argument list and read as further linetos, fabricating `(5,5)`,
      // `(0,0)` and `(1,20)` here. Raised in review on #908.
      expect(parse('M 0 0 L 10 10 A 5 5 0 0 1 20 20 L 30 30', 3)).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]);
    });

    test('an arc with packed flags is skipped just as cleanly', () => {
      // The compact serialisation the number scan cannot read: `0 0 1` is
      // written `001`. Whatever it tokenizes to must stay inside the arc.
      expect(parse('M 0 0 L 10 10 a5 5 0 001 1 L 30 30', 3)).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]);
    });
  });
});

describe('redundant collinear vertices (#907)', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  /**
   * Plotly's `hvh` geometry, measured. It splits each horizontal run into two
   * commands — `…H246.67H370…` with no `V` between them — so the path carries
   * ten vertices for four samples where the `mid` convention has eight.
   */
  const PLOTLY_HVH
    = 'M0,320.25H123.34V220.5H246.67H370V120.75H493.33H616.67V21H740';

  test('a mid staircase still lands inside each sample run', () => {
    render(PLOTLY_HVH);
    // eslint-disable-next-line no-new
    new StepTrace(layer(TraceType.STEP, { stepDirection: 'mid' }));

    // The x values are the sample positions Plotly drew; the y values are the
    // level held across each run.
    // `closeTo` on x: an interior `mid` sample is the midpoint of its run, so
    // it arrives through a division and lands a float ulp off the value
    // Plotly drew. The y values are read straight off a vertex and are exact.
    expect(circles()).toEqual([
      { x: expect.closeTo(0, 6), y: 320.25 },
      { x: expect.closeTo(246.67, 6), y: 220.5 },
      { x: expect.closeTo(493.335, 6), y: 120.75 },
      { x: expect.closeTo(740, 6), y: 21 },
    ]);
  });

  test('a well-formed staircase with a flat run is left alone', () => {
    // The reason collapsing runs is a *fallback* and not a first pass. A step
    // chart holds its value across an interval, so two equal samples put three
    // consecutive vertices on one horizontal line in a path that is already
    // exactly `2N - 1`. Collapsing first would drop the middle one, break the
    // count, and send a correct path to interpolation.
    //
    // Four samples at levels 1, 1, 2, 2: `hv` corners at each x.
    render('M0,300H100V300H100V200H200V200H200');
    // eslint-disable-next-line no-new
    new StepTrace(layer(TraceType.STEP, { stepDirection: 'hv' }));

    expect(circles()).toHaveLength(POINTS.length);
    expect(circles()[0]).toEqual({ x: 0, y: 300 });
  });

  test('a reversal is not mistaken for a redundant vertex', () => {
    // `vhv` goes out along an axis and comes back, so its middle vertex shares
    // an x with both neighbours while sitting outside their span. Dropping it
    // would erase a corner the renderer actually drew, so the collapse
    // requires the vertex to lie *between* its neighbours.
    render('M0,399V273H246.67V147V210H493.33V273V147H740V21');
    // eslint-disable-next-line no-new
    new StepTrace(layer(TraceType.STEP));

    // Ten vertices that collapse to ten: matching neither shape, this falls
    // back to interpolation rather than being forced into `mid`. One highlight
    // per sample either way -- what matters is that the reversal survived the
    // collapse, not which recovery the count then selected.
    expect(circles()).toHaveLength(POINTS.length);
  });
});

describe('a stepped band with no baseline (#907)', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('an hv band stroked as a bare edge maps onto its samples', () => {
    // Plotly strokes an area's top edge as its own `path.js-line`, with no
    // return journey along the baseline — so this is `2N - 1` vertices, not
    // `3N - 1`, and dropping a baseline that is not there would eat a sample.
    render('M0,320.25H246.67V220.5H493.33V120.75H740V21');
    // eslint-disable-next-line no-new
    new AreaTrace(layer(TraceType.AREA, { stepDirection: 'hv' }));

    expect(circles()).toEqual([
      { x: 0, y: 320.25 },
      { x: 246.67, y: 220.5 },
      { x: 493.33, y: 120.75 },
      { x: 740, y: 21 },
    ]);
  });

  test('a mid band stroked as a bare edge maps onto its samples', () => {
    // The case the old "longer than a top edge" test could not express: a
    // `mid` edge is `2N` vertices, already longer than the `2N - 1` an `hv`
    // one has, so the baseline check fired on a path that has no baseline.
    render('M0,320.25H123.34V220.5H246.67H370V120.75H493.33H616.67V21H740');
    // eslint-disable-next-line no-new
    new AreaTrace(layer(TraceType.AREA, { stepDirection: 'mid' }));

    expect(circles()).toEqual([
      { x: expect.closeTo(0, 6), y: 320.25 },
      { x: expect.closeTo(246.67, 6), y: 220.5 },
      { x: expect.closeTo(493.335, 6), y: 120.75 },
      { x: expect.closeTo(740, 6), y: 21 },
    ]);
  });
});

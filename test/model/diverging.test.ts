import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, describe, expect, test } from '@jest/globals';
import { DivergingTrace } from '@model/diverging';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * Three age bands, men left and women right, as the chart draws them.
 *
 * The left-hand values are negative because that is what a producer emits for
 * a chart with a mirrored baseline. Every magnitude is distinct and the
 * largest bar is on the *left*, which is the arrangement that exposes a
 * reading that took the sign for a magnitude: the biggest bar would be the
 * lowest note.
 *
 * Band `45-64` is the one where the two sides differ, so a balance of zero and
 * a balance in either direction are all present.
 */
const BANDS: SegmentedPoint[][] = [
  [
    { x: '0-24', y: -1200, z: 'Men' },
    { x: '25-44', y: -900, z: 'Men' },
    { x: '45-64', y: -700, z: 'Men' },
  ],
  [
    { x: '0-24', y: 1200, z: 'Women' },
    { x: '25-44', y: 950, z: 'Women' },
    { x: '45-64', y: 800, z: 'Women' },
  ],
];

/**
 * Create a minimal diverging bar layer for model-only tests.
 * @param data The sides the layer carries
 * @returns Diverging bar layer definition
 */
function createLayer(data: SegmentedPoint[][] = BANDS): MaidrLayer {
  return {
    id: 'test-diverging-layer',
    type: TraceType.DIVERGING,
    title: 'Population by age band',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Age band' }, y: { label: 'People' }, z: { label: 'Sex' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: DivergingTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a diverging trace positioned on one band of one side.
 * @param row Which side; the last row is the balance the parent appends
 * @param col Which band
 * @param data The sides the layer carries
 * @returns The positioned trace
 */
function diverging(
  row = 0,
  col = 0,
  data: SegmentedPoint[][] = BANDS,
): DivergingTrace {
  const trace = TraceFactory.create(createLayer(data)) as DivergingTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Where a state's pitch sits within the range it was given, 0 to 1.
 * @param state The trace state to read
 * @returns The relative pitch
 */
function pitch(state: NonEmptyTraceState): number {
  const { min, max, raw } = state.audio.freq;
  return (Number(raw) - min) / (max - min);
}

describe('diverging registration', () => {
  test('the factory builds a DivergingTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(DivergingTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(diverging().description.chartType).toBe('Diverging Bar Chart');
    expect(nonEmptyState(diverging()).plotType).toBe('diverging bar');
  });
});

describe('the sign is a direction, not a magnitude', () => {
  test('a left-hand bar is pitched by its size', () => {
    // The largest bar in the chart is on the left. Pitched as a signed value
    // it would be the LOWEST note -- a cohort of 1,200 men sounding smaller
    // than a cohort of 800 women.
    const { audio } = nonEmptyState(diverging(0, 0));

    expect(audio.freq.raw).toBe(1200);
    expect(audio.freq.min).toBe(0);
  });

  test('equal cohorts on opposite sides sound the same', () => {
    // Band `0-24` has 1,200 either way, and the two have to be
    // indistinguishable by pitch or the chart cannot be compared across its
    // own baseline.
    expect(pitch(nonEmptyState(diverging(0, 0))))
      .toBeCloseTo(pitch(nonEmptyState(diverging(1, 0))));
  });

  test('a bigger bar is a higher note whichever side it is on', () => {
    const bigLeft = pitch(nonEmptyState(diverging(0, 0)));
    const smallLeft = pitch(nonEmptyState(diverging(0, 2)));
    const smallRight = pitch(nonEmptyState(diverging(1, 2)));

    expect(bigLeft).toBeGreaterThan(smallLeft);
    expect(smallRight).toBeGreaterThan(smallLeft);
  });

  test('the announcement gives the size and the side, not a minus sign', () => {
    // A reader hearing "-1200" has to strip a sign that says which side they
    // are on, which the label beside it already said.
    const { text } = nonEmptyState(diverging(0, 0));

    expect(text.cross?.value).toBe(1200);
    expect(text.z).toEqual({ label: 'Sex', value: 'Men' });
  });

  test('an unnamed side is named by the way it grows', () => {
    // Better than leaving the sign as the only clue, which is exactly what
    // this trace removes from the announcement.
    const unnamed: SegmentedPoint[][] = [
      [{ x: 'a', y: -5, z: '' }, { x: 'b', y: -3, z: '' }],
      [{ x: 'a', y: 4, z: '' }, { x: 'b', y: 6, z: '' }],
    ];

    expect(nonEmptyState(diverging(0, 0, unnamed)).text.z?.value).toBe('left');
    expect(nonEmptyState(diverging(1, 0, unnamed)).text.z?.value).toBe('right');
  });
});

describe('a chart drawn with its bands down the page', () => {
  /**
   * The same pyramid, horizontal. A bar layer carries its value on `x` and
   * its category on `y` when the orientation is horizontal -- the pair
   * `toBarValue` reads -- so the point fields swap, not the announcement.
   */
  const HORIZONTAL: SegmentedPoint[][] = BANDS.map(side =>
    side.map(point => ({ x: point.y, y: point.x, z: point.z })));

  /**
   * Build a horizontal diverging trace.
   * @param row Which side
   * @param col Which band
   * @returns The positioned trace
   */
  function horizontal(row: number, col: number): DivergingTrace {
    const trace = TraceFactory.create({
      ...createLayer(HORIZONTAL),
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'People' }, y: { label: 'Age band' }, z: { label: 'Sex' } },
    }) as DivergingTrace;
    trace.moveToIndex(row, col);
    return trace;
  }

  test('still announces the size and the side rather than a sign', () => {
    // The parent swaps which point field feeds `cross`, not which half of the
    // announcement carries the length -- so there is one slot to replace, and
    // this is the case that says whether the right one was chosen. A pyramid
    // is ordinarily drawn this way up, so getting it wrong here would be the
    // ordinary case rather than the exotic one.
    const { text } = nonEmptyState(horizontal(0, 0));

    expect(text.cross?.label).toBe('People');
    expect(text.cross?.value).toBe(1200);
    expect(text.main.value).toBe('0-24');
    expect(text.z?.value).toBe('Men');
  });

  test('still pitches by size', () => {
    const { audio } = nonEmptyState(horizontal(0, 0));

    expect(audio.freq.raw).toBe(1200);
    expect(audio.freq.min).toBe(0);
  });
});

describe('the balance row says which side is ahead', () => {
  /** The summary row the segmented bar appends, after the two sides. */
  const BALANCE_ROW = 2;

  test('names the side rather than reporting a signed total', () => {
    // Band `25-44`: 950 women against 900 men, so the balance is +50.
    // "Sum is 50" invites a reader to hear a total; the number is a lead.
    const { text } = nonEmptyState(diverging(BALANCE_ROW, 1));

    expect(text.cross?.value).toBe(50);
    expect(text.z).toEqual({ label: 'Balance', value: 'Women ahead' });
  });

  test('names the other side when it leads', () => {
    const flipped: SegmentedPoint[][] = [
      [{ x: 'a', y: -900, z: 'Men' }],
      [{ x: 'a', y: 400, z: 'Women' }],
    ];

    // Row 2 is the balance the parent appends; rows 0 and 1 are the sides.
    expect(nonEmptyState(diverging(2, 0, flipped)).text.z)
      .toEqual({ label: 'Balance', value: 'Men ahead' });
  });

  test('names the leader by which way it grows, not by where it was declared', () => {
    // The right-hand side declared FIRST. Reading the winner off a fixed row
    // index announces "Women ahead" on a band where men lead by 500 -- the
    // sentence a reader has no way to check, since the sign is exactly what
    // this trace takes out of the announcement.
    const rightFirst: SegmentedPoint[][] = [
      [{ x: 'a', y: 400, z: 'Women' }],
      [{ x: 'a', y: -900, z: 'Men' }],
    ];

    expect(nonEmptyState(diverging(2, 0, rightFirst)).text.z)
      .toEqual({ label: 'Balance', value: 'Men ahead' });
  });

  test('keeps the plain summary when the chart is not two-sided', () => {
    // "X ahead" is a comparison between two sides. A third makes the summary
    // a sum again rather than a two-way difference, so it stays one: nothing
    // in the grammar holds a diverging layer to two sides, and naming a
    // winner out of a three-way total would be confidently wrong.
    const threeSided: SegmentedPoint[][] = [
      [{ x: 'a', y: -900, z: 'Against' }],
      [{ x: 'a', y: 400, z: 'For' }],
      [{ x: 'a', y: 200, z: 'Strongly for' }],
    ];

    const { text } = nonEmptyState(diverging(3, 0, threeSided));

    expect(text.z).toEqual({ label: 'Sex', value: 'Sum' });
    // Signed, too: on a sum a minus sign really is a smaller number.
    expect(text.cross?.value).toBe(-300);
  });

  test('says level rather than naming a winner at zero', () => {
    // Band `0-24` is 1,200 either way.
    expect(nonEmptyState(diverging(BALANCE_ROW, 0)).text.z)
      .toEqual({ label: 'Balance', value: 'level' });
  });

  test('a balance is pitched by its size like any other bar', () => {
    const { audio } = nonEmptyState(diverging(BALANCE_ROW, 1));

    expect(audio.freq.raw).toBe(50);
    expect(audio.freq.min).toBe(0);
  });
});

describe('the description totals each side', () => {
  /**
   * Read a description stat by label.
   * @param label The stat to find
   * @param data The sides the layer carries
   * @returns Its value, or undefined
   */
  function read(label: string, data: SegmentedPoint[][] = BANDS): unknown {
    return diverging(0, 0, data).description.stats.find(stat => stat.label === label)?.value;
  }

  test('reports a total per side, unsigned', () => {
    // The number a pyramid is captioned with, and the one a reader cannot
    // accumulate by ear across twenty age bands.
    expect(read('Men total')).toBe(2800);
    expect(read('Women total')).toBe(2950);
  });

  test('reports the size of a bar rather than a signed value', () => {
    // The parent's range is over the raw values, so it opened the dialog with
    // `Min segment value: -1,200` -- a negative population, three lines above
    // the unsigned totals that contradict it, and the one thing this trace
    // exists to take out of the reading.
    const labels = diverging().description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Min segment value');
    expect(labels).not.toContain('Max segment value');
    expect(read('Min bar size')).toBe(700);
    expect(read('Max bar size')).toBe(1200);
  });

  test('does not call a balance a bar total', () => {
    // The parent takes these over the summary row, which here is
    // `(-left) + right`: it reported a largest bar total of 100 for a band
    // holding 2,400 people, and a smallest of 0 for one holding 2,400.
    const labels = diverging().description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Largest bar total');
    expect(labels).not.toContain('Smallest bar total');
  });

  test('says which side is ahead overall, which is the finding', () => {
    // The two operands are on the lines above; the subtraction across them is
    // what a listener cannot do by ear, and the per-band balance navigation
    // announces never accumulates into it.
    expect(read('Overall balance')).toBe('Women ahead by 150');
  });

  test('says level rather than naming a winner when the sides match', () => {
    const even: SegmentedPoint[][] = [
      [{ x: 'a', y: -5, z: 'Men' }, { x: 'b', y: -3, z: 'Men' }],
      [{ x: 'a', y: 3, z: 'Women' }, { x: 'b', y: 5, z: 'Women' }],
    ];

    expect(read('Overall balance', even)).toBe('level');
  });

  test('says where the sides are furthest apart', () => {
    // A pyramid level everywhere but one cohort and one leaning the same way
    // throughout have the same overall balance, so the band is part of the
    // finding rather than a decoration on it.
    expect(read('Widest gap')).toBe('Women ahead by 100 at 45-64');
  });

  test('claims no winner on a chart that is not two-sided', () => {
    // "X ahead" is a comparison between exactly two sides; a third makes the
    // summary a sum again rather than a two-way difference.
    const threeSided: SegmentedPoint[][] = [
      [{ x: 'a', y: -900, z: 'Against' }],
      [{ x: 'a', y: 400, z: 'For' }],
      [{ x: 'a', y: 200, z: 'Strongly for' }],
    ];

    expect(read('Overall balance', threeSided)).toBeUndefined();
    expect(read('Widest gap', threeSided)).toBeUndefined();
    expect(read('Against total', threeSided)).toBe(900);
  });

  test('names a side the way every announcement names it', () => {
    // A producer that names only the bands it drew a legend entry for leaves
    // the first point of a side unnamed. Reading that point alone called the
    // side `left` while the parent's own series list, which scans the row,
    // called it `Men` -- two names for one side in one dialog.
    const partlyNamed: SegmentedPoint[][] = [
      [{ x: 'a', y: -5, z: '' }, { x: 'b', y: -3, z: 'Men' }],
      [{ x: 'a', y: 4, z: '' }, { x: 'b', y: 6, z: 'Women' }],
    ];

    expect(read('Men total', partlyNamed)).toBe(8);
    expect(read('Women total', partlyNamed)).toBe(10);
    expect(nonEmptyState(diverging(0, 0, partlyNamed)).text.z?.value).toBe('Men');
  });
});

describe('the data table reads the way the chart is announced', () => {
  test('gives a bar its size, not its direction', () => {
    // A reader checking `Men total: 2,800` against the table met -1200, -900,
    // -700 and had to reconstruct the convention themselves, while the pitch,
    // the text and the braille had all already taken the sign out.
    const { rows } = diverging().description.dataTable;

    expect(rows.slice(0, 3)).toEqual([
      ['0-24', 1200, 'Men'],
      ['25-44', 900, 'Men'],
      ['45-64', 700, 'Men'],
    ]);
  });

  test('files the summary row under the name navigation gives it', () => {
    // A reader reaches that row with PageUp and hears "Balance is level"; the
    // table had it under the parent's `Sum`.
    const { rows } = diverging().description.dataTable;

    expect(rows.slice(6)).toEqual([
      ['0-24', 0, 'Balance'],
      ['25-44', 50, 'Balance'],
      ['45-64', 100, 'Balance'],
    ]);
  });

  test('keeps the sum signed and named on a chart that is not two-sided', () => {
    // There the summary really is a sum, and a minus sign really is a smaller
    // number -- which is what `get text` says on the same row.
    const threeSided: SegmentedPoint[][] = [
      [{ x: 'a', y: -900, z: 'Against' }],
      [{ x: 'a', y: 400, z: 'For' }],
      [{ x: 'a', y: 200, z: 'Strongly for' }],
    ];
    const { rows } = diverging(0, 0, threeSided).description.dataTable;

    expect(rows[3]).toEqual(['a', -300, 'Sum']);
  });
});

describe('the highlight lands on the bar the reader is on', () => {
  /**
   * Provision the globals `Svg.selectAllElements` and the rect branch touch.
   *
   * jsdom does not expose `SVGRectElement` as a distinct constructor, so it
   * is aliased to `SVGElement` -- which is what makes `<rect>` nodes take the
   * mapping branch under test.
   *
   * @param html - The document to install
   */
  function installDom(html: string): void {
    const dom = new JSDOM(html);
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = dom.window.document;
    g.SVGElement = dom.window.SVGElement;
    g.SVGRectElement = dom.window.SVGRectElement ?? dom.window.SVGElement;
    g.SVGPathElement = dom.window.SVGPathElement ?? class SVGPathElementStub {};
  }

  afterEach(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.document;
    delete g.SVGElement;
    delete g.SVGRectElement;
    delete g.SVGPathElement;
  });

  /**
   * Three bands drawn left bar then right bar, which is the order a producer
   * emits them in: the sides in the order the data declares them.
   *
   * Each rect is tagged with the side it draws so a test can say which one
   * the model picked, rather than asserting on an index that would be
   * satisfied by either mapping.
   *
   * @returns The document source
   */
  function pyramidSvg(): string {
    const bands = ['0-24', '25-44', '45-64'];
    const rects = bands
      .map(band => `<rect data-side="Men" data-band="${band}" />`
        + `<rect data-side="Women" data-band="${band}" />`)
      .join('');
    return `<svg id="p"><g id="bars">${rects}</g></svg>`;
  }

  /**
   * The elements the trace resolved, exposed for assertion.
   *
   * @param layer - The layer to build a trace from
   * @returns One element per bar, shaped rows x categories
   */
  function highlightsOf(layer: MaidrLayer): SVGElement[][] | null {
    const trace = new DivergingTrace(layer);
    return (trace as unknown as { highlightValues: SVGElement[][] | null })
      .highlightValues;
  }

  test('reads the sides in the order the data declares them', () => {
    // The failure this guards is silent and visual-only: audio, text and
    // braille never go through this path, so every announcement is correct
    // while the highlight sits on the opposite bar.
    installDom(pyramidSvg());

    // The fixture draws each band's two bars adjacent, so the layer says so.
    // It used to be inferred: `<rect>` marks with no `domMapping` walked
    // category-major by default while `<path>` marks walked series-major, and
    // this case sat on the rect side of that split (#1003). Diverging
    // producers do not agree on a layout -- Victory draws series-major and
    // declares nothing -- so this is a fact about the fixture, not a
    // convention to move onto the trace.
    const highlights = highlightsOf({
      ...createLayer(),
      selectors: 'g[id=\'bars\'] > rect',
      domMapping: { order: 'column' },
    });

    expect(highlights).not.toBeNull();
    expect(highlights![0][0].getAttribute('data-side')).toBe('Men');
    expect(highlights![1][0].getAttribute('data-side')).toBe('Women');
    expect(highlights![0][2].getAttribute('data-band')).toBe('45-64');
    expect(highlights![1][2].getAttribute('data-band')).toBe('45-64');
  });

  test('a producer that draws right-hand bars first can say so', () => {
    // The reverse order is still reachable, just no longer the thing an
    // author gets without asking for it.
    const bands = ['0-24', '25-44', '45-64'];
    installDom(`<svg id="p"><g id="bars">${bands
      .map(band => `<rect data-side="Women" data-band="${band}" />`
        + `<rect data-side="Men" data-band="${band}" />`)
      .join('')}</g></svg>`);

    const highlights = highlightsOf({
      ...createLayer(),
      selectors: 'g[id=\'bars\'] > rect',
      domMapping: { order: 'column', groupDirection: 'reverse' },
    });

    expect(highlights).not.toBeNull();
    expect(highlights![0][0].getAttribute('data-side')).toBe('Men');
    expect(highlights![1][0].getAttribute('data-side')).toBe('Women');
  });
});

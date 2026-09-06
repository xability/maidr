/**
 * @jest-environment jsdom
 */

/**
 * What a pointer move costs on the traces that measure their marks live.
 *
 * Hexbin, gantt and word cloud walk every drawn element on every call to
 * `findNearestPoint`, and each step is a `getBoundingClientRect()` -- a
 * forced layout read. That call sits under `PointerGuidanceCommand`, which
 * runs on every `pointermove` DOM event with no throttle on the model side,
 * so a 2,000-bin lattice performed 2,000 layout reads per event at 60-120 Hz.
 *
 * Measuring once and keeping the result is only safe with a rule for when it
 * stops being true, so the invalidation cases come first: a cached geometry
 * lives until the viewport moves -- a scroll of the page or of any ancestor
 * container, or a window resize -- and the next hover measures again. A stale
 * centre sends the reader's pointer to a mark that is not there, which is
 * worse than the cost it saved.
 *
 * The counts are the assertion, not the clock: `toHaveBeenCalledTimes` says
 * what changed about the algorithm rather than how fast this machine was.
 */

import type { GanttPoint, HexbinPoint, MaidrLayer, WordCloudPoint } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { HexbinTrace } from '@model/hexbin';
import { WordCloudTrace } from '@model/wordCloud';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** How far the page has scrolled since the chart was drawn. */
let scrolled = 0;

/** Where each mark of a fixture is drawn: a row of boxes 100px apart. */
const MARK_WIDTH = 40;
const MARK_HEIGHT = 40;
const MARK_PITCH = 100;

/**
 * The box the mark carrying this index was drawn at.
 * @param index - Which mark, counting along the row
 * @returns Its geometry before any scrolling
 */
function markBox(index: number): { x: number; y: number } {
  return { x: index * MARK_PITCH, y: 0 };
}

/**
 * jsdom measures nothing, so geometry is carried on the element as an index
 * and read back here. The index survives `cloneNode`, which matters because
 * these traces highlight clones of the chart's elements.
 * @returns The spy counting the measurements the pointer path takes
 */
function stubMeasurement(): jest.SpiedFunction<() => DOMRect> {
  return jest
    .spyOn(SVGElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: SVGElement): DOMRect {
      const { x, y } = markBox(Number(this.getAttribute('data-mark') ?? 0));
      const top = y - scrolled;
      return {
        x,
        y: top,
        left: x,
        top,
        width: MARK_WIDTH,
        height: MARK_HEIGHT,
        right: x + MARK_WIDTH,
        bottom: top + MARK_HEIGHT,
        toJSON: () => ({}),
      } as DOMRect;
    });
}

/**
 * Draws a row of marks for a selector to resolve.
 * @param count - How many marks the chart drew
 * @param className - The class the layer's selector names
 */
function draw(count: number, className: string): void {
  const svg = document.querySelector('svg');
  for (let index = 0; index < count; index++) {
    const element = document.createElementNS(SVG_NS, 'rect');
    element.setAttribute('class', className);
    element.setAttribute('data-mark', String(index));
    svg?.appendChild(element);
  }
}

/** Two rows of two bins, drawn as four marks along a row. */
const LATTICE: HexbinPoint[][] = [
  [{ x: 0, y: 0, count: 3 }, { x: 2, y: 0, count: 9 }],
  [{ x: 1, y: 1, count: 5 }, { x: 3, y: 1, count: 12 }],
];

/**
 * A hexbin whose four bins are drawn.
 * @returns The trace, its lattice already drawn
 */
function buildHexbin(): HexbinTrace {
  draw(4, 'bin');
  return new HexbinTrace({
    id: 'hexbin',
    type: TraceType.HEXBIN,
    title: 'A lattice',
    selectors: '.bin',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: LATTICE,
  } as MaidrLayer);
}

/** Two lanes carrying four intervals between them. */
const LANES: GanttPoint[][] = [
  [
    { x: 'Design', start: 0, end: 30, label: 'Wireframes' },
    { x: 'Design', start: 60, end: 75, label: 'Revisions' },
  ],
  [
    { x: 'Build', start: 30, end: 100, label: 'Implementation' },
    { x: 'Build', start: 100, end: 120, label: 'Handover' },
  ],
];

/**
 * A schedule whose four intervals are drawn.
 * @returns The trace, its bars already drawn
 */
function buildGantt(): GanttTrace {
  draw(4, 'bar');
  return new GanttTrace({
    id: 'gantt',
    type: TraceType.GANTT,
    title: 'A schedule',
    selectors: '.bar',
    axes: { x: { label: 'Task' }, y: { label: 'Day' } },
    data: { points: LANES, unit: 'days' },
  } as MaidrLayer);
}

/**
 * Terms in the order they were authored, which is not their weight order --
 * so the fixture also exercises the permutation the trace applies.
 */
const TERMS: WordCloudPoint[] = [
  { x: 'neural', y: 128 },
  { x: 'machine', y: 412 },
  { x: 'gradient', y: 57 },
  { x: 'tensor', y: 233 },
];

/**
 * A word cloud whose four glyphs are drawn.
 * @returns The trace, its glyphs already drawn
 */
function buildWordCloud(): WordCloudTrace {
  draw(4, 'term');
  return new WordCloudTrace({
    id: 'word-cloud',
    type: TraceType.WORD_CLOUD,
    title: 'Terms',
    selectors: '.term',
    axes: { x: { label: 'Term' }, y: { label: 'Occurrences' } },
    data: TERMS,
  } as MaidrLayer);
}

/** What the cases below need of a trace: it hovers, and it can be disposed. */
interface HoverTrace {
  moveToPointAndGetPointerGuidance: (x: number, y: number) => unknown;
  dispose: () => void;
}

/**
 * The marks each fixture draws, and a pointer position below all of them.
 *
 * Below rather than on one, because the word cloud hit-tests glyph boxes in
 * order and stops at the one the pointer is inside: a pointer between the
 * glyphs is the case where a scan reaches every mark, and it is the common
 * one -- most of a cloud, and most of a lattice, is the space between marks.
 */
const MARKS = 4;
const BETWEEN_MARKS = {
  x: (MARKS - 1) * MARK_PITCH + MARK_WIDTH / 2,
  y: MARK_HEIGHT + 200,
};

const TRACES: { name: string; build: () => HoverTrace }[] = [
  { name: 'a hexbin', build: buildHexbin },
  { name: 'a gantt chart', build: buildGantt },
  { name: 'a word cloud', build: buildWordCloud },
];

describe.each(TRACES)('the marks $name measures for the pointer', ({ build }) => {
  let measure: jest.SpiedFunction<() => DOMRect>;

  beforeEach(() => {
    scrolled = 0;
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
    measure = stubMeasurement();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Builds the trace and hovers once, which is what fills the cache.
   * @returns The trace, already hovered over
   */
  function hovered(): HoverTrace {
    const trace = build();
    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x, BETWEEN_MARKS.y);
    measure.mockClear();
    return trace;
  }

  test('are measured on the first hover, so the fixture resolves', () => {
    const trace = build();

    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x, BETWEEN_MARKS.y);

    expect(measure.mock.calls.length).toBeGreaterThanOrEqual(MARKS);
  });

  test('are not measured again on the next hover', () => {
    const trace = hovered();

    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x + 1, BETWEEN_MARKS.y);

    // At most the bounds check on the mark the hover resolved to; the marks
    // themselves are answered from what the first hover measured.
    expect(measure.mock.calls.length).toBeLessThanOrEqual(1);
  });

  test('are measured again on the first hover after the page scrolls', () => {
    const trace = hovered();

    scrolled = 25;
    window.dispatchEvent(new Event('scroll'));
    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x, BETWEEN_MARKS.y);

    expect(measure.mock.calls.length).toBeGreaterThanOrEqual(MARKS);
  });

  test('are measured again on the first hover after the window resizes', () => {
    const trace = hovered();

    window.dispatchEvent(new Event('resize'));
    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x, BETWEEN_MARKS.y);

    expect(measure.mock.calls.length).toBeGreaterThanOrEqual(MARKS);
  });

  test('stop being watched once the trace is disposed', () => {
    const trace = hovered();
    const released = jest.spyOn(window, 'removeEventListener');

    trace.dispose();

    expect(released).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(released).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

describe('a chart scrolled after its marks were measured', () => {
  let measure: jest.SpiedFunction<() => DOMRect>;

  beforeEach(() => {
    scrolled = 0;
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
    measure = stubMeasurement();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves a hexbin hover against where the bins are now', () => {
    // The pointer sits on the first bin's centre *after* the scroll. Answered
    // from the pre-scroll measurements, the nearest bin would be the second.
    const trace = buildHexbin();
    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x, BETWEEN_MARKS.y);

    scrolled = 1000;
    window.dispatchEvent(new Event('scroll'));
    const guidance = trace.moveToPointAndGetPointerGuidance(
      MARK_WIDTH / 2,
      MARK_HEIGHT / 2 - 1000,
    );

    expect(guidance).toEqual({ onCurve: true });
    expect(measure.mock.calls.length).toBeGreaterThan(1);
  });

  test('resolves a word cloud hover against where the glyphs are now', () => {
    // A glyph is found by hit-testing its box, so a stale box means the
    // pointer falls through every term and the reader is told nothing at all.
    const trace = buildWordCloud();
    trace.moveToPointAndGetPointerGuidance(BETWEEN_MARKS.x, BETWEEN_MARKS.y);

    scrolled = 1000;
    window.dispatchEvent(new Event('scroll'));
    const guidance = trace.moveToPointAndGetPointerGuidance(
      (MARKS - 1) * MARK_PITCH + MARK_WIDTH / 2,
      MARK_HEIGHT / 2 - 1000,
    );

    expect(guidance).not.toBeNull();
  });
});

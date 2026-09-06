/**
 * @jest-environment jsdom
 */

/**
 * A horizontal candlestick uses the same (row, col) frame as a vertical one.
 *
 * Everything that consumes a candlestick's cursor -- the highlight grid, the
 * braille cell the display routes a cursor press back through, and the
 * movable grid's bounds -- is laid out `[segment position][candle index]`
 * regardless of orientation. The horizontal layout used to store the cursor
 * the other way round (row = candle, col = segment), so on such a chart the
 * highlight landed on the wrong element, or on none for a candle past the
 * section count; a braille cursor press landed on the wrong candle and the
 * wrong segment; and on a short chart it threw out of the braille handler.
 */

import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { Candlestick, CANDLESTICK_SECTIONS } from '@model/candlestick';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CANDLE_ATTRIBUTE = 'data-candle';
const CLOSE_ROW = CANDLESTICK_SECTIONS.indexOf('close');

/**
 * Renders one `rect` per candle under `#candles`, each stamped with its
 * index so a highlighted clone can say which candle it was cut from.
 * @param count - How many candles to draw
 */
function renderCandles(count: number): void {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  group.setAttribute('id', 'candles');
  for (let i = 0; i < count; i++) {
    const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    rect.setAttribute(CANDLE_ATTRIBUTE, String(i));
    group.appendChild(rect);
  }
  svg.appendChild(group);
  document.body.appendChild(svg);
}

/**
 * Builds a rising candle so every candle has the same sorted segment order
 * and the trend is a known Bull.
 * @param index - The candle's position, which also names it (`d<index>`)
 * @returns A candlestick point
 */
function candle(index: number): CandlestickPoint {
  const open = 10 + index;
  return {
    value: `d${index}`,
    open,
    high: open + 3,
    low: open - 1,
    close: open + 2,
    volume: 100,
    trend: 'Bull',
    volatility: 4,
  };
}

/**
 * Creates a candlestick layer of `count` candles in the given orientation,
 * with a legacy (single-selector) highlight.
 * @param orientation - Vertical or horizontal layout
 * @param count - How many candles the chart has
 * @returns A candlestick layer definition
 */
function makeLayer(orientation: Orientation, count: number): MaidrLayer {
  return {
    id: 'candle',
    type: TraceType.CANDLESTICK,
    orientation,
    selectors: '#candles > rect',
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: Array.from({ length: count }, (_, i) => candle(i)),
  };
}

/**
 * The candle index stamped on the currently highlighted element, or `null`
 * when the trace reports no highlight at all.
 * @param trace - The trace to inspect
 * @returns The `data-candle` value of the highlighted element
 */
function highlightedCandle(trace: Candlestick): string | null {
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    return null;
  }
  const { elements } = state.highlight;
  const element = Array.isArray(elements) ? elements[0] : elements;
  return element.getAttribute(CANDLE_ATTRIBUTE);
}

/**
 * The candle and segment the cursor currently announces.
 * @param trace - The trace to inspect
 * @returns The current candle's value and section, or `undefined` when empty
 */
function announced(
  trace: Candlestick,
): { candle: unknown; section: unknown } | undefined {
  const state = trace.state;
  return state.empty
    ? undefined
    : { candle: state.text.main.value, section: state.text.section };
}

/**
 * The braille cell the current cursor reports, as the display would read it.
 * @param trace - The trace to inspect
 * @returns The braille row and col
 */
function brailleCell(trace: Candlestick): { row: number; col: number } {
  const state = trace.state;
  if (state.empty || state.braille.empty) {
    throw new Error('expected a braille state');
  }
  return { row: state.braille.row, col: state.braille.col };
}

describe('highlighting a horizontal candlestick through a legacy selector', () => {
  const COUNT = 7;

  beforeEach(() => {
    renderCandles(COUNT);
  });

  test('outlines the element of the candle the cursor is on', () => {
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, COUNT));

    // A legacy selector maps candle k to element k in every section, so
    // walking the candles must walk the elements in step. The walk starts
    // with the initial-entry move, which lands on candle 0.
    const seen: (string | null)[] = [];
    trace.moveOnce('FORWARD');
    seen.push(highlightedCandle(trace));
    for (let i = 1; i < COUNT; i++) {
      trace.moveOnce('FORWARD');
      seen.push(highlightedCandle(trace));
    }

    expect(seen).toEqual(['0', '1', '2', '3', '4', '5', '6']);
  });

  test('outlines a candle whose index is past the section count', () => {
    // Five sections; candles 5 and 6 are only reachable as columns. Stored
    // as rows they were past the end of the grid and got no highlight.
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, COUNT));

    trace.moveToExtreme('FORWARD');

    expect(highlightedCandle(trace)).toBe('6');
  });

  test('outlines the same element a vertical chart does', () => {
    const horizontal = new Candlestick(makeLayer(Orientation.HORIZONTAL, COUNT));
    renderCandles(COUNT);
    const vertical = new Candlestick(makeLayer(Orientation.VERTICAL, COUNT));

    horizontal.moveToIndex(CLOSE_ROW, 5);
    vertical.moveToIndex(CLOSE_ROW, 5);

    expect(highlightedCandle(horizontal)).toBe('5');
    expect(highlightedCandle(horizontal)).toBe(highlightedCandle(vertical));
  });
});

describe('a braille cursor press on a horizontal candlestick', () => {
  beforeEach(() => {
    renderCandles(7);
  });

  test('lands on the close of the pressed candle', () => {
    // The braille display routes a press back through moveToIndex with the
    // cell it reported: row = static section index, col = candle index. On
    // a horizontal chart that used to be read the other way round, landing
    // on candle 4 in the volatility section.
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, 7));

    trace.moveToIndex(CLOSE_ROW, 6);

    expect(announced(trace)).toEqual({ candle: 'd6', section: 'close' });
  });

  test('reports back the cell it was sent to', () => {
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, 7));

    trace.moveToIndex(CLOSE_ROW, 6);

    expect(brailleCell(trace)).toEqual({ row: CLOSE_ROW, col: 6 });
  });

  test('does not throw on a chart with fewer candles than sections', () => {
    // Read as a candle index, the close row (4) named a candle a 3-candle
    // chart does not have, and the sorted-segment lookup threw a TypeError
    // out of the braille handler.
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, 3));

    expect(() => trace.moveToIndex(CLOSE_ROW, 1)).not.toThrow();
    expect(announced(trace)).toEqual({ candle: 'd1', section: 'close' });
  });

  test('refuses a cell the chart does not have rather than throwing', () => {
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, 3));

    expect(trace.moveToIndex(CLOSE_ROW, 3)).toBe(false);
    expect(trace.moveToIndex(CANDLESTICK_SECTIONS.length, 0)).toBe(false);
  });
});

describe('the movable grid of a horizontal candlestick', () => {
  beforeEach(() => {
    renderCandles(7);
  });

  test('accepts the cursor position the trace itself is on', () => {
    // On the last of seven candles the horizontal cursor used to sit at
    // row 6 -- past the five sections -- so the trace's own position was
    // one isMovable rejected.
    const trace = new Candlestick(makeLayer(Orientation.HORIZONTAL, 7));

    trace.moveToExtreme('FORWARD');

    expect(trace.isMovable([trace.row, trace.col])).toBe(true);
  });

  test('is on the same cell as a vertical chart after the same moves', () => {
    const horizontal = new Candlestick(makeLayer(Orientation.HORIZONTAL, 7));
    const vertical = new Candlestick(makeLayer(Orientation.VERTICAL, 7));

    for (const trace of [horizontal, vertical]) {
      trace.moveToExtreme('FORWARD');
      trace.moveOnce('DOWNWARD');
    }

    expect([horizontal.row, horizontal.col]).toEqual([vertical.row, vertical.col]);
    expect(horizontal.col).toBe(6);
  });

  test('bounds a section row and a candle column the same way in both layouts', () => {
    const horizontal = new Candlestick(makeLayer(Orientation.HORIZONTAL, 7));
    const vertical = new Candlestick(makeLayer(Orientation.VERTICAL, 7));

    expect(horizontal.isMovable([CLOSE_ROW, 6])).toBe(vertical.isMovable([CLOSE_ROW, 6]));
    expect(horizontal.isMovable([6, CLOSE_ROW])).toBe(vertical.isMovable([6, CLOSE_ROW]));
    expect(horizontal.isMovable([CLOSE_ROW, 6])).toBe(true);
  });
});

describe('audio panning of a horizontal candlestick', () => {
  beforeEach(() => {
    renderCandles(7);
  });

  test('pans by candle index, as the vertical chart does', () => {
    const horizontal = new Candlestick(makeLayer(Orientation.HORIZONTAL, 7));
    const vertical = new Candlestick(makeLayer(Orientation.VERTICAL, 7));

    horizontal.moveToIndex(CLOSE_ROW, 5);
    vertical.moveToIndex(CLOSE_ROW, 5);
    const h = horizontal.state;
    const v = vertical.state;
    if (h.empty || v.empty) {
      throw new Error('expected populated states');
    }

    expect(h.audio.panning).toEqual(v.audio.panning);
    expect(h.audio.panning.x).toBe(5);
    expect(h.audio.panning.cols).toBe(7);
  });
});

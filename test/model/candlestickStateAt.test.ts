/**
 * @jest-environment jsdom
 */

import type { CandlestickPoint, CandlestickSelector, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { Candlestick, CANDLESTICK_SECTIONS, candlestickSectionsOf } from '@model/candlestick';
import { TraceType } from '@type/grammar';

const CLOSE_ROW = CANDLESTICK_SECTIONS.indexOf('close');

const CANDLES: CandlestickPoint[] = [
  { value: '2026-01-01', open: 10, high: 15, low: 9, close: 14, volume: 100, trend: 'Bull', volatility: 6 },
  { value: '2026-01-02', open: 14, high: 18, low: 13, close: 17, volume: 120, trend: 'Bull', volatility: 5 },
  { value: '2026-01-03', open: 17, high: 19, low: 12, close: 13, volume: 90, trend: 'Bear', volatility: 7 },
];

/**
 * Creates a candlestick layer with three candles for state-at tests.
 * @param data - The candles, the three above unless given
 * @returns A candlestick layer definition
 */
function createCandlestickLayer(data: CandlestickPoint[] = CANDLES): MaidrLayer {
  return {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
}

describe('candlestick.getStateAt', () => {
  test('computes the state for the requested candle, not the cursor candle', () => {
    const trace = new Candlestick(createCandlestickLayer());

    // Cursor sits on candle 0; request the close of candle 1.
    const state = trace.getStateAt(CLOSE_ROW, 1);

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.text.main.value).toBe('2026-01-02');
      expect(state.text.cross?.value).toBe(17);
      expect(state.text.section).toBe('close');
    }
  });

  test('restores the cursor and internal point index', () => {
    const trace = new Candlestick(createCandlestickLayer());

    const before = trace.getStateAt(CLOSE_ROW, 0);
    trace.getStateAt(CLOSE_ROW, 2);
    const after = trace.getStateAt(CLOSE_ROW, 0);

    // Reading state at another candle must not change what the cursor sees.
    expect(after).toEqual(before);
  });

  test('does not notify observers', () => {
    const trace = new Candlestick(createCandlestickLayer());
    const observer = { update: jest.fn() };
    trace.addObserver(observer);

    trace.getStateAt(CLOSE_ROW, 1);

    expect(observer.update).not.toHaveBeenCalled();
  });
});

/**
 * `getStateAt` takes a section in `sections` order, as `moveToIndex` does,
 * while the highlight grid and the pan are laid out by each section's
 * value-sorted place in its candle. The two were paired by index: asked for
 * the close of a candle, row 4, it highlighted the segment ranked fifth,
 * which is the high.
 */
describe('candlestick.getStateAt, against the drawn marks', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SELECTORS: CandlestickSelector = {
    body: '.body',
    wickHigh: '.high',
    wickLow: '.low',
    open: '.open',
    close: '.close',
  };

  /**
   * Draws a body, two wicks and an open and a close mark per candle, each
   * stamped with what it is (`close-1`), so a highlighted clone can say which
   * mark it was cut from.
   * @param count - How many candles
   */
  function drawMarks(count: number): void {
    const marks = ['body', 'high', 'low', 'open', 'close'].map(name =>
      Array.from({ length: count }, (_, i) =>
        `<${name === 'body' ? 'rect' : 'line'} class="${name}" data-mark="${name}-${i}" />`).join(''));
    document.body.innerHTML = `<svg xmlns="${SVG_NS}">${marks.join('')}</svg>`;
  }

  /**
   * The marks a state highlights.
   * @param state - The state
   * @returns Their stamps, joined, or `nothing`
   */
  function marksOf(state: TraceState): string {
    if (state.empty || state.highlight.empty) {
      return 'nothing';
    }
    const { elements } = state.highlight;
    return (Array.isArray(elements) ? elements : [elements])
      .map(element => element.getAttribute('data-mark'))
      .join(' ');
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('highlights the close it is asked for, not the segment ranked at its row', () => {
    drawMarks(CANDLES.length);
    const trace = new Candlestick({ ...createCandlestickLayer(), selectors: SELECTORS });

    const state = trace.getStateAt(CLOSE_ROW, 1);

    expect(marksOf(state)).toBe('close-1');
  });

  test.each([
    ['with an open', CANDLES],
    ['with no open', CANDLES.map(({ open: _open, ...candle }) => candle)],
  ])('answers every cell %s as moving the cursor there does', (_name, data) => {
    drawMarks(data.length);
    const trace = new Candlestick({ ...createCandlestickLayer(data), selectors: SELECTORS });
    const rows = candlestickSectionsOf(data).length;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < data.length; col++) {
        const asked = trace.getStateAt(row, col);
        trace.moveToIndex(row, col);

        expect({ cell: [row, col], marks: marksOf(asked), state: asked })
          .toEqual({ cell: [row, col], marks: marksOf(trace.state), state: trace.state });
      }
    }
  });
});

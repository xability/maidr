/**
 * @jest-environment jsdom
 *
 * A d3 candlestick's high and low outlined on the candle's wick.
 *
 * The binder emitted the bodies' selector alone, and the core outlines a
 * string's element for every price of a candle: Up and Down walked the high,
 * the close, the open and the low with the same body outlined, and the wick
 * the high and the low are read off was never marked. Given the wicks as well
 * (`CandlestickSelector`), the core outlines the wick for the high and the
 * low and the edges of the body for the open and the close.
 *
 * jsdom because the core resolves the selectors against the page's document.
 */
import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { bindD3Candlestick } from '@adapters/d3/binders/candlestick';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROWS = [
  { date: 'Mon', open: 100, high: 110, low: 95, close: 105 },
  { date: 'Tue', open: 105, high: 112, low: 101, close: 102 },
];

// The binder warns on purpose when the wicks do not match the candles.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
  // jsdom lays nothing out, so a body has no measured box to draw its
  // open and close edges along.
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 20, width: 20, height: 30 }),
    configurable: true,
  });
  document.body.innerHTML = '';
});

afterEach(() => {
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
});

afterAll(() => {
  warnSpy.mockRestore();
});

/**
 * Draws one wick and one body per candle, bound as D3's joins leave them.
 * @param wickRows - The rows the wicks are bound to, in the order they are drawn
 * @returns The chart's SVG
 */
function draw(wickRows: unknown[] = ROWS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('id', 'ohlc');
  document.body.appendChild(svg);
  for (const row of wickRows) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'wick');
    line.setAttribute('x1', String(10 + ROWS.findIndex(candle => candle.date === (row as { date: string }).date) * 50));
    (line as unknown as { __data__: unknown }).__data__ = row;
    svg.appendChild(line);
  }
  ROWS.forEach((row, index) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'candle');
    rect.setAttribute('x', String(index * 50));
    rect.setAttribute('y', '20');
    rect.setAttribute('width', '20');
    rect.setAttribute('height', '30');
    (rect as unknown as { __data__: unknown }).__data__ = row;
    svg.appendChild(rect);
  });
  return svg;
}

/**
 * Binds the chart the way the example page does.
 * @param svg - The chart's SVG
 * @param wickSelector - The wicks' selector, when the chart names one
 * @returns The candlestick layer
 */
function bind(svg: SVGSVGElement, wickSelector?: string): MaidrLayer {
  return bindD3Candlestick(svg, {
    selector: 'rect.candle',
    ...(wickSelector === undefined ? {} : { wickSelector }),
    value: 'date',
    autoApply: false,
  }).layer;
}

/**
 * What the core outlines while a price of a candle is read, moving the
 * cursor there as a reader does: the trace keeps its prices in the order of
 * their values, which only a move puts the row in.
 * @param layer - The candlestick layer
 * @param section - The price, as it is announced
 * @param candle - Which candle
 * @returns The outlined elements
 */
function outlinedAt(layer: MaidrLayer, section: string, candle: number): SVGElement[] {
  const trace = TraceFactory.create(layer);
  try {
    for (let row = 0; row < 5; row++) {
      if (!trace.moveToIndex(row, candle)) {
        continue;
      }
      const state: TraceState = trace.state;
      if (!state.empty && state.text.section === section && !state.highlight.empty) {
        const { elements } = state.highlight;
        return Array.isArray(elements) ? elements : [elements];
      }
    }
  } finally {
    trace.dispose();
  }
  throw new Error(`No ${section} is read on candle ${candle}`);
}

describe('a d3 candlestick drawn with wicks', () => {
  it('names each candle\'s wick, in the candles\' order', () => {
    const layer = bind(draw(), 'line.wick');

    expect(layer.selectors).toEqual({
      body: '#ohlc rect.candle',
      wick: ['#ohlc line.wick[data-maidr-wick="0"]', '#ohlc line.wick[data-maidr-wick="1"]'],
    });
  });

  it.each(['high', 'low'])('outlines the wick while the %s is read', (section) => {
    const layer = bind(draw(), 'line.wick');

    const outlined = outlinedAt(layer, section, 1);

    expect(outlined.map(element => element.tagName.toLowerCase())).toEqual(['line']);
    expect(outlined[0].getAttribute('x1')).toBe('60');
  });

  it.each(['open', 'close'])('outlines an edge of the body while the %s is read, not the whole body', (section) => {
    const layer = bind(draw(), 'line.wick');

    const outlined = outlinedAt(layer, section, 0);

    expect(outlined.map(element => element.tagName.toLowerCase())).toEqual(['line']);
  });

  it('pairs a wick with the candle whose row it is bound to, whatever order the wicks are drawn in', () => {
    const svg = draw([...ROWS].reverse());

    bind(svg, 'line.wick');

    const first = svg.querySelector('[data-maidr-wick="0"]') as unknown as { __data__: unknown };
    expect(first.__data__).toBe(ROWS[0]);
  });

  it('pairs wicks bound to copies of the rows in the order they are drawn', () => {
    const svg = draw(ROWS.map(row => ({ ...row })));

    bind(svg, 'line.wick');

    expect(svg.querySelector('[data-maidr-wick="0"]')).toBe(svg.querySelector('line.wick'));
  });
});

describe('a d3 candlestick whose wicks cannot be paired', () => {
  it('outlines each candle\'s body, and says why', () => {
    const layer = bind(draw([ROWS[0]]), 'line.wick');

    expect(layer.selectors).toBe('#ohlc rect.candle');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('matched 1 wicks for 2 candles'));
  });
});

describe('a d3 candlestick bound without a wick selector', () => {
  it('names its bodies alone, as before', () => {
    const layer = bind(draw());

    expect(layer.selectors).toBe('#ohlc rect.candle');
    expect(outlinedAt(layer, 'high', 0).map(element => element.tagName.toLowerCase())).toEqual(['rect']);
  });
});

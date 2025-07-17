import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { expect } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { Orientation, TraceType } from '@type/grammar';

// Mock data for testing candlestick functionality
const mockCandlestickData: CandlestickPoint[] = [
  {
    value: '2023-01-01',
    open: 100,
    high: 120,
    low: 95,
    close: 110,
    volume: 1000,
    trend: 'Bull',
  },
  {
    value: '2023-01-02',
    open: 110,
    high: 115,
    low: 105,
    close: 108,
    volume: 800,
    trend: 'Bear',
  },
  {
    value: '2023-01-03',
    open: 108,
    high: 125,
    low: 100,
    close: 120,
    volume: 1200,
    trend: 'Bull',
  },
];

const mockLayer: MaidrLayer = {
  id: 'test-candlestick',
  type: TraceType.CANDLESTICK,
  orientation: Orientation.VERTICAL,
  data: mockCandlestickData,
  axes: {
    x: 'Date',
    y: 'Price',
  },
};

describe('candlestick Volatility Feature', () => {
  let candlestick: Candlestick;

  beforeEach(() => {
    candlestick = new Candlestick(mockLayer);
  });

  afterEach(() => {
    candlestick.dispose();
  });

  describe('volatility Calculation', () => {
    it('should calculate volatility correctly for each candle', () => {
      // Test volatility calculation by checking text output
      // First candle: High(120) - Low(95) = 25
      candlestick.moveToIndex(4, 0); // Move to volatility position for first candle
      const textState = candlestick.getTextState();
      expect(textState.section).toBe('volatility');
      expect(textState.cross.value).toBe(25); // 120 - 95

      // Second candle: High(115) - Low(105) = 10
      candlestick.moveToIndex(4, 1); // Move to volatility position for second candle
      const textState2 = candlestick.getTextState();
      expect(textState2.section).toBe('volatility');
      expect(textState2.cross.value).toBe(10); // 115 - 105

      // Third candle: High(125) - Low(100) = 25
      candlestick.moveToIndex(4, 2); // Move to volatility position for third candle
      const textState3 = candlestick.getTextState();
      expect(textState3.section).toBe('volatility');
      expect(textState3.cross.value).toBe(25); // 125 - 100
    });
  });

  describe('navigation to Volatility', () => {
    it('should navigate to volatility when moving down from lowest OHLC segment', () => {
      // Start at open position
      candlestick.moveToIndex(0, 0);

      // For first candle, OHLC values sorted: low(95), open(100), close(110), high(120)
      // Move to the lowest segment (low = 95)
      candlestick.moveToExtreme('DOWNWARD'); // This should now go to volatility
      const textState = candlestick.getTextState();
      expect(textState.section).toBe('volatility');
    });

    it('should move from volatility back to OHLC segments when moving up', () => {
      // Start at volatility
      candlestick.moveToIndex(4, 0);
      let textState = candlestick.getTextState();
      expect(textState.section).toBe('volatility');

      // Move up - should go to lowest value OHLC segment
      candlestick.moveOnce('UPWARD');
      textState = candlestick.getTextState();
      expect(textState.section).not.toBe('volatility');
      // Should be one of the OHLC segments, specifically the lowest value one
      expect(['open', 'high', 'low', 'close']).toContain(textState.section);
    });

    it('should not allow moving down from volatility', () => {
      // Start at volatility
      candlestick.moveToIndex(4, 0);

      // Check that we can't move further down
      expect(candlestick.isMovable('DOWNWARD')).toBe(false);
    });

    it('should allow moving up from volatility', () => {
      // Start at volatility
      candlestick.moveToIndex(4, 0);

      // Check that we can move up
      expect(candlestick.isMovable('UPWARD')).toBe(true);
    });
  });

  describe('navigation within same candle', () => {
    it('should navigate through all OHLC segments plus volatility', () => {
      // Start at first candle, open position
      candlestick.moveToIndex(0, 0);

      const visitedSegments = new Set<string>();
      let currentState = candlestick.getTextState();
      if (currentState.section) {
        visitedSegments.add(currentState.section);
      }

      // Try to visit all possible segments by moving up/down
      // This is a basic test to ensure navigation works
      while (candlestick.isMovable('DOWNWARD')) {
        candlestick.moveOnce('DOWNWARD');
        currentState = candlestick.getTextState();
        if (currentState.section) {
          visitedSegments.add(currentState.section);
        }
      }

      // Should have visited volatility
      expect(visitedSegments.has('volatility')).toBe(true);

      // Should also have visited some OHLC segments
      const ohlcSegments = ['open', 'high', 'low', 'close'];
      const hasOhlc = ohlcSegments.some(segment => visitedSegments.has(segment));
      expect(hasOhlc).toBe(true);
    });
  });

  describe('horizontal movement preserves segment type', () => {
    it('should preserve volatility segment when moving between candles', () => {
      // Start at volatility for first candle
      candlestick.moveToIndex(4, 0);
      let textState = candlestick.getTextState();
      expect(textState.section).toBe('volatility');

      // Move to second candle
      candlestick.moveOnce('FORWARD');
      textState = candlestick.getTextState();
      expect(textState.section).toBe('volatility');
      expect(textState.cross.value).toBe(10); // Second candle volatility

      // Move to third candle
      candlestick.moveOnce('FORWARD');
      textState = candlestick.getTextState();
      expect(textState.section).toBe('volatility');
      expect(textState.cross.value).toBe(25); // Third candle volatility
    });
  });

  describe('text formatting for volatility', () => {
    it('should format volatility text correctly', () => {
      candlestick.moveToIndex(4, 0); // Move to volatility of first candle
      const textState = candlestick.getTextState();

      expect(textState.section).toBe('volatility');
      expect(textState.cross.value).toBe(25);
      expect(textState.main.value).toBe('2023-01-01');
      expect(textState.fill?.value).toBe('Bull');
    });
  });
});

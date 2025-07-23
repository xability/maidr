import type { CandlestickPoint, MaidrLayer, TraceType } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { NotificationService } from '@service/notification';
import { TextService } from '@service/text';

// Mock data for testing
const mockCandlestickData: CandlestickPoint[] = [
  {
    value: '2021-01-01',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000,
    trend: 'Bull',
  },
  {
    value: '2021-01-02',
    open: 105,
    high: 115,
    low: 100,
    close: 100.75,
    volume: 1500,
    trend: 'Bear',
  },
];

const mockLayer: MaidrLayer = {
  id: 'test-candlestick',
  type: 'candlestick' as TraceType,
  data: mockCandlestickData,
  orientation: undefined,
  selectors: '',
  axes: {
    x: 'date',
    y: 'price',
  },
};

describe('Candlestick Text Formatting', () => {
  let candlestick: Candlestick;
  let textService: TextService;
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = new NotificationService();
    textService = new TextService(notificationService);
    candlestick = new Candlestick(mockLayer);
  });

  afterEach(() => {
    candlestick?.dispose();
    textService?.dispose();
    notificationService?.dispose();
  });

  describe('Text State Structure', () => {
    it('should provide correct text state structure for candlestick', () => {
      // Navigate to first point, open segment
      candlestick.moveToIndex(0, 0);

      const textState = (candlestick as any).text();

      expect(textState).toMatchObject({
        main: { label: 'date', value: '2021-01-01' },
        cross: { label: 'price', value: 100 },
        section: 'open',
        fill: { label: 'trend', value: 'Bull' },
      });
    });

    it('should provide correct text state for different segments', () => {
      // Test different segments
      const segments = [
        { segment: 'open', expectedValue: 100 },
        { segment: 'high', expectedValue: 110 },
        { segment: 'low', expectedValue: 95 },
        { segment: 'close', expectedValue: 105 },
      ];

      segments.forEach(({ segment, expectedValue }, index) => {
        // Navigate to the segment (row represents segment position in value-sorted order)
        candlestick.moveToIndex(index, 0);

        const textState = (candlestick as any).text();

        expect(textState.section).toBe(segment);
        expect(textState.cross.value).toBe(expectedValue);
      });
    });
  });

  describe('Text Formatting Issues', () => {
    it('should format terse text correctly (current behavior)', () => {
      // Set to terse mode first
      textService.toggle(); // From VERBOSE to TERSE

      candlestick.moveToIndex(0, 0); // First point, open segment
      const textState = (candlestick as any).text();
      const terseText = textService.format({
        empty: false,
        type: 'trace' as const,
        traceType: 'candlestick' as TraceType,
        plotType: 'candlestick',
        title: 'test',
        xAxis: 'date',
        yAxis: 'price',
        fill: '',
        hasMultiPoints: false,
        audio: {} as any,
        braille: {} as any,
        text: textState,
        autoplay: {} as any,
        highlight: {} as any,
      });

      // Fixed behavior: shows price type before price value
      expect(terseText).toBe('2021-01-01, open 100 bull');
    });

    it('should format verbose text correctly (current behavior)', () => {
      // Ensure verbose mode (default)
      candlestick.moveToIndex(0, 0); // First point, open segment
      const textState = (candlestick as any).text();
      const verboseText = textService.format({
        empty: false,
        type: 'trace' as const,
        traceType: 'candlestick' as TraceType,
        plotType: 'candlestick',
        title: 'test',
        xAxis: 'date',
        yAxis: 'price',
        fill: '',
        hasMultiPoints: false,
        audio: {} as any,
        braille: {} as any,
        text: textState,
        autoplay: {} as any,
        highlight: {} as any,
      });

      // Fixed behavior: proper wording and capitalization
      expect(verboseText).toBe('date is 2021-01-01, open price is 100, trend is bull');
    });
  });

  describe('Expected Behavior After Fix', () => {
    it('should format terse text with correct order: segment then price', () => {
      // Test different segments to verify the fixed behavior
      textService.toggle(); // Switch to terse mode

      const segments = ['open', 'high', 'low', 'close'];
      const expectedValues = [100, 110, 95, 105];

      segments.forEach((segment, index) => {
        candlestick.moveToIndex(index, 0);
        const textState = (candlestick as any).text();
        const terseText = textService.format({
          empty: false,
          type: 'trace' as const,
          traceType: 'candlestick' as TraceType,
          plotType: 'candlestick',
          title: 'test',
          xAxis: 'date',
          yAxis: 'price',
          fill: '',
          hasMultiPoints: false,
          audio: {} as any,
          braille: {} as any,
          text: textState,
          autoplay: {} as any,
          highlight: {} as any,
        });

        expect(terseText).toBe(`2021-01-01, ${segment} ${expectedValues[index]} bull`);
      });
    });

    it('should format verbose text with proper wording and capitalization', () => {
      // Test that verbose mode uses proper wording and lowercase "trend"
      candlestick.moveToIndex(0, 0); // First point, open segment
      const textState = (candlestick as any).text();
      const verboseText = textService.format({
        empty: false,
        type: 'trace' as const,
        traceType: 'candlestick' as TraceType,
        plotType: 'candlestick',
        title: 'test',
        xAxis: 'date',
        yAxis: 'price',
        fill: '',
        hasMultiPoints: false,
        audio: {} as any,
        braille: {} as any,
        text: textState,
        autoplay: {} as any,
        highlight: {} as any,
      });

      expect(verboseText).toBe('date is 2021-01-01, open price is 100, trend is bull');

      // Ensure it includes proper wording (segment + label) and lowercase "trend"
      expect(verboseText).toContain('open price');
      expect(verboseText).toContain('trend is');
      expect(verboseText).not.toContain('Trend is');
    });

    it('should format Bear trend as lowercase in both terse and verbose modes', () => {
      // Navigate to second point which has Bear trend
      candlestick.moveToIndex(0, 1); // First segment, second point (Bear trend)
      const textState = (candlestick as any).text();

      // Test verbose mode
      const verboseText = textService.format({
        empty: false,
        type: 'trace' as const,
        traceType: 'candlestick' as TraceType,
        plotType: 'candlestick',
        title: 'test',
        xAxis: 'date',
        yAxis: 'price',
        fill: '',
        hasMultiPoints: false,
        audio: {} as any,
        braille: {} as any,
        text: textState,
        autoplay: {} as any,
        highlight: {} as any,
      });

      expect(verboseText).toContain('trend is bear');

      // Test terse mode
      textService.toggle(); // Switch to terse mode
      const terseText = textService.format({
        empty: false,
        type: 'trace' as const,
        traceType: 'candlestick' as TraceType,
        plotType: 'candlestick',
        title: 'test',
        xAxis: 'date',
        yAxis: 'price',
        fill: '',
        hasMultiPoints: false,
        audio: {} as any,
        braille: {} as any,
        text: textState,
        autoplay: {} as any,
        highlight: {} as any,
      });

      expect(terseText).toContain('bear');
      expect(terseText).not.toContain('Bear');
    });
  });
});

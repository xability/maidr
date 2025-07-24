import type { TextState } from '../../src/type/state';
import { TextService } from '../../src/service/text';

// Create a mock notification service
const mockNotificationService = {
  notify: jest.fn(),
  dispose: jest.fn(),
} as any;

// Create test data that mimics boxplot text state
const boxplotTextState: TextState = {
  main: { label: 'Continent', value: 'Oceania' },
  cross: { label: 'Life Expectancy', value: 69.12 },
  section: 'Minimum', // This identifies it as a boxplot with section data
  // No fill property - this distinguishes boxplot from candlestick
};

const candlestickTextState: TextState = {
  main: { label: 'Date', value: '2021-01-05' },
  cross: { label: 'Price', value: 103.67 },
  section: 'high',
  fill: { label: 'trend', value: 'bear' }, // This identifies it as candlestick
};

describe('boxplot Text Formatting', () => {
  let textService: TextService;

  beforeEach(() => {
    textService = new TextService(mockNotificationService);
  });

  afterEach(() => {
    textService.dispose();
  });

  it('should format verbose text correctly for boxplot', () => {
    // Test current behavior
    const verboseText = (textService as any).formatVerboseTraceText(boxplotTextState);

    // Expected: "Continent is Oceania, minimum Life Expectancy is 69.12"
    expect(verboseText).toBe('Continent is Oceania, minimum Life Expectancy is 69.12');
  });

  it('should format terse text correctly for boxplot', () => {
    // Test current behavior
    const terseText = (textService as any).formatTerseTraceText(boxplotTextState);

    // Expected: "Oceania, Minimum 69.12"
    expect(terseText).toBe('Oceania, Minimum 69.12');
  });

  it('should not break candlestick formatting', () => {
    // Ensure candlestick formatting still works
    const verboseText = (textService as any).formatVerboseTraceText(candlestickTextState);
    const terseText = (textService as any).formatTerseTraceText(candlestickTextState);

    expect(verboseText).toBe('Date is 2021-01-05, high Price is 103.67, trend is bear');
    expect(terseText).toBe('2021-01-05, high 103.67, bear');
  });
});

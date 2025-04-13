/**
 * Base error class for test-related errors
 * Provides a common type for catching test-specific errors
 */
export class TestError extends Error {
  /**
   * Creates a new TestError
   * @param message - Error message
   */
  constructor(message: string) {
    super(message);
    this.name = 'TestError';
  }
}

/**
 * Error thrown when an element is not found in the page
 */
export class ElementNotFoundError extends TestError {
  /**
   * Creates a new ElementNotFoundError
   * @param selector - The selector that failed to find an element
   * @param timeout - The timeout that elapsed
   */
  constructor(selector: string, timeout?: number) {
    super(
      `Element with selector "${selector}" was not found${
        timeout ? ` within ${timeout}ms` : ''
      }`,
    );
    this.name = 'ElementNotFoundError';
  }
}

/**
 * Error thrown when an expected condition is not met
 */
export class AssertionError extends TestError {
  /**
   * Creates a new AssertionError
   * @param message - Description of the failed assertion
   */
  constructor(message: string) {
    super(`Assertion failed: ${message}`);
    this.name = 'AssertionError';
  }
}

/**
 * Error thrown when a keypress operation fails
 * Used to identify issues with keyboard interactions during tests
 */
export class KeypressError extends TestError {
  /**
   * Creates a new KeypressError
   * @param key - The key that failed to be pressed
   * @param context - Additional context about the operation being performed
   * @param cause - Optional underlying cause of the error
   */
  constructor(key: string, context: string, cause?: Error) {
    const causeMessage = cause ? `: ${cause.message}` : '';
    super(`Failed to press key "${key}" during ${context}${causeMessage}`);
    this.name = 'KeypressError';

    // Preserve stack trace in Node.js environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KeypressError);
    }
  }
}

/**
 * Error thrown when bar plot related operations fail
 */
export class BarPlotError extends Error {
  /**
   * Creates a new BarPlotError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'BarPlotError';
  }
}

/**
 * Error thrown when Histogram related operations fail
 */
export class HistogramError extends Error {
  /**
   * Creates a new HistogramError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'HistogramError';
  }
}

/**
 * Error thrown when Lineplot related operations fail
 */
export class LinePlotError extends Error {
  /**
   * Creates a new LinePlotError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'LinePlotError';
  }
}

/**
 * Error thrown when Heatmap related operations fail
 */
export class HeatmapError extends Error {
  /**
   * Creates a new HeatmapError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'HeatmapError';
  }
}

/**
 * Error thrown when Dodged Barplot related operations fail
 */
export class DodgedBarplotError extends Error {
  /**
   * Creates a new DodgedBarplotError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'DodgedBarplotError';
  }
}

/**
 * Error thrown when Stacked Barplot related operations fail
 */
export class StackedBarplotError extends Error {
  /**
   * Creates a new StackedBarplotError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'StackedBarplotError';
  }
}

/**
 * Error thrown when Vertical Boxplot related operations fail
 */
export class BoxplotVerticalError extends Error {
  /**
   * Creates a new BoxplotVerticalError
   * @param message - Error message describing the issue
   */
  constructor(message: string) {
    super(message);
    this.name = 'BoxplotVerticalError';
  }
}

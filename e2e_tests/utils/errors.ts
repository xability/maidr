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

import { expect, test } from '@playwright/test';
import { MultiLayerPlotPage } from '../page-objects/plots/multiLayer-page';
import {
  AssertionError,
  BarPlotError,
  BoxplotHorizontalError,
  BoxplotVerticalError,
  DodgedBarplotError,
  ElementNotFoundError,
  HeatmapError,
  HistogramError,
  KeypressError,
  LinePlotError,
  MultiLayerPlotError,
  MultiLineplotError,
  StackedBarplotError,
  TestError,
  ViolinPlotError,
} from '../utils/errors';

/**
 * The page objects wrap every failure in a plot-specific error. When that
 * wrapping discarded the original, a missing example file surfaced only as
 * "Failed to navigate to Multi Layer Plot" — which is how the filename-case
 * bug in issue #626 stayed undiagnosed for two months. These specs pin the
 * diagnostic contract so the cause cannot be dropped again.
 */
test.describe('Error cause propagation', () => {
  test('a failed navigation reports the browser error through both wrappers', async ({ page }) => {
    // Fail the navigation itself rather than relying on a bad path, so the
    // test keeps working now that the example filename is corrected.
    //
    // Closing the page rather than aborting via `page.route`: routing only
    // intercepts file:// navigations in Chromium, so the routed version passed
    // there and let the navigation succeed in Firefox and WebKit. A closed
    // page rejects `page.goto` identically in all three.
    const plotPage = new MultiLayerPlotPage(page);
    await page.close();

    const error = await plotPage
      .navigateToMultiLayerPlot()
      .then(() => null, (thrown: unknown) => thrown as MultiLayerPlotError);

    if (error === null) {
      throw new Error('Expected a blocked navigation to reject');
    }

    // Outermost: what the reporter shows on the summary line.
    expect(error).toBeInstanceOf(MultiLayerPlotError);
    expect(error.message).toBe('Failed to navigate to Multi Layer Plot');

    // One level down: which path the page object actually asked for. This is
    // the piece that would have named the wrong filename in #626.
    const navigationError = error.cause as Error;
    expect(navigationError).toBeDefined();
    expect(navigationError.message).toContain('Navigation failed to path');

    // Innermost: the browser's own reason for refusing.
    const browserError = navigationError.cause as Error;
    expect(browserError).toBeDefined();
    expect(browserError.message).toContain('page.goto');
  });

  test('every plot error class carries a cause through to the caller', async () => {
    const ErrorClasses = [
      BarPlotError,
      BoxplotHorizontalError,
      BoxplotVerticalError,
      DodgedBarplotError,
      HeatmapError,
      HistogramError,
      LinePlotError,
      MultiLayerPlotError,
      MultiLineplotError,
      StackedBarplotError,
      ViolinPlotError,
    ];

    for (const ErrorClass of ErrorClasses) {
      const original = new Error('the real failure');
      const wrapped = new ErrorClass('the wrapper message', { cause: original });

      expect(wrapped.name).toBe(ErrorClass.name);
      expect(wrapped.message).toBe('the wrapper message');
      expect(wrapped.cause).toBe(original);
    }
  });

  test('the shared test errors carry a cause too', async () => {
    const original = new Error('the real failure');

    expect(new TestError('wrapped', { cause: original }).cause).toBe(original);
    expect(new AssertionError('wrapped', { cause: original }).cause).toBe(original);
    expect(new ElementNotFoundError('svg', 5000, { cause: original }).cause).toBe(original);

    // KeypressError takes its cause positionally and folds the text into its
    // own message; it must still attach the original so the stack survives.
    const keypressError = new KeypressError('ArrowRight', 'navigation', original);
    expect(keypressError.cause).toBe(original);
    expect(keypressError.message).toContain('the real failure');

    // With no cause there must be no `cause` property at all. Setting it to
    // undefined still counts as owning it, and reporters then print a bare
    // "[cause]: undefined" line on every keypress failure.
    const causeless = new KeypressError('ArrowRight', 'navigation');
    expect(Object.prototype.hasOwnProperty.call(causeless, 'cause')).toBe(false);
  });
});

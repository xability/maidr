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
    // test keeps working once the example filename is corrected. Playwright
    // routing does apply to file:// URLs.
    await page.route(/\.html$/, route => route.abort());

    const plotPage = new MultiLayerPlotPage(page);
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
  });
});

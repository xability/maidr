import { expect, test } from '@playwright/test';
import { MultiLayerPlotPage } from '../page-objects/plots/multiLayer-page';
import {
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
} from '../utils/errors';

/**
 * The page objects wrap every failure in a plot-specific error. When that
 * wrapping discarded the original, a missing example file surfaced only as
 * "Failed to navigate to Multi Layer Plot" — which is how the filename-case
 * bug in issue #626 stayed undiagnosed for two months. These specs pin the
 * diagnostic contract so the cause cannot be dropped again.
 */
test.describe('Error cause propagation', () => {
  test('a failed navigation keeps the underlying browser error', async ({ page }) => {
    const plotPage = new MultiLayerPlotPage(page);

    // A path that does not exist, exactly like the capital-L typo did.
    const error = await plotPage
      .navigateTo('examples/no_such_example.html')
      .then(() => null, (thrown: unknown) => thrown as Error);

    if (error === null) {
      throw new Error('Expected navigating to a missing example to reject');
    }

    expect(error.message).toMatch(/Navigation failed to path/);

    // Without the cause this is where the trail went cold.
    expect(error.cause).toBeDefined();
    expect(String((error.cause as Error).message)).toContain('ERR_FILE_NOT_FOUND');
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
});

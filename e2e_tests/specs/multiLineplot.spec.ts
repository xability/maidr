import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { MultiLineplotPage } from '../page-objects/plots/multiLineplot-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a Multi Lineplot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized MultiLineplotPage instance
 */
async function setupMultiLineplotPage(
  page: Page,
  activateMaidr = true,
): Promise<MultiLineplotPage> {
  const multiLineplotPage = new MultiLineplotPage(page);
  if (activateMaidr) {
    await multiLineplotPage.activateMaidr();
  }
  return multiLineplotPage;
}

/**
 * Gets the correct data length from a multi lineplot layer
 * @param layer - The MAIDR layer containing multi lineplot data
 * @returns The number of data points in the layer
 * @throws Error if data structure is invalid
 */
function getLinePlotDataLength(layer: MaidrLayer | undefined): number {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (Array.isArray(layer.data) && Array.isArray(layer.data[0])) {
    return layer.data[0].length;
  } else if (Array.isArray(layer.data)) {
    return layer.data.length;
  }

  throw new TypeError('Layer data is not in expected format');
}

/**
 * Safely extracts the display value from a multi lineplot data point
 * @param layer - The lineplot layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getMultiLineplotDisplayValue(layer: MaidrLayer | undefined, index: number): string {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  let lineData: { x: string; y: number }[];
  if (Array.isArray(layer.data) && Array.isArray(layer.data[0])) {
    lineData = layer.data[0] as { x: string; y: number }[];
  } else if (Array.isArray(layer.data)) {
    lineData = layer.data as { x: string; y: number }[];
  } else {
    throw new TypeError('Layer data is not in expected format');
  }

  if (!Array.isArray(lineData)) {
    throw new TypeError('Line data is not in expected format');
  }

  if (index < 0 || index >= lineData.length) {
    throw new Error(`Index ${index} is out of bounds for data length ${lineData.length}`);
  }

  const multiLinePoint = lineData[index];

  if (!multiLinePoint || typeof multiLinePoint.x === 'undefined') {
    throw new Error(`Data point at index ${index} has invalid format`);
  }

  return `${multiLinePoint.x}`;
}

test.describe('Multi Lineplot', () => {
  let maidrData: Maidr;
  let multiLineplotLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const multiLineplotPage = new MultiLineplotPage(page);
      await multiLineplotPage.navigateToLinePlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await page.evaluate((plotId) => {
        const svgElement = document.querySelector(`svg`);

        if (!svgElement) {
          throw new Error(`SVG element with ID ${plotId} not found`);
        }

        const maidrDataAttr = svgElement.getAttribute('maidr-data');

        if (!maidrDataAttr) {
          throw new Error('maidr-data attribute not found on SVG element');
        }

        try {
          return JSON.parse(maidrDataAttr);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to parse maidr-data JSON: ${errorMessage}`);
        }
      }, TestConstants.MULTI_LINEPLOT_ID);

      multiLineplotLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getLinePlotDataLength(multiLineplotLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const multiLineplotPage = new MultiLineplotPage(page);
    await multiLineplotPage.navigateToLinePlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the multi lineplot with maidr data', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page, false);
      await multiLineplotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page, false);
      await multiLineplotPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);
      const instructionText = await multiLineplotPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.MULTI_LINEPLOT_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.toggleTextMode();
      const isTextModeTerse = await multiLineplotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await multiLineplotPage.toggleTextMode();
      const isTextModeOff = await multiLineplotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      expect(isTextModeOff).toBe(true);

      await multiLineplotPage.toggleTextMode();
      const isTextModeVerbose = await multiLineplotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeVerbose).toBe(true);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeVerbose).toBe(true);
      expect(isTextModeOff).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.toggleBrailleMode();
      const isBrailleModeOn = await multiLineplotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await multiLineplotPage.toggleBrailleMode();
      const isBrailleModeOff = await multiLineplotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOff).toBe(true);
      expect(isBrailleModeOn).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.toggleSonification();
      const isSoundModeOff = await multiLineplotPage.isSonificationActive(TestConstants.SOUND_OFF);

      await multiLineplotPage.toggleSonification();
      const isSoundModeOn = await multiLineplotPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.toggleReviewMode();
      const isReviewModeOn = await multiLineplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await multiLineplotPage.toggleReviewMode();
      const isReviewModeOff = await multiLineplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);
      await multiLineplotPage.toggleXAxisTitle();

      const xAxisTitle = await multiLineplotPage.getXAxisTitle();
      expect(xAxisTitle).toContain(multiLineplotLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);
      await multiLineplotPage.toggleYAxisTitle();

      const yAxisTitle = await multiLineplotPage.getYAxisTitle();
      expect(yAxisTitle).toContain(multiLineplotLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);
      await multiLineplotPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);
      await multiLineplotPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);
      await multiLineplotPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.increaseSpeed();
      const speed = await multiLineplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.decreaseSpeed();
      const speed = await multiLineplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.resetSpeed();
      const speed = await multiLineplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.moveToFirstDataPoint();

      for (let i = 0; i < dataLength - 1; i++) {
        await multiLineplotPage.moveToNextDataPoint();
      }

      const currentDataPoint = await multiLineplotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Move from left to right verification failed: ${errorMessage}`);
      }
    });

    test('should move from right to left', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await multiLineplotPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await multiLineplotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.moveToFirstDataPoint();
      const currentDataPoint = await multiLineplotPage.getCurrentDataPointInfo();

      try {
        const firstDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, 0);
        expect(currentDataPoint).toContain(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`First data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to the last data point', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.moveToLastDataPoint();
      const currentDataPoint = await multiLineplotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Last data point verification failed: ${errorMessage}`);
      }
    });

    test('should move up to next lineplot', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.moveToDataPointAbove();
      const currentDataPoint = await multiLineplotPage.getCurrentDataPointInfo();

      const expectedDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, 0);
      expect(currentDataPoint).toContain(expectedDataPointValue);
    });

    test('should move down to next lineplot', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      await multiLineplotPage.moveToDataPointBelow();
      const currentDataPoint = await multiLineplotPage.getCurrentDataPointInfo();

      const expectedDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, 0);
      expect(currentDataPoint).toContain(expectedDataPointValue);
    });
  });

  test.describe('Autoplay Controls', () => {
    test('should execute forward autoplay', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      try {
        const lastDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, dataLength - 1);
        await multiLineplotPage.startForwardAutoplay(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Forward autoplay test failed: ${errorMessage}`);
      }
    });

    test('should execute backward autoplay', async ({ page }) => {
      const multiLineplotPage = await setupMultiLineplotPage(page);

      try {
        const firstDataPointValue = getMultiLineplotDisplayValue(multiLineplotLayer, 0);
        await multiLineplotPage.moveToLastDataPoint();
        await multiLineplotPage.startReverseAutoplay(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Backward autoplay test failed: ${errorMessage}`);
      }
    });
  });

  test.describe('Go To Navigation', () => {
    test('should open Go To dialog with g key', async ({ page }) => {
      await setupMultiLineplotPage(page);

      // Press 'g' to open the Go To dialog
      await page.keyboard.press('g');

      // Verify the dialog is visible
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Verify the dialog title
      const title = dialog.locator('h3');
      await expect(title).toHaveText('Go To');
    });

    test('should show intersection targets in Go To dialog', async ({ page }) => {
      await setupMultiLineplotPage(page);

      // Press 'g' to open the Go To dialog
      await page.keyboard.press('g');

      // Wait for the dialog to be visible
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Get all targets in the listbox
      const targets = dialog.locator('[role="option"]');
      const targetCount = await targets.count();

      // Should have at least min, max, and potentially intersection targets
      expect(targetCount).toBeGreaterThanOrEqual(2);

      // Check for intersection targets - they should contain "Intersection with"
      const allTargetTexts = await targets.allTextContents();
      const intersectionTargets = allTargetTexts.filter(text => text.includes('Intersection'));

      // The multi-lineplot example has 3 lines that should have intersections
      // At least some intersections should be found
      expect(intersectionTargets.length).toBeGreaterThan(0);
    });

    test('should navigate to intersection point', async ({ page }) => {
      await setupMultiLineplotPage(page);

      // Press 'g' to open the Go To dialog
      await page.keyboard.press('g');

      // Wait for the dialog to be visible
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Find an intersection target
      const intersectionTarget = dialog.locator('[role="option"]').filter({
        hasText: /Intersection/,
      }).first();

      // Ensure intersection targets exist in the test data
      const intersectionCount = await intersectionTarget.count();
      expect(intersectionCount).toBeGreaterThan(0);

      // Click the intersection target
      await intersectionTarget.click();

      // Dialog should close after selection
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    test('should close Go To dialog with Escape', async ({ page }) => {
      await setupMultiLineplotPage(page);

      // Press 'g' to open the Go To dialog
      await page.keyboard.press('g');

      // Wait for the dialog to be visible
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Press Escape to close
      await page.keyboard.press('Escape');

      // Dialog should be closed
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    test('should show only intersections involving current line', async ({ page }) => {
      await setupMultiLineplotPage(page);

      // Move to a specific line first (e.g., navigate up/down)
      await page.keyboard.press('ArrowUp');

      // Press 'g' to open the Go To dialog
      await page.keyboard.press('g');

      // Wait for the dialog to be visible
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Get intersection targets
      const intersectionTargets = dialog.locator('[role="option"]').filter({
        hasText: /Intersection/,
      });

      // All intersection targets should mention other lines (not just current)
      const targetTexts = await intersectionTargets.allTextContents();
      for (const text of targetTexts) {
        // Each intersection should mention "with" followed by line names
        expect(text).toContain('with');
      }
    });
  });
});

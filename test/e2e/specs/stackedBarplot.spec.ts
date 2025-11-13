import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { expect, test } from '@playwright/test';
import { StackedBarplotPage } from '../pages/stackedBarplot.page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a Stacked Barplot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized StackedBarplotPage instance
 */
async function setupStackedBarplotPage(
  page: Page,
  activateMaidr = true,
): Promise<StackedBarplotPage> {
  const stackedBarplotPage = new StackedBarplotPage(page);
  if (activateMaidr) {
    await stackedBarplotPage.activateMaidr();
  }
  return stackedBarplotPage;
}

/**
 * Gets the correct data length from a stacked barplot layer
 * @param layer - The MAIDR layer containing stacked barplot data
 * @returns The number of data points in the first series
 * @throws Error if data structure is invalid
 */
function getStackedBarplotDataLength(layer: MaidrLayer | undefined): number {
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
 * Safely extracts the display value from a stacked barplot data point
 * @param layer - The stacked barplot layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getStackedBarplotDisplayValue(layer: MaidrLayer | undefined, index: number): string {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (Array.isArray(layer.data) && Array.isArray(layer.data[0])) {
    const barSeries = layer.data[0] as Array<{ x: string; y: number; fill: string }>;

    if (!Array.isArray(barSeries)) {
      throw new TypeError('Bar series is not an array');
    }

    if (index < 0 || index >= barSeries.length) {
      throw new Error(`Index ${index} is out of bounds for data length ${barSeries.length}`);
    }

    const barPoint = barSeries[index];

    if (!barPoint || typeof barPoint.x === 'undefined') {
      throw new Error(`Data point at index ${index} has invalid format`);
    }

    return String(barPoint.x);
  } else if (Array.isArray(layer.data)) {
    if (index < 0 || index >= layer.data.length) {
      throw new Error(`Index ${index} is out of bounds for data length ${layer.data.length}`);
    }

    const dataPoint = layer.data[index];

    if (!dataPoint || !('x' in dataPoint)) {
      throw new Error(`Data point at index ${index} has invalid format`);
    }

    return String(dataPoint.x);
  }

  throw new TypeError('Layer data is not in expected format');
}

test.describe('Stacked Barplot', () => {
  let maidrData: Maidr;
  let stackedBarplotLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const stackedBarplotPage = new StackedBarplotPage(page);
      await stackedBarplotPage.navigateToStackedBarplot();
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
      }, TestConstants.STACKED_BARPLOT_ID);

      stackedBarplotLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getStackedBarplotDataLength(stackedBarplotLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const stackedBarplotPage = new StackedBarplotPage(page);
    await stackedBarplotPage.navigateToStackedBarplot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the stacked barplot with maidr data', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page, false);
      await stackedBarplotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page, false);
      await stackedBarplotPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);
      const instructionText = await stackedBarplotPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.STACKED_BARPLOT_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.toggleTextMode();
      const isTextModeTerse = await stackedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await stackedBarplotPage.toggleTextMode();
      const isTextModeOff = await stackedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      expect(isTextModeOff).toBe(true);

      await stackedBarplotPage.toggleTextMode();
      const isTextModeVerbose = await stackedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeVerbose).toBe(true);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeVerbose).toBe(true);
      expect(isTextModeOff).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.toggleBrailleMode();
      const isBrailleModeOn = await stackedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await stackedBarplotPage.toggleBrailleMode();
      const isBrailleModeOff = await stackedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOff).toBe(true);
      expect(isBrailleModeOn).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.toggleSonification();
      const isSoundModeOff = await stackedBarplotPage.isSonificationActive(TestConstants.SOUND_OFF);

      await stackedBarplotPage.toggleSonification();
      const isSoundModeOn = await stackedBarplotPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.toggleReviewMode();
      const isReviewModeOn = await stackedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await stackedBarplotPage.toggleReviewMode();
      const isReviewModeOff = await stackedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);
      await stackedBarplotPage.toggleXAxisTitle();

      const xAxisTitle = await stackedBarplotPage.getXAxisTitle();
      expect(xAxisTitle).toContain(stackedBarplotLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);
      await stackedBarplotPage.toggleYAxisTitle();

      const yAxisTitle = await stackedBarplotPage.getYAxisTitle();
      expect(yAxisTitle).toContain(stackedBarplotLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);
      await stackedBarplotPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);
      await stackedBarplotPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);
      await stackedBarplotPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.increaseSpeed();
      const speed = await stackedBarplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.decreaseSpeed();
      const speed = await stackedBarplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.resetSpeed();
      const speed = await stackedBarplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.moveToFirstDataPoint();

      for (let i = 0; i < dataLength - 1; i++) {
        await stackedBarplotPage.moveToNextDataPoint();
      }

      const currentDataPoint = await stackedBarplotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Move from left to right verification failed: ${errorMessage}`);
      }
    });

    test('should move from right to left', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await stackedBarplotPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await stackedBarplotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.moveToFirstDataPoint();
      const currentDataPoint = await stackedBarplotPage.getCurrentDataPointInfo();

      try {
        const firstDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, 0);
        expect(currentDataPoint).toContain(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`First data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to the last data point', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.moveToLastDataPoint();
      const currentDataPoint = await stackedBarplotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Last data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to bottom level of stacked bar', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.moveToDataPointAbove();
      const currentDataPoint = await stackedBarplotPage.getCurrentDataPointInfo();

      const firstDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });

    test('should move to upper level of stacked bar', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      await stackedBarplotPage.moveToDataPointBelow();
      const currentDataPoint = await stackedBarplotPage.getCurrentDataPointInfo();

      const firstDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });
  });

  test.describe('Autoplay Controls', () => {
    test('should execute forward autoplay', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      try {
        const lastDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, dataLength - 1);
        await stackedBarplotPage.startForwardAutoplay(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Forward autoplay test failed: ${errorMessage}`);
      }
    });

    test('should execute backward autoplay', async ({ page }) => {
      const stackedBarplotPage = await setupStackedBarplotPage(page);

      try {
        const firstDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, 0);
        await stackedBarplotPage.moveToLastDataPoint();
        await stackedBarplotPage.startReverseAutoplay(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Backward autoplay test failed: ${errorMessage}`);
      }
    });
  });
});

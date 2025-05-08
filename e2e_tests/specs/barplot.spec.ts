import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a Bar Plot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized BarPlotPage instance
 */
async function setupBarPlotPage(
  page: Page,
  activateMaidr = true,
): Promise<BarPlotPage> {
  const barPlotPage = new BarPlotPage(page);
  if (activateMaidr) {
    await barPlotPage.activateMaidr();
  }
  return barPlotPage;
}

/**
 * Gets the correct data length from a bar plot layer
 * @param layer - The MAIDR layer containing bar plot data
 * @returns The number of data points
 * @throws Error if data structure is invalid
 */
function getBarPlotDataLength(layer: MaidrLayer | undefined): number {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (Array.isArray(layer.data)) {
    return layer.data.length;
  }

  throw new TypeError('Layer data is not in expected format');
}

/**
 * Safely extracts the display value from a bar plot data point
 * @param layer - The bar plot layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getBarPlotDisplayValue(layer: MaidrLayer | undefined, index: number): string {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (Array.isArray(layer.data)) {
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

test.describe('Bar Plot', () => {
  let maidrData: Maidr;
  let barLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const barPlotPage = new BarPlotPage(page);
      await barPlotPage.navigateToBarPlot();
      await page.waitForSelector(`svg#${TestConstants.BAR_ID}`, { timeout: 10000 });

      maidrData = await page.evaluate((plotId) => {
        const svgElement = document.querySelector(`svg#${plotId}`);

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
      }, TestConstants.BAR_ID);

      barLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getBarPlotDataLength(barLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.navigateToBarPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the barplot with maidr data', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page, false);
      await barPlotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page, false);
      await barPlotPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      const instructionText = await barPlotPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.BAR_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.toggleTextMode();
      const isTextModeTerse = await barPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await barPlotPage.toggleTextMode();
      const isTextModeOff = await barPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);

      await barPlotPage.toggleTextMode();
      const isTextModeVerbose = await barPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeOff).toBe(true);
      expect(isTextModeVerbose).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.toggleBrailleMode();
      const isBrailleModeOn = await barPlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await barPlotPage.toggleBrailleMode();
      const isBrailleModeOff = await barPlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOn).toBe(true);
      expect(isBrailleModeOff).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.toggleSonification();
      const isSoundModeOff = await barPlotPage.isSonificationActive(TestConstants.SOUND_OFF);

      await barPlotPage.toggleSonification();
      const isSoundModeOn = await barPlotPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.toggleReviewMode();
      const isReviewModeOn = await barPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await barPlotPage.toggleReviewMode();
      const isReviewModeOff = await barPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.toggleXAxisTitle();

      const xAxisTitle = await barPlotPage.getXAxisTitle();
      expect(xAxisTitle).toContain(barLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.toggleYAxisTitle();

      const yAxisTitle = await barPlotPage.getYAxisTitle();
      expect(yAxisTitle).toContain(barLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.increaseSpeed();
      const speed = await barPlotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.decreaseSpeed();
      const speed = await barPlotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.resetSpeed();
      const speed = await barPlotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await barPlotPage.moveToNextDataPoint();
      }

      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move from right to left', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await barPlotPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.moveToFirstDataPoint();
      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();

      try {
        const firstDataPointValue = getBarPlotDisplayValue(barLayer, 0);
        expect(currentDataPoint).toContain(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`First data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to the last data point', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.moveToLastDataPoint();
      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getBarPlotDisplayValue(barLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Last data point verification failed: ${errorMessage}`);
      }
    });

    test('should not be able to move up', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.moveToNextDataPoint();
      await barPlotPage.moveToDataPointAbove();

      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should not be able to move down', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);
      await barPlotPage.moveToNextDataPoint();
      await barPlotPage.moveToDataPointBelow();

      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });
  });

  test.describe('Autoplay Controls', () => {
    test('should execute forward autoplay', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      try {
        const lastDataPointValue = getBarPlotDisplayValue(barLayer, dataLength - 1);
        await barPlotPage.startForwardAutoplay(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Forward autoplay test failed: ${errorMessage}`);
      }
    });

    test('should execute backward autoplay', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      try {
        const firstDataPointValue = getBarPlotDisplayValue(barLayer, 0);
        await barPlotPage.moveToLastDataPoint();
        await barPlotPage.startReverseAutoplay(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Backward autoplay test failed: ${errorMessage}`);
      }
    });
  });
});

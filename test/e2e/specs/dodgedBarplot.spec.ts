import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { expect, test } from '@playwright/test';
import { DodgedBarplotPage } from '../pages/dodgedBarplot.page';
import { TestConstants } from '../utils/constants';

interface DodgedBarDataPoint {
  x: string;
  y: number;
  fill: string;
}

/**
 * Safely extracts the display value from a dodged barplot data point
 * @param layer - The dodged barplot layer containing data points
 * @param index - Index of the data point to extract value from
 * @param seriesIndex - Index of the series (default: 0)
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getDodgedBarplotDisplayValue(
  layer: MaidrLayer | undefined,
  index: number,
  seriesIndex = 0,
): string {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  // Handle nested array structure (dodged barplot data is typically nested)
  if (Array.isArray(layer.data) && Array.isArray(layer.data[0])) {
    if (seriesIndex < 0 || seriesIndex >= layer.data.length) {
      throw new Error(`Series index ${seriesIndex} is out of bounds for data length ${layer.data.length}`);
    }

    const barSeries = layer.data[seriesIndex] as DodgedBarDataPoint[];

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

/**
 * Gets the correct data length from a dodged barplot layer
 * @param layer - The MAIDR layer containing dodged barplot data
 * @param seriesIndex - Index of the series to get length for (default: 0)
 * @returns The number of data points in the specified series
 * @throws Error if data structure is invalid
 */
function getDodgedBarplotDataLength(
  layer: MaidrLayer | undefined,
  seriesIndex = 0,
): number {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  // Handle nested array structure (dodged barplot data is typically nested)
  if (Array.isArray(layer.data) && Array.isArray(layer.data[0])) {
    if (seriesIndex < 0 || seriesIndex >= layer.data.length) {
      throw new Error(`Series index ${seriesIndex} is out of bounds for data length ${layer.data.length}`);
    }
    const seriesData = layer.data[seriesIndex];
    if (Array.isArray(seriesData)) {
      return seriesData.length;
    }
    throw new TypeError('Series data is not an array');
  } else if (Array.isArray(layer.data)) {
    return layer.data.length;
  }

  throw new TypeError('Layer data is not in expected format');
}

/**
 * Helper function to create and initialize a dodged barplot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized DodgedBarplotPage instance
 */
async function setupDodgedBarplotPage(
  page: Page,
  activateMaidr = true,
): Promise<DodgedBarplotPage> {
  const dodgedBarplotPage = new DodgedBarplotPage(page);
  if (activateMaidr) {
    await dodgedBarplotPage.activateMaidr();
  }
  return dodgedBarplotPage;
}

test.describe('Dodged Barplot', () => {
  let maidrData: Maidr;
  let dodgedBarplotLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const dodgedBarplotPage = new DodgedBarplotPage(page);
      await dodgedBarplotPage.navigateToDodgedBarplot();
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
      }, TestConstants.DODGED_BARPLOT_ID);

      dodgedBarplotLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getDodgedBarplotDataLength(dodgedBarplotLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const dodgedBarplotPage = new DodgedBarplotPage(page);
    await dodgedBarplotPage.navigateToDodgedBarplot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the dodged barplot with maidr data', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page, false);
      await dodgedBarplotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page, false);
      await dodgedBarplotPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);
      const instructionText = await dodgedBarplotPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.DODGED_BARPLOT_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.toggleTextMode();
      const isTextModeTerse = await dodgedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await dodgedBarplotPage.toggleTextMode();
      const isTextModeOff = await dodgedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      expect(isTextModeOff).toBe(true);

      await dodgedBarplotPage.toggleTextMode();
      const isTextModeVerbose = await dodgedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeVerbose).toBe(true);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeVerbose).toBe(true);
      expect(isTextModeOff).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.toggleBrailleMode();
      const isBrailleModeOn = await dodgedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await dodgedBarplotPage.toggleBrailleMode();
      const isBrailleModeOff = await dodgedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOff).toBe(true);
      expect(isBrailleModeOn).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.toggleSonification();
      const isSoundModeOff = await dodgedBarplotPage.isSonificationActive(TestConstants.SOUND_OFF);

      await dodgedBarplotPage.toggleSonification();
      const isSoundModeOn = await dodgedBarplotPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.toggleReviewMode();
      const isReviewModeOn = await dodgedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await dodgedBarplotPage.toggleReviewMode();
      const isReviewModeOff = await dodgedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);
      await dodgedBarplotPage.toggleXAxisTitle();

      const xAxisTitle = await dodgedBarplotPage.getXAxisTitle();
      expect(xAxisTitle).toContain(dodgedBarplotLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);
      await dodgedBarplotPage.toggleYAxisTitle();

      const yAxisTitle = await dodgedBarplotPage.getYAxisTitle();
      expect(yAxisTitle).toContain(dodgedBarplotLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);
      await dodgedBarplotPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);
      await dodgedBarplotPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);
      await dodgedBarplotPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.increaseSpeed();
      const speed = await dodgedBarplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.decreaseSpeed();
      const speed = await dodgedBarplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.resetSpeed();
      const speed = await dodgedBarplotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.moveToFirstDataPoint();

      for (let i = 0; i < dataLength - 1; i++) {
        await dodgedBarplotPage.moveToNextDataPoint();
      }

      const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Move from left to right verification failed: ${errorMessage}`);
      }
    });

    test('should move from right to left', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await dodgedBarplotPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.moveToFirstDataPoint();
      const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();

      try {
        const firstDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, 0);
        expect(currentDataPoint).toContain(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`First data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to the last data point', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.moveToLastDataPoint();
      const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Last data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to bottom level of dodged bar', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.moveToDataPointAbove();
      const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();

      const firstDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });

    test('should move to upper level of dodged bar', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      await dodgedBarplotPage.moveToDataPointBelow();
      const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();

      const firstDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });
  });

  test.describe('Autoplay Controls', () => {
    test('should execute forward autoplay', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      try {
        const lastDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, dataLength - 1);
        await dodgedBarplotPage.startForwardAutoplay(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Forward autoplay test failed: ${errorMessage}`);
      }
    });

    test('should execute backward autoplay', async ({ page }) => {
      const dodgedBarplotPage = await setupDodgedBarplotPage(page);

      try {
        const firstDataPointValue = getDodgedBarplotDisplayValue(dodgedBarplotLayer, 0);
        await dodgedBarplotPage.moveToLastDataPoint();
        await dodgedBarplotPage.startReverseAutoplay(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Backward autoplay test failed: ${errorMessage}`);
      }
    });
  });
});

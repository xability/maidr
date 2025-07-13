import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { expect, test } from '@playwright/test';
import { HistogramPage } from '../pages/histogram.page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a histogram page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized HistogramPage instance
 */
async function setupHistogramPage(
  page: Page,
  activateMaidr = true,
): Promise<HistogramPage> {
  const histogramPage = new HistogramPage(page);
  if (activateMaidr) {
    await histogramPage.activateMaidr();
  }
  return histogramPage;
}

/**
 * Safely extracts the display value from a histogram data point
 * @param layer - The histogram layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getHistogramDisplayValue(layer: MaidrLayer | undefined, index: number): string {
  if (!Array.isArray(layer?.data)) {
    throw new TypeError('Layer data is not an array');
  }

  if (index < 0 || index >= layer.data.length) {
    throw new Error(`Index ${index} is out of bounds for data length ${layer.data.length}`);
  }

  const dataPoint = layer.data[index];

  if (dataPoint && 'xMin' in dataPoint && 'xMax' in dataPoint) {
    const xMin = String(dataPoint.xMin);
    const xMax = String(dataPoint.xMax);
    return `${xMin} through ${xMax}`;
  }

  if (dataPoint && 'x' in dataPoint) {
    return String(dataPoint.x);
  }

  throw new Error(`Data point at index ${index} has invalid format`);
}

test.describe('Histogram', () => {
  let maidrData: Maidr;
  let histogramLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const histogramPage = new HistogramPage(page);
      await histogramPage.navigateToHistogram();
      await page.waitForSelector(`svg#${TestConstants.HISTOGRAM_ID}`, { timeout: 10000 });

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
      }, TestConstants.HISTOGRAM_ID);

      histogramLayer = maidrData.subplots[0][0].layers[0];
      dataLength = (histogramLayer.data as { x: string; y: number }[]).length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the histogram with maidr data', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page, false);
      await histogramPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page, false);
      await histogramPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      const instructionText = await histogramPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.HISTOGRAM_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      await histogramPage.toggleTextMode();
      const isTextModeTerse = await histogramPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await histogramPage.toggleTextMode();
      const isTextModeOff = await histogramPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);

      await histogramPage.toggleTextMode();
      const isTextModeVerbose = await histogramPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeOff).toBe(true);
      expect(isTextModeVerbose).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      await histogramPage.toggleBrailleMode();
      const isBrailleModeOn = await histogramPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await histogramPage.toggleBrailleMode();
      const isBrailleModeOff = await histogramPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOn).toBe(true);
      expect(isBrailleModeOff).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      await histogramPage.toggleSonification();
      const isSoundModeOff = await histogramPage.isSonificationActive(TestConstants.SOUND_OFF);

      await histogramPage.toggleSonification();
      const isSoundModeOn = await histogramPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      await histogramPage.toggleReviewMode();
      const isReviewModeOn = await histogramPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await histogramPage.toggleReviewMode();
      const isReviewModeOff = await histogramPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.toggleXAxisTitle();

      const xAxisTitle = await histogramPage.getXAxisTitle();
      expect(xAxisTitle).toContain(histogramLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.toggleYAxisTitle();

      const yAxisTitle = await histogramPage.getYAxisTitle();
      expect(yAxisTitle).toContain(histogramLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.increaseSpeed();
      const speed = await histogramPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.decreaseSpeed();
      const speed = await histogramPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.resetSpeed();
      const speed = await histogramPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await histogramPage.moveToNextDataPoint();
      }

      const currentDataPoint = await histogramPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move from right to left', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      for (let i = 0; i <= dataLength; i++) {
        await histogramPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await histogramPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      await histogramPage.moveToFirstDataPoint();
      const currentDataPoint = await histogramPage.getCurrentDataPointInfo();

      try {
        const firstDataPointValue = getHistogramDisplayValue(histogramLayer, 0);
        expect(currentDataPoint).toContain(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`First data point verification failed: ${errorMessage}`);
      }
    });

    test('should move to the last data point', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      await histogramPage.moveToLastDataPoint();
      const currentDataPoint = await histogramPage.getCurrentDataPointInfo();

      try {
        const lastDataPointValue = getHistogramDisplayValue(histogramLayer, dataLength - 1);
        expect(currentDataPoint).toContain(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Last data point verification failed: ${errorMessage}`);
      }
    });

    test('should not be able to move up', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.moveToNextDataPoint();
      await histogramPage.moveToDataPointAbove();

      const currentDataPoint = await histogramPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should not be able to move down', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);
      await histogramPage.moveToNextDataPoint();
      await histogramPage.moveToDataPointBelow();

      const currentDataPoint = await histogramPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });
  });

  test.describe('Autoplay Controls', () => {
    test('should execute forward autoplay', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      try {
        const lastDataPointValue = getHistogramDisplayValue(histogramLayer, dataLength - 1);
        await histogramPage.startForwardAutoplay(lastDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Forward autoplay test failed: ${errorMessage}`);
      }
    });

    test('should execute backward autoplay', async ({ page }) => {
      const histogramPage = await setupHistogramPage(page);

      try {
        const firstDataPointValue = getHistogramDisplayValue(histogramLayer, 0);
        await histogramPage.moveToLastDataPoint();
        await histogramPage.startReverseAutoplay(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Backward autoplay test failed: ${errorMessage}`);
      }
    });
  });
});

import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/maidr';
import { expect, test } from '@playwright/test';
import { StackedBarplotPage } from '../page-objects/plots/stackedBarplot-page';
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
      await page.waitForSelector(`svg#${TestConstants.STACKED_BARPLOT_ID}`, { timeout: 10000 });

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

  test('should load the Stacked Barplot with maidr data', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.verifyPlotLoaded();
  });

  test('should activate maidr on click', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.activateMaidrOnClick();
  });

  test('should display instruction text', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    const instructionText = await StackedBarplotPage.getInstructionText();

    expect(instructionText).toBe(TestConstants.STACKED_BARPLOT_INSTRUCTION_TEXT);
  });

  test('should toggle text mode on and off', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.toggleTextMode();
    const isTextModeTerse = await StackedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

    await StackedBarplotPage.toggleTextMode();
    const isTextModeOff = await StackedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
    expect(isTextModeOff).toBe(true);

    await StackedBarplotPage.toggleTextMode();
    const isTextModeVerbose = await StackedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
    expect(isTextModeVerbose).toBe(true);

    expect(isTextModeTerse).toBe(true);
    expect(isTextModeVerbose).toBe(true);
    expect(isTextModeOff).toBe(true);
  });

  test('should toggle braille mode on and off', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.toggleBrailleMode();
    const isBrailleModeOn = await StackedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

    await StackedBarplotPage.toggleBrailleMode();
    const isBrailleModeOff = await StackedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

    expect(isBrailleModeOff).toBe(true);
    expect(isBrailleModeOn).toBe(true);
  });

  test('should toggle sound mode on and off', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.toggleSonification();
    const isSoundModeOff = await StackedBarplotPage.isSonificationActive(TestConstants.SOUND_OFF);

    await StackedBarplotPage.toggleSonification();
    const isSoundModeOn = await StackedBarplotPage.isSonificationActive(TestConstants.SOUND_ON);

    expect(isSoundModeOff).toBe(true);
    expect(isSoundModeOn).toBe(true);
  });

  test('should toggle review mode on and off', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.toggleReviewMode();
    const isReviewModeOn = await StackedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

    await StackedBarplotPage.toggleReviewMode();
    const isReviewModeOff = await StackedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

    expect(isReviewModeOn).toBe(true);
    expect(isReviewModeOff).toBe(true);
  });

  test('should display X-axis Title', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.toggleXAxisTitle();

    const xAxisTitle = await StackedBarplotPage.getXAxisTitle();
    expect(xAxisTitle).toContain(stackedBarplotLayer?.axes?.x ?? '');
  });

  test('should display Y-Axis Title', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.toggleYAxisTitle();

    const yAxisTitle = await StackedBarplotPage.getYAxisTitle();
    expect(yAxisTitle).toContain(stackedBarplotLayer?.axes?.y ?? '');
  });

  test('should show help menu', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.showHelpMenu();
  });

  test('should show settings menu', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.showSettingsMenu();
  });

  test('should show chat dialog', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.showChatDialog();
  });

  test('should be able to speed up', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.increaseSpeed();
    const speed = await StackedBarplotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_UP);
  });

  test('should be able to slow down', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.decreaseSpeed();
    const speed = await StackedBarplotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_DOWN);
  });

  test('should be able to reset speed', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.resetSpeed();
    const speed = await StackedBarplotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_RESET);
  });

  test('should move from left to right', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    for (let i = 0; i <= dataLength + 1; i++) {
      await StackedBarplotPage.moveToNextDataPoint();
    }

    const currentDataPoint = await StackedBarplotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move from right to left', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await StackedBarplotPage.moveToPreviousDataPoint();
    }

    const currentDataPoint = await StackedBarplotPage.getCurrentDataPointInfo();
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

  test('should execute forward autoplay', async ({ page }) => {
    const stackedBarplotPage = await setupStackedBarplotPage(page);

    try {
      const lastDataPointValue = getStackedBarplotDisplayValue(stackedBarplotLayer, dataLength - 1);

      await stackedBarplotPage.startForwardAutoplay(
        lastDataPointValue,
      );
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
      await stackedBarplotPage.startReverseAutoplay(
        firstDataPointValue,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Backward autoplay test failed: ${errorMessage}`);
    }
  });
});

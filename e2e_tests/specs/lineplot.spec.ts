import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/maidr';
import { expect, test } from '@playwright/test';
import { LinePlotPage } from '../page-objects/plots/lineplot-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a lineplot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized LinePlotPage instance
 */
async function setupLinePlotPage(
  page: Page,
  activateMaidr = true,
): Promise<LinePlotPage> {
  const linePlotPage = new LinePlotPage(page);
  if (activateMaidr) {
    await linePlotPage.activateMaidr();
  }
  return linePlotPage;
}

/**
 * Gets the correct data length from a line plot layer
 * @param layer - The MAIDR layer containing line plot data
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
 * Safely extracts the display value from a lineplot data point
 * @param layer - The lineplot layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getLinePlotDisplayValue(layer: MaidrLayer | undefined, index: number): string {
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

  const linePoint = lineData[index];

  if (!linePoint || typeof linePoint.x === 'undefined') {
    throw new Error(`Data point at index ${index} has invalid format`);
  }

  return `${linePoint.x}`;
}

test.describe('Line Plot', () => {
  let maidrData: Maidr;
  let linePlotLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const linePlotPage = new LinePlotPage(page);
      await linePlotPage.navigateToLinePlot();
      await page.waitForSelector(`svg#${TestConstants.LINEPLOT_ID}`, { timeout: 10000 });

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
      }, TestConstants.LINEPLOT_ID);

      linePlotLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getLinePlotDataLength(linePlotLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const linePlotPage = new LinePlotPage(page);
    await linePlotPage.navigateToLinePlot();
  });

  test('should load the lineplot with maidr data', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.verifyPlotLoaded();
  });

  test('should activate maidr on click', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.activateMaidrOnClick();
  });

  test('should display instruction text', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    const instructionText = await linePlotPage.getInstructionText();

    expect(instructionText).toBe(TestConstants.LINEPLOT_INSTRUCTION_TEXT);
  });

  test('should toggle text mode on and off', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.toggleTextMode();
    const isTextModeTerse = await linePlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

    await linePlotPage.toggleTextMode();
    const isTextModeOff = await linePlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
    expect(isTextModeOff).toBe(true);

    await linePlotPage.toggleTextMode();
    const isTextModeVerbose = await linePlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
    expect(isTextModeVerbose).toBe(true);

    expect(isTextModeTerse).toBe(true);
    expect(isTextModeVerbose).toBe(true);
    expect(isTextModeOff).toBe(true);
  });

  test('should toggle braille mode on and off', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.toggleBrailleMode();
    const isBrailleModeOn = await linePlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

    await linePlotPage.toggleBrailleMode();
    const isBrailleModeOff = await linePlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

    expect(isBrailleModeOff).toBe(true);
    expect(isBrailleModeOn).toBe(true);
  });

  test('should toggle sound mode on and off', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.toggleSonification();
    const isSoundModeOff = await linePlotPage.isSonificationActive(TestConstants.SOUND_OFF);

    await linePlotPage.toggleSonification();
    const isSoundModeOn = await linePlotPage.isSonificationActive(TestConstants.SOUND_ON);

    expect(isSoundModeOff).toBe(true);
    expect(isSoundModeOn).toBe(true);
  });

  test('should toggle review mode on and off', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.toggleReviewMode();
    const isReviewModeOn = await linePlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

    await linePlotPage.toggleReviewMode();
    const isReviewModeOff = await linePlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

    expect(isReviewModeOn).toBe(true);
    expect(isReviewModeOff).toBe(true);
  });

  test('should display X-axis Title', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.toggleXAxisTitle();

    const xAxisTitle = await linePlotPage.getXAxisTitle();
    expect(xAxisTitle).toContain(linePlotLayer?.axes?.x ?? '');
  });

  test('should display Y-Axis Title', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.toggleYAxisTitle();

    const yAxisTitle = await linePlotPage.getYAxisTitle();
    expect(yAxisTitle).toContain(linePlotLayer?.axes?.y ?? '');
  });

  test('should show help menu', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.showHelpMenu();
  });

  test('should show settings menu', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.showSettingsMenu();
  });

  test('should show chat dialog', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.showChatDialog();
  });

  test('should be able to speed up', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.increaseSpeed();
    const speed = await linePlotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_UP);
  });

  test('should be able to slow down', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.decreaseSpeed();
    const speed = await linePlotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_DOWN);
  });

  test('should be able to reset speed', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.resetSpeed();
    const speed = await linePlotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_RESET);
  });

  test('should move from left to right', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await linePlotPage.moveToNextDataPoint();
    }

    const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move from right to left', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await linePlotPage.moveToPreviousDataPoint();
    }

    const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move to the first data point', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.moveToFirstDataPoint();
    const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
    try {
      const firstDataPointValue = getLinePlotDisplayValue(linePlotLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`First data point verification failed: ${errorMessage}`);
    }
  });

  test('should move to the last data point', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.moveToLastDataPoint();
    const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();

    try {
      const lastDataPointValue = getLinePlotDisplayValue(linePlotLayer, dataLength - 1);
      expect(currentDataPoint).toContain(lastDataPointValue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Last data point verification failed: ${errorMessage}, ${dataLength}`);
    }
  });

  test('should not be able to move up', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.moveToNextDataPoint(); // Remove once up arrow key is handled in barplot
    await linePlotPage.moveToDataPointAbove();

    const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION); // Change validation text if modified upon fixing up and down arrow keys
  });

  test('should not be able to move down', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    await linePlotPage.moveToNextDataPoint(); // Remove once up arrow key is handled in barplot
    await linePlotPage.moveToDataPointBelow();

    const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION); // Change validation text if modified upon fixing up and down arrow keys
  });

  test('should execute forward autoplay', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    try {
      const lastDataPointValue = getLinePlotDisplayValue(linePlotLayer, dataLength - 1);

      await linePlotPage.startForwardAutoplay(
        lastDataPointValue,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Forward autoplay test failed: ${errorMessage}`);
    }
  });

  test('should execute backward autoplay', async ({ page }) => {
    const linePlotPage = await setupLinePlotPage(page);

    try {
      const firstDataPointValue = getLinePlotDisplayValue(linePlotLayer, 0);

      await linePlotPage.moveToLastDataPoint();
      await linePlotPage.startReverseAutoplay(
        firstDataPointValue,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Backward autoplay test failed: ${errorMessage}`);
    }
  });
});

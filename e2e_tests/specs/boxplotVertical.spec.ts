import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BoxplotVerticalPage } from '../page-objects/plots/boxplotVertical-page';
import { TestConstants } from '../utils/constants';

/**
 * Safely extracts the display value from a vertical boxplot data point
 * @param layer - The boxplot vertical layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getBoxplotVerticalDisplayValue(layer: MaidrLayer | undefined, index: number): string {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (!Array.isArray(layer.data)) {
    throw new TypeError('Layer data is not an array');
  }

  if (index < 0 || index >= layer.data.length) {
    throw new Error(`Index ${index} is out of bounds for data length ${layer.data.length}`);
  }

  const boxPoint = layer.data[index];

  if (!boxPoint || !('fill' in boxPoint)) {
    throw new Error(`Data point at index ${index} has invalid format`);
  }

  // For boxplot, the 'fill' property represents the category label (like '2seater', 'compact', etc.)
  return String(boxPoint.fill);
}

/**
 * Gets the correct data length from a boxplot vertical layer
 * @param layer - The MAIDR layer containing boxplot data
 * @returns The number of data points in the layer
 * @throws Error if data structure is invalid
 */
function getBoxplotVerticalDataLength(layer: MaidrLayer | undefined): number {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (!Array.isArray(layer.data)) {
    throw new TypeError('Layer data is not an array');
  }

  return layer.data.length;
}

test.describe('Boxplot Vertical', () => {
  let maidrData: Maidr;
  let boxplotVerticalLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const boxplotVerticalPage = new BoxplotVerticalPage(page);
      await boxplotVerticalPage.navigateToBoxplotVertical();
      await page.waitForSelector(`svg#${TestConstants.BOXPLOT_VERTICAL_ID}`, { timeout: 10000 });

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
      }, TestConstants.BOXPLOT_VERTICAL_ID);

      boxplotVerticalLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getBoxplotVerticalDataLength(boxplotVerticalLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.navigateToBoxplotVertical();
  });

  test('should load the boxplot vertical with maidr data', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);

    await boxplotVerticalPage.verifyPlotLoaded();
  });

  test('should activate maidr on click', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);

    await boxplotVerticalPage.activateMaidrOnClick();
  });

  test('should display instruction text', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    const instructionText = await boxplotVerticalPage.getInstructionText();

    expect(instructionText).toBe(TestConstants.BOXPLOT_VERTICAL_INSTRUCTION_TEXT);
  });

  test('should toggle text mode on and off', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.toggleTextMode();
    const isTextModeTerse = await boxplotVerticalPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

    await boxplotVerticalPage.toggleTextMode();
    const isTextModeOff = await boxplotVerticalPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
    expect(isTextModeOff).toBe(true);

    await boxplotVerticalPage.toggleTextMode();
    const isTextModeVerbose = await boxplotVerticalPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
    expect(isTextModeVerbose).toBe(true);

    expect(isTextModeTerse).toBe(true);
    expect(isTextModeVerbose).toBe(true);
    expect(isTextModeOff).toBe(true);
  });

  test('should toggle braille mode on and off', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.toggleBrailleMode();
    const isBrailleModeOn = await boxplotVerticalPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

    await boxplotVerticalPage.toggleBrailleMode();
    const isBrailleModeOff = await boxplotVerticalPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

    expect(isBrailleModeOff).toBe(false);
    expect(isBrailleModeOn).toBe(false);
  });

  test('should toggle sound mode on and off', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.toggleSonification();
    const isSoundModeOff = await boxplotVerticalPage.isSonificationActive(TestConstants.SOUND_OFF);

    await boxplotVerticalPage.toggleSonification();
    const isSoundModeOn = await boxplotVerticalPage.isSonificationActive(TestConstants.SOUND_ON);

    expect(isSoundModeOff).toBe(true);
    expect(isSoundModeOn).toBe(true);
  });

  test('should toggle review mode on and off', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.toggleReviewMode();
    const isReviewModeOn = await boxplotVerticalPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

    await boxplotVerticalPage.toggleReviewMode();
    const isReviewModeOff = await boxplotVerticalPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

    expect(isReviewModeOn).toBe(true);
    expect(isReviewModeOff).toBe(true);
  });

  test('should display X-axis Title', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();
    await boxplotVerticalPage.toggleXAxisTitle();

    const xAxisTitle = await boxplotVerticalPage.getXAxisTitle();
    expect(xAxisTitle).toContain(boxplotVerticalLayer?.axes?.x ?? '');
  });

  test('should display Y-Axis Title', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();
    await boxplotVerticalPage.toggleYAxisTitle();

    const yAxisTitle = await boxplotVerticalPage.getYAxisTitle();
    expect(yAxisTitle).toContain(boxplotVerticalLayer?.axes?.y ?? '');
  });

  test('should show help menu', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.showHelpMenu();
  });

  test('should show settings menu', async ({ page }) => {
    const barPlotPage = new BoxplotVerticalPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.showSettingsMenu();
  });

  test('should show chat dialog', async ({ page }) => {
    const barPlotPage = new BoxplotVerticalPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.showChatDialog();
  });

  test('should be able to speed up', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.increaseSpeed();
    const speed = await boxplotVerticalPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_UP);
  });

  test('should be able to slow down', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.decreaseSpeed();
    const speed = await boxplotVerticalPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_DOWN);
  });

  test('should be able to reset speed', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.resetSpeed();
    const speed = await boxplotVerticalPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_RESET);
  });

  test('should move from left to right', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    for (let i = 0; i <= dataLength; i++) {
      await boxplotVerticalPage.moveToNextDataPoint();
    }

    const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move from right to left', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    for (let i = 0; i <= dataLength; i++) {
      await boxplotVerticalPage.moveToPreviousDataPoint();
    }

    const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move to the first data point', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.moveToFirstDataPoint();
    const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();

    try {
      const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`First data point verification failed: ${errorMessage}`);
    }
  });

  test('should move to the last data point', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    await boxplotVerticalPage.moveToLastDataPoint();
    const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();

    try {
      const lastDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(lastDataPointValue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Last data point verification failed: ${errorMessage}`);
    }
  });

  test('should move to the box above', async ({ page }) => {
    const boxplotHorizontalPage = new BoxplotVerticalPage(page);
    await boxplotHorizontalPage.activateMaidr();

    await boxplotHorizontalPage.moveToDataPointAbove();

    const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();

    const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
    expect(currentDataPoint).toContain(firstDataPointValue); // Change validation text if modified upon fixing up and down arrow keys
  });

  test('should move to the box below', async ({ page }) => {
    const boxplotHorizontalPage = new BoxplotVerticalPage(page);
    await boxplotHorizontalPage.activateMaidr();

    await boxplotHorizontalPage.moveToDataPointBelow();

    const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();

    const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
    expect(currentDataPoint).toContain(firstDataPointValue); // Change validation text if modified upon fixing up and down arrow keys
  });

  test('should execute forward autoplay', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    try {
      const lastDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, dataLength - 1);

      await boxplotVerticalPage.startForwardAutoplay(
        lastDataPointValue,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Forward autoplay test failed: ${errorMessage}`);
    }
  });

  test('should execute backward autoplay', async ({ page }) => {
    const boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.activateMaidr();

    try {
      const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);

      await boxplotVerticalPage.moveToLastDataPoint();
      await boxplotVerticalPage.startReverseAutoplay(
        firstDataPointValue,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Backward autoplay test failed: ${errorMessage}`);
    }
  });
});

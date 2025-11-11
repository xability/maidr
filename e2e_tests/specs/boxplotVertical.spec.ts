import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BoxplotVerticalPage } from '../page-objects/plots/boxplotVertical-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a boxplot vertical page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized BoxplotVerticalPage instance
 */
async function setupBoxplotVerticalPage(
  page: Page,
  activateMaidr = true,
): Promise<BoxplotVerticalPage> {
  const boxplotVerticalPage = new BoxplotVerticalPage(page);
  if (activateMaidr) {
    await boxplotVerticalPage.activateMaidr();
  }
  return boxplotVerticalPage;
}

/**
 * Helper function to extract MAIDR data from the page
 * @param page - The Playwright page
 * @param plotId - The ID of the plot to extract data from
 * @returns The extracted MAIDR data
 * @throws Error if data extraction fails
 */
async function extractMaidrData(page: Page, plotId: string): Promise<Maidr> {
  return await page.evaluate((id) => {
    const svgElement = document.querySelector(`svg`);
    if (!svgElement) {
      throw new Error(`SVG element with ID ${id} not found`);
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
  }, plotId);
}

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
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page, TestConstants.BOXPLOT_VERTICAL_ID);
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

  test.describe('Basic Plot Functionality', () => {
    test('should load the boxplot vertical with maidr data', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page, false);
      await boxplotVerticalPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page, false);
      await boxplotVerticalPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);
      const instructionText = await boxplotVerticalPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.BOXPLOT_VERTICAL_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

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
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

      await boxplotVerticalPage.toggleBrailleMode();
      const isBrailleModeOn = await boxplotVerticalPage.isBrailleModeActive(TestConstants.BRAILLE_ON);
      expect(isBrailleModeOn).toBe(true);

      await boxplotVerticalPage.toggleBrailleMode();
      const isBrailleModeOff = await boxplotVerticalPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);
      expect(isBrailleModeOff).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

      await boxplotVerticalPage.toggleSonification();
      const isSoundModeOff = await boxplotVerticalPage.isSonificationActive(TestConstants.SOUND_OFF);

      await boxplotVerticalPage.toggleSonification();
      const isSoundModeOn = await boxplotVerticalPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

      await boxplotVerticalPage.toggleReviewMode();
      const isReviewModeOn = await boxplotVerticalPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await boxplotVerticalPage.toggleReviewMode();
      const isReviewModeOff = await boxplotVerticalPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);
      await boxplotVerticalPage.toggleXAxisTitle();

      const xAxisTitle = await boxplotVerticalPage.getXAxisTitle();
      expect(xAxisTitle).toContain(boxplotVerticalLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);
      await boxplotVerticalPage.toggleYAxisTitle();

      const yAxisTitle = await boxplotVerticalPage.getYAxisTitle();
      expect(yAxisTitle).toContain(boxplotVerticalLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);
      await boxplotVerticalPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);
      await boxplotVerticalPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);
      await boxplotVerticalPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

      await boxplotVerticalPage.increaseSpeed();
      const speed = await boxplotVerticalPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

      await boxplotVerticalPage.decreaseSpeed();
      const speed = await boxplotVerticalPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const boxplotVerticalPage = await setupBoxplotVerticalPage(page);

      await boxplotVerticalPage.resetSpeed();
      const speed = await boxplotVerticalPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    let boxplotVerticalPage: BoxplotVerticalPage;

    test.beforeEach(async ({ page }) => {
      boxplotVerticalPage = await setupBoxplotVerticalPage(page);
    });

    test('should move from left to right', async () => {
      for (let i = 0; i <= dataLength; i++) {
        await boxplotVerticalPage.moveToNextDataPoint();
      }

      const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move from right to left', async () => {
      for (let i = 0; i <= dataLength; i++) {
        await boxplotVerticalPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point of first box', async () => {
      await boxplotVerticalPage.moveToFirstDataPoint();
      const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
      const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });

    test('should move to the last data point of last box', async () => {
      await boxplotVerticalPage.moveToLastDataPoint();
      const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
      const lastDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(lastDataPointValue);
    });

    test('should move to topmost point of current box', async () => {
      await boxplotVerticalPage.moveToDataPointAbove();
      const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
      const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });

    test('should move to bottommost point of current box', async () => {
      await boxplotVerticalPage.moveToDataPointBelow();
      const currentDataPoint = await boxplotVerticalPage.getCurrentDataPointInfo();
      const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });
  });

  test.describe('Autoplay Controls', () => {
    let boxplotVerticalPage: BoxplotVerticalPage;

    test.beforeEach(async ({ page }) => {
      boxplotVerticalPage = await setupBoxplotVerticalPage(page);
    });

    test('should execute forward autoplay', async () => {
      const lastDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, dataLength - 1);
      await boxplotVerticalPage.startForwardAutoplay(lastDataPointValue);
    });

    test('should execute backward autoplay', async () => {
      const firstDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      await boxplotVerticalPage.moveToLastDataPoint();
      await boxplotVerticalPage.startReverseAutoplay(firstDataPointValue);
    });

    test('should execute downward autoplay', async () => {
      const lastDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      await boxplotVerticalPage.startDownwardAutoplay(lastDataPointValue);
    });

    test('should execute upward autoplay', async () => {
      await boxplotVerticalPage.moveToDataPointBelow();
      const lastDataPointValue = getBoxplotVerticalDisplayValue(boxplotVerticalLayer, 0);
      await boxplotVerticalPage.startUpwardAutoplay(lastDataPointValue);
    });
  });
});

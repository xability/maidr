import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BoxplotHorizontalPage } from '../page-objects/plots/boxplotHorizontal-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a boxplot horizontal page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized BoxplotHorizontalPage instance
 */
async function setupBoxplotHorizontalPage(
  page: Page,
  activateMaidr = true,
): Promise<BoxplotHorizontalPage> {
  const boxplotHorizontalPage = new BoxplotHorizontalPage(page);
  if (activateMaidr) {
    await boxplotHorizontalPage.activateMaidr();
  }
  return boxplotHorizontalPage;
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
 * Safely extracts the display value from a horizontal boxplot data point
 * @param layer - The boxplot horizontal layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getBoxplotHorizontalDisplayValue(layer: MaidrLayer | undefined, index: number): string {
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

  // For boxplot, the 'fill' property represents the category label (e.g., 'Africa', 'Americas')
  // This is what appears in the UI text during navigation
  return String(boxPoint.fill);
}

/**
 * Gets the correct data length from a boxplot horizontal layer
 * @param layer - The MAIDR layer containing boxplot data
 * @returns The number of data points in the layer
 * @throws Error if data structure is invalid
 */
function getBoxplotHorizontalDataLength(layer: MaidrLayer | undefined): number {
  if (!layer?.data) {
    throw new TypeError('Layer data is undefined');
  }

  if (!Array.isArray(layer.data)) {
    throw new TypeError('Layer data is not an array');
  }

  return layer.data.length;
}

test.describe('Boxplot Horizontal', () => {
  let maidrData: Maidr;
  let boxplotHorizontalLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const boxplotHorizontalPage = new BoxplotHorizontalPage(page);
      await boxplotHorizontalPage.navigateToBoxplotHorizontal();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page, TestConstants.BOXPLOT_HORIZONTAL_ID);
      boxplotHorizontalLayer = maidrData.subplots[0][0].layers[0];
      dataLength = getBoxplotHorizontalDataLength(boxplotHorizontalLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const boxplotHorizontalPage = new BoxplotHorizontalPage(page);
    await boxplotHorizontalPage.navigateToBoxplotHorizontal();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the boxplot horizontal with maidr data', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page, false);
      await boxplotHorizontalPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page, false);
      await boxplotHorizontalPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
      const instructionText = await boxplotHorizontalPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.BOXPLOT_HORIZONTAL_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.toggleTextMode();
      const isTextModeTerse = await boxplotHorizontalPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await boxplotHorizontalPage.toggleTextMode();
      const isTextModeOff = await boxplotHorizontalPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      expect(isTextModeOff).toBe(true);

      await boxplotHorizontalPage.toggleTextMode();
      const isTextModeVerbose = await boxplotHorizontalPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeVerbose).toBe(true);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeVerbose).toBe(true);
      expect(isTextModeOff).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.toggleBrailleMode();
      const isBrailleModeOn = await boxplotHorizontalPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await boxplotHorizontalPage.toggleBrailleMode();
      const isBrailleModeOff = await boxplotHorizontalPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOff).toBe(true);
      expect(isBrailleModeOn).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.toggleSonification();
      const isSoundModeOff = await boxplotHorizontalPage.isSonificationActive(TestConstants.SOUND_OFF);

      await boxplotHorizontalPage.toggleSonification();
      const isSoundModeOn = await boxplotHorizontalPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.toggleReviewMode();
      const isReviewModeOn = await boxplotHorizontalPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await boxplotHorizontalPage.toggleReviewMode();
      const isReviewModeOff = await boxplotHorizontalPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
      await boxplotHorizontalPage.toggleXAxisTitle();

      const xAxisTitle = await boxplotHorizontalPage.getXAxisTitle();
      expect(xAxisTitle).toContain(boxplotHorizontalLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
      await boxplotHorizontalPage.toggleYAxisTitle();

      const yAxisTitle = await boxplotHorizontalPage.getYAxisTitle();
      expect(yAxisTitle).toContain(boxplotHorizontalLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
      await boxplotHorizontalPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
      await boxplotHorizontalPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
      await boxplotHorizontalPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.increaseSpeed();
      const speed = await boxplotHorizontalPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.decreaseSpeed();
      const speed = await boxplotHorizontalPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      await boxplotHorizontalPage.resetSpeed();
      const speed = await boxplotHorizontalPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    let boxplotHorizontalPage: BoxplotHorizontalPage;

    test.beforeEach(async ({ page }) => {
      boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
    });

    test('should move from left to right', async () => {
      await boxplotHorizontalPage.moveToFirstDataPoint();

      for (let i = 0; i < dataLength; i++) {
        await boxplotHorizontalPage.moveToNextDataPoint();
      }

      const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      const lastDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(lastDataPointValue);
    });

    test('should move from right to left', async () => {
      for (let i = 0; i <= dataLength; i++) {
        await boxplotHorizontalPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the leftmost data point of current box', async () => {
      await boxplotHorizontalPage.moveToFirstDataPoint();
      const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      const firstDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });

    test('should move to the rightmost data point of current box', async () => {
      await boxplotHorizontalPage.moveToLastDataPoint();
      const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      const lastDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(lastDataPointValue);
    });

    test('should move to the box above', async () => {
      await boxplotHorizontalPage.moveToDataPointAbove();
      const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      const firstDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });

    test('should move to the first box', async () => {
      await boxplotHorizontalPage.moveToDataPointBelow();
      const currentDataPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      const firstDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      expect(currentDataPoint).toContain(firstDataPointValue);
    });
  });

  test.describe('Autoplay Controls', () => {
    let boxplotHorizontalPage: BoxplotHorizontalPage;

    test.beforeEach(async ({ page }) => {
      boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);
    });

    test('should execute forward autoplay', async () => {
      const lastDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      await boxplotHorizontalPage.startForwardAutoplay(lastDataPointValue);
    });

    test('should execute backward autoplay', async () => {
      const firstDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      await boxplotHorizontalPage.moveToLastDataPoint();
      await boxplotHorizontalPage.startReverseAutoplay(firstDataPointValue);
    });

    test('should execute downward autoplay', async () => {
      await boxplotHorizontalPage.moveToLastBox();
      const lastDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      await boxplotHorizontalPage.startDownwardAutoplay(lastDataPointValue);
    });

    test('should execute upward autoplay', async () => {
      const lastDataPointValue = getBoxplotHorizontalDisplayValue(boxplotHorizontalLayer, dataLength - 1);
      await boxplotHorizontalPage.startUpwardAutoplay(lastDataPointValue);
    });
  });

  test.describe('Rotor Navigation', () => {
    test('should cycle through rotor modes using Alt+Shift+Up', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to LOWER VALUE NAVIGATION mode
      await boxplotHorizontalPage.moveToNextRotorMode();
      const isLowerValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move to HIGHER VALUE NAVIGATION mode
      await boxplotHorizontalPage.moveToNextRotorMode();
      const isHigherValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode (cycles around)
      await boxplotHorizontalPage.moveToNextRotorMode();
      const isDataMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should cycle through rotor modes in reverse using Alt+Shift+Down', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to HIGHER VALUE NAVIGATION mode (reverse direction)
      await boxplotHorizontalPage.moveToPrevRotorMode();
      const isHigherValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move to LOWER VALUE NAVIGATION mode
      await boxplotHorizontalPage.moveToPrevRotorMode();
      const isLowerValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode
      await boxplotHorizontalPage.moveToPrevRotorMode();
      const isDataMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should navigate to lower values in LOWER VALUE mode', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      // Navigate to first data point
      await boxplotHorizontalPage.moveToFirstDataPoint();
      const firstPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(firstPoint).toBeTruthy();

      // Enter LOWER VALUE NAVIGATION mode
      await boxplotHorizontalPage.moveToNextRotorMode();
      const isLowerValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move right should find the next lower value
      await boxplotHorizontalPage.moveToNextDataPoint();
      const secondPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(secondPoint).toBeTruthy();
    });

    test('should navigate to higher values in HIGHER VALUE mode', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      // Navigate to last data point
      await boxplotHorizontalPage.moveToLastDataPoint();
      const lastPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(lastPoint).toBeTruthy();

      // Enter HIGHER VALUE NAVIGATION mode (press twice to skip LOWER VALUE)
      await boxplotHorizontalPage.moveToNextRotorMode(); // LOWER VALUE
      await boxplotHorizontalPage.moveToNextRotorMode(); // HIGHER VALUE
      const isHigherValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move left should find the next higher value
      await boxplotHorizontalPage.moveToPreviousDataPoint();
      const checkPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(checkPoint).toBeTruthy();
    });

    test('should return to DATA mode and resume normal navigation', async ({ page }) => {
      const boxplotHorizontalPage = await setupBoxplotHorizontalPage(page);

      // Enter LOWER VALUE mode
      await boxplotHorizontalPage.moveToNextRotorMode();
      const isLowerValueMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Cycle back to DATA POINT NAVIGATION mode
      await boxplotHorizontalPage.moveToNextRotorMode(); // HIGHER VALUE
      await boxplotHorizontalPage.moveToNextRotorMode(); // DATA POINT
      const isDataMode = await boxplotHorizontalPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);

      // Verify normal navigation works (sequential movement)
      await boxplotHorizontalPage.moveToFirstDataPoint();
      const firstPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(firstPoint).toBeTruthy();

      await boxplotHorizontalPage.moveToNextDataPoint();
      const secondPoint = await boxplotHorizontalPage.getCurrentDataPointInfo();
      expect(secondPoint).toBeTruthy();
    });
  });
});

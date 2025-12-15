import type { Page } from '@playwright/test';
import type { HeatmapData, Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { HeatmapPage } from '../page-objects/plots/heatmap-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a heatmap page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized HeatmapPage instance
 */
async function setupHeatmapPage(
  page: Page,
  activateMaidr = true,
): Promise<HeatmapPage> {
  const heatmapPage = new HeatmapPage(page);
  if (activateMaidr) {
    await heatmapPage.activateMaidr();
  }
  return heatmapPage;
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

test.describe('Heatmap', () => {
  let maidrData: Maidr;
  let heatmapLayer: MaidrLayer;
  let heatmapData: HeatmapData;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const heatmapPage = new HeatmapPage(page);
      await heatmapPage.navigateToHeatmap();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page, TestConstants.HEATMAP_ID);
      heatmapLayer = maidrData.subplots[0][0].layers[0];
      heatmapData = heatmapLayer.data as HeatmapData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const heatmapPage = new HeatmapPage(page);
    await heatmapPage.navigateToHeatmap();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the heatmap with maidr data', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page, false);
      await heatmapPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page, false);
      await heatmapPage.activateMaidrOnClick();
    });

    test('should display instruction text', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);
      const instructionText = await heatmapPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.HEATMAP_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.toggleTextMode();
      const isTextModeTerse = await heatmapPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await heatmapPage.toggleTextMode();
      const isTextModeOff = await heatmapPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      expect(isTextModeOff).toBe(true);

      await heatmapPage.toggleTextMode();
      const isTextModeVerbose = await heatmapPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeVerbose).toBe(true);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeVerbose).toBe(true);
      expect(isTextModeOff).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.toggleBrailleMode();
      const isBrailleModeOn = await heatmapPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

      await heatmapPage.toggleBrailleMode();
      const isBrailleModeOff = await heatmapPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

      expect(isBrailleModeOff).toBe(true);
      expect(isBrailleModeOn).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.toggleSonification();
      const isSoundModeOff = await heatmapPage.isSonificationActive(TestConstants.SOUND_OFF);

      await heatmapPage.toggleSonification();
      const isSoundModeOn = await heatmapPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });

    test('should toggle review mode on and off', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.toggleReviewMode();
      const isReviewModeOn = await heatmapPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

      await heatmapPage.toggleReviewMode();
      const isReviewModeOff = await heatmapPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

      expect(isReviewModeOn).toBe(true);
      expect(isReviewModeOff).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.toggleXAxisTitle();
      const xAxisTitle = await heatmapPage.getXAxisTitle();
      expect(xAxisTitle).toContain(heatmapLayer?.axes?.x ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.toggleYAxisTitle();
      const yAxisTitle = await heatmapPage.getYAxisTitle();
      expect(yAxisTitle).toContain(heatmapLayer?.axes?.y ?? '');
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);
      await heatmapPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);
      await heatmapPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);
      await heatmapPage.showChatDialog();
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.increaseSpeed();
      const speed = await heatmapPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.decreaseSpeed();
      const speed = await heatmapPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      await heatmapPage.resetSpeed();
      const speed = await heatmapPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Navigation Controls', () => {
    let heatmapPage: HeatmapPage;

    test.beforeEach(async ({ page }) => {
      heatmapPage = await setupHeatmapPage(page);
    });

    test('should move from left to right', async () => {
      for (let i = 0; i <= heatmapData.x.length; i++) {
        await heatmapPage.moveToNextDataPoint();
      }

      const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move from right to left', async () => {
      await heatmapPage.moveToLastDataPoint();

      for (let i = 0; i <= heatmapData.x.length; i++) {
        await heatmapPage.moveToPreviousDataPoint();
      }

      const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async () => {
      await heatmapPage.moveToFirstDataPoint();
      const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toContain(heatmapData.x[0].toString());
    });

    test('should move to the last data point', async () => {
      await heatmapPage.moveToLastDataPoint();
      const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toContain(heatmapData.x[heatmapData.x.length - 1].toString());
    });
  });

  test.describe('Autoplay Controls', () => {
    let heatmapPage: HeatmapPage;

    test.beforeEach(async ({ page }) => {
      heatmapPage = await setupHeatmapPage(page);
    });

    test('should execute forward autoplay', async () => {
      const expectedDataPoint = heatmapData.x[heatmapData.x.length - 1].toString();
      await heatmapPage.startForwardAutoplay(expectedDataPoint);
    });

    test('should execute backward autoplay', async () => {
      const expectedDataPoint = heatmapData.x[0].toString();
      await heatmapPage.moveToLastDataPoint();
      await heatmapPage.startReverseAutoplay(expectedDataPoint);
    });
  });

  test.describe('Rotor Navigation', () => {
    test('should cycle through rotor modes using Alt+Shift+Up', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to LOWER VALUE NAVIGATION mode
      await heatmapPage.moveToNextRotorMode();
      const isLowerValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move to HIGHER VALUE NAVIGATION mode
      await heatmapPage.moveToNextRotorMode();
      const isHigherValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode (cycles around)
      await heatmapPage.moveToNextRotorMode();
      const isDataMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should cycle through rotor modes in reverse using Alt+Shift+Down', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to HIGHER VALUE NAVIGATION mode (reverse direction)
      await heatmapPage.moveToPrevRotorMode();
      const isHigherValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move to LOWER VALUE NAVIGATION mode
      await heatmapPage.moveToPrevRotorMode();
      const isLowerValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode
      await heatmapPage.moveToPrevRotorMode();
      const isDataMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should navigate to lower values in LOWER VALUE mode', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      // Navigate to first data point
      await heatmapPage.moveToFirstDataPoint();
      const firstPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(firstPoint).toBeTruthy();

      // Enter LOWER VALUE NAVIGATION mode
      await heatmapPage.moveToNextRotorMode();
      const isLowerValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move right should find the next lower value
      await heatmapPage.moveToNextDataPoint();
      const secondPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(secondPoint).toBeTruthy();
    });

    test('should navigate to higher values in HIGHER VALUE mode', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      // Navigate to last data point
      await heatmapPage.moveToLastDataPoint();
      const lastPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(lastPoint).toBeTruthy();

      // Enter HIGHER VALUE NAVIGATION mode (press twice to skip LOWER VALUE)
      await heatmapPage.moveToNextRotorMode(); // LOWER VALUE
      await heatmapPage.moveToNextRotorMode(); // HIGHER VALUE
      const isHigherValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move left should find the next higher value
      await heatmapPage.moveToPreviousDataPoint();
      const checkPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(checkPoint).toBeTruthy();
    });

    test('should return to DATA mode and resume normal navigation', async ({ page }) => {
      const heatmapPage = await setupHeatmapPage(page);

      // Enter LOWER VALUE mode
      await heatmapPage.moveToNextRotorMode();
      const isLowerValueMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Cycle back to DATA POINT NAVIGATION mode
      await heatmapPage.moveToNextRotorMode(); // HIGHER VALUE
      await heatmapPage.moveToNextRotorMode(); // DATA POINT
      const isDataMode = await heatmapPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);

      // Verify normal navigation works (sequential movement)
      await heatmapPage.moveToFirstDataPoint();
      const firstPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(firstPoint).toBeTruthy();

      await heatmapPage.moveToNextDataPoint();
      const secondPoint = await heatmapPage.getCurrentDataPointInfo();
      expect(secondPoint).toBeTruthy();
    });
  });
});

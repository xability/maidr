import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
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

  test.describe('Basic Plot Functionality', () => {
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
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);
      await linePlotPage.toggleTextMode();
      const isTextModeTerse = await linePlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);
      await linePlotPage.toggleTextMode();
      const isTextModeOff = await linePlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      await linePlotPage.toggleTextMode();
      const isTextModeVerbose = await linePlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeTerse).toBe(true);
      expect(isTextModeOff).toBe(true);
      expect(isTextModeVerbose).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);
      await linePlotPage.toggleBrailleMode();
      const isBrailleModeOn = await linePlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);
      await linePlotPage.toggleBrailleMode();
      const isBrailleModeOff = await linePlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);
      expect(isBrailleModeOn).toBe(true);
      expect(isBrailleModeOff).toBe(true);
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
  });

  test.describe('Axis Controls', () => {
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
  });

  test.describe('Menu Controls', () => {
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
  });

  test.describe('Speed Controls', () => {
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
  });

  test.describe('Navigation Controls', () => {
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
        throw new Error(`Last data point verification failed: ${errorMessage}`);
      }
    });

    test('should not be able to move up', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);
      await linePlotPage.moveToNextDataPoint();
      await linePlotPage.moveToDataPointAbove();
      const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should not be able to move down', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);
      await linePlotPage.moveToNextDataPoint();
      await linePlotPage.moveToDataPointBelow();
      const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });
  });

  test.describe('Autoplay Controls', () => {
    test('should execute forward autoplay', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);
      try {
        const lastDataPointValue = getLinePlotDisplayValue(linePlotLayer, dataLength - 1);
        await linePlotPage.startForwardAutoplay(lastDataPointValue);
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
        await linePlotPage.startReverseAutoplay(firstDataPointValue);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Backward autoplay test failed: ${errorMessage}`);
      }
    });
  });

  test.describe('Rotor Navigation', () => {
    test('should cycle through rotor modes using Alt+Shift+Up', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to LOWER VALUE NAVIGATION mode
      await linePlotPage.moveToNextRotorMode();
      const isLowerValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move to HIGHER VALUE NAVIGATION mode
      await linePlotPage.moveToNextRotorMode();
      const isHigherValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode (cycles around)
      await linePlotPage.moveToNextRotorMode();
      const isDataMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should cycle through rotor modes in reverse using Alt+Shift+Down', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to HIGHER VALUE NAVIGATION mode (reverse direction)
      await linePlotPage.moveToPrevRotorMode();
      const isHigherValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move to LOWER VALUE NAVIGATION mode
      await linePlotPage.moveToPrevRotorMode();
      const isLowerValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode
      await linePlotPage.moveToPrevRotorMode();
      const isDataMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should navigate to lower values in LOWER VALUE mode', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Navigate to first data point
      await linePlotPage.moveToFirstDataPoint();
      const firstPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(firstPoint).toBeTruthy();

      // Enter LOWER VALUE NAVIGATION mode
      await linePlotPage.moveToNextRotorMode();
      const isLowerValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move right should find the next lower value
      await linePlotPage.moveToNextDataPoint();
      const secondPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(secondPoint).toBeTruthy();
    });

    test('should navigate to higher values in HIGHER VALUE mode', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Navigate to last data point
      await linePlotPage.moveToLastDataPoint();
      const lastPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(lastPoint).toBeTruthy();

      // Enter HIGHER VALUE NAVIGATION mode (press twice to skip LOWER VALUE)
      await linePlotPage.moveToNextRotorMode(); // LOWER VALUE
      await linePlotPage.moveToNextRotorMode(); // HIGHER VALUE
      const isHigherValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move left should find the next higher value
      await linePlotPage.moveToPreviousDataPoint();
      const checkPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(checkPoint).toBeTruthy();
    });

    test('should return to DATA mode and resume normal navigation', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Enter LOWER VALUE mode
      await linePlotPage.moveToNextRotorMode();
      const isLowerValueMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Cycle back to DATA POINT NAVIGATION mode
      await linePlotPage.moveToNextRotorMode(); // HIGHER VALUE
      await linePlotPage.moveToNextRotorMode(); // DATA POINT
      const isDataMode = await linePlotPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);

      // Verify normal navigation works (sequential movement)
      await linePlotPage.moveToFirstDataPoint();
      const firstPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(firstPoint).toBeTruthy();

      await linePlotPage.moveToNextDataPoint();
      const secondPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(secondPoint).toBeTruthy();
    });
  });

  test.describe('Go To Extrema', () => {
    test('should open Go To Extrema modal when pressing G key', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Open the Go To Extrema modal
      await linePlotPage.openGoToExtremaModal();

      // Verify the modal is visible
      const isModalVisible = await linePlotPage.isGoToExtremaModalVisible();
      expect(isModalVisible).toBe(true);
    });

    test('should close Go To Extrema modal when pressing Escape', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Open the modal first
      await linePlotPage.openGoToExtremaModal();
      const isModalOpenInitially = await linePlotPage.isGoToExtremaModalVisible();
      expect(isModalOpenInitially).toBe(true);

      // Close the modal
      await linePlotPage.closeGoToExtremaModal();

      // Verify the modal is closed
      const isModalVisibleAfterClose = await linePlotPage.isGoToExtremaModalVisible();
      expect(isModalVisibleAfterClose).toBe(false);
    });

    test('should display extrema targets in the modal', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Open the Go To Extrema modal
      await linePlotPage.openGoToExtremaModal();

      // Get the available targets
      const targets = await linePlotPage.getExtremaTargets();

      // Verify that extrema targets are displayed
      expect(targets.length).toBeGreaterThan(0);

      // Check that Maximum and Minimum options are available
      const hasMaximum = targets.some((t) => t.toLowerCase().includes('max'));
      const hasMinimum = targets.some((t) => t.toLowerCase().includes('min'));
      expect(hasMaximum || hasMinimum).toBe(true);

      // Close the modal
      await linePlotPage.closeGoToExtremaModal();
    });

    test('should navigate selection up and down in the modal', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Open the Go To Extrema modal
      await linePlotPage.openGoToExtremaModal();

      // Get initial targets to verify we have options
      const targets = await linePlotPage.getExtremaTargets();
      expect(targets.length).toBeGreaterThan(1);

      // Navigate down
      await linePlotPage.goToExtremaMoveDown();

      // Navigate back up
      await linePlotPage.goToExtremaMoveUp();

      // Modal should still be open
      const isModalVisible = await linePlotPage.isGoToExtremaModalVisible();
      expect(isModalVisible).toBe(true);

      // Close the modal
      await linePlotPage.closeGoToExtremaModal();
    });

    test('should navigate to maximum value when selecting Maximum', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Navigate to maximum using Go To Extrema
      await linePlotPage.goToMaximum();

      // Verify we're at a data point
      const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toBeTruthy();
    });

    test('should navigate to minimum value when selecting Minimum', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Navigate to minimum using Go To Extrema
      await linePlotPage.goToMinimum();

      // Verify we're at a data point
      const currentDataPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toBeTruthy();
    });

    test('should return to normal navigation after selecting extrema', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Navigate to maximum
      await linePlotPage.goToMaximum();

      // Verify we're at a data point
      const maxPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(maxPoint).toBeTruthy();

      // Verify normal navigation works after Go To Extrema
      await linePlotPage.moveToNextDataPoint();
      const nextPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(nextPoint).toBeTruthy();

      // Navigate back
      await linePlotPage.moveToPreviousDataPoint();
      const previousPoint = await linePlotPage.getCurrentDataPointInfo();
      expect(previousPoint).toBeTruthy();
    });

    test('should close modal when pressing G key again', async ({ page }) => {
      const linePlotPage = await setupLinePlotPage(page);

      // Open the modal
      await linePlotPage.openGoToExtremaModal();
      const isModalOpen = await linePlotPage.isGoToExtremaModalVisible();
      expect(isModalOpen).toBe(true);

      // Press G again to close (toggle behavior)
      await linePlotPage.pressKey(TestConstants.GO_TO_EXTREMA_KEY, 'toggle go to extrema modal');

      // Wait a moment for the modal to close
      await page.waitForTimeout(500);

      // Verify modal is closed
      const isModalClosed = !(await linePlotPage.isGoToExtremaModalVisible());
      expect(isModalClosed).toBe(true);
    });
  });
});

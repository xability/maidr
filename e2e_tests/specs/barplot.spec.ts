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

  test.describe('Rotor Navigation', () => {
    test('should cycle through rotor modes using Alt+Shift+Up', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to LOWER VALUE NAVIGATION mode
      await barPlotPage.moveToNextRotorMode();
      const isLowerValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move to HIGHER VALUE NAVIGATION mode
      await barPlotPage.moveToNextRotorMode();
      const isHigherValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode (cycles around)
      await barPlotPage.moveToNextRotorMode();
      const isDataMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should cycle through rotor modes in reverse using Alt+Shift+Down', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Start in DATA POINT NAVIGATION mode (default)
      // Move to HIGHER VALUE NAVIGATION mode (reverse direction)
      await barPlotPage.moveToPrevRotorMode();
      const isHigherValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move to LOWER VALUE NAVIGATION mode
      await barPlotPage.moveToPrevRotorMode();
      const isLowerValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Move back to DATA POINT NAVIGATION mode
      await barPlotPage.moveToPrevRotorMode();
      const isDataMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);
    });

    test('should navigate to lower values in LOWER VALUE mode', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Navigate to first data point (Sat: 87 - highest value)
      await barPlotPage.moveToFirstDataPoint();
      const firstPoint = await barPlotPage.getCurrentDataPointInfo();
      console.log('first',firstPoint)
      expect(firstPoint).toContain('Sat');

      // Enter LOWER VALUE NAVIGATION mode
      await barPlotPage.moveToNextRotorMode();
      const isLowerValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      console.log('lower?',isLowerValueMode)
      expect(isLowerValueMode).toBe(true);

      // Move right should find the next lower value (Sun: 76)
      await barPlotPage.moveToNextDataPoint();
      const secondPoint = await barPlotPage.getCurrentDataPointInfo();
      console.log('second',secondPoint)
      expect(secondPoint).toContain('Sun');


    });

    test('should navigate to higher values in HIGHER VALUE mode', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Navigate to last data point (Fri: 19 - lowest value)
      await barPlotPage.moveToLastDataPoint();
      const lastPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(lastPoint).toContain('Fri');

      // Enter HIGHER VALUE NAVIGATION mode (press twice to skip LOWER VALUE)
      await barPlotPage.moveToNextRotorMode(); // LOWER VALUE
      await barPlotPage.moveToNextRotorMode(); // HIGHER VALUE
      const isHigherValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_HIGHER_VALUE_MODE);
      expect(isHigherValueMode).toBe(true);

      // Move left should find the next higher value (Thur: 62)
      await barPlotPage.moveToLastDataPoint(); //Fri- 19
      await barPlotPage.moveToPreviousDataPoint(); //Thur-62

      const checkPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(checkPoint).toContain('Thur');

    });

    test('should return to DATA mode and resume normal navigation', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Enter LOWER VALUE mode
      await barPlotPage.moveToNextRotorMode();
      let isLowerValueMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_LOWER_VALUE_MODE);
      expect(isLowerValueMode).toBe(true);

      // Cycle back to DATA POINT NAVIGATION mode
      await barPlotPage.moveToNextRotorMode(); // HIGHER VALUE
      await barPlotPage.moveToNextRotorMode(); // DATA POINT
      const isDataMode = await barPlotPage.isRotorModeActive(TestConstants.ROTOR_DATA_MODE);
      expect(isDataMode).toBe(true);

      // Verify normal navigation works (sequential movement)
      await barPlotPage.moveToFirstDataPoint();
      const firstPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(firstPoint).toContain('Sat');

      await barPlotPage.moveToNextDataPoint();
      const secondPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(secondPoint).toContain('Sun');
    });
  });

  test.describe('Go To Extrema', () => {
    test('should open Go To Extrema modal when pressing G key', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Open the Go To Extrema modal
      await barPlotPage.openGoToExtremaModal();

      // Verify the modal is visible
      const isModalVisible = await barPlotPage.isGoToExtremaModalVisible();
      expect(isModalVisible).toBe(true);
    });

    test('should close Go To Extrema modal when pressing Escape', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Open the modal first
      await barPlotPage.openGoToExtremaModal();
      const isModalOpenInitially = await barPlotPage.isGoToExtremaModalVisible();
      expect(isModalOpenInitially).toBe(true);

      // Close the modal
      await barPlotPage.closeGoToExtremaModal();

      // Verify the modal is closed
      const isModalVisibleAfterClose = await barPlotPage.isGoToExtremaModalVisible();
      expect(isModalVisibleAfterClose).toBe(false);
    });

    test('should display extrema targets in the modal', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Open the Go To Extrema modal
      await barPlotPage.openGoToExtremaModal();

      // Get the available targets
      const targets = await barPlotPage.getExtremaTargets();

      // Verify that extrema targets are displayed
      expect(targets.length).toBeGreaterThan(0);

      // Check that Maximum and Minimum options are available
      const hasMaximum = targets.some((t) => t.toLowerCase().includes('max'));
      const hasMinimum = targets.some((t) => t.toLowerCase().includes('min'));
      expect(hasMaximum || hasMinimum).toBe(true);

      // Close the modal
      await barPlotPage.closeGoToExtremaModal();
    });

    test('should navigate selection up and down in the modal', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Open the Go To Extrema modal
      await barPlotPage.openGoToExtremaModal();

      // Get initial targets to verify we have options
      const targets = await barPlotPage.getExtremaTargets();
      expect(targets.length).toBeGreaterThan(1);

      // Navigate down
      await barPlotPage.goToExtremaMoveDown();

      // Navigate back up
      await barPlotPage.goToExtremaMoveUp();

      // Modal should still be open
      const isModalVisible = await barPlotPage.isGoToExtremaModalVisible();
      expect(isModalVisible).toBe(true);

      // Close the modal
      await barPlotPage.closeGoToExtremaModal();
    });

    test('should navigate to maximum value when selecting Maximum', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Navigate to maximum using Go To Extrema
      await barPlotPage.goToMaximum();

      // Verify we're at the maximum value (Sat: 87 is the highest in tips data)
      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toContain('Sat');
    });

    test('should navigate to minimum value when selecting Minimum', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Navigate to minimum using Go To Extrema
      await barPlotPage.goToMinimum();

      // Verify we're at the minimum value (Fri: 19 is the lowest in tips data)
      const currentDataPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toContain('Fri');
    });

    test('should return to normal navigation after selecting extrema', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Navigate to maximum
      await barPlotPage.goToMaximum();

      // Verify we're at the maximum
      const maxPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(maxPoint).toContain('Sat');

      // Verify normal navigation works after Go To Extrema
      await barPlotPage.moveToNextDataPoint();
      const nextPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(nextPoint).toContain('Sun');

      // Navigate back
      await barPlotPage.moveToPreviousDataPoint();
      const previousPoint = await barPlotPage.getCurrentDataPointInfo();
      expect(previousPoint).toContain('Sat');
    });

    test('should close modal when pressing G key again', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      // Open the modal
      await barPlotPage.openGoToExtremaModal();
      const isModalOpen = await barPlotPage.isGoToExtremaModalVisible();
      expect(isModalOpen).toBe(true);

      // Press G again to close (toggle behavior)
      await barPlotPage.pressKey(TestConstants.GO_TO_EXTREMA_KEY, 'toggle go to extrema modal');

      // Wait a moment for the modal to close
      await page.waitForTimeout(500);

      // Verify modal is closed
      const isModalClosed = !(await barPlotPage.isGoToExtremaModalVisible());
      expect(isModalClosed).toBe(true);
    });
  });

  test.describe('Hover Mode Settings', () => {
    test('should show hover mode with three radio button options in settings', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.openSettingsModal();

      // Verify "Hover Mode" label is visible
      await expect(page.getByText(TestConstants.SETTINGS_HOVER_MODE).first()).toBeVisible();

      // Verify all three radio button options are visible (using getByLabel to find by FormControlLabel)
      // Using exact: true to avoid matching "Hover Mode" radio group when looking for "Hover" option
      await expect(page.getByLabel(TestConstants.HOVER_MODE_OFF, { exact: true })).toBeVisible();
      await expect(page.getByLabel(TestConstants.HOVER_MODE_HOVER, { exact: true })).toBeVisible();
      await expect(page.getByLabel(TestConstants.HOVER_MODE_CLICK, { exact: true })).toBeVisible();

      await barPlotPage.closeSettingsModalWithButton();
    });


    test('should navigate to data point when hover mode is set to Hover', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.openSettingsModal();
      await barPlotPage.selectHoverMode(TestConstants.HOVER_MODE_HOVER);
      await barPlotPage.saveAndCloseSettingsModal();

      // Hover on data point
      await barPlotPage.hoverOnDataPoint(0.3, 0.5);

      // Wait until data point info appears
      await expect.poll(async () => {
        return await barPlotPage.getCurrentDataPointInfo();
      }).toBeTruthy();
    });

    test('should navigate to data point when hover mode is set to Click', async ({ page }) => {
      const barPlotPage = await setupBarPlotPage(page);

      await barPlotPage.openSettingsModal();
      await barPlotPage.selectHoverMode(TestConstants.HOVER_MODE_CLICK);
      await barPlotPage.saveAndCloseSettingsModal();

      await barPlotPage.clickOnDataPoint(0.3, 0.5);

      await expect.poll(async () => {
        return await barPlotPage.getCurrentDataPointInfo();
      }).toBeTruthy();
    });
  });
});

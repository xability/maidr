import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { MultiLayerPlotPage } from '../page-objects/plots/multiLayer-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a Multi Layer plot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized MultiLayerPlotPage instance
 */
async function setupMultiLayerPlotPage(
  page: Page,
  activateMaidr = true,
): Promise<MultiLayerPlotPage> {
  const multiLayerPlotPage = new MultiLayerPlotPage(page);
  if (activateMaidr) {
    await multiLayerPlotPage.activateMaidr();
  }
  return multiLayerPlotPage;
}

/**
 * Safely extracts the display value from a Multi Layer plot data point
 * @param layer - The Multi Layer plot layer containing data points
 * @param index - Index of the data point to extract value from
 * @returns The formatted string value suitable for display comparison
 * @throws Error if data structure is invalid or index is out of bounds
 */
function getMultiLayerPlotDisplayValue(layer: MaidrLayer | undefined, index: number): string {
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

test.describe('Multi Layer Plot', () => {
  let maidrData: Maidr;
  let multiLayerPlotLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const multiLayerPlotPage = new MultiLayerPlotPage(page);
      await multiLayerPlotPage.navigateToMultiLayerPlot();
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
      }, TestConstants.MULTI_LAYER_PLOT_ID);

      multiLayerPlotLayer = maidrData.subplots[0][0].layers[0];
      dataLength = (multiLayerPlotLayer.data as { x: string; y: number }[]).length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const multiLayerPlotPage = new MultiLayerPlotPage(page);
    await multiLayerPlotPage.navigateToMultiLayerPlot();
  });

  test.describe('First Layer (Default)', () => {
    test.describe('Basic Plot Functionality', () => {
      test('should load the Multi Layer plot with maidr data', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.verifyPlotLoaded();
      });

      test('should activate maidr on click', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.activateMaidrOnClick();
      });

      test('should display instruction text', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        const instructionText = await multiLayerPlotPage.getInstructionText();
        expect(instructionText).toBe(TestConstants.MULTI_LAYER_PLOT_INSTRUCTION_TEXT);
      });
      test('should switch to first layer', async ({ page }) => {
            const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
            await multiLayerPlotPage.switchToUpperLayer();
            const currentLayer = await multiLayerPlotPage.getCurrentLayerInfo();
            expect(currentLayer).toContain(TestConstants.MULTI_LAYER_FIRST_LAYER);
      });
    });

    test.describe('Mode Controls', () => {
      test('should toggle text mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);

        await multiLayerPlotPage.toggleTextMode();
        const isTextModeTerse = await multiLayerPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

        await multiLayerPlotPage.toggleTextMode();
        const isTextModeOff = await multiLayerPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
        expect(isTextModeOff).toBe(true);

        await multiLayerPlotPage.toggleTextMode();
        const isTextModeVerbose = await multiLayerPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
        expect(isTextModeVerbose).toBe(true);

        expect(isTextModeTerse).toBe(true);
        expect(isTextModeVerbose).toBe(true);
        expect(isTextModeOff).toBe(true);
      });

      test('should toggle braille mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);

        await multiLayerPlotPage.toggleBrailleMode();
        const isBrailleModeOn = await multiLayerPlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

        await multiLayerPlotPage.toggleBrailleMode();
        const isBrailleModeOff = await multiLayerPlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

        expect(isBrailleModeOff).toBe(true);
        expect(isBrailleModeOn).toBe(true);
      });

      test('should toggle sound mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);

        await multiLayerPlotPage.toggleSonification();
        const isSoundModeOff = await multiLayerPlotPage.isSonificationActive(TestConstants.SOUND_OFF);

        await multiLayerPlotPage.toggleSonification();
        const isSoundModeOn = await multiLayerPlotPage.isSonificationActive(TestConstants.SOUND_ON);

        expect(isSoundModeOff).toBe(true);
        expect(isSoundModeOn).toBe(true);
      });

      test('should toggle review mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);

        await multiLayerPlotPage.toggleReviewMode();
        const isReviewModeOn = await multiLayerPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

        await multiLayerPlotPage.toggleReviewMode();
        const isReviewModeOff = await multiLayerPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

        expect(isReviewModeOn).toBe(true);
        expect(isReviewModeOff).toBe(true);
      });
    });

    test.describe('Axis Controls', () => {
      test('should display X-axis Title', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.toggleXAxisTitle();
        const xAxisTitle = await multiLayerPlotPage.getXAxisTitle();
        expect(xAxisTitle).toContain(multiLayerPlotLayer?.axes?.x ?? '');
      });

      test('should display Y-Axis Title', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.toggleYAxisTitle();
        const yAxisTitle = await multiLayerPlotPage.getYAxisTitle();
        expect(yAxisTitle).toContain(multiLayerPlotLayer?.axes?.y ?? '');
      });
    });

    test.describe('Menu Controls', () => {
      test('should show help menu', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.showHelpMenu();
      });

      test('should show settings menu', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.showSettingsMenu();
      });

      test('should show chat dialog', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.showChatDialog();
      });
    });

    test.describe('Speed Controls', () => {
      test('should be able to speed up', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.increaseSpeed();
        const speed = await multiLayerPlotPage.getSpeedToggleInfo();
        expect(speed).toEqual(TestConstants.SPEED_UP);
      });

      test('should be able to slow down', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.decreaseSpeed();
        const speed = await multiLayerPlotPage.getSpeedToggleInfo();
        expect(speed).toEqual(TestConstants.SPEED_DOWN);
      });

      test('should be able to reset speed', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.resetSpeed();
        const speed = await multiLayerPlotPage.getSpeedToggleInfo();
        expect(speed).toEqual(TestConstants.SPEED_RESET);
      });
    });

    test.describe('Navigation Controls', () => {
      test('should move to the first data point', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.moveToFirstDataPoint();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();

        try {
          const firstDataPointValue = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, 0);
          expect(currentDataPoint).toContain(firstDataPointValue);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`First data point verification failed: ${errorMessage}`);
        }
      });

      test('should move to the last data point', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.moveToLastDataPoint();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();

        try {
          const lastDataPointValue = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, dataLength - 1);
          expect(currentDataPoint).toContain(lastDataPointValue);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Last data point verification failed: ${errorMessage}`);
        }
      });

      test('should not be able to move up', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.moveToNextDataPoint();
        await multiLayerPlotPage.moveToDataPointAbove();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });

      test('should not be able to move down', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        await multiLayerPlotPage.moveToNextDataPoint();
        await multiLayerPlotPage.moveToDataPointBelow();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });

      test('should move from left to right', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        for (let i = 0; i <= dataLength; i++) {
          await multiLayerPlotPage.moveToNextDataPoint();
        }
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });

      test('should move from right to left', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        for (let i = 0; i <= dataLength; i++) {
          await multiLayerPlotPage.moveToPreviousDataPoint();
        }
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });
    });

    test.describe('Autoplay Controls', () => {
      test('should execute forward autoplay', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        let expectedDataPoint: string;

        try {
          if (Array.isArray(multiLayerPlotLayer?.data) && dataLength > 0) {
            const lastDataPointValue = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, dataLength - 1);
            expectedDataPoint = lastDataPointValue;
          } else {
            throw new Error('Invalid data format in multiLayerPlotLayer');
          }

          await multiLayerPlotPage.startForwardAutoplay(expectedDataPoint);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Forward autoplay test failed: ${errorMessage}`);
        }
      });

      test('should execute reverse autoplay', async ({ page }) => {
        const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
        let expectedDataPoint: string;

        try {
          if (Array.isArray(multiLayerPlotLayer?.data) && dataLength > 0) {
            expectedDataPoint = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, 0);
          } else {
            throw new Error('Invalid data format in multiLayerPlotLayer');
          }
          await multiLayerPlotPage.moveToLastDataPoint();
          await multiLayerPlotPage.startReverseAutoplay(expectedDataPoint);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Backward autoplay test failed: ${errorMessage}`);
        }
      });
    });
  });

  test.describe('Layer Switching', () => {
    test('should switch to first layer', async ({ page }) => {
      const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
      await multiLayerPlotPage.switchToUpperLayer();
      const currentLayer = await multiLayerPlotPage.getCurrentLayerInfo();
      expect(currentLayer).toContain(TestConstants.MULTI_LAYER_FIRST_LAYER);
    });
  });

  test.describe('Second Layer', () => {
    /**
     * Sets up the test environment with the upper layer selected
     * @param page - Playwright page object
     * @returns Configured MultiLayerPlotPage instance
     */
    async function setupSecondLayerTest(page: Page): Promise<MultiLayerPlotPage> {
      const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
      await multiLayerPlotPage.switchToUpperLayer();
      await multiLayerPlotPage.switchToUpperLayer();
      const currentLayer = await multiLayerPlotPage.getCurrentLayerInfo();
      expect(currentLayer).toContain(TestConstants.MULTI_LAYER_SECOND_LAYER);
      return multiLayerPlotPage;
    }

    test.describe('Basic Plot Functionality', () => {
      test('should load the Multi Layer plot with maidr data', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.verifyPlotLoaded();
      });

      test('should activate maidr on click', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.activateMaidrOnClick();
      });

      test('should display current layer info', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        const layerInfoText = await multiLayerPlotPage.getCurrentLayerInfo();
        expect(layerInfoText).not.toBe(TestConstants.MULTI_LAYER_PLOT_INSTRUCTION_TEXT);
      });

      test('should switch to bottom layer', async ({ page }) => {
            const multiLayerPlotPage = await setupMultiLayerPlotPage(page);
            await multiLayerPlotPage.switchToUpperLayer(); //switching to first layer
            await multiLayerPlotPage.switchToUpperLayer(); //switching to second layer
            await multiLayerPlotPage.switchToLowerLayer(); //switch to first layer
            const currentLayer = await multiLayerPlotPage.getCurrentLayerInfo();
            expect(currentLayer).toContain(TestConstants.MULTI_LAYER_FIRST_LAYER);
      });

    });

    test.describe('Mode Controls', () => {
      test('should toggle text mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);

        await multiLayerPlotPage.toggleTextMode();
        const isTextModeTerse = await multiLayerPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

        await multiLayerPlotPage.toggleTextMode();
        const isTextModeOff = await multiLayerPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
        expect(isTextModeOff).toBe(true);

        await multiLayerPlotPage.toggleTextMode();
        const isTextModeVerbose = await multiLayerPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
        expect(isTextModeVerbose).toBe(true);

        expect(isTextModeTerse).toBe(true);
        expect(isTextModeVerbose).toBe(true);
        expect(isTextModeOff).toBe(true);
      });

      test('should toggle braille mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);

        await multiLayerPlotPage.toggleBrailleMode();
        const isBrailleModeOn = await multiLayerPlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

        await multiLayerPlotPage.toggleBrailleMode();
        const isBrailleModeOff = await multiLayerPlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

        expect(isBrailleModeOff).toBe(true);
        expect(isBrailleModeOn).toBe(true);
      });

      test('should toggle sound mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);

        await multiLayerPlotPage.toggleSonification();
        const isSoundModeOff = await multiLayerPlotPage.isSonificationActive(TestConstants.SOUND_OFF);

        await multiLayerPlotPage.toggleSonification();
        const isSoundModeOn = await multiLayerPlotPage.isSonificationActive(TestConstants.SOUND_ON);

        expect(isSoundModeOff).toBe(true);
        expect(isSoundModeOn).toBe(true);
      });

      test('should toggle review mode on and off', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);

        await multiLayerPlotPage.toggleReviewMode();
        const isReviewModeOn = await multiLayerPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

        await multiLayerPlotPage.toggleReviewMode();
        const isReviewModeOff = await multiLayerPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

        expect(isReviewModeOn).toBe(true);
        expect(isReviewModeOff).toBe(true);
      });
    });

    test.describe('Axis Controls', () => {
      test('should display X-axis Title', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.toggleXAxisTitle();
        const xAxisTitle = await multiLayerPlotPage.getXAxisTitle();
        expect(xAxisTitle).toContain(multiLayerPlotLayer?.axes?.x ?? '');
      });

      test('should display Y-axis Title', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        const secondLayer = maidrData.subplots[0][0].layers[1];
        await multiLayerPlotPage.toggleYAxisTitle();
        const yAxisTitle = await multiLayerPlotPage.getYAxisTitle();
        expect(yAxisTitle).toContain(secondLayer?.axes?.y ?? '');
      });
    });

    test.describe('Menu Controls', () => {
      test('should show help menu', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.showHelpMenu();
      });

      test('should show settings menu', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.showSettingsMenu();
      });

      test('should show chat dialog', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.showChatDialog();
      });
    });

    test.describe('Speed Controls', () => {
      test('should be able to speed up', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.increaseSpeed();
        const speed = await multiLayerPlotPage.getSpeedToggleInfo();
        expect(speed).toEqual(TestConstants.SPEED_UP);
      });

      test('should be able to slow down', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.decreaseSpeed();
        const speed = await multiLayerPlotPage.getSpeedToggleInfo();
        expect(speed).toEqual(TestConstants.SPEED_DOWN);
      });

      test('should be able to reset speed', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.resetSpeed();
        const speed = await multiLayerPlotPage.getSpeedToggleInfo();
        expect(speed).toEqual(TestConstants.SPEED_RESET);
      });
    });

    test.describe('Navigation Controls', () => {
      test('should move to the first data point', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.moveToFirstDataPoint();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();

        try {
          const firstDataPointValue = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, 0);
          expect(currentDataPoint).toContain(firstDataPointValue);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`First data point verification failed: ${errorMessage}`);
        }
      });

      test('should move to the last data point', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.moveToLastDataPoint();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();

        try {
          const lastDataPointValue = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, dataLength - 1);
          expect(currentDataPoint).toContain(lastDataPointValue);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Last data point verification failed: ${errorMessage}`);
        }
      });

      test('should not be able to move up', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.moveToNextDataPoint();
        await multiLayerPlotPage.moveToDataPointAbove();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });

      test('should not be able to move down', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        await multiLayerPlotPage.moveToNextDataPoint();
        await multiLayerPlotPage.moveToDataPointBelow();
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });

      test('should move from left to right', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        for (let i = 0; i <= dataLength; i++) {
          await multiLayerPlotPage.moveToNextDataPoint();
        }
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });

      test('should move from right to left', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        for (let i = 0; i <= dataLength; i++) {
          await multiLayerPlotPage.moveToPreviousDataPoint();
        }
        const currentDataPoint = await multiLayerPlotPage.getCurrentDataPointInfo();
        expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
      });
    });

    test.describe('Autoplay Controls', () => {
      test('should execute forward autoplay', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        let expectedDataPoint: string;

        try {
          if (Array.isArray(multiLayerPlotLayer?.data) && dataLength > 0) {
            const lastDataPointValue = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, dataLength - 1);
            expectedDataPoint = lastDataPointValue;
          } else {
            throw new Error('Invalid data format in multiLayerPlotLayer');
          }

          await multiLayerPlotPage.startForwardAutoplay(expectedDataPoint);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Forward autoplay test failed: ${errorMessage}`);
        }
      });

      test('should execute reverse autoplay', async ({ page }) => {
        const multiLayerPlotPage = await setupSecondLayerTest(page);
        let expectedDataPoint: string;

        try {
          if (Array.isArray(multiLayerPlotLayer?.data) && dataLength > 0) {
            expectedDataPoint = getMultiLayerPlotDisplayValue(multiLayerPlotLayer, 0);
          } else {
            throw new Error('Invalid data format in multiLayerPlotLayer');
          }
          await multiLayerPlotPage.moveToLastDataPoint();
          await multiLayerPlotPage.startReverseAutoplay(expectedDataPoint);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Backward autoplay test failed: ${errorMessage}`);
        }
      });
    });
  });
});

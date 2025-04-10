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
      dataLength = (stackedBarplotLayer.data as { x: string; y: number }[]).length;
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

    for (let i = 0; i <= dataLength; i++) {
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
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.moveToFirstDataPoint();
    const currentDataPoint = await StackedBarplotPage.getCurrentDataPointInfo();
    if (Array.isArray(stackedBarplotLayer?.data) && dataLength > 0 && 'x' in stackedBarplotLayer.data[0]) {
      expect(currentDataPoint).toContain((stackedBarplotLayer.data[0] as { x: string }).x);
    } else {
      throw new Error('Invalid data format in stackedBarplotLayer');
    }
  });

  test('should move to the last data point', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    await StackedBarplotPage.moveToLastDataPoint();
    const currentDataPoint = await StackedBarplotPage.getCurrentDataPointInfo();
    if (Array.isArray(stackedBarplotLayer?.data) && dataLength > 0 && 'x' in stackedBarplotLayer.data[0]) {
      expect(currentDataPoint).toContain((stackedBarplotLayer.data[dataLength - 1] as { x: string }).x);
    } else {
      throw new Error('Invalid data format in stackedBarplotLayer');
    }
  });

  test('should execute forward autoplay', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    let expectedDataPoint: string;
    if (Array.isArray(stackedBarplotLayer.data) && dataLength > 0 && 'x' in stackedBarplotLayer.data[0]) {
      expectedDataPoint = (stackedBarplotLayer.data[dataLength - 1] as { x: string }).x;
    } else {
      throw new Error('Invalid data format in stackedBarplotLayer');
    }

    await StackedBarplotPage.startForwardAutoplay(
      expectedDataPoint,
    );
  });

  test('should execute backward autoplay', async ({ page }) => {
    const StackedBarplotPage = await setupStackedBarplotPage(page);

    let expectedDataPoint: string;
    if (Array.isArray(stackedBarplotLayer.data) && dataLength > 0 && 'x' in stackedBarplotLayer.data[0]) {
      expectedDataPoint = (stackedBarplotLayer.data[0] as { x: string }).x;
    } else {
      throw new Error('Invalid data format in stackedBarplotLayer');
    }

    await StackedBarplotPage.moveToLastDataPoint();

    await StackedBarplotPage.startReverseAutoplay(
      expectedDataPoint,
    );
  });
});

import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/maidr';
import { expect, test } from '@playwright/test';
import { HeatmapPage } from '../page-objects/plots/heatmap-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a heatmap page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized HistogramPage instance
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

test.describe('Histogram', () => {
  let maidrData: Maidr;
  let heatmapLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const heatmapPage = new HeatmapPage(page);
      await heatmapPage.navigateToHeatmap();
      await page.waitForSelector(`svg#${TestConstants.HEATMAP_ID}`, { timeout: 10000 });

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
      }, TestConstants.HEATMAP_ID);

      heatmapLayer = maidrData.subplots[0][0].layers[0];
      dataLength = (heatmapLayer.data as { x: string; y: number }[]).length;
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

  test('should load the heatmap with maidr data', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    await heatmapPage.verifyPlotLoaded();
  });

  test('should activate maidr on click', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    await heatmapPage.activateMaidrOnClick();
  });

  test('should display instruction text', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    const instructionText = await heatmapPage.getInstructionText();

    expect(instructionText).toBe(TestConstants.HEATMAP_INSTRUCTION_TEXT);
  });

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

  test('should show help menu', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    await heatmapPage.showHelpMenu();
  });

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

  test('should move from left to right', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await heatmapPage.moveToNextDataPoint();
    }

    const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move from right to left', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await heatmapPage.moveToPreviousDataPoint();
    }

    const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move to the first data point', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    await heatmapPage.moveToFirstDataPoint();
    const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
    if (Array.isArray(heatmapLayer?.data) && dataLength > 0 && 'x' in heatmapLayer.data[0]) {
      expect(currentDataPoint).toContain((heatmapLayer.data[0] as { x: string }).x);
    } else {
      throw new Error('Invalid data format in heatmapLayer');
    }
  });

  test('should move to the last data point', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    await heatmapPage.moveToLastDataPoint();
    const currentDataPoint = await heatmapPage.getCurrentDataPointInfo();
    if (Array.isArray(heatmapLayer?.data) && dataLength > 0 && 'x' in heatmapLayer.data[0]) {
      expect(currentDataPoint).toContain((heatmapLayer.data[dataLength - 1] as { x: string }).x);
    } else {
      throw new Error('Invalid data format in heatmapLayer');
    }
  });

  test('should execute forward autoplay', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    let expectedDataPoint: string;
    if (Array.isArray(heatmapLayer.data) && dataLength > 0 && 'x' in heatmapLayer.data[0]) {
      expectedDataPoint = (heatmapLayer.data[dataLength - 1] as { x: string }).x;
    } else {
      throw new Error('Invalid data format in heatmapLayer');
    }

    await heatmapPage.startForwardAutoplay(
      expectedDataPoint,
    );
  });

  test('should execute backward autoplay', async ({ page }) => {
    const heatmapPage = await setupHeatmapPage(page);

    let expectedDataPoint: string;
    if (Array.isArray(heatmapLayer.data) && dataLength > 0 && 'x' in heatmapLayer.data[0]) {
      expectedDataPoint = (heatmapLayer.data[0] as { x: string }).x;
    } else {
      throw new Error('Invalid data format in heatmapLayer');
    }

    await heatmapPage.moveToLastDataPoint();

    await heatmapPage.startReverseAutoplay(
      expectedDataPoint,
    );
  });
});

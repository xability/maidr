import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/maidr';
import { expect, test } from '@playwright/test';
import { DodgedBarplotPage } from '../page-objects/plots/dodgedBarplot-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a dodged barplot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized DodgedBarplotPage instance
 */
async function setupDodgedBarplotPage(
  page: Page,
  activateMaidr = true,
): Promise<DodgedBarplotPage> {
  const dodgedBarplotPage = new DodgedBarplotPage(page);
  if (activateMaidr) {
    await dodgedBarplotPage.activateMaidr();
  }
  return dodgedBarplotPage;
}

test.describe('Dodged Barplot', () => {
  let maidrData: Maidr;
  let dodgedBarplotLayer: MaidrLayer;
  let dataLength: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const dodgedBarplotPage = new DodgedBarplotPage(page);
      await dodgedBarplotPage.navigateToDodgedBarplot();
      await page.waitForSelector(`svg#${TestConstants.DODGED_BARPLOT_ID}`, { timeout: 10000 });

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
      }, TestConstants.DODGED_BARPLOT_ID);

      dodgedBarplotLayer = maidrData.subplots[0][0].layers[0];
      dataLength = (dodgedBarplotLayer.data as { x: string; y: number }[]).length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const dodgedBarplotPage = new DodgedBarplotPage(page);
    await dodgedBarplotPage.navigateToDodgedBarplot();
  });

  test('should load the dodged barplot with maidr data', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.verifyPlotLoaded();
  });

  test('should activate maidr on click', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.activateMaidrOnClick();
  });

  test('should display instruction text', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    const instructionText = await dodgedBarplotPage.getInstructionText();

    expect(instructionText).toBe(TestConstants.DODGED_BARPLOT_INSTRUCTION_TEXT);
  });

  test('should toggle text mode on and off', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.toggleTextMode();
    const isTextModeTerse = await dodgedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

    await dodgedBarplotPage.toggleTextMode();
    const isTextModeOff = await dodgedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
    expect(isTextModeOff).toBe(true);

    await dodgedBarplotPage.toggleTextMode();
    const isTextModeVerbose = await dodgedBarplotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
    expect(isTextModeVerbose).toBe(true);

    expect(isTextModeTerse).toBe(true);
    expect(isTextModeVerbose).toBe(true);
    expect(isTextModeOff).toBe(true);
  });

  test('should toggle braille mode on and off', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.toggleBrailleMode();
    const isBrailleModeOn = await dodgedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

    await dodgedBarplotPage.toggleBrailleMode();
    const isBrailleModeOff = await dodgedBarplotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

    expect(isBrailleModeOff).toBe(true);
    expect(isBrailleModeOn).toBe(true);
  });

  test('should toggle sound mode on and off', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.toggleSonification();
    const isSoundModeOff = await dodgedBarplotPage.isSonificationActive(TestConstants.SOUND_OFF);

    await dodgedBarplotPage.toggleSonification();
    const isSoundModeOn = await dodgedBarplotPage.isSonificationActive(TestConstants.SOUND_ON);

    expect(isSoundModeOff).toBe(true);
    expect(isSoundModeOn).toBe(true);
  });

  test('should toggle review mode on and off', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.toggleReviewMode();
    const isReviewModeOn = await dodgedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

    await dodgedBarplotPage.toggleReviewMode();
    const isReviewModeOff = await dodgedBarplotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

    expect(isReviewModeOn).toBe(true);
    expect(isReviewModeOff).toBe(true);
  });

  test('should display X-axis Title', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.toggleXAxisTitle();

    const xAxisTitle = await dodgedBarplotPage.getXAxisTitle();
    expect(xAxisTitle).toContain(dodgedBarplotLayer?.axes?.x ?? '');
  });

  test('should display Y-Axis Title', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.toggleYAxisTitle();

    const yAxisTitle = await dodgedBarplotPage.getYAxisTitle();
    expect(yAxisTitle).toContain(dodgedBarplotLayer?.axes?.y ?? '');
  });

  test('should show help menu', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.showHelpMenu();
  });

  test('should be able to speed up', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.increaseSpeed();
    const speed = await dodgedBarplotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_UP);
  });

  test('should be able to slow down', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.decreaseSpeed();
    const speed = await dodgedBarplotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_DOWN);
  });

  test('should be able to reset speed', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.resetSpeed();
    const speed = await dodgedBarplotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_RESET);
  });

  test('should move from left to right', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await dodgedBarplotPage.moveToNextDataPoint();
    }

    const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move from right to left', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    for (let i = 0; i <= dataLength; i++) {
      await dodgedBarplotPage.moveToPreviousDataPoint();
    }

    const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();
    expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
  });

  test('should move to the first data point', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.moveToFirstDataPoint();
    const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();
    if (Array.isArray(dodgedBarplotLayer?.data) && dataLength > 0 && 'x' in dodgedBarplotLayer.data[0]) {
      expect(currentDataPoint).toContain((dodgedBarplotLayer.data[0] as { x: string }).x);
    } else {
      throw new Error('Invalid data format in dodgedBarplotLayer');
    }
  });

  test('should move to the last data point', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    await dodgedBarplotPage.moveToLastDataPoint();
    const currentDataPoint = await dodgedBarplotPage.getCurrentDataPointInfo();
    if (Array.isArray(dodgedBarplotLayer?.data) && dataLength > 0 && 'x' in dodgedBarplotLayer.data[0]) {
      expect(currentDataPoint).toContain((dodgedBarplotLayer.data[dataLength - 1] as { x: string }).x);
    } else {
      throw new Error('Invalid data format in dodgedBarplotLayer');
    }
  });

  test('should execute forward autoplay', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    let expectedDataPoint: string;
    if (Array.isArray(dodgedBarplotLayer.data) && dataLength > 0 && 'x' in dodgedBarplotLayer.data[0]) {
      expectedDataPoint = (dodgedBarplotLayer.data[dataLength - 1] as { x: string }).x;
    } else {
      throw new Error('Invalid data format in dodgedBarplotLayer');
    }

    await dodgedBarplotPage.startForwardAutoplay(
      expectedDataPoint,
    );
  });

  test('should execute backward autoplay', async ({ page }) => {
    const dodgedBarplotPage = await setupDodgedBarplotPage(page);

    let expectedDataPoint: string;
    if (Array.isArray(dodgedBarplotLayer.data) && dataLength > 0 && 'x' in dodgedBarplotLayer.data[0]) {
      expectedDataPoint = (dodgedBarplotLayer.data[0] as { x: string }).x;
    } else {
      throw new Error('Invalid data format in dodgedBarplotLayer');
    }

    await dodgedBarplotPage.moveToLastDataPoint();

    await dodgedBarplotPage.startReverseAutoplay(
      expectedDataPoint,
    );
  });
});

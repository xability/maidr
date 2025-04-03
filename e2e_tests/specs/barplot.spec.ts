import type { Maidr, MaidrLayer } from '../../src/type/maidr';
/**
 * E2E tests for Bar Plot functionality
 *
 * These tests verify that the bar plot renders correctly and that all
 * interactive features function as expected.
 */
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';

test.describe('Bar Plot', () => {
  let maidrData: Maidr; ;
  let barLayer: MaidrLayer;
  // let barPoints: BarPoint[];

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
      // barPoints = barLayer.data as BarPoint[];
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

  test('should load the barplot with maidr data', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);

    await barPlotPage.verifyPlotLoaded();
  });

  test('should activate maidr on click', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);

    await barPlotPage.activateMaidrOnClick();
  });

  test('should display instruction text', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    const instructionText = await barPlotPage.getInstructionText();

    expect(instructionText).toBe(TestConstants.BAR_INSTRUCTION_TEXT);
  });

  test('should toggle text mode on and off', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.toggleTextMode();
    const isTextModeTerse = await barPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

    await barPlotPage.toggleTextMode();
    const isTextModeOff = await barPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
    expect(isTextModeOff).toBe(true);

    await barPlotPage.toggleTextMode();
    const isTextModeVerbose = await barPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
    expect(isTextModeVerbose).toBe(true);

    expect(isTextModeTerse).toBe(true);
    expect(isTextModeVerbose).toBe(true);
    expect(isTextModeOff).toBe(true);
  });

  test('should toggle braille mode on and off', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.toggleBrailleMode();
    const isBrailleModeOn = await barPlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);

    await barPlotPage.toggleBrailleMode();
    const isBrailleModeOff = await barPlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);

    expect(isBrailleModeOff).toBe(true);
    expect(isBrailleModeOn).toBe(true);
  });

  test('should toggle sound mode on and off', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.toggleSonification();
    const isSoundModeOff = await barPlotPage.isSonificationActive(TestConstants.SOUND_ON);

    await barPlotPage.toggleSonification();
    const isSoundModeOn = await barPlotPage.isSonificationActive(TestConstants.SOUND_OFF);

    expect(isSoundModeOff).toBe(true);
    expect(isSoundModeOn).toBe(true);
  });

  test('should toggle review mode on and off', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.toggleReviewMode();
    const isReviewModeOn = await barPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_ON);

    await barPlotPage.toggleReviewMode();
    const isReviewModeOff = await barPlotPage.isReviewModeActive(TestConstants.REVIEW_MODE_OFF);

    expect(isReviewModeOn).toBe(true);
    expect(isReviewModeOff).toBe(true);
  });

  test('should display X-axis Title', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();
    await barPlotPage.toggleXAxisTitle();

    const xAxisTitle = await barPlotPage.getXAxisTitle();
    expect(xAxisTitle).toContain(barLayer?.axes?.x ?? '');
  });

  test('should display Y-Axis Title', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();
    await barPlotPage.toggleYAxisTitle();

    const yAxisTitle = await barPlotPage.getYAxisTitle();
    expect(yAxisTitle).toContain(barLayer?.axes?.y ?? '');
  });

  test('should show help menu', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.showHelpMenu();
  });

  test('should be able to speed up', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.increaseSpeed();
    const speed = await barPlotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_UP);
  });

  test('should be able to slow down', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.decreaseSpeed();
    const speed = await barPlotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_DOWN);
  });

  test('should be able to reset speed', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.resetSpeed();
    const speed = await barPlotPage.getSpeedToggleInfo();
    expect(speed).toEqual(TestConstants.SPEED_RESET);
  });
});

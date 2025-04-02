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
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.navigateToBarPlot();

    await context.close();
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
});

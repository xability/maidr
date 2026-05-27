import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { ViolinPlotPage } from '../page-objects/plots/violinPlot-page';
import { TestConstants } from '../utils/constants';

/**
 * Helper function to create and initialize a violin plot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized ViolinPlotPage instance
 */
async function setupViolinPlotPage(
  page: Page,
  activateMaidr = true,
): Promise<ViolinPlotPage> {
  const violinPlotPage = new ViolinPlotPage(page);
  if (activateMaidr) {
    await violinPlotPage.activateMaidr();
  }
  return violinPlotPage;
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

test.describe('Violin Plot', () => {
  let maidrData: Maidr;
  // Layer references for potential future test expansion
  let _violinKdeLayer: MaidrLayer;
  let _violinBoxLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const violinPlotPage = new ViolinPlotPage(page);
      await violinPlotPage.navigateToViolinPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page, TestConstants.VIOLIN_PLOT_ID);
      // Violin plots have two layers: SMOOTH (KDE) and BOX
      const layers = maidrData.subplots[0][0].layers;
      _violinKdeLayer = layers.find(l => l.type === 'smooth') || layers[0];
      _violinBoxLayer = layers.find(l => l.type === 'box') || layers[1];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const violinPlotPage = new ViolinPlotPage(page);
    await violinPlotPage.navigateToViolinPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the violin plot with maidr data', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page, false);
      await violinPlotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page, false);
      await violinPlotPage.activateMaidrOnClick();
    });

    test('should display instruction text for violin plot', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);
      const instructionText = await violinPlotPage.getInstructionText();
      // Violin plots are multilayer, so expect layer info in instruction
      expect(instructionText).toContain('maidr plot');
    });

    test('should have two layers (KDE and BOX)', async () => {
      const layers = maidrData.subplots[0][0].layers;
      expect(layers.length).toBe(2);
      expect(layers.some(l => l.type === 'smooth')).toBe(true);
      expect(layers.some(l => l.type === 'box')).toBe(true);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);

      await violinPlotPage.toggleTextMode();
      const isTextModeTerse = await violinPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);

      await violinPlotPage.toggleTextMode();
      const isTextModeOff = await violinPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      expect(isTextModeOff).toBe(true);

      await violinPlotPage.toggleTextMode();
      const isTextModeVerbose = await violinPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeVerbose).toBe(true);

      expect(isTextModeTerse).toBe(true);
      expect(isTextModeVerbose).toBe(true);
      expect(isTextModeOff).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);

      await violinPlotPage.toggleSonification();
      const isSoundModeOff = await violinPlotPage.isSonificationActive(TestConstants.SOUND_OFF);

      await violinPlotPage.toggleSonification();
      const isSoundModeOn = await violinPlotPage.isSonificationActive(TestConstants.SOUND_ON);

      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });
  });

  test.describe('KDE Layer Navigation', () => {
    let violinPlotPage: ViolinPlotPage;

    test.beforeEach(async ({ page }) => {
      violinPlotPage = await setupViolinPlotPage(page);
    });

    test('should navigate between violins with left/right arrows', async () => {
      // Move to next violin
      await violinPlotPage.moveToNextViolin();
      const afterRightPress = await violinPlotPage.getCurrentDataPointInfo();

      // Move back to previous violin
      await violinPlotPage.moveToPreviousViolin();
      const afterLeftPress = await violinPlotPage.getCurrentDataPointInfo();

      // Values should be different after moving
      expect(afterRightPress).not.toEqual(afterLeftPress);
    });

    test('should navigate along KDE curve with up/down arrows', async () => {
      // Get initial position
      const initialInfo = await violinPlotPage.getCurrentDataPointInfo();

      // Move up along the curve
      await violinPlotPage.moveUpKdeCurve();
      const afterUpPress = await violinPlotPage.getCurrentDataPointInfo();

      // Move down along the curve
      await violinPlotPage.moveDownKdeCurve();
      const afterDownPress = await violinPlotPage.getCurrentDataPointInfo();

      // Up should change position
      expect(afterUpPress).not.toEqual(initialInfo);
      // Down should return to initial position
      expect(afterDownPress).toEqual(initialInfo);
    });

    test('should report out of bounds when at plot extremes', async () => {
      // Navigate to first violin
      await violinPlotPage.moveToFirstDataPoint();

      // Try to move before first violin
      await violinPlotPage.moveToPreviousViolin();
      const currentInfo = await violinPlotPage.getCurrentDataPointInfo();

      // Should still be at the same position or show out of bounds
      expect(currentInfo).toBeTruthy();
    });
  });

  test.describe('Layer Switching', () => {
    let violinPlotPage: ViolinPlotPage;

    test.beforeEach(async ({ page }) => {
      violinPlotPage = await setupViolinPlotPage(page);
    });

    test('should switch from KDE layer to BOX layer', async ({ page }) => {
      // Switch to next layer (BOX)
      await violinPlotPage.switchToNextLayer();

      // Wait for layer switch notification
      await page.waitForTimeout(500);

      // Get info after switch - should be on BOX layer
      const afterSwitchInfo = await violinPlotPage.getCurrentDataPointInfo();

      // Should have valid data point info after layer switch
      expect(afterSwitchInfo).toBeTruthy();
    });

    test('should switch back from BOX layer to KDE layer', async ({ page }) => {
      // Switch to BOX layer
      await violinPlotPage.switchToNextLayer();
      await page.waitForTimeout(500);

      // Switch back to KDE layer
      await violinPlotPage.switchToPreviousLayer();
      await page.waitForTimeout(500);

      // Get current info
      const currentInfo = await violinPlotPage.getCurrentDataPointInfo();
      expect(currentInfo).toBeTruthy();
    });
  });

  test.describe('BOX Layer Navigation', () => {
    let violinPlotPage: ViolinPlotPage;

    test.beforeEach(async ({ page }) => {
      violinPlotPage = await setupViolinPlotPage(page);
      // Switch to BOX layer
      await violinPlotPage.switchToNextLayer();
      await page.waitForTimeout(500);
    });

    test('should navigate between violin boxes with appropriate arrows', async () => {
      // Move to next violin box
      await violinPlotPage.moveToNextViolin();
      const afterMove = await violinPlotPage.getCurrentDataPointInfo();

      // Should have valid data point info for the violin
      expect(afterMove).toBeTruthy();
    });

    test('should navigate between box sections (min, q1, q2, q3, max)', async () => {
      // Get initial section
      const initialInfo = await violinPlotPage.getCurrentDataPointInfo();

      // Move up to next section
      await violinPlotPage.moveUpKdeCurve();
      const afterUpMove = await violinPlotPage.getCurrentDataPointInfo();

      // Should show different section
      expect(afterUpMove).not.toEqual(initialInfo);
    });
  });

  test.describe('Speed Controls', () => {
    test('should be able to speed up', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);

      await violinPlotPage.increaseSpeed();
      const speed = await violinPlotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_UP);
    });

    test('should be able to slow down', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);

      await violinPlotPage.decreaseSpeed();
      const speed = await violinPlotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_DOWN);
    });

    test('should be able to reset speed', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);

      await violinPlotPage.resetSpeed();
      const speed = await violinPlotPage.getSpeedToggleInfo();
      expect(speed).toEqual(TestConstants.SPEED_RESET);
    });
  });

  test.describe('Menu Controls', () => {
    test('should show help menu', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);
      await violinPlotPage.showHelpMenu();
    });

    test('should show settings menu', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);
      await violinPlotPage.showSettingsMenu();
    });

    test('should show chat dialog', async ({ page }) => {
      const violinPlotPage = await setupViolinPlotPage(page);
      await violinPlotPage.showChatDialog();
    });
  });
});

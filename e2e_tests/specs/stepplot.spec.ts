import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer, StepPoint } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { StepPlotPage } from '../page-objects/plots/stepplot-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * Every braille cell MAIDR can emit lives in the Unicode braille block
 * (U+2800 to U+28FF), so a display carrying anything else is not braille
 * output. Written as escapes rather than literal glyphs because the range
 * endpoints are indistinguishable by eye: U+2800 is the blank cell.
 */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/**
 * Helper function to create and initialize a step plot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized StepPlotPage instance
 */
async function setupStepPlotPage(
  page: Page,
  activateMaidr = true,
): Promise<StepPlotPage> {
  const stepPlotPage = new StepPlotPage(page);
  if (activateMaidr) {
    await stepPlotPage.activateMaidr();
  }
  return stepPlotPage;
}

/**
 * Extracts the single step series from a step plot layer.
 *
 * Step data is nested exactly like line data — one inner array per series —
 * so the series, not the layer, is what the assertions index into.
 * @param layer - The MAIDR layer containing step plot data
 * @returns The points of the first (only) series
 * @throws Error if the data is not in the nested step format
 */
function getStepSeries(layer: MaidrLayer | undefined): StepPoint[] {
  if (!layer?.data || !Array.isArray(layer.data) || !Array.isArray(layer.data[0])) {
    throw new TypeError('Step layer data is not a nested array of points');
  }

  return layer.data[0] as StepPoint[];
}

/**
 * Reads one point of the step series, failing loudly rather than returning
 * `undefined` for an index the example does not have. The return type narrows
 * `label` to a string, since a hypnogram point without a level name has
 * nothing for these assertions to check.
 * @param series - The step series
 * @param index - Index of the point to read
 * @returns The point at that index, with its ordinal level name
 * @throws Error if the index is out of bounds or the point carries no level name
 */
function getStepPoint(series: StepPoint[], index: number): StepPoint & { label: string } {
  if (index < 0 || index >= series.length) {
    throw new Error(`Index ${index} is out of bounds for series length ${series.length}`);
  }

  const point = series[index];
  if (!point || point.label === undefined) {
    throw new Error(`Step point at index ${index} has no ordinal level name`);
  }

  return { ...point, label: point.label };
}

test.describe('Step Plot', () => {
  let maidrData: Maidr;
  let stepPlotLayer: MaidrLayer;
  let stepSeries: StepPoint[];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const stepPlotPage = new StepPlotPage(page);
      await stepPlotPage.navigateToStepPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);

      stepPlotLayer = maidrData.subplots[0][0].layers[0];
      stepSeries = getStepSeries(stepPlotLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const stepPlotPage = new StepPlotPage(page);
    await stepPlotPage.navigateToStepPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the stepplot with maidr data', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.activateMaidrOnClick();
    });

    test('should declare the layer as a step plot', () => {
      expect(stepPlotLayer.type).toBe(TestConstants.STEPPLOT_ID);
    });

    test('should display instruction text naming a step plot', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      const instructionText = await stepPlotPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.STEPPLOT_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.toggleTextMode();
      const isTextModeTerse = await stepPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);
      await stepPlotPage.toggleTextMode();
      const isTextModeOff = await stepPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      await stepPlotPage.toggleTextMode();
      const isTextModeVerbose = await stepPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeTerse).toBe(true);
      expect(isTextModeOff).toBe(true);
      expect(isTextModeVerbose).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.toggleBrailleMode();
      const isBrailleModeOn = await stepPlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);
      await stepPlotPage.toggleBrailleMode();
      const isBrailleModeOff = await stepPlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);
      expect(isBrailleModeOn).toBe(true);
      expect(isBrailleModeOff).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.toggleSonification();
      const isSoundModeOff = await stepPlotPage.isSonificationActive(TestConstants.SOUND_OFF);
      await stepPlotPage.toggleSonification();
      const isSoundModeOn = await stepPlotPage.isSonificationActive(TestConstants.SOUND_ON);
      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille cell per data point', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToNextDataPoint();
      await stepPlotPage.toggleBrailleMode();

      const braille = await stepPlotPage.getBrailleContent();

      expect(braille).not.toBe('');
      expect(braille).toMatch(BRAILLE_CELL);
      expect([...braille]).toHaveLength(stepSeries.length);
    });
  });

  test.describe('Ordinal Level Announcements', () => {
    test('should announce the level name rather than its numeric code', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToNextDataPoint();

      const first = getStepPoint(stepSeries, 0);
      const announcement = normalizeText(await stepPlotPage.getCurrentDataPointInfo());

      // The cross-axis value is the last thing announced for a step point, so
      // the tail is exactly where the level name has to replace the code.
      expect(announcement.endsWith(first.label)).toBe(true);
      expect(announcement.endsWith(String(first.y))).toBe(false);
    });

    test('should announce the new level name after a transition', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToNextDataPoint();
      await stepPlotPage.moveToNextDataPoint();

      const second = getStepPoint(stepSeries, 1);
      const announcement = normalizeText(await stepPlotPage.getCurrentDataPointInfo());

      expect(announcement).toContain(second.label);
      expect(announcement.endsWith(second.label)).toBe(true);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.toggleXAxisTitle();
      const xAxisTitle = await stepPlotPage.getXAxisTitle();
      expect(xAxisTitle).toContain(stepPlotLayer?.axes?.x?.label ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.toggleYAxisTitle();
      const yAxisTitle = await stepPlotPage.getYAxisTitle();
      expect(yAxisTitle).toContain(stepPlotLayer?.axes?.y?.label ?? '');
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      for (let i = 0; i <= stepSeries.length; i++) {
        await stepPlotPage.moveToNextDataPoint();
      }
      const currentDataPoint = await stepPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move from right to left', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      for (let i = 0; i <= stepSeries.length; i++) {
        await stepPlotPage.moveToPreviousDataPoint();
      }
      const currentDataPoint = await stepPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first data point', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToFirstDataPoint();

      const first = getStepPoint(stepSeries, 0);
      const announcement = normalizeText(await stepPlotPage.getCurrentDataPointInfo());

      expect(announcement).toContain(String(first.x));
      expect(announcement).toContain(first.label);
    });

    test('should move to the last data point', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToLastDataPoint();

      const last = getStepPoint(stepSeries, stepSeries.length - 1);
      const announcement = normalizeText(await stepPlotPage.getCurrentDataPointInfo());

      expect(announcement).toContain(String(last.x));
      expect(announcement).toContain(last.label);
    });

    test('should not be able to move up', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToNextDataPoint();
      await stepPlotPage.moveToDataPointAbove();
      const currentDataPoint = await stepPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should not be able to move down', async ({ page }) => {
      const stepPlotPage = await setupStepPlotPage(page);
      await stepPlotPage.moveToNextDataPoint();
      await stepPlotPage.moveToDataPointBelow();
      const currentDataPoint = await stepPlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });
  });
});

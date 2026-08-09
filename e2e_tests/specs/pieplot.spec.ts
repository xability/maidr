import type { Page } from '@playwright/test';
import type { Maidr, MaidrLayer, PiePoint } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { PiePlotPage } from '../page-objects/plots/pie-page';
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
 * The label the slice's share of the whole is announced under. Verbose text
 * renders the optional third value as `<label> is <value>`, so this is the
 * literal a screen reader hears immediately before the percentage.
 */
const PERCENTAGE_LABEL = 'Percentage';

/**
 * Helper function to create and initialize a pie plot page
 * @param page - The Playwright page
 * @param activateMaidr - Whether to activate MAIDR
 * @returns Initialized PiePlotPage instance
 */
async function setupPiePlotPage(
  page: Page,
  activateMaidr = true,
): Promise<PiePlotPage> {
  const piePlotPage = new PiePlotPage(page);
  if (activateMaidr) {
    await piePlotPage.activateMaidr();
  }
  return piePlotPage;
}

/**
 * Extracts the slices from a pie plot layer.
 *
 * A pie layer is flat — one entry per slice, never the nested per-series array
 * the bar and line families use — so a nested payload is rejected here rather
 * than left to fail as an unhelpful `undefined` several assertions later.
 * @param layer - The MAIDR layer containing pie plot data
 * @returns The slices, in the order they are drawn
 * @throws Error if the data is not a flat array of points
 */
function getPieSlices(layer: MaidrLayer | undefined): PiePoint[] {
  if (!layer?.data || !Array.isArray(layer.data)) {
    throw new TypeError('Pie layer data is undefined');
  }

  if (Array.isArray(layer.data[0])) {
    throw new TypeError('Pie layer data is nested; a pie layer carries a flat PiePoint[]');
  }

  return layer.data as PiePoint[];
}

/**
 * Reads one slice, failing loudly rather than returning `undefined` for an
 * index the example does not have.
 * @param slices - The pie's slices
 * @param index - Index of the slice to read
 * @returns The slice at that index
 * @throws Error if the index is out of bounds
 */
function getPieSlice(slices: PiePoint[], index: number): PiePoint {
  if (index < 0 || index >= slices.length) {
    throw new Error(`Index ${index} is out of bounds for ${slices.length} slices`);
  }

  return slices[index];
}

/**
 * Derives the share a slice should be announced as.
 *
 * Recomputed here from the values on the wire, deliberately: the percentage is
 * not a field a producer sends, it is derived once in the model, and the point
 * of the assertion is that what the user hears agrees with the numbers it is
 * supposedly derived from. Reading an authored percentage back out of the
 * schema would assert nothing at all.
 * @param slices - The pie's slices
 * @param index - Index of the slice whose share is wanted
 * @returns The share as display text, e.g. `25.0%`
 */
function expectedPercentage(slices: PiePoint[], index: number): string {
  const total = slices.reduce((sum, slice) => sum + slice.y, 0);
  return `${((getPieSlice(slices, index).y / total) * 100).toFixed(1)}%`;
}

test.describe('Pie Plot', () => {
  let maidrData: Maidr;
  let pieLayer: MaidrLayer;
  let slices: PiePoint[];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const piePlotPage = new PiePlotPage(page);
      await piePlotPage.navigateToPiePlot();
      await page.waitForSelector(`svg#${TestConstants.PIE_ID}`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);

      pieLayer = maidrData.subplots[0][0].layers[0];
      slices = getPieSlices(pieLayer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const piePlotPage = new PiePlotPage(page);
    await piePlotPage.navigateToPiePlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the pie plot with maidr data', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page, false);
      await piePlotPage.verifyPlotLoaded();
    });

    test('should activate maidr on click', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page, false);
      await piePlotPage.activateMaidrOnClick();
    });

    test('should declare the layer as a pie', () => {
      expect(pieLayer.type).toBe(TestConstants.PIE_ID);
    });

    test('should carry no authored percentage on the wire', () => {
      // There is exactly one source of truth for a slice's share, and it is the
      // model. A producer that shipped its own percentage could disagree with
      // the values beside it, and nothing downstream could tell which was
      // right — so the field must not exist here in the first place.
      for (const slice of slices) {
        expect('percentage' in slice).toBe(false);
      }
    });

    test('should display instruction text naming a pie', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      const instructionText = await piePlotPage.getInstructionText();
      expect(instructionText).toBe(TestConstants.PIE_INSTRUCTION_TEXT);
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.toggleTextMode();
      const isTextModeTerse = await piePlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);
      await piePlotPage.toggleTextMode();
      const isTextModeOff = await piePlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      await piePlotPage.toggleTextMode();
      const isTextModeVerbose = await piePlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);
      expect(isTextModeTerse).toBe(true);
      expect(isTextModeOff).toBe(true);
      expect(isTextModeVerbose).toBe(true);
    });

    test('should toggle braille mode on and off', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.toggleBrailleMode();
      const isBrailleModeOn = await piePlotPage.isBrailleModeActive(TestConstants.BRAILLE_ON);
      await piePlotPage.toggleBrailleMode();
      const isBrailleModeOff = await piePlotPage.isBrailleModeActive(TestConstants.BRAILLE_OFF);
      expect(isBrailleModeOn).toBe(true);
      expect(isBrailleModeOff).toBe(true);
    });

    test('should toggle sound mode on and off', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.toggleSonification();
      const isSoundModeOff = await piePlotPage.isSonificationActive(TestConstants.SOUND_OFF);
      await piePlotPage.toggleSonification();
      const isSoundModeOn = await piePlotPage.isSonificationActive(TestConstants.SOUND_ON);
      expect(isSoundModeOff).toBe(true);
      expect(isSoundModeOn).toBe(true);
    });
  });

  test.describe('Slice Announcements', () => {
    test('should announce the slice label, its value and its share', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToNextDataPoint();

      const first = getPieSlice(slices, 0);
      const announcement = normalizeText(await piePlotPage.getCurrentDataPointInfo());

      expect(announcement).toContain(String(first.x));
      expect(announcement).toContain(String(first.y));
      // The share is the one thing a pie announces that no other trace does.
      // Asserted with its label attached, because the bare number reaching the
      // announcement by some other route would satisfy a `toContain` on the
      // percentage alone.
      expect(announcement).toContain(`${PERCENTAGE_LABEL} is ${expectedPercentage(slices, 0)}`);
    });

    test('should announce each slice with its own share while navigating', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);

      for (let index = 0; index < slices.length; index++) {
        await piePlotPage.moveToNextDataPoint();

        const slice = getPieSlice(slices, index);
        const announcement = normalizeText(await piePlotPage.getCurrentDataPointInfo());

        expect(announcement).toContain(String(slice.x));
        expect(announcement).toContain(
          `${PERCENTAGE_LABEL} is ${expectedPercentage(slices, index)}`,
        );
      }
    });

    test('should never announce a share of NaN', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToNextDataPoint();

      const announcement = await piePlotPage.getCurrentDataPointInfo();

      // `0 / 0` is the shape this guards: a total that never divides cleanly
      // must still report a share, and "NaN percent" is the one thing a slice
      // must never be announced as.
      expect(announcement).not.toContain('NaN');
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille cell per slice', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToNextDataPoint();
      await piePlotPage.toggleBrailleMode();

      const braille = await piePlotPage.getBrailleContent();

      expect(braille).not.toBe('');
      expect(braille).toMatch(BRAILLE_CELL);
      expect([...braille]).toHaveLength(slices.length);
    });
  });

  test.describe('Axis Controls', () => {
    test('should display X-axis Title', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.toggleXAxisTitle();
      const xAxisTitle = await piePlotPage.getXAxisTitle();
      expect(xAxisTitle).toContain(pieLayer?.axes?.x?.label ?? '');
    });

    test('should display Y-Axis Title', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.toggleYAxisTitle();
      const yAxisTitle = await piePlotPage.getYAxisTitle();
      expect(yAxisTitle).toContain(pieLayer?.axes?.y?.label ?? '');
    });
  });

  test.describe('Navigation Controls', () => {
    test('should move from left to right', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      for (let i = 0; i <= slices.length; i++) {
        await piePlotPage.moveToNextDataPoint();
      }
      const currentDataPoint = await piePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move from right to left', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      for (let i = 0; i <= slices.length; i++) {
        await piePlotPage.moveToPreviousDataPoint();
      }
      const currentDataPoint = await piePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should move to the first slice', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToFirstDataPoint();

      const first = getPieSlice(slices, 0);
      const announcement = normalizeText(await piePlotPage.getCurrentDataPointInfo());

      expect(announcement).toContain(String(first.x));
      expect(announcement).toContain(`${PERCENTAGE_LABEL} is ${expectedPercentage(slices, 0)}`);
    });

    test('should move to the last slice', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToLastDataPoint();

      const lastIndex = slices.length - 1;
      const last = getPieSlice(slices, lastIndex);
      const announcement = normalizeText(await piePlotPage.getCurrentDataPointInfo());

      expect(announcement).toContain(String(last.x));
      expect(announcement).toContain(
        `${PERCENTAGE_LABEL} is ${expectedPercentage(slices, lastIndex)}`,
      );
    });

    // A pie is one row of slices, so the vertical axis has nowhere to go. Both
    // directions are checked: a trace that reported the wrong number of rows
    // would still refuse one of them, and only the pair pins the single row.
    test('should not be able to move up', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToNextDataPoint();
      await piePlotPage.moveToDataPointAbove();
      const currentDataPoint = await piePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });

    test('should not be able to move down', async ({ page }) => {
      const piePlotPage = await setupPiePlotPage(page);
      await piePlotPage.moveToNextDataPoint();
      await piePlotPage.moveToDataPointBelow();
      const currentDataPoint = await piePlotPage.getCurrentDataPointInfo();
      expect(currentDataPoint).toEqual(TestConstants.PLOT_EXTREME_VERIFICATION);
    });
  });
});

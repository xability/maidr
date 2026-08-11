import type { LinePoint, Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { AreaPlotPage } from '../page-objects/plots/area-page';
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
 * Extracts one band's points from the stacked area layer.
 *
 * Area data is nested exactly like line data — one inner array per series —
 * so the series, not the layer, is what the assertions index into.
 * @param layer - The MAIDR layer containing the area data
 * @param index - Zero-based index of the band to read
 * @returns The points of that band
 * @throws TypeError if the data is not in the nested per-series format
 */
function getBand(layer: MaidrLayer | undefined, index: number): LinePoint[] {
  if (!layer?.data || !Array.isArray(layer.data) || !Array.isArray(layer.data[0])) {
    throw new TypeError('Area layer data is not a nested array of points');
  }

  return layer.data[index] as LinePoint[];
}

/**
 * Counts the bands a layer carries.
 *
 * `MaidrLayer.data` is a union that includes `HeatmapData`, an object with no
 * length, so the nested-array shape has to be established before counting
 * rather than assumed.
 * @param layer - The MAIDR layer containing the area data
 * @returns The number of bands
 * @throws TypeError if the data is not in the nested per-series format
 */
function bandCount(layer: MaidrLayer | undefined): number {
  if (!layer?.data || !Array.isArray(layer.data)) {
    throw new TypeError('Area layer data is not a nested array of points');
  }

  return layer.data.length;
}

test.describe('Stacked Area Plot', () => {
  let maidrData: Maidr;
  let areaLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const areaPlotPage = new AreaPlotPage(page);
      await areaPlotPage.navigateToAreaPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
      areaLayer = maidrData.subplots[0][0].layers[0];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const areaPlotPage = new AreaPlotPage(page);
    await areaPlotPage.navigateToAreaPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the area plot with maidr data', async ({ page }) => {
      const areaPlotPage = new AreaPlotPage(page);
      await areaPlotPage.activateMaidr();
      await areaPlotPage.verifyPlotLoaded();
    });

    test('should declare the layer as a stacked area plot', () => {
      expect(areaLayer.type).toBe('stacked_area');
    });

    test('should carry one nested series per band', () => {
      expect(Array.isArray(areaLayer.data)).toBe(true);
      expect(areaLayer.data).toHaveLength(2);
      expect(getBand(areaLayer, 0)).toHaveLength(5);
      expect(getBand(areaLayer, 1)).toHaveLength(5);
    });

    test('should carry each band own value, not the running total', () => {
      // The distinction this trace type exists for. The upper band's third
      // point is drawn at a height of 100 because the stack reaches 100 there,
      // but the value it carries is that band's own 70.
      expect(getBand(areaLayer, 1)[2].y).toBe(70);
    });

    test('should announce itself as a stacked area plot', async ({ page }) => {
      // A line reading was the bug: the user was told "single line" for a
      // chart drawing two magnitudes per sample.
      const areaPlotPage = new AreaPlotPage(page);
      await areaPlotPage.activateMaidr();

      const instructionText = await areaPlotPage.getInstructionText();
      expect(normalizeText(instructionText)).toBe(
        normalizeText(TestConstants.AREAPLOT_INSTRUCTION_TEXT),
      );
    });
  });

  test.describe('Mode Controls', () => {
    test('should toggle text mode on and off', async ({ page }) => {
      const areaPlotPage = new AreaPlotPage(page);
      await areaPlotPage.activateMaidr();

      await areaPlotPage.toggleTextMode();
      const isTerse = await areaPlotPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE);
      await areaPlotPage.toggleTextMode();
      const isOff = await areaPlotPage.isTextModeActive(TestConstants.TEXT_MODE_OFF);
      await areaPlotPage.toggleTextMode();
      const isVerbose = await areaPlotPage.isTextModeActive(TestConstants.TEXT_MODE_VERBOSE);

      expect(isTerse).toBe(true);
      expect(isOff).toBe(true);
      expect(isVerbose).toBe(true);
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille line per band, one cell per point', async ({ page }) => {
      const areaPlotPage = new AreaPlotPage(page);
      await areaPlotPage.activateMaidr();
      await areaPlotPage.moveToNextDataPoint();
      await areaPlotPage.toggleBrailleMode();

      const braille = await areaPlotPage.getBrailleContent();
      // A multi-series trace drives a multi-line display: one row per band, so
      // a reader can feel the bands against each other rather than one at a
      // time. Splitting is what makes the per-band assertion below possible —
      // and the reason a whole-string match against the braille block fails,
      // since the separator is a newline and not a braille cell.
      const lines = braille.split('\n');

      expect(lines).toHaveLength(bandCount(areaLayer));
      for (const line of lines) {
        expect(line).toMatch(BRAILLE_CELL);
        expect(line).toHaveLength(getBand(areaLayer, 0).length);
      }
    });
  });

  test.describe('Announcements', () => {
    test('should announce the running total alongside the band value', async ({ page }) => {
      // The whole point of the trace type: verbose mode has to name both
      // magnitudes, so the reader is never left guessing which one they heard.
      const areaPlotPage = new AreaPlotPage(page);
      await areaPlotPage.activateMaidr();
      await areaPlotPage.moveToNextDataPoint();

      const announcement = normalizeText(await areaPlotPage.getInstructionText());

      // First point of the first band: value 10, stack total 15.
      expect(announcement).toContain('10');
      expect(announcement).toContain('Total');
      expect(announcement).toContain('15');
    });
  });
});

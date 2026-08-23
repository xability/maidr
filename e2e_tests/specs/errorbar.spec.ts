import type { ErrorBarPoint, Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { ErrorBarPlotPage } from '../page-objects/plots/errorbar-page';
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
 * Reads the layer's points, failing loudly rather than returning undefined for
 * a shape the example does not have.
 * @param layer - The MAIDR layer carrying the interval data
 * @returns The layer's points
 * @throws TypeError if the data is not a flat array of interval points
 */
function getPoints(layer: MaidrLayer | undefined): ErrorBarPoint[] {
  if (!layer?.data || !Array.isArray(layer.data) || Array.isArray(layer.data[0])) {
    throw new TypeError('Error bar layer data is not a flat array of points');
  }

  return layer.data as ErrorBarPoint[];
}

test.describe('Error Bar Plot', () => {
  let maidrData: Maidr;
  let errorBarLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const errorBarPage = new ErrorBarPlotPage(page);
      await errorBarPage.navigateToErrorBarPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
      errorBarLayer = maidrData.subplots[0][0].layers[0];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const errorBarPage = new ErrorBarPlotPage(page);
    await errorBarPage.navigateToErrorBarPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the error bar plot with maidr data', async ({ page }) => {
      const errorBarPage = new ErrorBarPlotPage(page);
      await errorBarPage.activateMaidr();
      await errorBarPage.verifyPlotLoaded();
    });

    test('should declare the layer as an error bar plot', () => {
      expect(errorBarLayer.type).toBe('error_bar');
    });

    test('should carry a bound pair with every estimate', () => {
      const points = getPoints(errorBarLayer);

      expect(points).toHaveLength(3);
      for (const point of points) {
        // The estimate is optional on the shape since #1047, because a band
        // may draw only bounds. This chart is not one -- it draws all three,
        // and asserting so is what makes the two comparisons below mean
        // something rather than compare against `undefined`.
        expect(typeof point.y).toBe('number');
        expect(typeof point.yMin).toBe('number');
        expect(typeof point.yMax).toBe('number');
        expect(point.yMin!).toBeLessThan(point.y!);
        expect(point.y!).toBeLessThan(point.yMax!);
      }
    });

    test('should carry the bounds as absolute positions, not offsets', () => {
      // The distinction the schema fixes: matplotlib hands out an offset,
      // Vega-Lite computes bounds, and a reader told "0.4" instead of "4.6"
      // is being given a number the chart does not draw anywhere.
      const first = getPoints(errorBarLayer)[0];

      expect(first.yMin).toBe(3.8);
      expect(first.yMax).toBe(4.6);
    });

    test('should announce itself as an error bar plot', async ({ page }) => {
      const errorBarPage = new ErrorBarPlotPage(page);
      await errorBarPage.activateMaidr();

      const instructionText = await errorBarPage.getInstructionText();
      expect(normalizeText(instructionText)).toBe(
        normalizeText(TestConstants.ERRORBAR_INSTRUCTION_TEXT),
      );
    });
  });

  test.describe('Interval Navigation', () => {
    test('should walk the bounds and the estimate at one sample', async ({ page }) => {
      // The motion this trace type exists for: up and down at one x trace a
      // single interval, rather than making the reader rebuild it from three
      // separate passes over the chart.
      const errorBarPage = new ErrorBarPlotPage(page);
      await errorBarPage.activateMaidr();
      await errorBarPage.moveToNextDataPoint();

      const atEntry = normalizeText(await errorBarPage.getInstructionText());
      await errorBarPage.moveToDataPointBelow();
      const below = normalizeText(await errorBarPage.getInstructionText());
      await errorBarPage.moveToDataPointAbove();
      await errorBarPage.moveToDataPointAbove();
      const above = normalizeText(await errorBarPage.getInstructionText());

      // Each of the three names which magnitude it is, so the numbers can
      // never be mistaken for three separate samples.
      expect(atEntry).toContain('value');
      expect(below).toContain('lower bound');
      expect(above).toContain('upper bound');
    });

    test('should announce the sample alongside the magnitude', async ({ page }) => {
      const errorBarPage = new ErrorBarPlotPage(page);
      await errorBarPage.activateMaidr();
      await errorBarPage.moveToNextDataPoint();

      const announcement = normalizeText(await errorBarPage.getInstructionText());

      expect(announcement).toContain('control');
      expect(announcement).toContain('4.2');
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille row per magnitude', async ({ page }) => {
      const errorBarPage = new ErrorBarPlotPage(page);
      await errorBarPage.activateMaidr();
      await errorBarPage.moveToNextDataPoint();
      await errorBarPage.toggleBrailleMode();

      const braille = await errorBarPage.getBrailleContent();
      const lines = braille.split('\n');

      // Lower bounds, estimates, upper bounds — one row each, one cell per
      // sample.
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(line).toMatch(BRAILLE_CELL);
        expect(line).toHaveLength(getPoints(errorBarLayer).length);
      }
    });
  });
});

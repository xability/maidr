import type { GaugePoint, Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { GaugePlotPage } from '../page-objects/plots/gauge-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * Every braille cell MAIDR can emit lives in the Unicode braille block
 * (U+2800 to U+28FF), so a display carrying anything else is not braille
 * output.
 */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/**
 * Reads the layer's measure, failing loudly rather than returning undefined
 * for a shape the example does not have.
 * @param layer - The MAIDR layer carrying the measure
 * @returns The layer's single measure
 * @throws TypeError if the data is not a single gauge object
 */
function getMeasure(layer: MaidrLayer | undefined): GaugePoint {
  if (!layer?.data || Array.isArray(layer.data)) {
    throw new TypeError('Gauge layer data is not a single measure object');
  }

  return layer.data as GaugePoint;
}

test.describe('Gauge', () => {
  let maidrData: Maidr;
  let gaugeLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const gaugePage = new GaugePlotPage(page);
      await gaugePage.navigateToGaugePlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
      gaugeLayer = maidrData.subplots[0][0].layers[0];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const gaugePage = new GaugePlotPage(page);
    await gaugePage.navigateToGaugePlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the gauge with maidr data', async ({ page }) => {
      const gaugePage = new GaugePlotPage(page);
      await gaugePage.activateMaidr();
      await gaugePage.verifyPlotLoaded();
    });

    test('should declare the layer as a gauge', () => {
      expect(gaugeLayer.type).toBe('gauge');
    });

    test('should carry a single measure, not an array', () => {
      // The chart draws exactly one measure. An array of one would describe a
      // shape the chart does not have, which is why the schema takes an object
      // here as it does for a heatmap.
      expect(Array.isArray(gaugeLayer.data)).toBe(false);

      const measure = getMeasure(gaugeLayer);
      expect(measure.value).toBe(73);
      expect(measure.target).toBe(80);
    });

    test('should place the value inside a band and short of the target', () => {
      // The fixture only proves anything if the value is neither on a band
      // edge nor equal to the target: either would let a wrong reading look
      // right.
      const measure = getMeasure(gaugeLayer);

      expect(measure.value).toBeLessThan(Number(measure.target));
      expect(measure.bands?.map(band => band.to)).not.toContain(measure.value);
    });

    test('should announce itself as a gauge', async ({ page }) => {
      const gaugePage = new GaugePlotPage(page);
      await gaugePage.activateMaidr();

      const instructionText = await gaugePage.getInstructionText();
      expect(normalizeText(instructionText)).toBe(
        normalizeText(TestConstants.GAUGE_INSTRUCTION_TEXT),
      );
    });
  });

  test.describe('Relational Announcement', () => {
    test('should announce the range and target alongside the value', async ({ page }) => {
      // The reason this is a trace type rather than a number on a page: a
      // sighted reader takes the scale, the band and the target from the
      // dial's geometry, and none of it is written anywhere.
      const gaugePage = new GaugePlotPage(page);
      await gaugePage.activateMaidr();
      await gaugePage.moveToNextDataPoint();

      const announcement = normalizeText(await gaugePage.getInstructionText());

      expect(announcement).toContain('73');
      expect(announcement).toContain('100');
      expect(announcement).toContain('80');
      expect(announcement).toContain('ok');
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render a single braille cell', async ({ page }) => {
      const gaugePage = new GaugePlotPage(page);
      await gaugePage.activateMaidr();
      await gaugePage.moveToNextDataPoint();
      await gaugePage.toggleBrailleMode();

      const braille = await gaugePage.getBrailleContent();

      expect(braille.split('\n')).toHaveLength(1);
      expect(braille).toMatch(BRAILLE_CELL);
      expect(braille).toHaveLength(1);
    });
  });
});

import type { DumbbellData, Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { DumbbellPlotPage } from '../page-objects/plots/dumbbell-page';
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
 * Reads the layer's pairs, failing loudly rather than returning undefined for
 * a shape the example does not have.
 * @param layer - The MAIDR layer carrying the pairs
 * @returns The layer's dumbbell data
 * @throws TypeError if the data is not a single dumbbell object
 */
function getPairs(layer: MaidrLayer | undefined): DumbbellData {
  if (!layer?.data || Array.isArray(layer.data)) {
    throw new TypeError('Dumbbell layer data is not a single object');
  }

  return layer.data as DumbbellData;
}

test.describe('Dumbbell', () => {
  let maidrData: Maidr;
  let dumbbellLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const dumbbellPage = new DumbbellPlotPage(page);
      await dumbbellPage.navigateToDumbbellPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
      dumbbellLayer = maidrData.subplots[0][0].layers[0];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const dumbbellPage = new DumbbellPlotPage(page);
    await dumbbellPage.navigateToDumbbellPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the dumbbell with maidr data', async ({ page }) => {
      const dumbbellPage = new DumbbellPlotPage(page);
      await dumbbellPage.activateMaidr();
      await dumbbellPage.verifyPlotLoaded();
    });

    test('should declare the layer as a dumbbell', () => {
      expect(dumbbellLayer.type).toBe('dumbbell');
    });

    test('should carry both directions and an unchanged pair', () => {
      // The fixture only proves anything if it holds all three cases the
      // announcement distinguishes. A chart where everything rose would let a
      // reading that ignored direction look right.
      const { points } = getPairs(dumbbellLayer);
      const changes = points.map(point => Number(point.end) - Number(point.start));

      expect(changes.some(change => change > 0)).toBe(true);
      expect(changes.some(change => change < 0)).toBe(true);
      expect(changes.includes(0)).toBe(true);
    });

    test('should announce itself as a dumbbell', async ({ page }) => {
      const dumbbellPage = new DumbbellPlotPage(page);
      await dumbbellPage.activateMaidr();

      const instructionText = await dumbbellPage.getInstructionText();
      expect(normalizeText(instructionText)).toBe(
        normalizeText(TestConstants.DUMBBELL_INSTRUCTION_TEXT),
      );
    });
  });

  test.describe('The Change Is The Message', () => {
    test('should announce the change alongside the end under the cursor', async ({ page }) => {
      // The reason this is a trace type. Without the change, a reader has to
      // hold one number, navigate to the other and subtract by ear, on every
      // row of the chart.
      const dumbbellPage = new DumbbellPlotPage(page);
      await dumbbellPage.activateMaidr();
      await dumbbellPage.moveToNextDataPoint();

      const announcement = normalizeText(await dumbbellPage.getInstructionText());

      expect(announcement).toContain('Denmark');
      // The chart's own name for the end, not "start".
      expect(announcement).toContain('1990');
      expect(announcement).toContain('71.2');
      expect(announcement).toContain('Increase is 7.2');
    });

    test('should name a decline as a decrease', async ({ page }) => {
      const dumbbellPage = new DumbbellPlotPage(page);
      await dumbbellPage.activateMaidr();
      await dumbbellPage.moveToNextDataPoint();
      await dumbbellPage.moveToNextDataPoint();

      const announcement = normalizeText(await dumbbellPage.getInstructionText());

      expect(announcement).toContain('Latvia');
      expect(announcement).toContain('Decrease is 5.1');
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille row per end', async ({ page }) => {
      const dumbbellPage = new DumbbellPlotPage(page);
      await dumbbellPage.activateMaidr();
      await dumbbellPage.moveToNextDataPoint();
      await dumbbellPage.toggleBrailleMode();

      const braille = await dumbbellPage.getBrailleContent();
      const rows = braille.split('\n');

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatch(BRAILLE_CELL);
        expect(row).toHaveLength(getPairs(dumbbellLayer).points.length);
      }
    });
  });
});

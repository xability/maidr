import type { Maidr, MaidrLayer, WaterfallPoint } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { WaterfallPlotPage } from '../page-objects/plots/waterfall-page';
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
 * Reads the layer's steps, failing loudly rather than returning undefined for
 * a shape the example does not have.
 * @param layer - The MAIDR layer carrying the waterfall steps
 * @returns The layer's steps
 * @throws TypeError if the data is not a flat array of waterfall steps
 */
function getSteps(layer: MaidrLayer | undefined): WaterfallPoint[] {
  if (!layer?.data || !Array.isArray(layer.data) || Array.isArray(layer.data[0])) {
    throw new TypeError('Waterfall layer data is not a flat array of steps');
  }

  return layer.data as WaterfallPoint[];
}

test.describe('Waterfall Plot', () => {
  let maidrData: Maidr;
  let waterfallLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const waterfallPage = new WaterfallPlotPage(page);
      await waterfallPage.navigateToWaterfallPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
      waterfallLayer = maidrData.subplots[0][0].layers[0];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const waterfallPage = new WaterfallPlotPage(page);
    await waterfallPage.navigateToWaterfallPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the waterfall plot with maidr data', async ({ page }) => {
      const waterfallPage = new WaterfallPlotPage(page);
      await waterfallPage.activateMaidr();
      await waterfallPage.verifyPlotLoaded();
    });

    test('should declare the layer as a waterfall plot', () => {
      expect(waterfallLayer.type).toBe('waterfall');
    });

    test('should carry a contribution and a running total on every step', () => {
      const steps = getSteps(waterfallLayer);

      expect(steps).toHaveLength(5);
      for (const step of steps) {
        expect(typeof step.delta).toBe('number');
        expect(typeof step.end).toBe('number');
        expect(['increase', 'decrease', 'total']).toContain(step.kind);
      }
    });

    test('should keep the running totals consistent with the contributions', () => {
      // The chart's own arithmetic. A fixture whose deltas do not carry each
      // running total to the next is not a waterfall, and would let a wrong
      // reading of either field look correct.
      const steps = getSteps(waterfallLayer).filter(step => step.kind !== 'total');

      for (const step of steps) {
        expect(step.end - step.start).toBeCloseTo(step.delta, 6);
      }
    });

    test('should announce itself as a waterfall plot', async ({ page }) => {
      const waterfallPage = new WaterfallPlotPage(page);
      await waterfallPage.activateMaidr();

      const instructionText = await waterfallPage.getInstructionText();
      expect(normalizeText(instructionText)).toBe(
        normalizeText(TestConstants.WATERFALL_INSTRUCTION_TEXT),
      );
    });
  });

  test.describe('Step Navigation', () => {
    test('should announce the contribution and the running total together', async ({ page }) => {
      // The reason this trace type exists: a step announced only as "down 250"
      // leaves the reader summing deltas in their head to know where they are,
      // and one announced only as "950" never says what moved it.
      const waterfallPage = new WaterfallPlotPage(page);
      await waterfallPage.activateMaidr();
      await waterfallPage.moveToNextDataPoint();
      await waterfallPage.moveToNextDataPoint();

      const announcement = normalizeText(await waterfallPage.getInstructionText());

      expect(announcement).toContain('Marketing');
      expect(announcement).toContain('250');
      expect(announcement).toContain('950');
    });

    test('should name which way a step moved', async ({ page }) => {
      const waterfallPage = new WaterfallPlotPage(page);
      await waterfallPage.activateMaidr();
      await waterfallPage.moveToNextDataPoint();
      await waterfallPage.moveToNextDataPoint();
      const decrease = normalizeText(await waterfallPage.getInstructionText());

      await waterfallPage.moveToNextDataPoint();
      const increase = normalizeText(await waterfallPage.getInstructionText());

      expect(decrease).toContain('decrease');
      expect(increase).toContain('increase');
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille row of contributions', async ({ page }) => {
      const waterfallPage = new WaterfallPlotPage(page);
      await waterfallPage.activateMaidr();
      await waterfallPage.moveToNextDataPoint();
      await waterfallPage.toggleBrailleMode();

      const braille = await waterfallPage.getBrailleContent();
      const lines = braille.split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(BRAILLE_CELL);
      expect(lines[0]).toHaveLength(getSteps(waterfallLayer).length);
    });
  });
});

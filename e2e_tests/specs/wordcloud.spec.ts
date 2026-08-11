import type { Maidr, MaidrLayer, WordCloudPoint } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { WordCloudPlotPage } from '../page-objects/plots/wordcloud-page';
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
 * Reads the layer's terms, failing loudly rather than returning undefined for
 * a shape the example does not have.
 * @param layer - The MAIDR layer carrying the terms
 * @returns The layer's terms, in the order the document draws them
 * @throws TypeError if the data is not a flat array of terms
 */
function getTerms(layer: MaidrLayer | undefined): WordCloudPoint[] {
  if (!layer?.data || !Array.isArray(layer.data) || Array.isArray(layer.data[0])) {
    throw new TypeError('Word cloud layer data is not a flat array of terms');
  }

  return layer.data as WordCloudPoint[];
}

test.describe('Word Cloud', () => {
  let maidrData: Maidr;
  let wordCloudLayer: MaidrLayer;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const wordCloudPage = new WordCloudPlotPage(page);
      await wordCloudPage.navigateToWordCloudPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
      wordCloudLayer = maidrData.subplots[0][0].layers[0];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to extract MAIDR data:', errorMessage);
      throw error;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const wordCloudPage = new WordCloudPlotPage(page);
    await wordCloudPage.navigateToWordCloudPlot();
  });

  test.describe('Basic Plot Functionality', () => {
    test('should load the word cloud with maidr data', async ({ page }) => {
      const wordCloudPage = new WordCloudPlotPage(page);
      await wordCloudPage.activateMaidr();
      await wordCloudPage.verifyPlotLoaded();
    });

    test('should declare the layer as a word cloud', () => {
      expect(wordCloudLayer.type).toBe('word_cloud');
    });

    test('should author the terms in packing order, not weight order', () => {
      // The fixture only proves anything if the two orders differ: a cloud
      // authored heaviest-first would pass every assertion below even with the
      // sort removed entirely.
      const authored = getTerms(wordCloudLayer).map(term => term.x);
      const byWeight = [...getTerms(wordCloudLayer)]
        .sort((a, b) => Number(b.y) - Number(a.y))
        .map(term => term.x);

      expect(authored).not.toEqual(byWeight);
    });

    test('should announce itself as a word cloud', async ({ page }) => {
      const wordCloudPage = new WordCloudPlotPage(page);
      await wordCloudPage.activateMaidr();

      const instructionText = await wordCloudPage.getInstructionText();
      expect(normalizeText(instructionText)).toBe(
        normalizeText(TestConstants.WORDCLOUD_INSTRUCTION_TEXT),
      );
    });
  });

  test.describe('Weight-Ordered Navigation', () => {
    test('should walk the terms heaviest first', async ({ page }) => {
      const wordCloudPage = new WordCloudPlotPage(page);
      await wordCloudPage.activateMaidr();
      await wordCloudPage.moveToNextDataPoint();

      const first = normalizeText(await wordCloudPage.getInstructionText());
      await wordCloudPage.moveToNextDataPoint();
      const second = normalizeText(await wordCloudPage.getInstructionText());

      // `machine` is the SECOND element in the document and the heaviest term.
      expect(first).toContain('machine');
      expect(first).toContain('412');
      expect(second).toContain('tensor');
    });
  });

  test.describe('Highlight', () => {
    test('should highlight the glyph it just announced', async ({ page }) => {
      // The assertion the whole design turns on, and the one no model-level
      // test can make. MAIDR highlights by inserting a clone of the drawn
      // element, so the clone's text is the term actually lit up on screen.
      // Sorting the terms without permuting the resolved elements would
      // announce `machine` while highlighting `neural`, which is drawn first —
      // and text, audio and braille would all still be correct.
      const wordCloudPage = new WordCloudPlotPage(page);
      await wordCloudPage.activateMaidr();
      await wordCloudPage.moveToNextDataPoint();

      const announcement = normalizeText(await wordCloudPage.getInstructionText());
      expect(announcement).toContain('machine');

      const highlighted = page.locator('[id^="maidr-highlight"]').first();
      await expect(highlighted).toHaveText('machine');
    });
  });

  test.describe('Braille Output', () => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    test('should render one braille row of weights', async ({ page }) => {
      const wordCloudPage = new WordCloudPlotPage(page);
      await wordCloudPage.activateMaidr();
      await wordCloudPage.moveToNextDataPoint();
      await wordCloudPage.toggleBrailleMode();

      const braille = await wordCloudPage.getBrailleContent();
      const lines = braille.split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(BRAILLE_CELL);
      expect(lines[0]).toHaveLength(getTerms(wordCloudLayer).length);
    });
  });
});

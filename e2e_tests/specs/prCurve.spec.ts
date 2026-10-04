import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * Every braille cell MAIDR can emit lives in the Unicode braille block
 * (U+2800 to U+28FF), so a display carrying anything else is not braille
 * output.
 */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class PrCurvePage extends BasePage {
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    svg: `svg`,
    braille: `textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /** Navigates to the precision-recall curve example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/pr-curve.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'pr-classifiers');
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }

  /**
   * Reads the current contents of the braille display.
   * @returns The braille content, whitespace trimmed
   */
  public async getBrailleContent(): Promise<string> {
    const textarea = await this.waitForElement(this.selectors.braille);
    return (await textarea.inputValue()).trim();
  }
}

test.describe('Precision-recall curve', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new PrCurvePage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new PrCurvePage(page).navigateToPlot();
  });

  test('should declare the layer as a precision-recall curve', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('pr_curve');
  });

  test('should carry one curve per classifier, each declaring its prevalence', () => {
    const layer = maidrData.subplots[0][0].layers[0];
    const curves = layer.data as { x: number; y: number; prevalence?: number }[][];

    expect(curves).toHaveLength(2);
    for (const curve of curves) {
      expect(curve[0]).toMatchObject({ x: 1, prevalence: 0.3 });
      expect(curve[curve.length - 1]).toMatchObject({ x: 0, y: 1 });
    }
  });

  test('should announce itself as a precision-recall curve rather than a line', async ({ page }) => {
    const plot = new PrCurvePage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('precision-recall');
    expect(instruction).not.toContain('multiline');
  });

  test('should announce the threshold and the height above the baseline with the rates', async ({ page }) => {
    const plot = new PrCurvePage(page);
    await plot.activateMaidr();
    // The first keypress establishes the entry position at the loosest
    // threshold; the second reaches the next one.
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Recall');
    expect(announcement).toContain('0.9');
    expect(announcement).toContain('Precision');
    expect(announcement).toContain('0.5');
    expect(announcement).toContain('Threshold');
    expect(announcement).toContain('0.2');
    expect(announcement).toContain('Above baseline');
  });

  test('should move to the other classifier with the down arrow', async ({ page }) => {
    // The forest has no point at a recall of 0.9; the move lands on its
    // nearest point below the cursor.
    const plot = new PrCurvePage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Random forest');
    expect(announcement).toContain('0.4');
  });

  test('should announce both classifiers at the point they share', async ({ page }) => {
    // Both curves were scored on one test set, so at the loosest threshold
    // both sit at a recall of 1 and the prevalence.
    const plot = new PrCurvePage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Logistic regression');
    expect(announcement).toContain('Random forest');
  });

  test('should render one braille row per classifier', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type.
    const plot = new PrCurvePage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });
});

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
class RocCurvePage extends BasePage {
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

  /** Navigates to the ROC curve example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/roc.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'roc-classifiers');
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

test.describe('ROC curve', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new RocCurvePage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new RocCurvePage(page).navigateToPlot();
  });

  test('should declare the layer as a roc curve', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('roc');
  });

  test('should carry one curve per classifier, each from (0, 0) to (1, 1)', () => {
    const layer = maidrData.subplots[0][0].layers[0];
    const curves = layer.data as { x: number; y: number }[][];

    expect(curves).toHaveLength(2);
    for (const curve of curves) {
      expect(curve[0]).toMatchObject({ x: 0, y: 0 });
      expect(curve[curve.length - 1]).toMatchObject({ x: 1, y: 1 });
    }
  });

  test('should announce itself as a roc curve rather than a line', async ({ page }) => {
    const plot = new RocCurvePage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('roc');
    expect(instruction).not.toContain('multiline');
  });

  test('should announce the threshold and the height above chance with the rates', async ({ page }) => {
    // The threshold is the one number a reader can act on, and the height
    // above the diagonal is what a sighted reader takes in at a glance.
    const plot = new RocCurvePage(page);
    await plot.activateMaidr();
    // The first keypress establishes the entry position at (0, 0); the
    // second reaches the first real operating point.
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('False positive rate');
    expect(announcement).toContain('0.05');
    expect(announcement).toContain('0.55');
    expect(announcement).toContain('Threshold');
    expect(announcement).toContain('0.8');
    expect(announcement).toContain('Above chance');
    expect(announcement).toContain('0.5');
  });

  test('should render one braille row per classifier', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new RocCurvePage(page);
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

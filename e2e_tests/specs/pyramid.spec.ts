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
class PyramidPlotPage extends BasePage {
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

  /** Navigates to the population pyramid example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/pyramid.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'pyramid-population');
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

test.describe('Population pyramid', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new PyramidPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new PyramidPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a diverging bar', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('diverging_bar');
  });

  test('should carry the left-hand side signed, as the chart draws it', () => {
    // A horizontal bar layer carries its value on `x` and its category on
    // `y`, which is the pair `toBarValue` reads.
    const sides = maidrData.subplots[0][0].layers[0].data as { x: number; y: string }[][];

    expect(sides).toHaveLength(2);
    expect(sides[0].every(point => point.x < 0)).toBe(true);
    expect(sides[1].every(point => point.x > 0)).toBe(true);
  });

  test('should announce a left-hand bar by size and side, not by a minus sign', async ({ page }) => {
    // Pitched and announced as a signed value, the biggest bar on the left is
    // the lowest note and the smallest number in the chart.
    const plot = new PyramidPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Men');
    expect(announcement).toContain('1200');
    expect(announcement).not.toContain('-1200');
  });

  test('should render one braille row per side plus the balance', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new PyramidPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });
});

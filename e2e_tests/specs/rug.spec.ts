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
class RugPlotPage extends BasePage {
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

  /** Navigates to the rug plot example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/rug.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'rug-latency');
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
   * @returns The braille content, trailing newline removed
   */
  public async getBrailleContent(): Promise<string> {
    const textarea = await this.waitForElement(this.selectors.braille);
    return (await textarea.inputValue()).replace(/\n$/, '');
  }
}

test.describe('Rug plot', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new RugPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new RugPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a rug', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('rug');
  });

  test('should announce itself as a vertical rug', async ({ page }) => {
    // The type is what tells a reader that the pitch is the position on the
    // axis; announced as a point plot, the same chart would leave them
    // wondering why the pitch moves with x.
    const plot = new RugPlotPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('type: vertical rug');
    expect(instruction).not.toContain('type: point');
  });

  test('should walk the observations from the lowest position up', async ({ page }) => {
    // The example lists 2.2 first; the lowest observation is 1.2, and it is
    // the first one, so the first step lands there and says so.
    const plot = new RugPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Seconds');
    expect(announcement).toContain('1.2');
    expect(announcement).toContain('1 of 12');
  });

  test('should render the observation count per bin as one braille row', async ({ page }) => {
    // The braille surface the scatter reading never had (#1132): four bins
    // of 2.5 seconds over the declared axis, so four cells.
    const plot = new RugPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const braille = await plot.getBrailleContent();

    expect(braille).toMatch(BRAILLE_CELL);
    expect(braille).toHaveLength(4);
  });
});

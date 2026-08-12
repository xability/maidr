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
class FunnelPlotPage extends BasePage {
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

  /** Navigates to the funnel example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/funnel.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'funnel-checkout');
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
    // Only the trailing newline is stripped, not the whitespace before it: a
    // lane with nothing booked renders as an empty row, and trimming would
    // delete it and leave the reader's line count one short of the chart's.
    return (await textarea.inputValue()).replace(/\n$/, '');
  }
}

test.describe('Funnel', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new FunnelPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new FunnelPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a funnel', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('funnel');
  });

  test('should carry the stages in the order they are walked', () => {
    const stages = maidrData.subplots[0][0].layers[0].data as { x: string; y: number }[];

    expect(stages.map(stage => stage.x))
      .toEqual(['Visited', 'Signed up', 'Viewed cart', 'Purchased']);
  });

  test('should announce the retention alongside the count', async ({ page }) => {
    // The drop-off is what the chart is read for, and it is a ratio a
    // listener cannot take from two heights heard one at a time.
    const plot = new FunnelPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Signed up');
    expect(announcement).toContain('2400');
    expect(announcement).toContain('24.0%');
  });

  test('should claim no retention on the entry stage', async ({ page }) => {
    // Nothing converted into it, so "100% retained" would report a
    // conversion the chart never claimed, and "Entered is 10000, 100.0% of
    // it" would say the same number twice.
    const plot = new FunnelPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('10000');
    expect(announcement).not.toContain('100.0%');
    expect(announcement).not.toContain('Retained');
  });

  test('should render one braille row of stage counts', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new FunnelPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const braille = await plot.getBrailleContent();

    expect(braille).toMatch(BRAILLE_CELL);
    expect(braille).toHaveLength(4);
  });
});

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
class DotPlotPage extends BasePage {
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

  /** Navigates to the dot plot example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/dot.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'dot-response');
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

test.describe('Dot plot', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new DotPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new DotPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a dot plot', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('dot');
  });

  test('should announce itself as a dot plot rather than a bar', async ({ page }) => {
    // The whole point of the type. Sharing BarTrace must not mean the chart
    // tells a reader it is a bar chart.
    const plot = new DotPlotPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('dot');
    expect(instruction).not.toContain('bar');
  });

  test('should tell the reader the chart is drawn horizontally', async ({ page }) => {
    // `IS_ORIENTED` reaches exactly one string: the "horizontal"/"vertical"
    // prefix `Context.getInstruction()` puts on the activation announcement.
    // The per-point announcement does NOT test it -- `BarTrace` reads
    // `layer.orientation` off the JSON directly, so main and cross swap
    // whatever `IS_ORIENTED` says. An earlier version of this test asserted
    // the per-point text and passed with `IS_ORIENTED[DOT]` set to `false`,
    // which made it a test of nothing while reading like the opposite.
    //
    // So this reads the announcement before navigating anywhere.
    const plot = new DotPlotPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText())).toContain('horizontal');
  });

  test('should read the categories down the page, not across it', async ({ page }) => {
    // The arrangement a Cleveland dot plot is almost always drawn in: the
    // endpoint is the category and the milliseconds are the value, and a
    // layer that swapped them would name one where the other belongs.
    const plot = new DotPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('/search');
    expect(announcement).toContain('412');
    expect(announcement).toContain('Endpoint');
    expect(announcement).toContain('Milliseconds');
  });

  test('should render one braille row of values', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new DotPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const braille = await plot.getBrailleContent();

    expect(braille).toMatch(BRAILLE_CELL);
    expect(braille).toHaveLength(4);
  });
});

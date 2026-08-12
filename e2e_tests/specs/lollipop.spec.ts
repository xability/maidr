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
class LollipopPlotPage extends BasePage {
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

  /** Navigates to the lollipop example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/lollipop.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'lollipop-life');
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

test.describe('Lollipop', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new LollipopPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new LollipopPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a lollipop', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('lollipop');
  });

  test('should announce itself as a lollipop rather than a bar', async ({ page }) => {
    // The whole point of the type. Sharing BarTrace must not mean the chart
    // tells a reader it is a bar chart.
    const plot = new LollipopPlotPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('lollipop');
    expect(instruction).not.toContain('bar');
  });

  test('should tell the reader the chart is drawn horizontally', async ({ page }) => {
    // `IS_ORIENTED` reaches exactly one string: the "horizontal"/"vertical"
    // prefix on the activation announcement. The per-point text does not test
    // it -- `BarTrace` reads `layer.orientation` off the JSON directly -- so
    // this reads the announcement before navigating anywhere.
    const plot = new LollipopPlotPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText())).toContain('horizontal');
  });

  test('should announce the country and its value', async ({ page }) => {
    const plot = new LollipopPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Norway');
    expect(announcement).toContain('84');
  });

  test('should render one braille row of values', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new LollipopPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const braille = await plot.getBrailleContent();

    expect(braille).toMatch(BRAILLE_CELL);
    expect(braille).toHaveLength(5);
  });
});

import type { BoxenPoint, Maidr } from '../../src/type/grammar';
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
class BoxenPlotPage extends BasePage {
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

  /** Navigates to the letter-value example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/boxen.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'boxen-response');
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

test.describe('Letter-value plot', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new BoxenPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new BoxenPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a boxen', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('boxen');
  });

  test('should carry ladders of different depth', () => {
    // The whole reason this is not a box plot: a library adds rungs as the
    // sample grows, so depth is a fact about the data.
    const groups = maidrData.subplots[0][0].layers[0].data as BoxenPoint[];

    expect(groups).toHaveLength(2);
    expect(groups[0].levels.length).not.toBe(groups[1].levels.length);
  });

  test('should announce a rung by the percentile it is', async ({ page }) => {
    // "the 12.5th percentile" is a number a reader can place; "level 3" is
    // one they have to count back from.
    const plot = new BoxenPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('percentile');
    expect(announcement).toContain('control');
  });

  test('should walk the ladder in value order', async ({ page }) => {
    // Left to right has to move monotonically through the distribution, or
    // the pitch stops meaning "further out".
    const plot = new BoxenPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    const first = normalizeText(await plot.getInstructionText());
    await plot.moveToNextDataPoint();
    const second = normalizeText(await plot.getInstructionText());

    expect(first).toContain('6.25th percentile');
    expect(second).toContain('12.5th percentile');
  });

  test('should render one braille row per distribution', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new BoxenPlotPage(page);
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

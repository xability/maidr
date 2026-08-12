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
class BumpPlotPage extends BasePage {
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

  /** Navigates to the bump chart example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/bump.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'bump-league');
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

test.describe('Bump chart', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new BumpPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new BumpPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a bump chart', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('bump');
  });

  test('should carry one line per competitor over the same rounds', () => {
    const layer = maidrData.subplots[0][0].layers[0];
    const teams = layer.data as { x: string; y: number }[][];

    expect(teams).toHaveLength(4);
    for (const team of teams) {
      expect(team.map(point => point.x)).toEqual(['R1', 'R2', 'R3', 'R4']);
    }
  });

  test('should announce itself as a bump chart rather than a line', async ({ page }) => {
    const plot = new BumpPlotPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText())).toContain('bump');
  });

  test('should announce the places moved alongside the rank', async ({ page }) => {
    // The overtake is what the chart is drawn for, and it is not recoverable
    // from hearing a sequence of ranks one at a time.
    const plot = new BumpPlotPage(page);
    await plot.activateMaidr();
    // The first keypress establishes the entry position on R1, which has no
    // previous round and so reports no move -- the second reaches R2, where
    // Ash has dropped a place.
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('R2');
    expect(announcement).toContain('Places lost is 1');
  });

  test('should render one braille row per competitor', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new BumpPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
      expect(row).toHaveLength(4);
    }
  });
});

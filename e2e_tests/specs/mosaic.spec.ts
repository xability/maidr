import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class MosaicPlotPage extends BasePage {
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

  /** Navigates to the mosaic example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/mosaic.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'mosaic-survival');
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

test.describe('Mosaic plot', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new MosaicPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new MosaicPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a mosaic', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('mosaic');
  });

  test('should carry a width that disagrees with the height', () => {
    // The whole point of the type. `First` has the best survival rate and the
    // smallest share; a reading that gave only the heights would report the
    // same table for a ship of six first-class passengers and one of six
    // hundred.
    const series = maidrData.subplots[0][0].layers[0].data as {
      x: string;
      y: number;
      width?: number;
    }[][];
    const survived = series[0];
    const first = survived.find(cell => cell.x === 'First');
    const third = survived.find(cell => cell.x === 'Third');

    expect(first?.y).toBeGreaterThan(Number(third?.y));
    expect(first?.width).toBeLessThan(Number(third?.width));
  });

  test('should announce the column share as its own fact', async ({ page }) => {
    // Asserted as the whole sentence rather than as a substring. A `toContain`
    // on the percentage was true of the earlier, fused reading too --
    // "15.0% of all Proportion is 0.62" contains it and says the proportion
    // *is* the share, which is the ambiguity this trace exists to remove.
    const plot = new MosaicPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toBe(
      'Class is First, Proportion is 0.62, Outcome is Survived, '
      + 'Share of all is 15.0%, Count is 203',
    );
  });

  test('should render one braille row per series plus the total', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new MosaicPlotPage(page);
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

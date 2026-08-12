import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class ForestPlotPage extends BasePage {
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

  /** Navigates to the forest example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/forest.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'forest-intervention');
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

test.describe('Forest plot', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new ForestPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new ForestPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a forest plot', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('forest');
  });

  test('should declare the null rather than leave it to be guessed', () => {
    // Guessed at 0, every odds ratio reads as not crossing, since they are
    // all positive -- a confident wrong answer on every row of the figure.
    const layer = maidrData.subplots[0][0].layers[0];

    expect(layer.forestOptions?.nullValue).toBe(1);
  });

  test('should read the studies down the page, not across them', async ({ page }) => {
    // `IS_ORIENTED` reaches exactly one string: the "horizontal"/"vertical"
    // prefix on the activation announcement. The per-point text does not test
    // it, so this reads the announcement before navigating anywhere.
    const plot = new ForestPlotPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText())).toContain('horizontal');
  });

  test('should say whether a study crosses the null, and what it weighs', async ({ page }) => {
    // The two facts a forest plot is scanned for, neither of which an error
    // bar's reading carries.
    const plot = new ForestPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Silva 2018');
    // Entirely below 1, so it does not cross -- the case a reading that only
    // checked the upper bound would get backwards.
    expect(announcement).toContain('does not cross the null');
    expect(announcement).toContain('12.0%');
  });

  test('should render one braille row per section of the interval', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new ForestPlotPage(page);
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

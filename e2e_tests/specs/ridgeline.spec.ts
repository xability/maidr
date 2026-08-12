import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * A braille row is cells, and may carry spaces where a curve is flat against
 * the chart's floor.
 */
const BRAILLE_ROW = /^[\u2800-\u28FF ]+$/;
/** At least one real cell, so a blank display is not mistaken for output. */
const BRAILLE_CELL_ANYWHERE = /[\u2801-\u28FF]/;

/** The example's own page, driven through the shared base helpers. */
class RidgelinePlotPage extends BasePage {
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

  /** Navigates to the ridgeline example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/ridgeline.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'ridgeline-delivery');
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

test.describe('Ridgeline', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new RidgelinePlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new RidgelinePlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a ridgeline', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('ridgeline');
  });

  test('should carry no baseline offset in the data', async () => {
    // The offset is drawn, not measured. A layer that carried it would
    // announce a cohort's days shifted by wherever its curve was placed --
    // the one number a reader has no way to correct for.
    const groups = maidrData.subplots[0][0].layers[0].data as { y: number }[][];

    expect(groups).toHaveLength(3);
    // Every cohort's days sit on the same axis, overlapping as the chart
    // draws them overlapping. Offsets would separate them into disjoint runs.
    const lows = groups.map(row => Math.min(...row.map(point => point.y)));
    const highs = groups.map(row => Math.max(...row.map(point => point.y)));

    expect(lows[1]).toBeLessThan(highs[0]);
    expect(lows[2]).toBeLessThan(highs[1]);
  });

  test('should announce the cohort, the day and the density', async ({ page }) => {
    const plot = new RidgelinePlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('2019');
    expect(announcement).toContain('Days');
  });

  test('should stay on the same day when it moves between cohorts', async ({ page }) => {
    // The comparison the chart exists for, and the one a listener cannot make
    // by holding a number across a dozen groups. The cohorts are sampled on
    // different grids, so a move by index would land on a different day and
    // say nothing about it.
    const plot = new RidgelinePlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const dayOf = (text: string): string => {
      const match = /Days is ([\d.-]+)/.exec(text);
      return match === null ? '' : match[1];
    };

    const before = dayOf(normalizeText(await plot.getInstructionText()));
    expect(before).not.toBe('');

    await plot.moveToDataPointAbove();
    await plot.moveToDataPointBelow();

    expect(dayOf(normalizeText(await plot.getInstructionText()))).toBe(before);
  });

  test('should render one braille row per cohort', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new RidgelinePlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_ROW);
      expect(row).toMatch(BRAILLE_CELL_ANYWHERE);
    }
  });
});

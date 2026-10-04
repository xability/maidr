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
class PercentileBandPage extends BasePage {
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

  /** Navigates to the percentile band example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/percentile-band.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'percentile-band');
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

test.describe('Percentile band', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new PercentileBandPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new PercentileBandPage(page).navigateToPlot();
  });

  test('should declare the layer as a percentile band', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('percentile_band');
  });

  test('should carry nine quantiles at every step', () => {
    const layer = maidrData.subplots[0][0].layers[0];
    const points = layer.data as { x: number; quantiles: { level: number; value: number }[] }[];

    expect(points).toHaveLength(8);
    for (const point of points) {
      expect(point.quantiles.map(q => q.level)).toEqual(
        [0, 0.0668, 0.1587, 0.3085, 0.5, 0.6915, 0.8413, 0.9332, 1],
      );
    }
  });

  test('should announce itself as a percentile band rather than a multiline', async ({ page }) => {
    const plot = new PercentileBandPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('percentile band');
    expect(instruction).not.toContain('multiline');
  });

  test('should enter on the median and announce the band around it', async ({ page }) => {
    const plot = new PercentileBandPage(page);
    await plot.activateMaidr();
    // The first keypress establishes the entry position on the first step's
    // median; the second reaches step 100.
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Step is 100');
    expect(announcement).toContain('Median Weight is 0.02');
    expect(announcement).toContain('Middle 68% is -0.31 to 0.35');
  });

  test('should step out to the next quantile with the up arrow', async ({ page }) => {
    const plot = new PercentileBandPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointAbove();
    await plot.moveToDataPointAbove();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('84.1th percentile Weight is 0.35');
    expect(announcement).toContain('Median is 0.02');
    expect(announcement).toContain('Middle 68% is -0.31 to 0.35');
  });

  test('should render the braille display', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new PercentileBandPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });
});

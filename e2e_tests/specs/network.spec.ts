import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class NetworkPage extends BasePage {
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

  /** Navigates to the network example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/network.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'network-collab');
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

test.describe('Network diagram', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new NetworkPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new NetworkPage(page).navigateToPlot();
  });

  test('should declare the layer as a network', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('network');
  });

  test('should carry no position, because a force layout has none to mean', () => {
    // The schema has no x or y to be tempted by: where a node lands is a fact
    // about the solver's seed, and a field that existed would be announced.
    const declared = maidrData.subplots[0][0].layers[0]
      .data as unknown as Record<string, unknown>[];

    expect(declared).toHaveLength(10);
    for (const link of declared) {
      expect(Object.keys(link).sort()).toEqual(['source', 'target']);
    }
  });

  test('should enter on the hub and announce its degree', async ({ page }) => {
    // The hub is the finding this chart is usually drawn for, so the walk
    // starts there rather than wherever the producer listed first.
    const plot = new NetworkPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Ada');
    expect(announcement).toContain('Links');
  });

  test('should reach the other group with the arrows', async ({ page }) => {
    // The guarantee that matters: following links from Ada never reaches Tim,
    // so an arrow that followed links would strand a third of this chart.
    const plot = new NetworkPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointAbove();

    expect(normalizeText(await plot.getInstructionText())).toContain('2 of 2');
  });

  test('should walk this group most connected first', async ({ page }) => {
    const plot = new NetworkPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    // Grace has three links; Edsger and Barbara have one each.
    expect(normalizeText(await plot.getInstructionText())).toContain('Grace');
  });

  test('should render one braille row per group', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new NetworkPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });

  test('should announce itself as a network', async ({ page }) => {
    const plot = new NetworkPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText()).toLowerCase())
      .toContain('network');
  });
});

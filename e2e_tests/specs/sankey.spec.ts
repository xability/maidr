import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class SankeyPage extends BasePage {
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

  /** Navigates to the sankey example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/sankey.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'sankey-energy');
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

test.describe('Sankey diagram', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new SankeyPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new SankeyPage(page).navigateToPlot();
  });

  test('should declare the layer as a sankey', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('sankey');
  });

  test('should declare flows and no node list, since a flow names both ends', () => {
    const flows = maidrData.subplots[0][0].layers[0].data as {
      source: string;
      target: string;
      value: number;
    }[];

    expect(flows).toHaveLength(8);
    for (const flow of flows) {
      expect(typeof flow.source).toBe('string');
      expect(typeof flow.target).toBe('string');
      expect(flow.value).toBeGreaterThan(0);
    }
  });

  test('should follow the widest ribbon, not the first one authored', async ({ page }) => {
    // Coal's flows are declared smallest first in the example, so a trace that
    // took the first authored edge would land on Losses.
    const plot = new SankeyPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('Coal');

    await plot.moveToNextDataPoint();
    const downstream = normalizeText(await plot.getInstructionText());

    expect(downstream).toContain('Electricity');
    expect(downstream).not.toContain('Losses');
  });

  test('should announce the ribbon it travelled, not only where it landed', async ({ page }) => {
    // The whole content of the step: which flow was taken, how big it is, and
    // what share of the source it carries.
    const plot = new SankeyPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Coal to Electricity');
    expect(announcement).toContain('34');
    expect(announcement).toContain('60.7%');
  });

  test('should walk the column with up and down', async ({ page }) => {
    const plot = new SankeyPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    // Gas is the other source, stacked under Coal in the same column.
    expect(normalizeText(await plot.getInstructionText())).toContain('Gas');
  });

  test('should refuse to go further downstream from a sink', async ({ page }) => {
    const plot = new SankeyPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('Homes');

    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText()).toLowerCase())
      .toContain('no more data');
  });

  test('should render one braille row per stage', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new SankeyPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });

  test('should announce itself as a sankey', async ({ page }) => {
    const plot = new SankeyPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText()).toLowerCase())
      .toContain('sankey');
  });
});

import type { HexbinPoint, Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * A braille row of a sparse lattice: cells from the Unicode braille block
 * (U+2800 to U+28FF), and spaces where a bin held nothing.
 *
 * The heatmap encoding this reuses renders an empty cell as a space, and on a
 * hexbin that is most of the margin around the cloud -- so a row of pure
 * braille would be the wrong assertion, not a stricter one.
 */
const BRAILLE_ROW = /^[\u2800-\u28FF ]+$/;

/** At least one real cell, so an all-space row is not mistaken for output. */
const BRAILLE_CELL_ANYWHERE = /[\u2800-\u28FF]/;

/** The example's own page, driven through the shared base helpers. */
class HexbinPlotPage extends BasePage {
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

  /** Navigates to the hexbin example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/hexbin.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'hexbin-density');
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

test.describe('Hexbin', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new HexbinPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new HexbinPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a hexbin', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('hexbin');
  });

  test('should carry a staggered lattice', () => {
    // The offset is the whole difficulty: alternate rows sit half a cell
    // across, which is what lets the hexagons tessellate.
    const rows = maidrData.subplots[0][0].layers[0].data as HexbinPoint[][];

    expect(Number(rows[1][0].x) - Number(rows[0][0].x)).toBeCloseTo(0.5);
    expect(rows[0].length).not.toBe(rows[1].length);
  });

  test('should announce a bin by its centre and count', async ({ page }) => {
    // On a staggered lattice a column index is not a location, so it is not
    // what the announcement gives.
    const plot = new HexbinPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Count');
    expect(announcement).not.toContain('column');
  });

  test('should keep a vertical walk over the same x', async ({ page }) => {
    // Two rows up and two rows back down has to return to where it started.
    // Choosing the nearer bin relative to the one being left would drift
    // half a cell per row and announce a real bin with a real count the
    // whole way, so nothing but this check would notice.
    const plot = new HexbinPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    const start = normalizeText(await plot.getInstructionText());

    await plot.moveToDataPointAbove();
    await plot.moveToDataPointAbove();
    await plot.moveToDataPointBelow();
    await plot.moveToDataPointBelow();

    expect(normalizeText(await plot.getInstructionText())).toBe(start);
  });

  test('should render one braille row per lattice row', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new HexbinPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    // Five lattice rows, and every one of them real braille rather than the
    // blank an unregistered encoder leaves behind. Spaces are admitted
    // alongside the cells: an empty bin has no density to encode, and the
    // heatmap encoding this reuses renders one as a space -- which on a
    // hexbin is most of the margin around the cloud.
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_ROW);
      expect(row).toMatch(BRAILLE_CELL_ANYWHERE);
    }
  });
});

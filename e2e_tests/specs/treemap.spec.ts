import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class TreemapPage extends BasePage {
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

  /** Navigates to the treemap example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/treemap.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'treemap-population');
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

test.describe('Treemap', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new TreemapPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new TreemapPage(page).navigateToPlot();
  });

  test('should declare the layer as a treemap', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('treemap');
  });

  test('should declare only the leaves, leaving the tree to the paths', () => {
    // A treemap draws its leaves, so this is the ordinary shape rather than a
    // degenerate one. The three continents exist only in the paths.
    const nodes = maidrData.subplots[0][0].layers[0].data as {
      x: string;
      path?: string[];
    }[];

    expect(nodes).toHaveLength(10);
    expect(nodes.map(node => node.x)).not.toContain('Asia');
    for (const node of nodes) {
      expect(node.path).toHaveLength(1);
    }
  });

  test('should enter on a derived node and name its share and children', async ({ page }) => {
    // Asia is in no declared point: it exists because ten leaves named it as
    // an ancestor, and its total is theirs. A reader who could only reach the
    // ten countries has been given a list, which is the reading this trace
    // exists to replace.
    const plot = new TreemapPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Asia');
    expect(announcement).toContain('Children');
  });

  test('should go down into a child and up back to its parent', async ({ page }) => {
    const plot = new TreemapPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    const child = normalizeText(await plot.getInstructionText());

    expect(child).toContain('China');
    // The comparison the rectangles are drawn to support, and the one a
    // sighted reader estimates worst.
    expect(child).toContain('Share of Asia');

    await plot.moveToDataPointAbove();

    expect(normalizeText(await plot.getInstructionText())).toContain('Asia');
  });

  test('should stop at the last sibling rather than step into a cousin', async ({ page }) => {
    // Japan is the last of Asia's four children and sits immediately before
    // Nigeria in the address space. On a flat grid, walking right from Japan
    // lands in Africa and announces it as though it followed Japan.
    const plot = new TreemapPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();
    // China, then three steps to the last of Asia's four children.
    for (let step = 0; step < 3; step++) {
      await plot.moveToNextDataPoint();
    }

    expect(normalizeText(await plot.getInstructionText())).toContain('Japan');

    await plot.moveToNextDataPoint();
    const past = normalizeText(await plot.getInstructionText());

    // The step is refused outright rather than landing anywhere. Nigeria is
    // the next entry of this level and the wrong answer, but so is any other
    // name: the point is that the walk ends where the parent does.
    expect(past).not.toContain('Nigeria');
    expect(past.toLowerCase()).toContain('no more data');
  });

  test('should render one braille row per level', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new TreemapPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });

  test('should announce itself as a treemap', async ({ page }) => {
    const plot = new TreemapPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText()).toLowerCase())
      .toContain('treemap');
  });
});

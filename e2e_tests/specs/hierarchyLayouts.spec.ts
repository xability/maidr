import type { Page } from '@playwright/test';
import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** The two hierarchy layouts that are not the treemap, and their pages. */
const LAYOUTS = [
  { type: 'sunburst', file: 'examples/sunburst.html', id: 'sunburst-population', label: 'sunburst' },
  { type: 'icicle', file: 'examples/icicle.html', id: 'icicle-population', label: 'icicle' },
] as const;

/** One example page, driven through the shared base helpers. */
class HierarchyPage extends BasePage {
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

  /**
   * @param page - The Playwright page
   * @param file - Which example page this layout lives on
   * @param svgId - The chart's SVG id, for activation
   */
  public constructor(
    page: Page,
    private readonly file: string,
    private readonly svgId: string,
  ) {
    super(page);
  }

  /** Navigates to this layout's example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo(this.file);
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, this.svgId);
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }
}

for (const layout of LAYOUTS) {
  test.describe(`${layout.label} chart`, () => {
    let maidrData: Maidr;

    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        const plot = new HierarchyPage(page, layout.file, layout.id);
        await plot.navigateToPlot();
        await page.waitForSelector(`svg`, { timeout: 10000 });

        maidrData = await extractMaidrData(page);
      } finally {
        await context.close();
      }
    });

    test.beforeEach(async ({ page }) => {
      await new HierarchyPage(page, layout.file, layout.id).navigateToPlot();
    });

    test(`should declare the layer as a ${layout.label}`, () => {
      expect(maidrData.subplots[0][0].layers[0].type).toBe(layout.type);
    });

    test('should declare only the leaves, as the treemap does', () => {
      const nodes = maidrData.subplots[0][0].layers[0].data as { x: string }[];

      expect(nodes).toHaveLength(10);
      expect(nodes.map(node => node.x)).not.toContain('Asia');
    });

    test('should announce itself as the chart the author drew', async ({ page }) => {
      // The layout is what the reader is looking at, and the type is one of
      // the few places they learn it.
      const plot = new HierarchyPage(page, layout.file, layout.id);
      await plot.activateMaidr();

      expect(normalizeText(await plot.getInstructionText()).toLowerCase())
        .toContain(layout.label);
    });

    test('should walk the tree with the same keys as every other layout', async ({ page }) => {
      // A reader who meets two of these should not have to learn two sets of
      // keys. Down enters the first child, up returns to the parent.
      const plot = new HierarchyPage(page, layout.file, layout.id);
      await plot.activateMaidr();
      await plot.moveToNextDataPoint();

      expect(normalizeText(await plot.getInstructionText())).toContain('Asia');

      await plot.moveToDataPointBelow();

      const child = normalizeText(await plot.getInstructionText());

      expect(child).toContain('China');
      expect(child).toContain('Share of Asia');

      await plot.moveToDataPointAbove();

      expect(normalizeText(await plot.getInstructionText())).toContain('Asia');
    });

    test('should stop at the last sibling rather than step into a cousin', async ({ page }) => {
      const plot = new HierarchyPage(page, layout.file, layout.id);
      await plot.activateMaidr();
      await plot.moveToNextDataPoint();
      await plot.moveToDataPointBelow();
      for (let step = 0; step < 3; step++) {
        await plot.moveToNextDataPoint();
      }

      expect(normalizeText(await plot.getInstructionText())).toContain('Japan');

      await plot.moveToNextDataPoint();
      const past = normalizeText(await plot.getInstructionText());

      expect(past).not.toContain('Nigeria');
      expect(past.toLowerCase()).toContain('no more data');
    });
  });
}

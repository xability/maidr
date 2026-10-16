import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * E2E coverage for the Graphviz adapter (`maidr/graphviz`).
 *
 * Drives `examples/graphviz/digraph.html` and `examples/graphviz/network.html`,
 * whose SVGs Graphviz drew ahead of time as a Quarto `{dot}` cell does, so the
 * spec needs no Graphviz and no network. Requires a built adapter bundle (`node scripts/build.js graphviz`).
 */

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^\p{Script=Braille}+$/u;

/** The outline MAIDR draws over the node the reader is on. */
const OUTLINE = '[data-maidr-graphviz-node][data-maidr-owned]:not([visibility="hidden"])';

class GraphvizPage extends BasePage {
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
   * Navigates to one of the examples.
   * @param example - The example's name under `examples/graphviz/`
   */
  public async navigateToPlot(example = 'digraph'): Promise<void> {
    await super.navigateTo(`examples/graphviz/${example}.html`);
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the diagram. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'graphviz-orders');
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

test.describe('Graphviz adapter', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await new GraphvizPage(page).navigateToPlot();
      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new GraphvizPage(page).navigateToPlot();
  });

  test('should read the digraph as a directed graph titled by its label', () => {
    expect(maidrData.title).toBe('Order handling');
    expect(maidrData.subplots[0][0].layers[0].type).toBe('directed_graph');
  });

  test('should start on the node nothing feeds and outline it', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Order received');
    expect(announcement).toContain('0 inputs, 1 output');
    await expect(page.locator(OUTLINE)).toHaveCount(1);
    await expect(page.locator(`${OUTLINE} title`)).toHaveText('received');
  });

  test('should follow the edges and name a merge by its edge labels', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('In stock?');

    // Order from supplier, then Pick and pack: topological order.
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    const merge = normalizeText(await plot.getInstructionText());

    expect(merge).toContain('Pick and pack');
    expect(merge).toContain('2 inputs, 1 output');
    expect(merge).toContain('In stock? (yes)');
    expect(merge).toContain('Order from supplier (arrives)');
    await expect(page.locator(`${OUTLINE} title`)).toHaveText('pick');
  });

  test('should show the graph on the braille display', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    expect(await plot.getBrailleContent()).toMatch(BRAILLE_CELL);
  });
});

test.describe('Graphviz adapter, undirected graph', () => {
  /** The outline MAIDR draws over the link to the node the reader is on. */
  const LINK = '[data-maidr-graphviz-edge][data-maidr-owned]:not([visibility="hidden"])';

  test.beforeEach(async ({ page }) => {
    await new GraphvizPage(page).navigateToPlot('network');
  });

  test('should read the graph as a network, most connected person first', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Person is Chloe');
    expect(announcement).toContain('to Ana, Ben, Dev');
    expect(announcement).toContain('Group is 1 of 2');
    await expect(page.locator(LINK)).toHaveCount(1);
  });

  test('should outline the link each step crosses', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('Person is Ben');
    await expect(page.locator(`${LINK} title`)).toHaveText('ben--chloe');
  });
});

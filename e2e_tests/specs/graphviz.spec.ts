import type { Page } from '@playwright/test';
import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * E2E coverage for the Graphviz adapter (`maidr/graphviz`).
 *
 * Drives the pages under `examples/graphviz/`, whose SVGs Graphviz drew ahead
 * of time as a Quarto `{dot}` cell does, so the
 * spec needs no Graphviz and no network. Requires a built adapter bundle (`node scripts/build.js graphviz`).
 */

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^\p{Script=Braille}+$/u;

/** The outline MAIDR draws over the node the reader is on. */
const OUTLINE = '[data-maidr-graphviz-node][data-maidr-owned]:not([visibility="hidden"])';

/** The default highlight colour, as a computed stroke. */
const HIGHLIGHT_STROKE = 'rgb(3, 200, 9)';

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
    // The node's own shape, which Graphviz strokes black, not only its label.
    await expect(page.locator(`${OUTLINE} :is(polygon, path, ellipse)`).first())
      .toHaveCSS('stroke', HIGHLIGHT_STROKE);
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
  /** The outlines MAIDR draws over the links of the node the reader is on. */
  const LINK = '[data-maidr-graphviz-edge][data-maidr-owned]:not([visibility="hidden"])';

  /**
   * The links outlined, sorted: their order in the drawing is the order they
   * were outlined in, not the order the graph declares them.
   * @param page - The page
   * @returns The links' titles
   */
  async function outlinedLinks(page: Page): Promise<string[]> {
    return (await page.locator(`${LINK} title`).allTextContents()).sort();
  }

  test.beforeEach(async ({ page }) => {
    await new GraphvizPage(page).navigateToPlot('network');
  });

  test('should read the graph as a network, most connected person first', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Person is Chloe');
    expect(announcement).toContain('Links is 3, Linked to is Ana, Ben, Dev');
    expect(announcement).toContain('Group is 1 of 2');
    await expect(page.locator(LINK)).toHaveCount(3);
  });

  test('should outline every link of the person each step lands on', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    const chloe = await outlinedLinks(page);
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('Person is Ana');
    // The one line between Ana and Chloe was the whole highlight on both.
    await expect.poll(() => outlinedLinks(page)).toEqual(['ana--ben', 'ana--chloe']);
    expect(chloe).toEqual(['ana--chloe', 'ben--chloe', 'chloe--dev']);

    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('Person is Ben');
    await expect.poll(() => outlinedLinks(page)).toEqual(['ana--ben', 'ben--chloe']);
    await expect(page.locator(`${LINK} path`).first()).toHaveCSS('stroke', HIGHLIGHT_STROKE);
  });
});

test.describe('Graphviz adapter, clusters', () => {
  test.beforeEach(async ({ page }) => {
    await new GraphvizPage(page).navigateToPlot('clusters');
  });

  test('should meet a cluster as one scope in the order the edges run', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Component is Backend');
    expect(announcement).toContain('4 nodes inside');
    expect(announcement).toContain('To is Email worker');
    // Graphviz drew the cluster, but MAIDR derives the scope from its nodes:
    // every node inside it is outlined.
    await expect.poll(async () => (await page.locator(`${OUTLINE} title`).allTextContents()).sort())
      .toEqual(['api', 'cache', 'db', 'payments']);
  });

  test('should open nested clusters with down and leave them with up', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    expect(normalizeText(await plot.getInstructionText())).toContain('Component is API, Path is Backend');
    await expect(page.locator(`${OUTLINE} title`)).toHaveText('api');

    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    expect(normalizeText(await plot.getInstructionText())).toContain('Path is Backend > Data');
    await expect(page.locator(`${OUTLINE} title`)).toHaveText('db');

    await plot.moveToDataPointAbove();
    await plot.moveToDataPointAbove();

    expect(normalizeText(await plot.getInstructionText())).toContain('Component is Backend');
  });
});

test.describe('Graphviz adapter, patchwork treemap', () => {
  /** The outline MAIDR draws over the branch or leaf the reader is on. */
  const CELL = '[data-maidr-graphviz-cell][data-maidr-owned]:not([visibility="hidden"])';

  test.beforeEach(async ({ page }) => {
    await new GraphvizPage(page).navigateToPlot('patchwork');
  });

  test('should announce each branch with the areas of its leaves added up', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToDataPointBelow();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Item is people');
    expect(announcement).toContain('Area is 65');
    expect(announcement).toContain('Children is 2');
    await expect(page.locator(`${CELL} title`)).toHaveText('cluster_people');
    await expect(page.locator(`${CELL} polygon`)).toHaveCSS('stroke', HIGHLIGHT_STROKE);
    // Drawn after the leaves Graphviz tiles over the branch, or they would
    // cover its border.
    expect(await page.locator(CELL).evaluate(cell => cell.parentElement?.lastElementChild === cell))
      .toBe(true);
  });

  test('should open a branch onto its leaves, each with its area', async ({ page }) => {
    const plot = new GraphvizPage(page);
    await plot.activateMaidr();
    await plot.moveToDataPointBelow();
    await plot.moveToDataPointBelow();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Item is Salaries');
    expect(announcement).toContain('Area is 50');
    await expect(page.locator(`${CELL} title`)).toHaveText('salaries');
  });

  test('should draw every leaf with its label inside its own rectangle', async ({ page }) => {
    // Graphviz centres a leaf's label on its rectangle however narrow the
    // rectangle is. At 60 and 5, Training was 24pt wide for a 48pt label,
    // which ran over Salaries and off the drawing's edge.
    const spilled = await page.evaluate(() =>
      [...document.querySelectorAll('svg g.node:not([data-maidr-owned])')]
        .filter((node) => {
          const label = (node.querySelector('text') as SVGGraphicsElement).getBBox();
          const cell = (node.querySelector('polygon') as SVGGraphicsElement).getBBox();
          return label.x < cell.x || label.x + label.width > cell.x + cell.width
            || label.y < cell.y || label.y + label.height > cell.y + cell.height;
        })
        .map(node => node.querySelector('text')?.textContent));

    expect(spilled).toEqual([]);
  });
});

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';

/**
 * The object list (`o`), driven the way a reader drives it: open it from the
 * chart, step through it, change its order and filter, jump, and land back on
 * the chart with the jump announced.
 */

/** A chart example, driven through the shared base helpers. */
class ChartPage extends BasePage {
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

  private readonly example: string;
  private readonly plotId: string;

  public constructor(page: Page, example: string, plotId: string) {
    super(page);
    this.example = example;
    this.plotId = plotId;
  }

  /** Opens the example and enters the chart. */
  public async open(): Promise<void> {
    await super.navigateTo(`examples/${this.example}`);
    await super.verifyPlotLoaded(this.selectors.svg);
    await super.activateMaidr(this.selectors.svg, this.plotId);
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }

  /**
   * Waits for the announcement to change to something matching.
   * @param pattern - What it should say
   */
  public async expectAnnouncement(pattern: RegExp): Promise<void> {
    await expect(this.page.locator(this.selectors.notification).first()).toHaveText(pattern);
  }
}

/**
 * The open object list.
 * @param page - The page
 * @returns The dialog
 */
function objectList(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('dialog', { name: 'Object list' });
}

/**
 * The accessible name of the element that has focus.
 * @param page - The page
 * @returns Its name, from `aria-label`
 */
async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
}

test.describe('Object list on a network', () => {
  test.beforeEach(async ({ page }) => {
    await new ChartPage(page, 'network.html', 'network-collab').open();
  });

  test('should list every node by name, A to Z, with focus on the first', async ({ page }) => {
    await page.keyboard.press('o');

    const dialog = objectList(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('listbox', { name: '9 nodes, Name, A to Z' })).toBeVisible();
    const options = dialog.getByRole('option');
    await expect(options).toHaveCount(9);
    // Row 2 tells the sort apart from the others: Ada is first in all of them.
    await expect(options.nth(1)).toHaveAttribute('aria-label', /^Alan/);
    expect(await focusedName(page)).toMatch(/^Ada/);
  });

  test('should change the order with s and say it with the first node', async ({ page }) => {
    await page.keyboard.press('o');
    await expect(objectList(page)).toBeVisible();

    await page.keyboard.press('s');

    await expect.poll(() => focusedName(page)).toMatch(/^9 nodes, Links, highest first: Ada/);
    await expect(objectList(page).getByRole('option').nth(1)).toHaveAttribute('aria-label', /^Grace/);
  });

  test('should narrow the list to a group with f', async ({ page }) => {
    await page.keyboard.press('o');
    await expect(objectList(page)).toBeVisible();

    await page.keyboard.press('f');

    await expect(objectList(page).getByRole('option')).toHaveCount(6);
    await page.keyboard.press('f');
    await expect(objectList(page).getByRole('option')).toHaveCount(3);
  });

  test('should jump to the chosen node and announce it on the chart', async ({ page }) => {
    const chart = new ChartPage(page, 'network.html', 'network-collab');
    await page.keyboard.press('o');
    await expect(objectList(page)).toBeVisible();
    await page.keyboard.press('s');
    await page.keyboard.press('ArrowDown');

    await page.keyboard.press('Enter');

    await expect(objectList(page)).toBeHidden();
    await chart.expectAnnouncement(/Grace/);
    // Back on the chart, where the arrows walk from the node jumped to.
    await page.keyboard.press('ArrowLeft');
    await chart.expectAnnouncement(/Ada/);
  });

  test('should close with Escape without moving', async ({ page }) => {
    const chart = new ChartPage(page, 'network.html', 'network-collab');
    await page.keyboard.press('ArrowRight');
    const before = await chart.getInstructionText();
    await page.keyboard.press('o');
    await expect(objectList(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');

    await page.keyboard.press('Escape');

    await expect(objectList(page)).toBeHidden();
    expect(await chart.getInstructionText()).toBe(before);
  });

  test('should mark the node the reader is on and open there', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('o');

    const current = objectList(page).locator('[role="option"][aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current).toBeFocused();
  });

  test('should press the order button with Enter rather than jump', async ({ page }) => {
    await page.keyboard.press('o');
    const dialog = objectList(page);
    const order = dialog.getByRole('button', { name: 'Order: Name, A to Z' });
    await order.focus();

    await page.keyboard.press('Enter');

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Order: Links, highest first' })).toBeFocused();
  });
});

test.describe('Object list on a treemap', () => {
  test('should filter by level', async ({ page }) => {
    await new ChartPage(page, 'treemap.html', 'treemap-population').open();
    await page.keyboard.press('o');
    const dialog = objectList(page);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('f');
    await expect(dialog.getByRole('button', { name: 'Showing: Level 1' })).toBeVisible();
    const continents = await dialog.getByRole('option').count();
    await page.keyboard.press('f');

    await expect(dialog.getByRole('button', { name: 'Showing: Level 2' })).toBeVisible();
    expect(await dialog.getByRole('option').count()).toBeGreaterThan(continents);
    await expect.poll(() => focusedName(page)).toMatch(/^Level 2: /);
  });
});

test.describe('Object list on a chart walked along its axes', () => {
  test('should say there is no list rather than open one', async ({ page }) => {
    const bar = new BarPlotPage(page);
    await bar.navigateToBarPlot();
    await bar.activateMaidr();

    await page.keyboard.press('o');

    await expect(page.locator(`#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`).first())
      .toHaveText(/No object list for this layer/);
    await expect(objectList(page)).toHaveCount(0);
  });
});

import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { normalizeText } from '../utils/text';

/**
 * A reader changes a shortcut from the help menu (#189): the new key runs
 * the action, the old one no longer does, the change survives a reload, and
 * the defaults can be put back.
 */

/** The dot plot example, driven through the shared base helpers. */
class ShortcutPage extends BasePage {
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

  /** Navigates to the example and activates MAIDR on it. */
  public async open(): Promise<void> {
    await super.navigateTo('examples/dot.html');
    await super.verifyPlotLoaded(this.selectors.svg);
    await super.activateMaidr(this.selectors.svg, 'dot-response');
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }

  /** Whether the braille display is up. */
  public async brailleIsShown(): Promise<boolean> {
    return this.page.locator(this.selectors.braille).isVisible();
  }

  /**
   * Opens the help menu and gives one action a new shortcut.
   * @param action - The action as the help menu names it
   * @param key - The Playwright key to press as the new shortcut
   */
  public async rebind(action: string, key: string): Promise<void> {
    await this.openHelpMenu();
    await this.waitForElement(this.selectors.helpModal);
    await this.page.getByRole('button', { name: `Change shortcut for ${action}` }).click();
    await this.pressKey(key, `record ${key} for ${action}`);
    await expect(this.page.getByRole('status')).toContainText(`${action} is now`);
    await this.clickElement(this.selectors.helpModalClose);
    await this.closeModal(this.selectors.helpModal);
  }

  /** Opens the help menu and puts every default shortcut back. */
  public async restoreAll(): Promise<void> {
    await this.openHelpMenu();
    await this.waitForElement(this.selectors.helpModal);
    await this.page.getByRole('button', { name: 'Restore all default shortcuts' }).click();
    await expect(this.page.getByRole('status')).toContainText('restored');
    await this.clickElement(this.selectors.helpModalClose);
    await this.closeModal(this.selectors.helpModal);
  }
}

test.describe('Custom shortcuts', () => {
  test('a changed shortcut runs the action, and the default stops', async ({ page }) => {
    const plot = new ShortcutPage(page);
    await plot.open();

    await plot.rebind('Toggle Braille Mode', 'x');

    await plot.pressKey('x', 'toggle braille with the new shortcut');
    await expect(page.locator('textarea[id^="maidr-braille-textarea-"]')).toBeVisible();

    // `b` is free now: in braille mode it warns like any other unassigned key.
    await plot.pressKey('b', 'press the old shortcut');
    await expect(page.locator('textarea[id^="maidr-braille-textarea-"]')).toBeVisible();
    expect(normalizeText(await plot.getInstructionText())).toContain('Invalid key');
  });

  test('the help menu lists the new key with its default', async ({ page }) => {
    const plot = new ShortcutPage(page);
    await plot.open();
    await plot.rebind('Toggle Text Mode', 'y');

    await plot.openHelpMenu();
    await expect(page.getByText('y (custom, default t)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore the default shortcut for Toggle Text Mode' })).toBeVisible();
  });

  test('a changed shortcut survives a reload', async ({ page }) => {
    const plot = new ShortcutPage(page);
    await plot.open();
    await plot.rebind('Toggle Braille Mode', 'x');

    await page.reload();
    await plot.open();
    await plot.pressKey('x', 'toggle braille after a reload');

    await expect(page.locator('textarea[id^="maidr-braille-textarea-"]')).toBeVisible();
  });

  test('a taken key is refused and names the action that has it', async ({ page }) => {
    const plot = new ShortcutPage(page);
    await plot.open();

    await plot.openHelpMenu();
    await page.getByRole('button', { name: 'Change shortcut for Toggle Text Mode' }).click();
    await plot.pressKey('b', 'record a taken key');

    await expect(page.getByRole('status')).toContainText('b is already used by Toggle Braille Mode.');
  });

  test('restoring the defaults brings the old shortcut back', async ({ page }) => {
    const plot = new ShortcutPage(page);
    await plot.open();
    await plot.rebind('Toggle Braille Mode', 'x');

    await plot.restoreAll();
    await plot.pressKey('b', 'toggle braille with the default again');

    await expect(page.locator('textarea[id^="maidr-braille-textarea-"]')).toBeVisible();
  });
});

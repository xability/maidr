import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TestConstants } from '../utils/constants';
import { AssertionError, KeypressError } from '../utils/errors';

/**
 * Base page object that all other page objects extend
 * Provides common functionality for all pages
 */
export class BasePage {
  protected readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigates to a specific path
   * @param path - The path to navigate to
   * @throws Error if navigation fails
   */
  public async navigateTo(path: string): Promise<void> {
    try {
      const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
      let baseURL = '';

      try {
        baseURL = (this.page as any)._browserContext._options?.baseURL || '';

        if (baseURL && !baseURL.endsWith('/')) {
          baseURL = `${baseURL}/`;
        }
      } catch (err) {
        console.warn('Could not determine baseURL from browser context', err);
      }

      await this.page.goto(normalizedPath, {
        timeout: 30000,
        waitUntil: 'load',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Navigation failed to path "${path}": ${errorMessage}`);
    }
  }

  /**
   * Waits for an element to be visible on the page
   * @param selector - The selector for the element
   * @param timeout - Optional timeout in milliseconds
   * @returns The locator for the element
   * @throws Error if element is not found within timeout
   */
  public async waitForElement(selector: string, timeout?: number): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Clicks on an element
   * @param selector - The selector for the element
   * @throws Error if element is not found or cannot be clicked
   */
  public async clickElement(selector: string): Promise<void> {
    const element = await this.waitForElement(selector);
    await element.click();
  }

  /**
   * Gets information about the currently active element on the page
   * @returns Promise resolving to information about the active element
   */
  public async getActiveElementInfo(): Promise<{
    tagName: string;
    className: string;
    id: string;
    attributes: Record<string, string>;
  }> {
    return await this.page.evaluate(() => {
      const activeElement = document.activeElement;

      const attributes: Record<string, string> = {};
      if (activeElement && activeElement.attributes) {
        for (let i = 0; i < activeElement.attributes.length; i++) {
          const attr = activeElement.attributes[i];
          attributes[attr.name] = attr.value;
        }
      }

      return {
        tagName: activeElement?.tagName?.toLowerCase() || 'none',
        className: activeElement?.className || '',
        id: activeElement?.id || '',
        attributes,
      };
    });
  }

  /**
   * Fills an input field with text
   * @param selector - The selector for the input element
   * @param text - The text to fill in the input
   * @throws Error if element is not found or cannot be filled
   */
  public async fillInput(selector: string, text: string): Promise<void> {
    const input = await this.waitForElement(selector);
    await input.fill(text);
  }

  /**
   * Gets text content from an element
   * @param selector - The selector for the element
   * @returns The text content of the element
   * @throws Error if element is not found
   */
  public async getElementText(selector: string): Promise<string> {
    const element = await this.waitForElement(selector);
    return (await element.textContent()) || '';
  }

  /**
   * Checks if an element is visible on the page
   * @param selector - The selector for the element
   * @returns True if the element is visible, false otherwise
   */
  public async isElementVisible(selector: string): Promise<boolean> {
    const locator = this.page.locator(selector);
    return await locator.isVisible();
  }

  /**
   * Presses a keyboard key
   * @param key - The key to press
   * @param context - Context description for error reporting
   * @throws KeypressError if key press fails
   */
  public async pressKey(key: string, context: string): Promise<void> {
    try {
      await this.page.keyboard.press(key);
    } catch (error) {
      throw new KeypressError(
        key,
        context,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Toggles braille mode on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleBrailleMode(): Promise<void> {
    await this.pressKey(TestConstants.BRAILLE_KEY, 'braille mode');
  }

  /**
   * Toggles sonification on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleSonification(): Promise<void> {
    await this.pressKey(TestConstants.SOUND_KEY, 'sonification');
  }

  /**
   * Toggles text mode on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleTextMode(): Promise<void> {
    await this.pressKey(TestConstants.TEXT_KEY, 'text mode');
  }

  /**
   * Toggles review mode on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleReviewMode(): Promise<void> {
    await this.pressKey(TestConstants.REVIEW_KEY, 'review mode');
  }

  /**
   * Shows the help menu and verifies it appears correctly
   * @throws AssertionError if help menu does not appear or doesn't have expected content
   */
  public async showHelpMenu(): Promise<void> {
    try {
      await this.page.keyboard.down(TestConstants.COMMAND_KEY);
      await this.page.waitForTimeout(50);
      await this.pressKey(TestConstants.SLASH_KEY, 'show help menu');

      await expect(this.page.locator(TestConstants.MAIDR_HELP_MODAL)).toBeVisible({
        timeout: 5000,
      });

      const helpTitle = await this.getElementText(TestConstants.MAIDR_HELP_MODAL_TITLE);
      if (!helpTitle.includes(TestConstants.HELP_MENU_TITLE)) {
        throw new Error(`Expected dialog title to contain "Keyboard Shortcuts", but got "${helpTitle}"`);
      }

      await this.page.click(TestConstants.HELP_MENU_CLOSE_BUTTON);

      await expect(this.page.locator(TestConstants.MAIDR_HELP_MODAL)).not.toBeVisible({
        timeout: 1000,
      });
    } catch (error) {
      throw new AssertionError('Failed to show help menu');
    }
  }

  /**
   * Increases playback speed
   * @throws KeypressError if operation fails
   */
  public async increaseSpeed(): Promise<void> {
    await this.pressKey(TestConstants.PERIOD_KEY, 'increase speed');
  }

  /**
   * Decreases playback speed
   * @throws KeypressError if operation fails
   */
  public async decreaseSpeed(): Promise<void> {
    await this.pressKey(TestConstants.COMMA_KEY, 'decrease speed');
  }

  /**
   * Resets playback speed to default
   * @throws KeypressError if operation fails
   */
  public async resetSpeed(): Promise<void> {
    await this.pressKey(TestConstants.SLASH_KEY, 'reset speed');
  }

  /**
   * Replays the current data point
   * @throws KeypressError if operation fails
   */
  public async replayCurrentPoint(): Promise<void> {
    await this.pressKey(TestConstants.SPACE_KEY, 'replay current point');
  }

  /**
   * Moves to the first data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToFirstDataPoint(): Promise<void> {
    await this.page.keyboard.down(TestConstants.META_KEY);
    await this.page.waitForTimeout(50);
    await this.pressKey(TestConstants.LEFT_ARROW_KEY, 'move to first data point');
  }

  /**
   * Moves to the last data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToLastDataPoint(): Promise<void> {
    await this.page.keyboard.down(TestConstants.META_KEY);
    await this.page.waitForTimeout(50);
    await this.pressKey(TestConstants.RIGHT_ARROW_KEY, 'move to last data point');
  }

  /**
   * Moves to the next data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToNextDataPoint(): Promise<void> {
    await this.pressKey(TestConstants.RIGHT_ARROW_KEY, 'move to next data point');
  }

  /**
   * Moves to the previous data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToPreviousDataPoint(): Promise<void> {
    await this.pressKey(TestConstants.LEFT_ARROW_KEY, 'move to previous data point');
  }

  /**
   * Waits for a specified time period
   * @param milliseconds - The time to wait in milliseconds
   */
  public async wait(milliseconds: number): Promise<void> {
    await this.page.waitForTimeout(milliseconds);
  }

  /**
   * Toggles visibility of the X-axis title
   * @throws KeypressError if operation fails
   */
  public async toggleXAxisTitle(): Promise<void> {
    await this.pressKey(TestConstants.LABEL_KEY, 'label scope');
    await this.pressKey(TestConstants.X_AXIS_TITLE, 'x-axis title');
  }

  /**
   * Toggles visibility of the Y-axis title
   * @throws KeypressError if operation fails
   */
  public async toggleYAxisTitle(): Promise<void> {
    await this.pressKey(TestConstants.LABEL_KEY, 'label scope');
    await this.pressKey(TestConstants.Y_AXIS_TITLE, 'y-axis title');
  }
}

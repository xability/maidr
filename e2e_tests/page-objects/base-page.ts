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

  /**
   * Common selectors used across different pages
   */
  protected readonly selectors = {
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * Creates a new BasePage instance
   * @param page - The Playwright page object
   */
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
   * Presses a key combination (e.g., Command + key)
   * @param modifierKey - The modifier key (e.g., Command, Shift)
   * @param key - The key to press
   * @param context - Context description for error reporting
   * @param delay - Optional delay between key presses
   * @throws KeypressError if key combination fails
   */
  protected async pressKeyCombination(
    modifierKey: string,
    key: string,
    context: string,
    delay = 50,
  ): Promise<void> {
    try {
      await this.page.keyboard.down(modifierKey);
      await this.page.waitForTimeout(delay);
      await this.pressKey(key, context);
      await this.page.keyboard.up(modifierKey);
    } catch (error) {
      throw new KeypressError(
        `${modifierKey}+${key}`,
        context,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Verifies a modal appears and has the expected title
   * @param modalSelector - The selector for the modal
   * @param titleText - The expected title text
   * @param timeout - Optional timeout in milliseconds
   * @throws AssertionError if modal verification fails
   */
  protected async verifyModal(
    modalSelector: string,
    titleText: string,
    timeout = 5000,
  ): Promise<void> {
    const modal = this.page.locator(modalSelector);
    await expect(modal).toBeVisible({ timeout });

    const title = this.page.getByText(titleText, { exact: true });
    const isTitleVisible = await title.isVisible({ timeout });
    if (!isTitleVisible) {
      throw new Error(`Modal title "${titleText}" not visible`);
    }
  }

  /**
   * Closes a modal using the Escape key
   * @param modalSelector - The selector for the modal
   * @param timeout - Optional timeout in milliseconds
   * @throws AssertionError if modal cannot be closed
   */
  protected async closeModal(
    modalSelector: string,
    timeout = 2000,
  ): Promise<void> {
    await this.pressKey(TestConstants.ESCAPE_KEY, 'close modal');
    await expect(this.page.locator(modalSelector)).not.toBeVisible({ timeout });
  }

  /**
   * Toggles a mode using a specific key
   * @param key - The key to toggle the mode
   * @param modeName - The name of the mode for error reporting
   * @throws KeypressError if toggling fails
   */
  protected async toggleMode(key: string, modeName: string): Promise<void> {
    await this.pressKey(key, modeName);
  }

  /**
   * Toggles braille mode on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleBrailleMode(): Promise<void> {
    await this.toggleMode(TestConstants.BRAILLE_KEY, 'braille mode');
  }

  /**
   * Toggles sonification on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleSonification(): Promise<void> {
    await this.toggleMode(TestConstants.SOUND_KEY, 'sonification');
  }

  /**
   * Toggles text mode on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleTextMode(): Promise<void> {
    await this.toggleMode(TestConstants.TEXT_KEY, 'text mode');
  }

  /**
   * Toggles review mode on/off
   * @throws KeypressError if toggling fails
   */
  public async toggleReviewMode(): Promise<void> {
    await this.toggleMode(TestConstants.REVIEW_KEY, 'review mode');
  }

  /**
   * Shows the help menu and verifies it appears correctly
   * @throws AssertionError if help menu does not appear or doesn't have expected content
   */
  public async showHelpMenu(): Promise<void> {
    try {
      await this.pressKeyCombination(
        TestConstants.COMMAND_KEY,
        TestConstants.SLASH_KEY,
        'show help menu',
      );

      await this.verifyModal(
        this.selectors.helpModal,
        TestConstants.HELP_MENU_TITLE,
      );

      await this.clickElement(this.selectors.helpModalClose);
      await this.closeModal(this.selectors.helpModal);
    } catch (error) {
      throw new AssertionError('Failed to show help menu');
    }
  }

  /**
   * Shows the Settings menu and verifies it appears correctly
   * @throws AssertionError if Settings menu does not appear or doesn't have expected content
   */
  public async showSettingsMenu(): Promise<void> {
    try {
      await this.pressKeyCombination(
        TestConstants.COMMAND_KEY,
        TestConstants.PERIOD_KEY,
        'show settings menu',
        100,
      );

      await this.verifyModal(
        this.selectors.settingsModal,
        TestConstants.SETTINGS_MENU_TITLE,
      );

      await this.closeModal(this.selectors.settingsModal);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AssertionError(
        `Failed to show settings menu: ${errorMessage}`,
      );
    }
  }

  /**
   * Shows the Chat dialog and verifies it appears correctly
   * @throws AssertionError if Chat Dialog does not appear or doesn't have expected content
   */
  public async showChatDialog(): Promise<void> {
    try {
      await this.pressKeyCombination(
        TestConstants.SHIFT_KEY,
        TestConstants.SLASH_KEY,
        'show Chat dialog',
        100,
      );

      await this.verifyModal(
        this.selectors.chatModal,
        TestConstants.CHAT_DIALOG_TITLE,
        10000,
      );

      await this.closeModal(this.selectors.chatModal);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AssertionError(
        `Failed to show chat dialog: ${errorMessage}`,
      );
    }
  }

  /**
   * Changes playback speed
   * @param key - The key to press for speed change
   * @param action - Description of the speed change action
   * @throws KeypressError if operation fails
   */
  protected async changeSpeed(key: string, action: string): Promise<void> {
    await this.pressKey(key, action);
  }

  /**
   * Increases playback speed
   * @throws KeypressError if operation fails
   */
  public async increaseSpeed(): Promise<void> {
    await this.changeSpeed(TestConstants.PERIOD_KEY, 'increase speed');
  }

  /**
   * Decreases playback speed
   * @throws KeypressError if operation fails
   */
  public async decreaseSpeed(): Promise<void> {
    await this.changeSpeed(TestConstants.COMMA_KEY, 'decrease speed');
  }

  /**
   * Resets playback speed to default
   * @throws KeypressError if operation fails
   */
  public async resetSpeed(): Promise<void> {
    await this.changeSpeed(TestConstants.SLASH_KEY, 'reset speed');
  }

  /**
   * Replays the current data point
   * @throws KeypressError if operation fails
   */
  public async replayCurrentPoint(): Promise<void> {
    await this.pressKey(TestConstants.SPACE_KEY, 'replay current point');
  }

  /**
   * Moves to a specific data point using a key combination
   * @param key - The key to press
   * @param action - Description of the movement action
   * @param useMetaKey - Whether to use the Meta key
   * @throws KeypressError if operation fails
   */
  protected async moveToDataPoint(
    key: string,
    action: string,
    useMetaKey = false,
  ): Promise<void> {
    if (useMetaKey) {
      await this.pressKeyCombination(TestConstants.META_KEY, key, action);
    } else {
      await this.pressKey(key, action);
    }
  }

  /**
   * Moves to the first data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToFirstDataPoint(): Promise<void> {
    await this.moveToDataPoint(
      TestConstants.LEFT_ARROW_KEY,
      'move to first data point',
      true,
    );
  }

  /**
   * Moves to the last data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToLastDataPoint(): Promise<void> {
    await this.moveToDataPoint(
      TestConstants.RIGHT_ARROW_KEY,
      'move to last data point',
      true,
    );
  }

  /**
   * Moves to the next data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToNextDataPoint(): Promise<void> {
    await this.moveToDataPoint(
      TestConstants.RIGHT_ARROW_KEY,
      'move to next data point',
    );
  }

  /**
   * Moves to the previous data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToPreviousDataPoint(): Promise<void> {
    await this.moveToDataPoint(
      TestConstants.LEFT_ARROW_KEY,
      'move to previous data point',
    );
  }

  /**
   * Moves to the data point above the current data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToDataPointAbove(): Promise<void> {
    await this.moveToDataPoint(
      TestConstants.UP_ARROW_KEY,
      'move to data point above',
    );
  }

  /**
   * Moves to the data point below the current data point in the chart
   * @throws KeypressError if operation fails
   */
  public async moveToDataPointBelow(): Promise<void> {
    await this.moveToDataPoint(
      TestConstants.DOWN_ARROW_KEY,
      'move to data point below',
    );
  }

  /**
   * Waits for a specified time period
   * @param milliseconds - The time to wait in milliseconds
   */
  public async wait(milliseconds: number): Promise<void> {
    await this.page.waitForTimeout(milliseconds);
  }

  /**
   * Toggles axis title visibility
   * @param axisKey - The key to press for the specific axis
   * @param axisName - The name of the axis for error reporting
   * @throws KeypressError if operation fails
   */
  protected async toggleAxisTitle(axisKey: string, axisName: string): Promise<void> {
    await this.pressKey(TestConstants.LABEL_KEY, 'label scope');
    await this.pressKey(axisKey, axisName);
  }

  /**
   * Toggles visibility of the X-axis title
   * @throws KeypressError if operation fails
   */
  public async toggleXAxisTitle(): Promise<void> {
    await this.toggleAxisTitle(TestConstants.X_AXIS_TITLE, 'x-axis title');
  }

  /**
   * Toggles visibility of the Y-axis title
   * @throws KeypressError if operation fails
   */
  public async toggleYAxisTitle(): Promise<void> {
    await this.toggleAxisTitle(TestConstants.Y_AXIS_TITLE, 'y-axis title');
  }

  /**
   * Verifies the plot has loaded correctly
   * @param svgSelector - The selector for the SVG element
   * @returns Promise resolving when verification is complete
   * @throws Error if plot is not loaded correctly
   */
  protected async verifyPlotLoaded(svgSelector: string): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(svgSelector)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new Error('Plot failed to load correctly');
    }
  }

  /**
   * Verifies if the SVG element is focused
   * @param plotId - The ID of the plot to verify
   * @throws Error if SVG is not focused
   */
  protected async verifySvgFocused(plotId: string): Promise<void> {
    const activeElementInfo = await this.getActiveElementInfo();
    if (activeElementInfo.tagName !== 'svg' || activeElementInfo.id !== plotId) {
      throw new Error(
        `Expected SVG element with ID "${plotId}" to be focused, `
        + `but found ${activeElementInfo.tagName} with ID "${activeElementInfo.id}"`,
      );
    }
  }

  /**
   * Activates MAIDR by focusing the plot
   * @param svgSelector - The selector for the SVG element
   * @param plotId - The ID of the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws Error if MAIDR cannot be activated
   */
  protected async activateMaidr(svgSelector: string, plotId: string): Promise<void> {
    try {
      await this.verifyPlotLoaded(svgSelector);
      await this.page.keyboard.press(TestConstants.TAB_KEY);
      await this.verifySvgFocused(plotId);
    } catch (error) {
      throw new Error('Failed to activate MAIDR');
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @param svgSelector - The selector for the SVG element
   * @param plotId - The ID of the plot
   * @returns Promise resolving when MAIDR is activated via click
   * @throws Error if MAIDR cannot be activated by clicking
   */
  protected async activateMaidrOnClick(svgSelector: string, plotId: string): Promise<void> {
    try {
      await this.verifyPlotLoaded(svgSelector);
      await this.page.click(svgSelector);
      await this.verifySvgFocused(plotId);
    } catch (error) {
      throw new Error('Failed to activate MAIDR by clicking');
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @param notificationSelector - The selector for the notification element
   * @returns Promise resolving to the instruction text
   * @throws Error if instruction text cannot be retrieved
   */
  protected async getInstructionText(notificationSelector: string): Promise<string> {
    try {
      const text = await this.getElementText(notificationSelector);
      return text.replace(/\s+/g, ' ').trim();
    } catch (error) {
      throw new Error('Failed to get instruction text');
    }
  }

  /**
   * Checks if a specific mode is active
   * @param notificationSelector - The selector for the notification element
   * @param mode - The mode to check
   * @param modeMessages - Map of mode values to expected messages
   * @returns Promise resolving to true if mode is active, false otherwise
   * @throws Error if mode status cannot be checked
   */
  protected async isModeActive(
    notificationSelector: string,
    mode: string,
    modeMessages: Record<string, string>,
  ): Promise<boolean> {
    try {
      const notificationText = await this.getElementText(notificationSelector);
      return notificationText === modeMessages[mode];
    } catch (error) {
      throw new Error(`Failed to check ${mode} status`);
    }
  }

  /**
   * Gets axis title text
   * @param infoSelector - The selector for the info element
   * @returns Promise resolving to the axis title text
   * @throws Error if title cannot be retrieved
   */
  protected async getAxisTitle(infoSelector: string): Promise<string> {
    try {
      return await this.getElementText(infoSelector);
    } catch (error) {
      throw new Error('Failed to get axis title');
    }
  }

  /**
   * Gets the current playback speed
   * @param speedIndicatorSelector - The selector for the speed indicator
   * @returns Promise resolving to the current speed value
   * @throws Error if speed cannot be retrieved
   */
  protected async getPlaybackSpeed(speedIndicatorSelector: string): Promise<number> {
    try {
      const speedText = await this.getElementText(speedIndicatorSelector);
      return Number.parseFloat(speedText);
    } catch (error) {
      throw new Error('Failed to get playback speed');
    }
  }

  /**
   * Gets the current data point information
   * @param infoSelector - The selector for the info element
   * @returns Promise resolving to the current data point information
   * @throws Error if data point information cannot be retrieved
   */
  protected async getCurrentDataPointInfo(infoSelector: string): Promise<string> {
    try {
      return await this.getElementText(infoSelector);
    } catch (error) {
      throw new Error('Failed to get current data point information');
    }
  }

  /**
   * Starts autoplay in a specific direction
   * @param direction - The direction to autoplay ('forward' or 'reverse')
   * @param infoSelector - The selector for the info element
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @returns Promise resolving when autoplay completes and expected content is displayed
   * @throws Error if autoplay fails or times out
   */
  protected async startAutoplay(
    direction: 'forward' | 'reverse',
    infoSelector: string,
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    const arrowKey = direction === 'forward' ? TestConstants.RIGHT_ARROW_KEY : TestConstants.LEFT_ARROW_KEY;
    const directionName = direction === 'forward' ? 'forward' : 'reverse';

    try {
      await this.page.keyboard.down(TestConstants.META_KEY);
      await this.page.keyboard.down(TestConstants.SHIFT_KEY);
      await this.pressKey(arrowKey, `start ${directionName} autoplay`);

      await this.page.keyboard.up(TestConstants.META_KEY);
      await this.page.keyboard.up(TestConstants.SHIFT_KEY);
      await this.page.keyboard.up(arrowKey);

      if (expectedContent) {
        await this.waitForElementContent(
          infoSelector,
          expectedContent,
          options,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to complete ${directionName} autoplay: ${errorMessage}`);
    }
  }

  /**
   * Waits for an element to contain specific content
   * @param selector - CSS selector for the target element
   * @param expectedContent - The expected text content to wait for
   * @param options - Configuration options for the wait operation
   * @returns Promise resolving when the condition is met
   * @throws Error if timeout is reached before the condition is met
   */
  protected async waitForElementContent(
    selector: string,
    expectedContent: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    const timeout = options.timeout || 10000;
    const pollInterval = options.pollInterval || 100;

    try {
      await this.page.waitForSelector(selector, { timeout: Math.min(5000, timeout / 2) });

      await this.page.waitForFunction(
        ({ selector, expectedContent }) => {
          const element = document.querySelector(selector);
          return element && element.textContent?.includes(expectedContent);
        },
        { selector, expectedContent },
        { timeout, polling: pollInterval },
      );
    } catch (error) {
      let actualContent = '';
      try {
        actualContent = await this.page.$eval(selector, el => el.textContent || '');
      } catch {
        actualContent = 'Element not found';
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Timeout waiting for element "${selector}" to have content "${expectedContent}". `
        + `Actual content: "${actualContent}". ${errorMessage}`,
      );
    }
  }
}

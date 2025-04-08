import type { Page } from '@playwright/test';
import type { MaidrLayer } from '@type/maidr';
import { expect } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { BarPlotError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object representing the bar plot page
 * Handles all bar plot specific interactions and verifications
 */
export class BarPlotPage extends BasePage {
  /**
   * The ID of the plot being tested
   */
  private readonly plotId: string;

  /**
   * Creates a new BarPlotPage instance
   * @param page - The Playwright page object
   * @param plotId - ID of the bar plot (defaults to BAR_ID constant)
   */
  constructor(page: Page, plotId: string = TestConstants.BAR_ID) {
    super(page);
    this.plotId = plotId;
  }

  /**
   * Navigates to the bar plot page
   * @returns Promise resolving when navigation completes
   * @throws BarPlotError if navigation fails
   */
  public async navigateToBarPlot(): Promise<void> {
    try {
    // Use absolute path to ensure correct navigation
      const absolutePath = '/examples/barplot.html';
      // console.log(`Navigating to bar plot at: ${absolutePath}`);

      await this.navigateTo(absolutePath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to navigate to bar plot: ${errorMessage}`);
    }
  }

  /**
   * Waits for an element to contain specific content
   *
   * @param selector - CSS selector for the target element
   * @param expectedContent - The expected text content to wait for
   * @param options - Configuration options for the wait operation
   * @returns Promise resolving when the condition is met
   * @throws BarPlotError if timeout is reached before the condition is met
   *
   * @example
   * // Wait for data point info to show specific content
   * await waitForElementContent('#info-container p', 'Expected text', { timeout: 5000 });
   */
  public async waitForElementContent(
    selector: string,
    expectedContent: string,
  options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    const timeout = options.timeout || 10000;
    const pollInterval = options.pollInterval || 100;

    try {
    // First verify the element exists
      await this.page.waitForSelector(selector, { timeout: Math.min(5000, timeout / 2) });

      // Then wait for its content to match expected
      await this.page.waitForFunction(
        ({ selector, expectedContent }) => {
          const element = document.querySelector(selector);
          return element && element.textContent?.includes(expectedContent);
        },
        { selector, expectedContent },
        { timeout, polling: pollInterval },
      );
    } catch (error) {
    // Log current element content for debugging
      let actualContent = '';
      try {
        actualContent = await this.page.$eval(selector, el => el.textContent || '');
      } catch {
        actualContent = 'Element not found';
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(
        `Timeout waiting for element "${selector}" to have content "${expectedContent}". `
        + `Actual content: "${actualContent}". ${errorMessage}`,
      );
    }
  }

  /**
   * Gets information about the currently active element on the page
   * @returns Promise resolving to information about the active element
   */
  private async getActiveElementInfo(): Promise<{
    tagName: string;
    className: string;
    id: string;
    attributes: Record<string, string>;
  }> {
    return await this.page.evaluate(() => {
      const activeElement = document.activeElement;

      // Get all attributes
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
   * Extracts MAIDR data from the page
   * @returns Promise resolving to the MAIDR layer data
   * @throws BarPlotError if data cannot be extracted
   */
  public async getMaidrData(): Promise<MaidrLayer> {
    try {
      return await this.page.evaluate(() => {
        return window.maidr.subplots[0][0].layers[0];
      });
    } catch (error) {
      throw new BarPlotError('Failed to extract MAIDR data from window object');
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws BarPlotError if plot is not loaded correctly
   */
  public async verifyPlotLoaded(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(`svg#${this.plotId}`)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new BarPlotError('Bar plot failed to load correctly');
    }
  }

  /**
   * Activates MAIDR by clicking on the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws BarPlotError if MAIDR cannot be activated
   */
  public async activateMaidr(): Promise<void> {
    try {
      await this.verifyPlotLoaded();

      await this.page.keyboard.press(TestConstants.TAB_KEY);

      const activeElementInfo = await this.getActiveElementInfo();

      if (activeElementInfo.tagName !== 'svg' || activeElementInfo.id !== this.plotId) {
        throw new Error(`Expected SVG element with ID "${this.plotId}" to be focused,
          but found ${activeElementInfo.tagName} with ID "${activeElementInfo.id}"`);
      }
    } catch (error) {
      throw new BarPlotError('Failed to activate MAIDR');
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @returns Promise resolving when MAIDR is activated via click
   * @throws BarPlotError if MAIDR cannot be activated by clicking
   */
  public async activateMaidrOnClick(): Promise<void> {
    try {
      await this.verifyPlotLoaded();

      const svgSelector = `svg#${this.plotId}`;

      await this.page.click(svgSelector);

      const activeElementInfo = await this.getActiveElementInfo();

      // Verify the SVG is now the active element
      if (activeElementInfo.tagName !== 'svg' || activeElementInfo.id !== this.plotId) {
        throw new Error(
          `Expected SVG element with ID "${this.plotId}" to be focused after click, `
          + `but found ${activeElementInfo.tagName} with ID "${activeElementInfo.id}"`,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to activate MAIDR by clicking: ${errorMessage}`);
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws BarPlotError if instruction text cannot be retrieved
   */
  public async getInstructionText(): Promise<string> {
    const notificationSelector
      = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;

    try {
      const text = await this.getElementText(notificationSelector);
      return text.replace(/\s+/g, ' ').trim();
    } catch (error) {
      throw new BarPlotError('Failed to get instruction text');
    }
  }

  /**
   * Gets the current notification text (data point information)
   * @returns Promise resolving to the notification text
   * @throws BarPlotError if notification text cannot be retrieved
   */
  public async getNotificationText(): Promise<string> {
    const notificationSelector
      = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;

    try {
      return await this.getElementText(notificationSelector);
    } catch (error) {
      throw new BarPlotError('Failed to get notification text');
    }
  }

  /**
   * Toggles text mode on/off
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */
  public async toggleTextMode(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.TEXT_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to toggle text mode');
    }
  }

  /**
   * Checks if text mode is active
   * @returns Promise resolving to true if text mode is active, false otherwise
   */
  public async isTextModeActive(textMode: string): Promise<boolean> {
    const notificationSelector
    = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      const notification_text = await this.getElementText(notificationSelector);
      if (textMode === TestConstants.TEXT_MODE_TERSE) {
        return notification_text === TestConstants.TEXT_MODE_TERSE_MESSAGE;
      } else if (textMode === TestConstants.TEXT_MODE_VERBOSE) {
        return notification_text === TestConstants.TEXT_MODE_VERBOSE_MESSAGE;
      } else if (textMode === TestConstants.TEXT_MODE_OFF) {
        return notification_text === TestConstants.TEXT_MODE_OFF_MESSAGE;
      } else {
        throw new BarPlotError('Invalid text mode specified');
      }
    } catch (error) {
      throw new BarPlotError('Failed to check text mode status');
    }
  }

  /**
   * Toggles braille mode on/off
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */
  public async toggleBrailleMode(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.BRAILLE_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to toggle braille mode');
    }
  }

  /**
   * Checks if braille mode is active
   * @returns Promise resolving to true if braille mode is active, false otherwise
   */
  public async isBrailleModeActive(braille_mode: string): Promise<boolean> {
    const notificationSelector
      = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      const notification_text = await this.getElementText(notificationSelector);
      if (braille_mode === TestConstants.BRAILLE_ON) {
        return notification_text === TestConstants.BRAILLE_MODE_ON;
      } else if (braille_mode === TestConstants.BRAILLE_OFF) {
        return notification_text === TestConstants.BRAILLE_MODE_OFF;
      } else {
        throw new BarPlotError('Invalid braille mode specified');
      }
    } catch (error) {
      throw new BarPlotError('Failed to check braille mode status');
    }
  }

  /**
   * Toggles sonification on/off
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */
  public async toggleSonification(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.SOUND_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to toggle sonification');
    }
  }

  /**
   * Checks if sonification is active
   * @returns Promise resolving to true if sonification is active, false otherwise
   */
  public async isSonificationActive(sonification_mode: string): Promise<boolean> {
    const notificationSelector
      = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      const notification_text = await this.getElementText(notificationSelector);
      if (sonification_mode === TestConstants.SOUND_ON) {
        return notification_text === TestConstants.SOUND_MODE_ON;
      } else if (sonification_mode === TestConstants.SOUND_OFF) {
        return notification_text === TestConstants.SOUND_MODE_OFF;
      } else {
        throw new BarPlotError('Invalid sonification mode specified');
      }
    } catch (error) {
      throw new BarPlotError('Failed to check sonification status');
    }
  }

  /**
   * Toggles review mode on/off
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */
  public async toggleReviewMode(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.REVIEW_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to toggle review mode');
    }
  }

  /**
   * Checks if review mode is active
   * @returns Promise resolving to true if review mode is active, false otherwise
   */
  public async isReviewModeActive(review_mode: string): Promise<boolean> {
    const notificationSelector
      = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      const notification_text = await this.getElementText(notificationSelector);
      if (review_mode === TestConstants.REVIEW_MODE_ON) {
        return notification_text === TestConstants.REVIEW_MODE_ON_MESSAGE;
      } else if (review_mode === TestConstants.REVIEW_MODE_OFF) {
        return notification_text === TestConstants.REVIEW_MODE_OFF_MESSAGE;
      } else {
        throw new BarPlotError('Invalid review mode specified');
      }
    } catch (error) {
      throw new BarPlotError('Failed to check review mode status');
    }
  }

  /**
   * Toggle X-axis title
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */

  public async toggleXAxisTitle(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.LABEL_KEY);
      await this.page.keyboard.press(TestConstants.X_AXIS_TITLE);
    } catch (error) {
      throw new BarPlotError('Failed to toggle X-axis title');
    }
  }

  /**
   * Toggle Y-axis title
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */
  public async toggleYAxisTitle(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.LABEL_KEY);
      await this.page.keyboard.press(TestConstants.Y_AXIS_TITLE);
    } catch (error) {
      throw new BarPlotError('Failed to toggle Y-axis title');
    }
  }

  /**
   * Get X-Axis title
   * @returns X-axis title text
   * @throws BarPlotError if title cannot be retrieved
   */

  public async getXAxisTitle(): Promise<string> {
    const xAxisTitleSelector = `#${TestConstants.MAIDR_INFO_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      const xAxisTitle = await this.getElementText(xAxisTitleSelector);
      return xAxisTitle;
    } catch (error) {
      throw new BarPlotError('Failed to get X-axis title');
    }
  }

  /**
   * Get Y-Axis title
   * @returns Y-axis title text
   * @throws BarPlotError if title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    const yAxisTitleSelector = `#${TestConstants.MAIDR_INFO_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      const yAxisTitle = await this.getElementText(yAxisTitleSelector);
      return yAxisTitle;
    } catch (error) {
      throw new BarPlotError('Failed to get Y-axis title');
    }
  }

  /**
   * Presses multiple keys in sequence
   * @param keys - Array of keys to press in order
   * @returns Promise resolving when all keys have been pressed
   * @throws Error if key press fails
   */
  private async pressKeysInSequence(keys: string[]): Promise<void> {
    try {
      for (const key of keys) {
        await this.page.keyboard.press(key);

        // Add a small delay between key presses to ensure they're registered separately
        await this.page.waitForTimeout(100);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to press keys in sequence: ${errorMessage}`);
    }
  }
  /**
   * Toggle Help menu
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */

  public async showHelpMenu(): Promise<void> {
    try {
      await this.page.keyboard.down(TestConstants.COMMAND_KEY);
      await this.page.waitForTimeout(50);
      await this.page.keyboard.press(TestConstants.SLASH_KEY);

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
      throw new BarPlotError('Failed to show help menu');
    }
  }

  /**
   * Gets the current playback speed
   * @returns Promise resolving to the current speed value
   * @throws BarPlotError if speed cannot be retrieved
   */
  public async getPlaybackSpeed(): Promise<number> {
    try {
      const speedText = await this.getElementText(
        `#${TestConstants.MAIDR_SPEED_INDICATOR + this.plotId}`,
      );
      return Number.parseFloat(speedText);
    } catch (error) {
      throw new BarPlotError('Failed to get playback speed');
    }
  }

  /**
   * Increases playback speed
   * @returns Promise resolving when speed change is complete
   * @throws BarPlotError if speed change fails
   */
  public async increaseSpeed(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.PERIOD_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to increase speed');
    }
  }

  /**
   * Decreases playback speed
   * @returns Promise resolving when speed change is complete
   * @throws BarPlotError if speed change fails
   */
  public async decreaseSpeed(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.COMMA_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to decrease speed');
    }
  }

  /**
   * Resets playback speed to default
   * @returns Promise resolving when speed reset is complete
   * @throws BarPlotError if speed reset fails
   */
  public async resetSpeed(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.SLASH_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to reset speed');
    }
  }

  /**
   * Get current speed toggle information
   * @returns current speed toggle information
   * @throws BarPlotError if speed toggle information cannot be retrieved
   */
  public async getSpeedToggleInfo(): Promise<string> {
    const speedToggleSelector
      = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      return await this.getElementText(speedToggleSelector);
    } catch (error) {
      throw new BarPlotError('Failed to get speed toggle information');
    }
  }

  /**
   * Replays the current data point
   * @returns Promise resolving when replay is complete
   * @throws BarPlotError if replay fails
   */
  public async replayCurrentPoint(): Promise<void> {
    try {
      await this.page.keyboard.press(' ');
    } catch (error) {
      throw new BarPlotError('Failed to replay current point');
    }
  }

  /**
   * Toggles autoplay on/off
   * @returns Promise resolving when toggling is complete
   * @throws BarPlotError if toggling fails
   */
  public async toggleAutoplay(): Promise<void> {
    try {
      await this.page.keyboard.press('a');
    } catch (error) {
      throw new BarPlotError('Failed to toggle autoplay');
    }
  }

  /**
   * Checks if autoplay is active
   * @returns Promise resolving to true if autoplay is active, false otherwise
   */
  public async isAutoplayActive(): Promise<boolean> {
    return await this.isElementVisible(
      `#${TestConstants.MAIDR_CONTAINER + this.plotId} .autoplay-active`,
    );
  }

  /**
   * Waits for a specified amount of time
   * @param milliseconds - Time to wait in milliseconds
   * @returns Promise resolving when wait is complete
   */
  public async wait(milliseconds: number): Promise<void> {
    await this.page.waitForTimeout(milliseconds);
  }

  /**
   * Move to the next data point on the right
   * @returns Promise resolving when movement is complete
   * @throws BarPlotError if movement fails
   */
  public async moveToNextDataPoint(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.RIGHT_ARROW_KEY);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to move to next data point: ${errorMessage}`);
    }
  }

  /**
   * Move to the previous data point on the left
   * @returns Promise resolving when movement is complete
   * @throws BarPlotError if movement fails
   */
  public async moveToPreviousDataPoint(): Promise<void> {
    try {
      await this.page.keyboard.press(TestConstants.LEFT_ARROW_KEY);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to move to previous data point: ${errorMessage}`);
    }
  }

  /**
   * Get the current data point information
   * @returns Promise resolving to the current data point information
   * @throws BarPlotError if data point information cannot be retrieved
   */

  public async getCurrentDataPointInfo(): Promise<string> {
    const dataPointSelector
      = `#${TestConstants.MAIDR_INFO_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
    try {
      return await this.getElementText(dataPointSelector);
    } catch (error) {
      throw new BarPlotError('Failed to get current data point information');
    }
  }

  /**
   * Get the information about first data point
   * @returns Promise resolving to the first data point information
   * @throws BarPlotError if data point information cannot be retrieved
   */

  public async moveToFirstDataPoint(): Promise<void> {
    try {
      await this.page.keyboard.down(TestConstants.META_KEY);
      await this.page.waitForTimeout(50);
      await this.page.keyboard.press(TestConstants.LEFT_ARROW_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to get first data point information');
    }
  }

  /**
   * Get the information about last data point
   * @returns Promise resolving to the last data point information
   * @throws BarPlotError if data point information cannot be retrieved
   */
  public async moveToLastDataPoint(): Promise<void> {
    try {
      await this.page.keyboard.down(TestConstants.META_KEY);
      await this.page.waitForTimeout(50);
      await this.page.keyboard.press(TestConstants.RIGHT_ARROW_KEY);
    } catch (error) {
      throw new BarPlotError('Failed to get last data point information');
    }
  }

  /**
   * Starts forward autoplay and waits for completion
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @returns Promise resolving when autoplay completes and expected content is displayed
   * @throws BarPlotError if autoplay fails or times out
   *
   * @example
   * // Start autoplay and wait for data point info to reach expected text
   * await startForwardAutoplay('Last data point reached', { timeout: 10000 });
   */
  public async startForwardAutoplay(
    expectedContent?: string,
  options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
    // Start autoplay with keyboard shortcuts
      await this.page.keyboard.down(TestConstants.META_KEY);
      await this.page.keyboard.down(TestConstants.SHIFT_KEY);
      await this.page.keyboard.press(TestConstants.RIGHT_ARROW_KEY);

      // Release modifier keys
      await this.page.keyboard.up(TestConstants.META_KEY);
      await this.page.keyboard.up(TestConstants.SHIFT_KEY);
      await this.page.keyboard.up(TestConstants.RIGHT_ARROW_KEY);

      // If expected content is provided, wait for it
      if (expectedContent) {
        const dataPointSelector
        = `#${TestConstants.MAIDR_INFO_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
        await this.waitForElementContent(
          dataPointSelector,
          expectedContent,
          options,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to complete forward autoplay: ${errorMessage}`);
    }
  }

  /**
   * Starts reverse autoplay and waits for completion
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @returns Promise resolving when autoplay completes and expected content is displayed
   * @throws BarPlotError if autoplay fails or times out
   *
   * @example
   * // Start autoplay and wait for data point info to reach expected text
   * await startReverseAutoplay('First data point reached', { timeout: 10000 });
   */
  public async startReverseAutoplay(
    expectedContent?: string,
  options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
    // Start autoplay with keyboard shortcuts
      await this.page.keyboard.down(TestConstants.META_KEY);
      await this.page.keyboard.down(TestConstants.SHIFT_KEY);
      await this.page.keyboard.press(TestConstants.LEFT_ARROW_KEY);

      // Release modifier keys
      await this.page.keyboard.up(TestConstants.META_KEY);
      await this.page.keyboard.up(TestConstants.SHIFT_KEY);
      await this.page.keyboard.up(TestConstants.LEFT_ARROW_KEY);

      // If expected content is provided, wait for it
      if (expectedContent) {
        const dataPointSelector
        = `#${TestConstants.MAIDR_INFO_CONTAINER + this.plotId} ${TestConstants.PARAGRAPH}`;
        await this.waitForElementContent(
          dataPointSelector,
          expectedContent,
          options,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to complete reverse autoplay: ${errorMessage}`);
    }
  }
}

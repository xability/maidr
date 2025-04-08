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
      await this.pressKey(TestConstants.RIGHT_ARROW_KEY, 'start forward autoplay');

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
      await this.pressKey(TestConstants.LEFT_ARROW_KEY, 'start reverse autoplay');

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

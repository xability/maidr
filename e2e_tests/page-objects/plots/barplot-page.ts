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
   * Moves to the next bar in the specified direction
   * @param direction - Direction of movement (right or left arrow key)
   * @returns Promise resolving when movement is complete
   * @throws BarPlotError if movement fails
   */
  public async moveToNextBar(direction: 'ArrowRight' | 'ArrowLeft'): Promise<void> {
    try {
      await this.page.keyboard.press(direction);
    } catch (error) {
      throw new BarPlotError(`Failed to move ${direction === 'ArrowRight' ? 'right' : 'left'}`);
    }
  }

  /**
   * Navigates to extreme point (first or last bar)
   * @param extremePoint - Which extreme to navigate to ('Home' or 'End')
   * @returns Promise resolving when navigation is complete
   * @throws BarPlotError if navigation fails
   */
  public async navigateToExtremePoint(extremePoint: 'Home' | 'End'): Promise<void> {
    try {
      await this.page.keyboard.press(extremePoint);

      const selector = extremePoint === 'Home'
        ? `#${TestConstants.MAIDR_CONTAINER + this.plotId} .bar.active:first-child`
        : `#${TestConstants.MAIDR_CONTAINER + this.plotId} .bar.active:last-child`;

      await expect(this.page.locator(selector)).toBeVisible();
    } catch (error) {
      throw new BarPlotError(`Failed to navigate to ${extremePoint === 'Home' ? 'first' : 'last'} bar`);
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
      await this.page.keyboard.press('+');
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
      await this.page.keyboard.press('-');
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
      await this.page.keyboard.press('0');
    } catch (error) {
      throw new BarPlotError('Failed to reset speed');
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
}

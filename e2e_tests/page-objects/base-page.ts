import type { Locator, Page } from '@playwright/test';

/**
 * Base page object that all other page objects extend
 * Provides common functionality for all pages
 */
export class BasePage {
  /**
   * The Playwright page object
   */
  protected readonly page: Page;

  /**
   * Creates a new BasePage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigates to a specified path relative to baseURL
   * @param path - The path to navigate to (relative to baseURL)
   * @returns Promise resolving when navigation completes
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
   * Waits for a specific element to be visible
   * @param selector - The selector for the element
   * @param timeout - Optional timeout in milliseconds
   * @returns The Locator for the element
   * @throws Error if element doesn't become visible within timeout
   */
  public async waitForElement(selector: string, timeout?: number): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Clicks an element after ensuring it's visible
   * @param selector - The selector for the element to click
   * @returns Promise resolving when click completes
   * @throws Error if element is not clickable
   */
  public async clickElement(selector: string): Promise<void> {
    const element = await this.waitForElement(selector);
    await element.click();
  }

  /**
   * Types text into an input field
   * @param selector - The selector for the input element
   * @param text - The text to type
   * @returns Promise resolving when typing completes
   * @throws Error if input element is not found or not editable
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
}

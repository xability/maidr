import type { Page } from '@playwright/test';
import { BindingOutputError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * What the reader has in front of them after one keypress: what was announced,
 * and where the highlight is.
 */
export interface Reading {
  /** The text MAIDR shows for the point being read. */
  readonly text: string;
  /** The last number in that text, or null when it names none. */
  readonly value: number | null;
  /** How many of MAIDR's own highlight elements are visible. */
  readonly outlined: number;
  /** The first visible highlight's box, in page coordinates. */
  readonly box: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Page object for the pages r-maidr and py-maidr produce.
 *
 * Each fixture under `e2e_tests/fixtures/bindings/` is a binding's real output
 * with its bundled `maidr.js` swapped for this build, so a spec can ask what a
 * reader of that page gets from the code about to be released.
 */
export class BindingOutputPage extends BasePage {
  /**
   * The chart. Every binding renders one `<svg>` per figure; MAIDR is
   * attached to it.
   */
  private readonly svgSelector = 'svg';

  /**
   * Creates a new BindingOutputPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Opens one fixture and waits for its chart.
   * @param fixture - The fixture's file name, without `.html`
   * @throws BindingOutputError if the page does not load
   */
  public async open(fixture: string): Promise<void> {
    try {
      await super.navigateTo(`e2e_tests/fixtures/bindings/${fixture}.html`);
      await super.verifyPlotLoaded(this.svgSelector);
    } catch (error) {
      throw new BindingOutputError(`Failed to open ${fixture}`, { cause: error });
    }
  }

  /**
   * Moves focus onto the chart, as a keyboard user does.
   * @throws BindingOutputError if the chart does not take focus
   */
  public async enter(): Promise<void> {
    try {
      await super.activateMaidr(this.svgSelector, 'binding');
    } catch (error) {
      throw new BindingOutputError('Failed to focus the chart', { cause: error });
    }
  }

  /**
   * Presses one key and reads back what it produced.
   * @param key - The key to press
   * @returns The announcement and the highlight after the keypress
   * @throws BindingOutputError if the keypress is not announced
   */
  public async step(key: string): Promise<Reading> {
    try {
      await this.pressKeyAwaitingAnnouncement(key, `step ${key}`);
    } catch (error) {
      throw new BindingOutputError(`Pressing ${key} announced nothing`, { cause: error });
    }
    return this.page.evaluate(() => {
      const text = document.querySelector('#maidr-text-container')?.textContent?.trim() ?? '';
      const numbers = text.match(/-?\d+(?:\.\d+)?/g);
      const visible = Array.from(document.querySelectorAll('svg [data-maidr-owned]'))
        .filter(element => getComputedStyle(element).visibility !== 'hidden'
          && element.getAttribute('visibility') !== 'hidden');
      const first = visible[0]?.getBoundingClientRect();
      return {
        text,
        value: numbers ? Number(numbers[numbers.length - 1]) : null,
        outlined: visible.length,
        box: first ? { x: first.x, y: first.y, width: first.width, height: first.height } : null,
      };
    });
  }
}

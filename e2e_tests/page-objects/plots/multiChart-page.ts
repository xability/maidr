import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { MultiChartError } from '../../utils/errors';
import { BasePage } from '../base-page';

/** The attribute each chart's region is stamped with, holding its page order. */
const CHART_ATTRIBUTE = 'data-multi-chart';

/** The element MAIDR wraps every chart it reads in. */
export const CHART_ARTICLE = 'article[id^="maidr-article-"]';

/**
 * What the reader has in front of them in one chart after one keypress.
 */
export interface ChartReading {
  /** The text MAIDR shows for what is being read. */
  readonly text: string;
  /** How many of MAIDR's own highlight elements are visible in the chart. */
  readonly outlined: number;
  /**
   * The first visible highlight's box -- left, top, width and height -- as
   * fractions of the chart's own plot, or null when nothing is outlined. A
   * chart that shares a row with another is drawn smaller than one alone,
   * so pixels would not compare.
   */
  readonly box: number[] | null;
  /** The stroke of every panel MAIDR has outlined in the chart. */
  readonly panelStrokes: string[];
}

/**
 * Where MAIDR's elements are, chart by chart, in page order.
 */
export interface Ownership {
  /** Elements MAIDR created inside each chart. */
  readonly owned: number[];
  /** Elements MAIDR created inside no chart at all. */
  readonly ownedElsewhere: number;
  /** Panels MAIDR has outlined inside each chart. */
  readonly outlinedPanels: number[];
}

/**
 * Page object for a page holding several charts.
 *
 * Each chart has a region: everything on the page that belongs to it. That is
 * the article MAIDR wraps it in, or for a Plotly chart the graph div, which
 * also holds the layers Plotly draws over the chart outside that article. The
 * regions are numbered in page order when the page opens, and every method
 * names a chart by that number.
 */
export class MultiChartPage extends BasePage {
  /**
   * Creates a new MultiChartPage instance
   * @param page - The Playwright page object
   * @param region - What each chart's region is
   */
  constructor(page: Page, private readonly region: string) {
    super(page);
  }

  /**
   * Opens one fixture under `e2e_tests/fixtures/multi-chart/` and waits for
   * MAIDR to take every chart on it.
   * @param fixture - The fixture's file name, without `.html`
   * @param charts - How many charts it holds
   * @throws MultiChartError if the page or a chart does not load
   */
  public async open(fixture: string, charts: number): Promise<void> {
    try {
      await super.navigateTo(`e2e_tests/fixtures/multi-chart/${fixture}.html`);
      await expect(this.page.locator(CHART_ARTICLE)).toHaveCount(charts, { timeout: 15000 });
      const regions = await this.page.evaluate(({ region, attribute }) => {
        const found = Array.from(document.querySelectorAll(region));
        found.forEach((element, index) => element.setAttribute(attribute, String(index)));
        return found.length;
      }, { region: this.region, attribute: CHART_ATTRIBUTE });
      expect(regions).toBe(charts);
    } catch (error) {
      throw new MultiChartError(`Failed to open ${fixture}`, { cause: error });
    }
  }

  /**
   * Takes every chart but one off the page, so that one can be read alone.
   * @param chart - The chart to keep
   */
  public async isolate(chart: number): Promise<void> {
    await this.page.evaluate(({ attribute, keep }) => {
      for (const element of Array.from(document.querySelectorAll(`[${attribute}]`))) {
        if (element.getAttribute(attribute) !== keep) {
          element.remove();
        }
      }
    }, { attribute: CHART_ATTRIBUTE, keep: String(chart) });
  }

  /**
   * Moves focus onto one chart.
   * @param chart - The chart to focus
   * @throws MultiChartError if the chart does not take focus
   */
  public async enter(chart: number): Promise<void> {
    try {
      const plot = this.page.locator(`[${CHART_ATTRIBUTE}="${chart}"] figure[id^="maidr-figure-"] > [tabindex="0"]`);
      await plot.focus();
      await expect(plot).toBeFocused();
    } catch (error) {
      throw new MultiChartError(`Failed to focus chart ${chart}`, { cause: error });
    }
  }

  /**
   * Presses one key and reads back what it produced in one chart.
   * @param chart - The chart being read
   * @param key - The key to press
   * @returns What the chart shows after the keypress
   * @throws MultiChartError if the keypress is not announced
   */
  public async step(chart: number, key: string): Promise<ChartReading> {
    try {
      await this.pressKeyAwaitingAnnouncement(key, `step ${key}`);
    } catch (error) {
      throw new MultiChartError(`Pressing ${key} announced nothing`, { cause: error });
    }
    return this.page.evaluate(({ attribute, index }) => {
      const region = document.querySelector(`[${attribute}="${index}"]`);
      const plot = region?.querySelector('figure[id^="maidr-figure-"] > [tabindex="0"]');
      if (!region || !plot) {
        throw new Error(`chart ${index} is not on the page`);
      }
      const visible = Array.from(region.querySelectorAll('[data-maidr-owned]'))
        .filter(element => getComputedStyle(element).visibility !== 'hidden'
          && element.getAttribute('visibility') !== 'hidden');
      const origin = plot.getBoundingClientRect();
      const first = visible[0]?.getBoundingClientRect();
      return {
        text: region.querySelector('#maidr-text-container')?.textContent?.trim() ?? '',
        outlined: visible.length,
        box: first
          ? [
              (first.x - origin.x) / origin.width,
              (first.y - origin.y) / origin.height,
              first.width / origin.width,
              first.height / origin.height,
            ]
          : null,
        panelStrokes: Array.from(region.querySelectorAll('[data-maidr-orig-stroke]'))
          .map(element => element.getAttribute('stroke') ?? ''),
      };
    }, { attribute: CHART_ATTRIBUTE, index: chart });
  }

  /**
   * Counts MAIDR's elements chart by chart.
   * @returns Where they are
   */
  public async ownership(): Promise<Ownership> {
    return this.page.evaluate((attribute) => {
      const regions = Array.from(document.querySelectorAll(`[${attribute}]`));
      const count = (selector: string): number[] => regions
        .map(region => region.querySelectorAll(selector).length);
      const owned = count('[data-maidr-owned]');
      const total = document.querySelectorAll('[data-maidr-owned]').length;
      return {
        owned,
        ownedElsewhere: total - owned.reduce((sum, n) => sum + n, 0),
        outlinedPanels: count('[data-maidr-orig-stroke]'),
      };
    }, CHART_ATTRIBUTE);
  }
}

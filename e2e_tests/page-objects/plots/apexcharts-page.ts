import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { BasePage } from '../base-page';

/**
 * The ApexCharts CDN URL the examples load, pinned to 7.6.0 with an SRI hash.
 */
const APEXCHARTS_CDN = 'https://cdn.jsdelivr.net/npm/apexcharts@7.6.0/dist/apexcharts.min.js';

/**
 * The same file from the `apexcharts` devDependency. No other spec reaches the
 * network, so the CDN request is answered from here -- the same bytes, which
 * is why the page's integrity check still passes -- and a jsDelivr outage
 * cannot fail the suite.
 */
const APEXCHARTS_LOCAL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../node_modules/apexcharts/dist/apexcharts.min.js',
);

/** What the reader has after one keypress. */
export interface ApexChartsReading {
  /** The announced text, whitespace collapsed. */
  readonly text: string;
  /** How many of MAIDR's highlight elements are visible. */
  readonly outlined: number;
  /** The first visible highlight's box, or null when nothing is outlined. */
  readonly box: { x: number; y: number; width: number; height: number } | null;
}

/** A box on the page, as `getBoundingClientRect` gives it. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Page object for the ApexCharts adapter's example pages.
 *
 * Drives a page the way a reader does -- Tab onto the chart, press keys --
 * and reads back the announcement, the braille display and MAIDR's outline.
 * It also triggers the redraws ApexCharts performs on a live page (a data
 * update, a resize) and reports what the binding made of them.
 */
export class ApexChartsPage extends BasePage {
  protected override readonly selectors = {
    svg: '#chart svg.apexcharts-svg',
    chart: '#chart',
    text: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER}`,
    // The textarea's id ends with a React `useId()` suffix, so match on the
    // stable prefix rather than the whole id.
    braille: `textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`,
    figure: '[id^="maidr-figure"]',
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * Uncaught page errors, console errors, and every console message MAIDR
   * (`[maidr]`, `[MAIDR]`) or the adapter (`[maidr/apexcharts]`) wrote.
   */
  public readonly problems: string[] = [];

  /**
   * Records problems from the moment the page object exists.
   * @param page - The Playwright page
   */
  constructor(page: Page) {
    super(page);
    page.on('pageerror', error => this.problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().toLowerCase().includes('[maidr'))
        this.problems.push(`${message.type()}: ${message.text()}`);
    });
  }

  /**
   * Opens an example and waits until MAIDR has been handed the chart.
   * @param example - The file name under `examples/`, without `.html`
   */
  public async open(example: string): Promise<void> {
    const library = readFileSync(APEXCHARTS_LOCAL);
    await this.page.route(APEXCHARTS_CDN, route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body: library,
    }));
    await this.navigateTo(`examples/${example}.html`);
    await this.verifyPlotLoaded(this.selectors.svg);
    // bindApexCharts writes the schema once ApexCharts' entry animation ends,
    // and MAIDR wraps the chart in its figure when it takes it.
    await this.page.waitForSelector('[maidr-data]', { state: 'attached', timeout: 10000 });
    await this.page.waitForSelector(this.selectors.figure, { state: 'attached', timeout: 10000 });
    await this.waitUntilDrawn();
  }

  /**
   * Waits until the chart has stopped redrawing.
   *
   * Mounting MAIDR can change the space the chart has -- MAIDR's figure has
   * margins of its own -- and ApexCharts then draws the chart again at the new
   * width, after which the binding hands MAIDR the redrawn chart. A reader
   * arriving in the middle of that finds the outline gone until their next
   * key, so the tests wait for it to finish, as a reader Tabbing in would:
   * until the chart is drawn at its container's width, and then until
   * neither the chart nor the data MAIDR was handed has changed for a
   * second.
   */
  public async waitUntilDrawn(): Promise<void> {
    await expect.poll(
      () => this.page.evaluate(() => {
        const container = document.querySelector('#chart') as HTMLElement;
        const svg = container.querySelector('svg.apexcharts-svg');
        if (!svg)
          return Number.POSITIVE_INFINITY;
        const style = getComputedStyle(container);
        const content = container.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
        return Math.abs(svg.getBoundingClientRect().width - content);
      }),
      { timeout: 10000, intervals: [100] },
    ).toBeLessThanOrEqual(1);
    await this.page.evaluate(() => {
      const scope = window as unknown as { lastChartMutation?: number };
      scope.lastChartMutation = Date.now();
      new MutationObserver(() => {
        scope.lastChartMutation = Date.now();
      }).observe(document.querySelector('#chart') as Element, { subtree: true, childList: true, attributes: true });
    });
    await expect.poll(
      () => this.page.evaluate(() =>
        Date.now() - ((window as unknown as { lastChartMutation: number }).lastChartMutation)),
      { timeout: 10000, intervals: [100] },
    ).toBeGreaterThan(1000);
  }

  /** Tabs onto the chart, as a keyboard user does. */
  public async enter(): Promise<void> {
    await this.activateMaidr(this.selectors.svg, 'apexcharts');
  }

  /**
   * Presses one key -- wherever the focus is -- and reads back what it
   * produced.
   * @param key - The key to press
   * @returns The announcement and the highlight after the keypress
   */
  public async step(key: string): Promise<ApexChartsReading> {
    await this.pressKeyAwaitingAnnouncement(key, `step ${key}`);
    return this.read();
  }

  /**
   * Reads the announcement and the outline as they are now.
   * @returns The reading
   */
  public async read(): Promise<ApexChartsReading> {
    return this.page.evaluate((textSelector) => {
      const text = document.querySelector(textSelector)?.textContent ?? '';
      const visible = Array.from(document.querySelectorAll('svg [data-maidr-owned]'))
        .filter(element => getComputedStyle(element).visibility !== 'hidden'
          && element.getAttribute('visibility') !== 'hidden');
      const first = visible[0]?.getBoundingClientRect();
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        outlined: visible.length,
        box: first ? { x: first.x, y: first.y, width: first.width, height: first.height } : null,
      };
    }, this.selectors.text);
  }

  /**
   * Turns braille mode on and reads the display.
   * @returns The braille display's contents, whitespace trimmed
   */
  public async readBraille(): Promise<string> {
    await this.toggleBrailleMode();
    const textarea = await this.waitForElement(this.selectors.braille);
    return (await textarea.inputValue()).trim();
  }

  /**
   * Presses Tab from the chart and reports where the focus went.
   * @returns True when the focus is still inside the chart's container
   *   (on a control ApexCharts drew, such as a toolbar button)
   */
  public async tabStaysInChart(): Promise<boolean> {
    await this.pressKey(TestConstants.TAB_KEY, 'tab out of the chart');
    return this.page.evaluate(selector =>
      document.querySelector(selector)?.contains(document.activeElement) ?? false, this.selectors.chart);
  }

  /**
   * Whether the keyboard focus is on MAIDR's chart.
   * @returns True when the reader is in the chart
   */
  public async isInChart(): Promise<boolean> {
    return this.isMaidrPlotFocused();
  }

  /**
   * Replaces the chart's data through ApexCharts' own `updateSeries`, adding
   * one to every value, and waits until MAIDR has been handed the result.
   * The page must expose its chart as `window.chart` (see {@link exposeChart}).
   */
  public async updateEveryValue(): Promise<void> {
    await this.redraw(() => {
      const chart = (window as unknown as { chart: { w: { config: { series: { data: number[] }[] } }; updateSeries: (s: unknown) => void } }).chart;
      chart.updateSeries(chart.w.config.series.map(series => ({ ...series, data: series.data.map(value => value + 1) })));
    });
  }

  /**
   * Narrows the chart's container and tells ApexCharts the window resized,
   * then waits until MAIDR has been handed the redrawn chart.
   * @param maxWidth - The container's new `max-width`, in pixels
   */
  public async narrowTo(maxWidth: number): Promise<void> {
    await this.redraw((width) => {
      (document.querySelector('#chart') as HTMLElement).style.maxWidth = `${width}px`;
      window.dispatchEvent(new Event('resize'));
    }, maxWidth);
  }

  /**
   * Makes the page's chart reachable as `window.chart`, by wrapping the
   * ApexCharts constructor before the page's own script runs. Call it before
   * {@link open}.
   */
  public async exposeChart(): Promise<void> {
    await this.page.addInitScript(() => {
      let library: unknown;
      Object.defineProperty(window, 'ApexCharts', {
        configurable: true,
        get: () => library,
        set: (value: new (...args: unknown[]) => object) => {
          library = class extends value {
            constructor(...args: unknown[]) {
              super(...args);
              (window as unknown as { chart: object }).chart = this;
            }
          };
        },
      });
    });
  }

  /**
   * The width the chart's svg is drawn at.
   *
   * ApexCharts removes its svg while it redraws, so a reading taken then has
   * no svg, or an empty one, to measure. That gives NaN rather than an error
   * or a zero: NaN fails every comparison, so an `expect.poll` keeps polling,
   * where a throw would end it and a zero could pass it.
   * @returns The width, in CSS pixels, or NaN mid-redraw
   */
  public async svgWidth(): Promise<number> {
    return this.page.evaluate((selector) => {
      const width = document.querySelector(selector)?.getBoundingClientRect().width;
      return width || Number.NaN;
    }, this.selectors.svg);
  }

  /**
   * The box of one of the chart's drawn marks.
   * @param selector - A selector inside the chart's container
   * @returns The mark's box
   */
  public async boxOf(selector: string): Promise<Box> {
    const box = await this.page.locator(`${this.selectors.chart} ${selector}:not([data-maidr-owned])`).boundingBox();
    if (!box)
      throw new Error(`Nothing drawn for ${selector}`);
    return box;
  }

  /**
   * Whether the page scrolls sideways.
   * @returns True when the document is wider than the viewport
   */
  public async overflowsSideways(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  }

  /**
   * Runs something that makes ApexCharts redraw, and waits for the binding to
   * hand MAIDR the redrawn chart.
   *
   * The binding hands a redraw over through `window.maidrLive.setData`, so
   * that call is counted: wrapped here, in the page, before the redraw.
   * @param action - Runs in the page and triggers the redraw
   * @param arg - Passed to `action`
   */
  private async redraw(action: (arg: number) => void, arg = 0): Promise<void> {
    const before = await this.page.evaluate(() => {
      const scope = window as unknown as {
        maidrLive: { setData: (data: unknown) => boolean };
        rebinds?: number;
      };
      if (scope.rebinds === undefined) {
        scope.rebinds = 0;
        const setData = scope.maidrLive.setData;
        scope.maidrLive.setData = (data) => {
          scope.rebinds = (scope.rebinds ?? 0) + 1;
          return setData(data);
        };
      }
      return scope.rebinds;
    });
    await this.page.evaluate(action, arg);
    await expect.poll(
      () => this.page.evaluate(() => (window as unknown as { rebinds: number }).rebinds),
      { timeout: 10000 },
    ).toBeGreaterThan(before);
  }
}

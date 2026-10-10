import type { Page } from '@playwright/test';
import { TestError } from '../../utils/errors';
import { BasePage } from '../base-page';

/** Where the reader's focus is, as the host-guard checks read it. */
export interface FocusInfo {
  tagName: string;
  id: string;
  tabIndex: string | null;
  inChart: boolean;
}

/** The focus ring as the browser draws it. */
export interface RingStyle {
  style: string;
  width: string;
  color: string;
  offset: string;
}

/**
 * Page object for the host-guard fixtures: a chart written into a page whose
 * own shortcuts -- a deck's, a site search's, a card's -- would otherwise act
 * on the keys the reader presses in it.
 *
 * The hosts are stubs that record what they did in `window.hostLog`, so the
 * checks read that log rather than any DOM of the host's. The chart's own
 * reading is driven through `BasePage`'s navigation and mode helpers, which
 * wait for each announcement.
 */
export class HostGuardsPage extends BasePage {
  private readonly svgSelector: string;
  private readonly fixture: string;

  /**
   * Creates the page object for one of the host-guard fixtures.
   * @param page - The Playwright page object
   * @param fixture - The fixture's file name under `e2e_tests/fixtures/`
   * @param svgId - The id of the fixture's chart
   */
  constructor(page: Page, fixture: string, svgId: string) {
    super(page);
    this.fixture = fixture;
    this.svgSelector = `svg#${svgId}`;
  }

  /**
   * Opens the fixture and waits for its hosts to be ready: a reveal.js deck
   * says so a task after load.
   * @throws TestError if the fixture does not load
   */
  public async open(): Promise<void> {
    try {
      await super.navigateTo(`e2e_tests/fixtures/${this.fixture}`);
      await super.verifyPlotLoaded(this.svgSelector);
      await this.page.waitForFunction(() => {
        const reveal = (window as unknown as { Reveal?: { isReady: () => boolean } }).Reveal;
        return reveal === undefined || reveal.isReady();
      });
    } catch (error) {
      throw new TestError(`Failed to open ${this.fixture}`, { cause: error });
    }
  }

  /**
   * Tabs into the chart, its first tab stop.
   * @throws TestError if the chart does not take the focus
   */
  public async tabIntoChart(): Promise<void> {
    try {
      await super.activateMaidr(this.svgSelector, this.fixture);
    } catch (error) {
      throw new TestError('Failed to tab into the chart', { cause: error });
    }
  }

  /**
   * Moves the focus to the button after the chart, outside it.
   */
  public async focusOutside(): Promise<void> {
    await this.page.locator('#outside').focus();
  }

  /**
   * What the page's hosts have done since the page loaded.
   * @returns The host log
   */
  public async hostLog(): Promise<string[]> {
    return this.page.evaluate(() => [...(window as unknown as { hostLog: string[] }).hostLog]);
  }

  /**
   * How often the deck re-applied its config, reshuffling the slides.
   * @returns The count
   */
  public async reshuffles(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { reshuffles: number }).reshuffles);
  }

  /**
   * Whether the card around the chart is full screen.
   * @returns True while it is
   */
  public async cardIsFullScreen(): Promise<boolean> {
    return (await this.page.locator('#card').getAttribute('data-full-screen')) === 'true';
  }

  /**
   * Where the focus is.
   * @returns The focused element's tag, id, tabindex, and whether it is in the chart
   */
  public async focus(): Promise<FocusInfo> {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      return {
        tagName: active?.tagName ?? '',
        id: active?.id ?? '',
        tabIndex: active?.getAttribute('tabindex') ?? null,
        inChart: active?.closest('article[id^="maidr-article-"]') != null,
      };
    });
  }

  /**
   * The outline the focused element is drawn with.
   * @returns The computed outline
   */
  public async focusRing(): Promise<RingStyle> {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) {
        return { style: '', width: '', color: '', offset: '' };
      }
      const style = getComputedStyle(active);
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        color: style.outlineColor,
        offset: style.outlineOffset,
      };
    });
  }

  /**
   * The names of the markers set on the page's window, which must be none:
   * on `window` they are the bindings' own once-guards.
   * @returns The marker names the window has
   */
  public async windowMarkers(): Promise<string[]> {
    return this.page.evaluate(() =>
      ['__maidrHostGuard', '__maidrInline', '__maidrKnitr'].filter(marker => marker in window));
  }

  /**
   * Presses a key, or a chord, wherever the focus is, without waiting for an
   * announcement: the keys the hosts would take announce nothing in MAIDR.
   * @param key - The key, in Playwright's spelling
   * @throws KeypressError if the key press fails
   */
  public async press(key: string): Promise<void> {
    await this.pressKey(key, `press ${key} for the host page`);
  }
}

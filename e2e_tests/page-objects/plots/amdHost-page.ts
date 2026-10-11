import type { Locator, Page } from '@playwright/test';
import { announcementsSince, installAnnouncementRecorder } from '../../utils/announcements';
import { AmdHostError } from '../../utils/errors';
import { BasePage } from '../base-page';

/** What a `require()` on the page settled to. */
export interface RequireOutcome {
  /** `typeof` each module it resolved to (maidr.js and a pack: `undefined`). */
  resolved?: string[];
  /** The message require.js threw synchronously, as on a mismatch. */
  threw?: string;
  /** The message of the error require.js handed the errback. */
  failed?: string;
}

/**
 * Page object for the pages under `e2e_tests/fixtures/amd/`, each of which has
 * an AMD `define` before maidr.js runs and the same three-bar chart. It points
 * at fixtures rather than `examples/` because the loader, not the chart, is
 * what is under test.
 */
export class AmdHostPage extends BasePage {
  private static readonly SVG = 'svg#amd-host-bars';

  /**
   * Creates a new AmdHostPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /** MAIDR's article around the chart; there is none until maidr has run. */
  public get article(): Locator {
    return this.page.locator('article[id^="maidr-article"]');
  }

  /** The focusable wrapper whose label is the pre-activation instruction. */
  public get wrapper(): Locator {
    return this.article.locator('figure > div[tabindex="0"]').first();
  }

  /**
   * Opens one fixture and waits for its chart.
   * @param fixture - The fixture's file name, without `.html`
   * @throws AmdHostError if the page does not load
   */
  public async open(fixture: string): Promise<void> {
    try {
      await super.navigateTo(`e2e_tests/fixtures/amd/${fixture}.html`);
      await super.verifyPlotLoaded(AmdHostPage.SVG);
    } catch (error) {
      throw new AmdHostError(`Failed to open ${fixture}`, { cause: error });
    }
  }

  /**
   * Moves focus onto the chart, as a keyboard user does.
   * @throws AmdHostError if the chart does not take focus
   */
  public async enter(): Promise<void> {
    try {
      await super.activateMaidr(AmdHostPage.SVG, 'amd-host-bars');
    } catch (error) {
      throw new AmdHostError('Failed to focus the chart', { cause: error });
    }
  }

  /**
   * Steps to the next bar.
   * @returns What MAIDR announced for the step
   */
  public async next(): Promise<string[]> {
    const before = await installAnnouncementRecorder(this.page);
    await this.moveToNextDataPoint();
    return announcementsSince(this.page, before);
  }

  /**
   * Reads a value the fixture keeps on `window`, awaiting it if it is a
   * promise.
   * @param name - The property's name
   * @returns The value
   */
  public async read<T>(name: string): Promise<T> {
    return this.page.evaluate(
      key => (window as unknown as Record<string, unknown>)[key],
      name,
    ) as Promise<T>;
  }

  /**
   * Runs the page's own `require()`, as its AMD code does. Only the pages
   * with require.js define it (`require-later.js`).
   * @param names - The modules to require
   * @param config - What to hand `require.config()` first, if anything
   * @returns What the `require()` settled to
   */
  public async requireLater(names: string[], config?: object): Promise<RequireOutcome> {
    return this.page.evaluate(
      ([modules, settings]) => (window as unknown as {
        requireLater: (names: string[], config?: object) => Promise<RequireOutcome>;
      }).requireLater(modules, settings),
      [names, config] as const,
    );
  }

  /**
   * The locale packs that have run on the page: what `window.maidrLocales`
   * holds, a plain array until maidr.js adopts it.
   * @returns Each pack's locale code, in the order the packs ran
   */
  public async localePacks(): Promise<string[]> {
    return this.page.evaluate(() => {
      type Pack = [string, unknown];
      const holder = (window as unknown as { maidrLocales?: Pack[] | { seen: Pack[] } }).maidrLocales;
      const packs = Array.isArray(holder) ? holder : holder?.seen ?? [];
      return packs.map(([code]) => code);
    });
  }
}

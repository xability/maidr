import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * maidr's adapter bundles on a page with require.js.
 *
 * Each adapter's classic script was rolldown's UMD. On a page with an AMD
 * `define`, its wrapper handed the bundle to require.js as an anonymous module
 * instead of running it, and require.js runs one only when something asks for
 * it. Nothing does: maidr's Quarto extension loads `observable.js` by a script
 * tag, r-maidr reads `window.maidrECharts` and `window.maidrHighcharts`, and
 * every guide says to use the page global. So under require.js -- which Quarto
 * puts on every page a Jupyter render writes HTML into -- the global was never
 * set, Observable Plot charts were never watched, and require.js threw
 * "Mismatched anonymous define()" at the page's next `require()`, taking the
 * page's own widgets down with it.
 *
 * The bundles now always run and set their global, and then register with the
 * loader under their import path, which a module load resolves to. The
 * fixtures are under `e2e_tests/fixtures/amd/`; the README beside them says
 * where the require.js there comes from.
 *
 * Like liveData.spec.ts, this drives the pages directly rather than through a
 * page object: what is under test is the loader and the page globals, and
 * there is no chart on these pages.
 */

/** What a `require()` on the page settled to. */
interface RequireOutcome {
  /** Each module, named after the page global it is, or else its `typeof`. */
  resolved?: string[];
  /** The message require.js threw synchronously, as on a mismatch. */
  threw?: string;
  /** The message of the error require.js handed the errback. */
  failed?: string;
}

/**
 * Open a fixture, recording the errors the page throws.
 * @param page - The Playwright page
 * @param fixture - The fixture's file name, without `.html`
 * @returns The page's uncaught errors, filled in as they happen
 */
async function open(page: Page, fixture: string): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`e2e_tests/fixtures/amd/${fixture}.html`);
  return pageErrors;
}

/**
 * Run the page's next `require()`.
 * @param page - The Playwright page
 * @param names - The module names to require
 * @returns What it settled to
 */
async function requireLater(page: Page, names: string[]): Promise<RequireOutcome> {
  return page.evaluate(
    modules => (window as unknown as {
      requireLater: (names: string[]) => Promise<RequireOutcome>;
    }).requireLater(modules),
    names,
  );
}

/**
 * The names on a page global, so a missing global reads as `null` rather than
 * failing inside the page.
 * @param page - The Playwright page
 * @param name - The global's name
 * @returns Its keys, or null when it is not set
 */
async function globalKeys(page: Page, name: string): Promise<string[] | null> {
  return page.evaluate((key) => {
    const value = (window as unknown as Record<string, unknown>)[key];
    return value && typeof value === 'object' ? Object.keys(value) : null;
  }, name);
}

/**
 * Whether the Observable global carries the names the first release shipped,
 * as aliases of the current ones; maidr's Quarto extension and pages written
 * against that release call them.
 * @param page - The Playwright page
 * @returns True when both aliases are the functions they stand for
 */
async function hasQuartoAliases(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const api = (window as unknown as { maidrObservable?: Record<string, unknown> }).maidrObservable;
    return typeof api?.initObservablePlots === 'function'
      && api.initQuartoObservable === api.initObservablePlots
      && api.stopQuartoObservable === api.stopObservablePlots;
  });
}

test.describe('adapter bundles after require.js 2.3.6, as Quarto loads it', () => {
  test('set their page globals', async ({ page }) => {
    await open(page, 'adapters-requirejs');

    expect(await globalKeys(page, 'maidrObservable')).toEqual(expect.arrayContaining(['bindObservablePlot', 'TraceType']));
    expect(await globalKeys(page, 'maidrECharts')).toEqual(expect.arrayContaining(['createMaidrFromEChart', 'bindEChart']));
    expect(await globalKeys(page, 'maidrHighcharts')).toEqual(expect.arrayContaining(['highchartsToMaidr']));
    expect(await hasQuartoAliases(page)).toBe(true);
  });

  test('leave the page\'s later require() resolving', async ({ page }) => {
    const pageErrors = await open(page, 'adapters-requirejs');

    const outcome = await requireLater(page, ['jquery']);

    expect(outcome).toEqual({ resolved: ['object'] });
    expect(pageErrors).toEqual([]);
  });

  test('resolve to their page globals when required by import path', async ({ page }) => {
    const pageErrors = await open(page, 'adapters-requirejs');

    const outcome = await requireLater(page, ['maidr/observable', 'maidr/echarts', 'maidr/highcharts']);

    expect(outcome).toEqual({
      resolved: ['window.maidrObservable', 'window.maidrECharts', 'window.maidrHighcharts'],
    });
    expect(pageErrors).toEqual([]);
  });
});

test.describe('maidr\'s Quarto extension after require.js 2.3.6', () => {
  // maidr.js itself is still UMD here and makes the same anonymous define, so
  // this page keeps failing until the change that ships it as an IIFE lands.
  // Then this turns red: drop the `fail` and keep the assertions.
  test.fail();

  test('boots maidr and the Observable watcher, and the page\'s later require() resolves', async ({ page }) => {
    const pageErrors = await open(page, 'quarto-extension-requirejs');

    const outcome = await requireLater(page, ['jquery', 'maidr/observable']);

    expect(await page.evaluate(() => typeof (window as unknown as { maidrLive?: unknown }).maidrLive)).toBe('object');
    expect(await hasQuartoAliases(page)).toBe(true);
    expect(outcome).toEqual({ resolved: ['object', 'window.maidrObservable'] });
    expect(pageErrors).toEqual([]);
  });
});

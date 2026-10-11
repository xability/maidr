import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * maidr's adapter bundles on a page with require.js.
 *
 * Built as rolldown's UMD, an adapter never ran there: its page global was
 * never set -- maidr's Quarto extension loads `observable.js` by a script tag,
 * r-maidr reads `window.maidrECharts` and `window.maidrHighcharts`, and every
 * guide uses the global -- Observable Plot charts were never watched, and
 * require.js threw "Mismatched anonymous define()" at the page's next
 * `require()`. Now each runs and sets its global as soon as it loads, and then
 * registers itself: by its import path from a script tag, anonymously when
 * require.js loads it, so a load under any name or by URL resolves to the
 * global. The README beside the fixtures (`e2e_tests/fixtures/amd/`) says
 * more, and where the require.js there comes from; amdHost.spec.ts covers
 * maidr.js and the locale packs.
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
 * @param config - What to hand `require.config()` first, if anything
 * @returns What it settled to
 */
async function requireLater(page: Page, names: string[], config?: object): Promise<RequireOutcome> {
  return page.evaluate(
    ([modules, settings]) => (window as unknown as {
      requireLater: (names: string[], config?: object) => Promise<RequireOutcome>;
    }).requireLater(modules, settings),
    [names, config] as const,
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

test.describe('adapter bundles that require.js loads itself', () => {
  // `enforceDefine` fails a load the script makes no define for, so it also
  // pins that the load is answered by the bundle, not simulated.
  const config = {
    enforceDefine: true,
    paths: { maidrEC: '../../../dist/echarts', maidrObs: '../../../dist/observable' },
  };

  test('resolve under a paths alias or a URL, and set their page globals', async ({ page }) => {
    const pageErrors = await open(page, 'requirejs-loads');

    const outcome = await requireLater(page, ['maidrEC', 'maidrObs', '../../../dist/highcharts.js'], config);

    expect(outcome).toEqual({
      resolved: ['window.maidrECharts', 'window.maidrObservable', 'window.maidrHighcharts'],
    });
    expect(await hasQuartoAliases(page)).toBe(true);
    expect(await requireLater(page, ['jquery'])).toEqual({ resolved: ['object'] });
    expect(pageErrors).toEqual([]);
  });

  test('resolve under their import path', async ({ page }) => {
    const pageErrors = await open(page, 'requirejs-loads');

    const outcome = await requireLater(page, ['maidr/echarts'], {
      enforceDefine: true,
      paths: { 'maidr/echarts': '../../../dist/echarts' },
    });

    expect(outcome).toEqual({ resolved: ['window.maidrECharts'] });
    expect(pageErrors).toEqual([]);
  });
});

test.describe('maidr\'s Quarto extension after require.js 2.3.6', () => {
  test('boots maidr beside the Observable global, and the page\'s later require() resolves', async ({ page }) => {
    const pageErrors = await open(page, 'quarto-extension-requirejs');

    const outcome = await requireLater(page, ['jquery', 'maidr', 'maidr/observable']);

    expect(await page.evaluate(() => typeof (window as unknown as { maidrLive?: unknown }).maidrLive)).toBe('object');
    expect(await hasQuartoAliases(page)).toBe(true);
    expect(outcome).toEqual({ resolved: ['object', 'undefined', 'window.maidrObservable'] });
    expect(pageErrors).toEqual([]);
  });
});

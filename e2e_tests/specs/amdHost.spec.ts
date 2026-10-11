import { expect, test } from '@playwright/test';
import { AmdHostPage } from '../page-objects/plots/amdHost-page';

/**
 * maidr.js and its locale packs on a page with an AMD loader.
 *
 * Built as UMD, neither ran there: maidr never booted, a Korean reader's pack
 * never registered (the article said `lang="ko"` over English text), and
 * require.js threw "Mismatched anonymous define()" at the page's next
 * `require()`. maidr itself reported nothing: the chart was simply not there.
 * Now each runs as soon as it loads and then registers itself -- by name from
 * a script tag, anonymously when require.js loads it -- so the page's AMD code
 * keeps working and a module load of either resolves. The README beside the
 * fixtures (`e2e_tests/fixtures/amd/`) says more, and where the require.js
 * there comes from; amdAdapters.spec.ts covers the adapter bundles.
 */

const KOREAN_INSTRUCTION = /maidr 그래프입니다/;

test.describe('a page whose define counts the anonymous calls', () => {
  test('boots maidr, which makes none', async ({ page }) => {
    const host = new AmdHostPage(page);

    await host.open('define-stub');

    await expect(host.article).toHaveCount(1);
    expect(await host.read<number>('__anonymousDefines')).toBe(0);
    expect(await host.read<string[]>('__namedDefines')).toEqual(['maidr']);
  });

  test('announces the bar a reader moves to', async ({ page }) => {
    const host = new AmdHostPage(page);
    await host.open('define-stub');
    await host.enter();

    const announced = await host.next();

    expect(announced.join('\n')).toContain('Apples');
  });

  test.describe('in a Korean browser', () => {
    test.use({ locale: 'ko-KR' });

    test('runs the locale pack maidr fetches beside it', async ({ page }) => {
      const host = new AmdHostPage(page);

      await host.open('define-stub');

      await expect(host.article).toHaveAttribute('lang', 'ko');
      await expect(host.wrapper).toHaveAccessibleDescription(KOREAN_INSTRUCTION);
      expect(await host.read<number>('__anonymousDefines')).toBe(0);
      expect(await host.read<string[]>('__namedDefines')).toEqual(['maidr', 'maidr/locale/ko']);
    });
  });
});

test.describe('require.js 2.3.6, as Quarto loads it', () => {
  test('boots maidr, and the page\'s later require() resolves', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const host = new AmdHostPage(page);

    await host.open('requirejs');
    await expect(host.article).toHaveCount(1);
    const outcome = await host.requireLater(['jquery', 'maidr']);

    // `maidr` resolves to undefined, as it did when require.js ran the UMD.
    expect(outcome).toEqual({ resolved: ['object', 'undefined'] });
    expect(pageErrors).toEqual([]);
  });

  test.describe('in a Korean browser', () => {
    test.use({ locale: 'ko-KR' });

    test('runs the locale pack, and the page\'s require() after it resolves', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      const host = new AmdHostPage(page);

      await host.open('requirejs');
      await expect(host.article).toHaveAttribute('lang', 'ko');
      await expect(host.wrapper).toHaveAccessibleDescription(KOREAN_INSTRUCTION);
      const outcome = await host.requireLater(['jquery', 'maidr/locale/ko']);

      expect(outcome).toEqual({ resolved: ['object', 'undefined'] });
      expect(pageErrors).toEqual([]);
    });
  });
});

test.describe('maidr.js and a pack that require.js loads itself', () => {
  // A load by URL, or under a `paths` alias, as a page's own AMD code makes
  // one. `enforceDefine` fails a load the script makes no define for, so it
  // also pins that the script's own registration answers the load.
  const ENFORCE_DEFINE = { enforceDefine: true };

  test('resolves maidr.js by URL, and maidr boots', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const host = new AmdHostPage(page);
    await host.open('requirejs-loads');

    const outcome = await host.requireLater(['../../../dist/maidr.js'], ENFORCE_DEFINE);

    expect(outcome).toEqual({ resolved: ['undefined'] });
    await expect(host.article).toHaveCount(1);
    expect(await host.requireLater(['jquery'])).toEqual({ resolved: ['object'] });
    expect(pageErrors).toEqual([]);
  });

  test('resolves maidr.js under a paths alias, and maidr boots', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const host = new AmdHostPage(page);
    await host.open('requirejs-loads');

    const outcome = await host.requireLater(['maidrCore'], {
      ...ENFORCE_DEFINE,
      paths: { maidrCore: '../../../dist/maidr' },
    });

    expect(outcome).toEqual({ resolved: ['undefined'] });
    await expect(host.article).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });

  test('resolves a locale pack by URL, and the pack runs', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const host = new AmdHostPage(page);
    await host.open('requirejs-loads');

    const outcome = await host.requireLater(['../../../dist/locale-ko.js'], ENFORCE_DEFINE);

    expect(outcome).toEqual({ resolved: ['undefined'] });
    expect(await host.localePacks()).toEqual(['ko']);
    expect(pageErrors).toEqual([]);
  });

  test.describe('in a Korean browser', () => {
    test.use({ locale: 'ko-KR' });

    test('runs the pack maidr.js fetches beside itself', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      const host = new AmdHostPage(page);
      await host.open('requirejs-loads');

      const outcome = await host.requireLater(['../../../dist/maidr.js'], ENFORCE_DEFINE);

      expect(outcome).toEqual({ resolved: ['undefined'] });
      await expect(host.article).toHaveAttribute('lang', 'ko');
      await expect(host.wrapper).toHaveAccessibleDescription(KOREAN_INSTRUCTION);
      expect(await host.requireLater(['jquery'])).toEqual({ resolved: ['object'] });
      expect(pageErrors).toEqual([]);
    });
  });
});

test.describe('d3-require, as Observable and Quarto {ojs} cells load modules', () => {
  test('resolves require of maidr.js, and maidr boots', async ({ page }) => {
    const host = new AmdHostPage(page);

    await host.open('d3-require');

    // An IIFE that defined nothing would reject here with "invalid module".
    expect(await host.read<string>('__required')).toBe('resolved to undefined');
    await expect(host.article).toHaveCount(1);
  });

  test('announces the bar a reader moves to', async ({ page }) => {
    const host = new AmdHostPage(page);
    await host.open('d3-require');
    await expect(host.article).toHaveCount(1);
    await host.enter();

    const announced = await host.next();

    expect(announced.join('\n')).toContain('Apples');
  });
});

import { expect, test } from '@playwright/test';
import { AmdHostPage } from '../page-objects/plots/amdHost-page';

/**
 * maidr.js and its locale packs on a page with an AMD loader.
 *
 * Both used to ship as UMD. An entry with no exports gets a wrapper that, when
 * the page has an AMD `define`, hands the bundle to it as an anonymous module
 * instead of running it. Quarto loads require.js on every page a Jupyter
 * render writes HTML into. py-maidr's charts there run maidr.js through a
 * `define` shim of their own; a load without one -- maidr.js or a pack added
 * to such a page by hand -- never booted maidr, a Korean reader's pack never
 * registered (the article said `lang="ko"` over English text), and require.js
 * threw "Mismatched anonymous define()" at the page's next `require()`,
 * breaking the page's own widgets with it. maidr itself reported nothing: the
 * chart was simply not there.
 *
 * They are IIFEs now, which run whatever the page has, and each registers
 * itself under its import path once it has run, so a loader that loads one as
 * a module still resolves. The fixtures are under `e2e_tests/fixtures/amd/`;
 * the README beside them says where the require.js there comes from.
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
      await expect(host.wrapper).toHaveAttribute('aria-label', KOREAN_INSTRUCTION);
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
      await expect(host.wrapper).toHaveAttribute('aria-label', KOREAN_INSTRUCTION);
      const outcome = await host.requireLater(['jquery', 'maidr/locale/ko']);

      expect(outcome).toEqual({ resolved: ['object', 'undefined'] });
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

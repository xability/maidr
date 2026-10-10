import { expect, test } from '@playwright/test';
import { HostGuardsPage } from '../page-objects/plots/hostGuards-page';
import { announcementsSince, installAnnouncementRecorder } from '../utils/announcements';
import { modifierKey } from '../utils/platform';

/**
 * A chart that shares its page with the page's own shortcuts.
 *
 * In a frame of its own, a chart hears every key and the page none. Written
 * into the page -- a Quarto or R Markdown slide, a website with a search box,
 * a dashboard card -- it shares them, and every one of those pages acts on
 * keys MAIDR uses: the arrow keys turn the slide, `f` opens the site search,
 * Escape leaves the card's full screen, `/` jumps to pkgdown's search box.
 * MAIDR holds each of them off while the reader is in the chart, and only
 * then, so the checks here go both ways: the page's shortcut does nothing
 * from inside the chart, and works as before from outside it.
 *
 * The hosts are stubs that listen where the real ones listen and ask what the
 * real ones ask (see the comments in the fixtures). They write what they did
 * to a log the checks read.
 */

test.describe('Host-page guards (host-guards.html)', () => {
  let host: HostGuardsPage;

  test.beforeEach(async ({ page }) => {
    host = new HostGuardsPage(page, 'host-guards.html', 'host-guards');
    await host.open();
  });

  test('the page\'s shortcuts leave the keys pressed in the chart alone', async ({ page }) => {
    const modifier = await modifierKey(page);
    await host.tabIntoChart();

    await host.moveToNextDataPoint();
    await host.press('f');
    await host.press(`${modifier}+Shift+F`);

    expect(await host.hostLog()).toEqual([]);
  });

  test('the page\'s shortcuts work as before outside the chart', async ({ page }) => {
    const modifier = await modifierKey(page);
    await host.tabIntoChart();
    await host.focusOutside();

    await host.press('ArrowRight');
    await host.press('f');
    await host.press(`${modifier}+Shift+F`);

    expect(await host.hostLog()).toEqual([
      'reveal:ArrowRight',
      'mousetrap:ArrowRight',
      'slidy:ArrowRight',
      'quarto-search',
      'reveal-search',
    ]);
  });

  test('Escape in braille mode leaves the full-screen card full screen', async () => {
    await host.tabIntoChart();
    await host.toggleBrailleMode();

    await host.press('Escape');

    expect(await host.cardIsFullScreen()).toBe(true);

    await host.focusOutside();
    await host.press('Escape');

    expect(await host.cardIsFullScreen()).toBe(false);
    expect(await host.hostLog()).toEqual(['card-exit']);
  });

  test('/ in braille mode resets the speed, and pkgdown\'s search box does not take it', async ({ page }) => {
    await host.tabIntoChart();
    await host.toggleBrailleMode();
    const mark = await installAnnouncementRecorder(page);

    await host.resetSpeed();

    expect(await announcementsSince(page, mark)).toContain('Reset speed');
    expect((await host.focus()).inChart).toBe(true);
    expect(await host.hostLog()).toEqual([]);
  });

  test('the chart has a solid ring on a page that removes every outline', async () => {
    await host.tabIntoChart();

    expect(await host.focusRing()).toEqual({
      style: 'solid',
      width: '3px',
      color: 'rgb(26, 95, 180)',
      offset: '-3px',
    });
  });

  test('Shift+Tab from the first thing on the slide lands on the slide, where the deck\'s keys work', async () => {
    await host.tabIntoChart();

    await host.press('Shift+Tab');

    expect(await host.focus()).toEqual({ tagName: 'SECTION', id: 'slide-1', tabIndex: '-1', inChart: false });

    await host.press('ArrowRight');

    expect(await host.hostLog()).toContain('reveal:ArrowRight');
  });

  test('the deck is never re-configured, and nothing is written on the window', async ({ page }) => {
    await host.tabIntoChart();
    await host.moveToNextDataPoint();

    // `configure()` would have reshuffled this deck once per call.
    expect(await host.reshuffles()).toBe(0);
    // On the window, these are the bindings' once-guards.
    expect(await host.windowMarkers()).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { Reveal: { __maidrHostGuard?: boolean } }).Reveal.__maidrHostGuard)).toBe(true);
  });
});

test.describe('Host-page guards on ioslides (host-guards-ioslides.html)', () => {
  let host: HostGuardsPage;

  test.beforeEach(async ({ page }) => {
    host = new HostGuardsPage(page, 'host-guards-ioslides.html', 'host-guards-ioslides');
    await host.open();
  });

  test('the deck built at DOMContentLoaded leaves the keys pressed in the chart alone', async () => {
    await host.tabIntoChart();

    await host.moveToNextDataPoint();

    expect(await host.hostLog()).toEqual([]);
  });

  test('Shift+Tab lands on the slide, where the deck\'s keys work again', async () => {
    await host.tabIntoChart();

    await host.press('Shift+Tab');

    expect(await host.focus()).toEqual({ tagName: 'SLIDE', id: 'slide-1', tabIndex: '-1', inChart: false });

    await host.press('ArrowRight');

    expect(await host.hostLog()).toEqual(['ioslides:ArrowRight']);
  });
});

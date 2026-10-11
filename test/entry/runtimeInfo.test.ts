/**
 * Tests for what the script bundle tells a binding about itself
 * (`src/index.tsx`), and for when it guards a host page.
 *
 * py-maidr and r-maidr carry their own copies of the host-page guards and the
 * focus ring, for the maidr.js releases that predate them. They stand theirs
 * down by reading `window.maidrLive.features` at runtime, so those flags have
 * to be there, and fixed, from the moment the bundle runs.
 */

import { JSDOM } from 'jsdom';
import packageJson from '../../package.json';

jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: jest.fn(),
  disposeMaidrOnElement: jest.fn(),
}));

/**
 * Loads the entry point into a fresh window.
 *
 * @param configure - Anything to set on the window before the entry loads.
 * @returns The window.
 */
async function loadPage(
  configure: (window: JSDOM['window']) => void = () => {},
): Promise<JSDOM['window']> {
  const { window } = new JSDOM('<!DOCTYPE html><body></body>');
  Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLCollection: window.HTMLCollection,
    HTMLInputElement: window.HTMLInputElement,
    SVGElement: window.SVGElement,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
  });
  configure(window);
  await jest.isolateModulesAsync(async () => {
    await import('../../src/index');
  });
  return window;
}

describe('window.maidrLive', () => {
  it('should name the release the bundle is', async () => {
    const window = await loadPage();

    expect(window.maidrLive?.version).toBe(packageJson.version);
  });

  it('should list the host-page features, frozen', async () => {
    const window = await loadPage();
    const features = window.maidrLive?.features;

    expect(features).toEqual({ hostGuards: 1, focusRing: 1 });
    expect(Object.isFrozen(features)).toBe(true);
  });
});

describe('the host-page guards', () => {
  it('should be installed as soon as the bundle runs, before a deck is built', async () => {
    // ioslides binds its key handler when it builds the deck at
    // DOMContentLoaded, so a prototype guarded any later is guarded too late.
    const previous = jest.fn();
    function SlideDeck(): void {}
    SlideDeck.prototype.onBodyKeyDown_ = previous;

    await loadPage((window) => {
      (window as unknown as { SlideDeck: unknown }).SlideDeck = SlideDeck;
    });

    expect(SlideDeck.prototype.onBodyKeyDown_).not.toBe(previous);
    expect((SlideDeck as unknown as { __maidrHostGuard?: boolean }).__maidrHostGuard).toBe(true);
  });
});

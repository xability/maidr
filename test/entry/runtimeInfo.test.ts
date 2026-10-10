/**
 * Tests for when the script bundle (`src/index.tsx`) guards a host page.
 */

import { JSDOM } from 'jsdom';

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

/**
 * Tests for the entry point's legacy `window.maidr` fallback (`src/index.tsx`).
 *
 * Browsers expose an element with `id="maidr"` as `window.maidr`, so a page
 * that merely names a container `maidr` used to have that element read as
 * chart data, and start-up threw. Only real chart data may take the fallback.
 */

import { JSDOM } from 'jsdom';

const mockInitMaidrOnElement = jest.fn();

jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: mockInitMaidrOnElement,
  disposeMaidrOnElement: jest.fn(),
}));

const SPEC = {
  id: 'chart',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
      data: [{ x: 'Q1', y: 120 }],
    }],
  }]],
};

/**
 * Load the entry point into a fresh window holding `body`, and let it scan.
 *
 * @param body - The page's body markup.
 * @param configure - Anything to set on the window before the entry loads.
 * @returns The window.
 */
async function loadPage(
  body: string,
  configure: (window: JSDOM['window']) => void = () => {},
): Promise<JSDOM['window']> {
  const { window } = new JSDOM(`<!DOCTYPE html><body>${body}</body>`);
  Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLCollection: window.HTMLCollection,
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

describe('the legacy window.maidr fallback', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    mockInitMaidrOnElement.mockClear();
    warn.mockClear();
    error.mockClear();
  });

  afterAll(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('should leave an element named maidr alone rather than read it as chart data', async () => {
    const window = await loadPage('<main id="maidr"></main>');

    // The browser, not the page, put the element there.
    expect(window.maidr).toBeInstanceOf(window.HTMLElement);
    expect(mockInitMaidrOnElement).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('should leave two elements named maidr alone too', async () => {
    await loadPage('<div id="maidr"></div><div id="maidr"></div>');

    expect(mockInitMaidrOnElement).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('should still initialise chart data a page assigned to window.maidr', async () => {
    await loadPage('<svg id="chart"></svg>', (window) => {
      window.maidr = SPEC as never;
    });

    expect(mockInitMaidrOnElement).toHaveBeenCalledTimes(1);
    expect(mockInitMaidrOnElement.mock.calls[0][0]).toBe(SPEC);
  });

  it('should warn about, and skip, a window.maidr that is neither data nor an element', async () => {
    await loadPage('<svg id="chart"></svg>', (window) => {
      window.maidr = { id: 'chart' } as never;
    });

    expect(mockInitMaidrOnElement).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not MAIDR chart data'));
  });
});

/**
 * Tests for the entry point's watch for dynamically-created Plotly charts
 * (`observeForPlotlyDivs` in `src/index.tsx`).
 *
 * Plotly emits its events through its own emitter, never as DOM events, so a
 * DOM `plotly_afterplot` listener never fires and never removes itself. The
 * observer re-offers a chart once Plotly inserts its SVG instead.
 */

import { JSDOM } from 'jsdom';

const mockClaimPlotlyExamination = jest.fn(() => false);

jest.mock('../../src/adapters/plotly', () => ({
  claimPlotlyExamination: mockClaimPlotlyExamination,
  extractPlotlyData: jest.fn(() => null),
  isPlotlyPlot: jest.fn(() => false),
  normalizePlotlySvg: jest.fn(),
}));

jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: jest.fn(),
  disposeMaidrOnElement: jest.fn(),
}));

/**
 * Load the entry point into a fresh window holding `body`, and let it scan.
 *
 * @param body - The page's body markup.
 * @returns The window.
 */
async function loadPage(body: string): Promise<JSDOM['window']> {
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
  await jest.isolateModulesAsync(async () => {
    await import('../../src/index');
  });
  return window;
}

/** Lets the MutationObserver callbacks queued so far run. */
async function flushObservers(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('the Plotly chart observer', () => {
  beforeEach(() => {
    mockClaimPlotlyExamination.mockClear();
  });

  it('should not pile up listeners on a chart div that has no SVG yet', async () => {
    const window = await loadPage('<div id="gd" class="js-plotly-plot"></div>');
    const gd = window.document.getElementById('gd')!;
    const addEventListener = jest.spyOn(gd, 'addEventListener');

    // Unrelated page mutations, such as live-region updates elsewhere.
    for (let i = 0; i < 3; i++) {
      window.document.body.appendChild(window.document.createElement('span'));
      await flushObservers();
    }

    expect(addEventListener).not.toHaveBeenCalledWith('plotly_afterplot', expect.anything());
    window.disconnectMaidrObservers?.();
  });

  it('should offer the chart again once Plotly inserts its SVG', async () => {
    const window = await loadPage('<div id="gd" class="js-plotly-plot"></div>');
    const gd = window.document.getElementById('gd')!;
    expect(mockClaimPlotlyExamination).not.toHaveBeenCalled();

    const svg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'main-svg');
    gd.appendChild(svg);
    await flushObservers();

    expect(mockClaimPlotlyExamination).toHaveBeenCalledWith(gd);
    window.disconnectMaidrObservers?.();
  });
});

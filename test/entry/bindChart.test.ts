/**
 * Tests for the `maidr:bindchart` listener registered by the script-tag entry
 * point (`src/index.tsx`).
 *
 * Adapters bind a chart by stamping `maidr-data` on the rendered element and
 * dispatching `maidr:bindchart` on it. Charting libraries render into `<svg>`,
 * which is an `SVGElement` and *not* an `HTMLElement`, so the listener has to
 * accept any `Element` — otherwise SVG-rooted charts are dropped silently.
 */

import { JSDOM } from 'jsdom';

const mockInitMaidrOnElement = jest.fn();

jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: mockInitMaidrOnElement,
}));

const SVG_NS = 'http://www.w3.org/2000/svg';

const SPEC = {
  id: 'chart',
  title: 'Revenue by Quarter',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      selectors: 'rect.bar',
      axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
      data: [{ x: 'Q1', y: 120 }, { x: 'Q2', y: 185 }],
    }],
  }]],
};

/** Dispatches the adapter binding event the way real adapters do. */
function bindChart(element: Element): void {
  element.setAttribute('maidr-data', JSON.stringify(SPEC));
  element.dispatchEvent(
    new CustomEvent('maidr:bindchart', { bubbles: true, detail: SPEC }),
  );
}

describe('maidr:bindchart listener', () => {
  beforeAll(async () => {
    // `instanceof` checks inside the entry point resolve against these globals,
    // so every element the tests create must come from this same window.
    const { window } = new JSDOM('<!DOCTYPE html><body></body>');
    Object.assign(globalThis, {
      window,
      document: window.document,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      SVGElement: window.SVGElement,
      Node: window.Node,
      Event: window.Event,
      CustomEvent: window.CustomEvent,
      MutationObserver: window.MutationObserver,
    });
    // Imported after the DOM exists: the listener registers at module scope.
    await import('../../src/index');
  });

  beforeEach(() => {
    mockInitMaidrOnElement.mockClear();
    document.body.innerHTML = '';
  });

  it('initialises MAIDR when the bound element is an <svg>', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    document.body.appendChild(svg);

    bindChart(svg);

    expect(mockInitMaidrOnElement).toHaveBeenCalledTimes(1);
    expect(mockInitMaidrOnElement.mock.calls[0][1]).toBe(svg);
  });

  it('initialises MAIDR when the bound element is an HTML host div', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    bindChart(host);

    expect(mockInitMaidrOnElement).toHaveBeenCalledTimes(1);
    expect(mockInitMaidrOnElement.mock.calls[0][1]).toBe(host);
  });

  it('ignores the event when the bound element carries no maidr-data', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    document.body.appendChild(svg);

    svg.dispatchEvent(
      new CustomEvent('maidr:bindchart', { bubbles: true, detail: SPEC }),
    );

    expect(mockInitMaidrOnElement).not.toHaveBeenCalled();
  });
});

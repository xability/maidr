/**
 * @jest-environment jsdom
 */

import type { MermaidApi } from '@adapters/mermaid/types';
import { watchQuartoMermaid } from '@adapters/mermaid/quarto';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * watchQuartoMermaid against a page shaped as Quarto renders a `{mermaid}`
 * cell, and against Quarto's own draw loop (`mermaid-init.js`), replayed by
 * hand: each `<pre class="mermaid mermaid-js">` is drawn under `mermaid-<n>`
 * in document order, replaced by its SVG, and a labelled cell's SVG renamed.
 */

const PIE = 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85';

/**
 * Lays out the cells as Quarto writes them.
 *
 * @param cells - Each cell's text, and its label when it has one
 */
function quartoPage(cells: { text: string; label?: string }[]): void {
  document.body.innerHTML = cells.map(({ text, label }) => `
    <div class="cell-output-display"><div>
      <pre class="mermaid mermaid-js"${label ? ` data-label="${label}"` : ''}>${text}</pre>
    </div></div>`).join('');
}

/**
 * Draws the page's cells as Quarto's `mermaid-init.js` does, one at a time.
 *
 * @param slices - How many slices to draw per diagram, by its render id
 * @param stopAt - Draw only this many, as when a cell's text stops the loop
 */
async function quartoDraws(slices: Record<string, number>, stopAt = Infinity): Promise<void> {
  let n = 0;
  for (const pre of [...document.querySelectorAll('pre.mermaid-js')]) {
    if (n >= stopAt) {
      return;
    }
    n += 1;
    await Promise.resolve();
    const host = pre.parentElement as HTMLElement;
    const id = `mermaid-${n}`;
    const label = (pre as HTMLElement).dataset.label;
    host.removeChild(pre);
    host.insertAdjacentHTML('beforeend', `<svg id="${label ? `${label}-mermaid` : id}">${
      '<path class="pieCircle"></path>'.repeat(slices[id] ?? 2)}</svg>`);
    host.querySelector('svg')?.classList.add('mermaid-js');
  }
}

/**
 * A stand-in for the Mermaid Quarto loads, set as the page's global.
 *
 * @returns The texts it was asked to parse
 */
function pageMermaid(): string[] {
  const parsed: string[] = [];
  const mermaid: MermaidApi = {
    mermaidAPI: {
      getDiagramFromText: async (text) => {
        parsed.push(text);
        return { type: 'pie', db: { getSections: () => new Map([['Dogs', 386], ['Cats', 85]]) } };
      },
    },
    render: async () => ({ svg: '<svg></svg>' }),
  };
  (window as Window & { mermaid?: MermaidApi }).mermaid = mermaid;
  return parsed;
}

/**
 * Lets the watcher's mutation callbacks and parses run.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('watchQuartoMermaid', () => {
  let errors: jest.SpiedFunction<typeof console.error>;
  let stop: () => void = () => {};

  beforeEach(() => {
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stop();
    errors.mockRestore();
    document.body.innerHTML = '';
    delete (window as Window & { mermaid?: MermaidApi }).mermaid;
  });

  it('binds every diagram once Quarto has drawn them all, from the text Quarto drew', async () => {
    quartoPage([{ text: PIE }, { text: PIE.replace('Pets', 'More') }]);
    const parsed = pageMermaid();

    stop = watchQuartoMermaid();
    await quartoDraws({});
    await settle();

    const drawings = [...document.querySelectorAll('svg.mermaid-js')];
    expect(drawings.map(svg => svg.hasAttribute('maidr'))).toEqual([true, true]);
    expect(parsed).toEqual([PIE, PIE.replace('Pets', 'More')]);
  });

  it('pairs a labelled diagram by the id Quarto drew it under, not the one it renamed it to', async () => {
    quartoPage([{ text: PIE, label: 'fig-pets' }]);
    pageMermaid();

    stop = watchQuartoMermaid();
    await quartoDraws({});
    await settle();

    const svg = document.querySelector('svg.mermaid-js') as SVGSVGElement;
    expect(svg.id).toBe('fig-pets-mermaid');
    const maidr = JSON.parse(svg.getAttribute('maidr') ?? '{}');
    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.data).toEqual([{ x: 'Dogs', y: 386 }, { x: 'Cats', y: 85 }]);
    // Scoped to the drawing as it is now named, so the outline still lands.
    expect(document.querySelectorAll(layer.selectors)).toHaveLength(2);
  });

  it('leaves room for MAIDR\'s focus ring inside the drawing Quarto drew', async () => {
    quartoPage([{ text: PIE }]);
    pageMermaid();

    stop = watchQuartoMermaid();
    await quartoDraws({});
    await settle();

    const svg = document.querySelector('svg.mermaid-js') as SVGSVGElement;
    expect(svg.hasAttribute('maidr')).toBe(true);
    expect(svg.style.padding).toBe('6px');
    expect(svg.style.boxSizing).toBe('border-box');
  });

  it('parses nothing while Quarto is still drawing, since parses share state', async () => {
    quartoPage([{ text: PIE }, { text: PIE }]);
    const parsed = pageMermaid();

    stop = watchQuartoMermaid();
    await quartoDraws({}, 1);
    await settle();

    expect(parsed).toEqual([]);
    expect(document.querySelector('svg[maidr]')).toBeNull();
  });

  it('binds what Quarto drew when a cell stops its loop, once the page has loaded', async () => {
    jest.useFakeTimers();
    try {
      quartoPage([{ text: PIE }, { text: 'not a diagram' }]);
      pageMermaid();

      stop = watchQuartoMermaid();
      await quartoDraws({}, 1);
      window.dispatchEvent(new Event('load'));
      await jest.advanceTimersByTimeAsync(2500);

      expect(document.querySelectorAll('svg[maidr]')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits for a slow draw to go still before binding what it has drawn', async () => {
    jest.useFakeTimers();
    try {
      quartoPage([{ text: PIE }, { text: PIE }, { text: PIE }]);
      const parsed = pageMermaid();

      stop = watchQuartoMermaid();
      window.dispatchEvent(new Event('load'));
      await quartoDraws({}, 1);
      await jest.advanceTimersByTimeAsync(1500);
      await quartoDraws({}, 1);
      await jest.advanceTimersByTimeAsync(1500);

      // Three seconds after load, but drawing moved 1.5 s ago: nothing yet.
      expect(parsed).toEqual([]);

      await jest.advanceTimersByTimeAsync(1000);

      expect(document.querySelectorAll('svg[maidr]')).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('binds a stalled draw even while the rest of the page keeps changing', async () => {
    jest.useFakeTimers();
    try {
      quartoPage([{ text: PIE }, { text: 'not a diagram' }]);
      pageMermaid();
      const ticker = document.createElement('p');
      document.body.append(ticker);

      stop = watchQuartoMermaid();
      window.dispatchEvent(new Event('load'));
      await quartoDraws({}, 1);
      for (let i = 0; i < 10; i += 1) {
        ticker.textContent = String(i);
        await jest.advanceTimersByTimeAsync(500);
      }

      expect(document.querySelectorAll('svg[maidr]')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks a cell it cannot read and still binds the others', async () => {
    quartoPage([{ text: 'broken' }, { text: PIE }]);
    const parsed = pageMermaid();
    const mermaid = (window as Window & { mermaid?: MermaidApi }).mermaid as MermaidApi;
    const parse = mermaid.mermaidAPI.getDiagramFromText;
    mermaid.mermaidAPI.getDiagramFromText = async (text) => {
      if (text === 'broken') {
        throw new Error('no diagram');
      }
      return parse(text);
    };

    stop = watchQuartoMermaid();
    await quartoDraws({});
    await settle();

    const drawings = [...document.querySelectorAll('svg.mermaid-js')];
    expect(drawings.map(svg => svg.hasAttribute('maidr'))).toEqual([false, true]);
    expect(drawings[0].parentElement?.hasAttribute('data-maidr-mermaid-failed')).toBe(true);
    expect(parsed).toEqual([PIE]);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a page without `{mermaid}` cells', async () => {
    document.body.innerHTML = '<svg id="other"></svg>';
    const parsed = pageMermaid();

    stop = watchQuartoMermaid();
    await settle();

    expect(parsed).toEqual([]);
    expect(document.querySelector('svg[maidr]')).toBeNull();
  });
});

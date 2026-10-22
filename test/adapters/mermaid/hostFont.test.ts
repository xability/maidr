/**
 * @jest-environment jsdom
 */

import type { MermaidApi } from '@adapters/mermaid/types';
import { renderMermaid } from '@adapters/mermaid/bind';
import { beforeEach, describe, expect, it } from '@jest/globals';

/**
 * The font of the element `renderMermaid` draws a diagram in.
 *
 * MAIDR shows its text and dialogs inside that element, so in Mermaid's own
 * `<pre class="mermaid">` they took the `<pre>`'s monospace. A stand-in
 * plays Mermaid's part, as in `bindIds.test.ts`.
 */

const pie: MermaidApi = {
  mermaidAPI: {
    getDiagramFromText: async () => ({
      type: 'pie',
      db: { getSections: () => new Map([['Dogs', 3], ['Cats', 2]]) },
    }),
  },
  render: async (id: string) => ({
    svg: `<svg id="${id}"><g><path class="pieCircle"></path><path class="pieCircle"></path></g></svg>`,
  }),
};

/**
 * The element the page holds the diagram in.
 *
 * @param markup - The page
 * @returns The diagram's element
 */
function host(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.querySelector('.mermaid') as HTMLElement;
}

describe('the font of the element a diagram is drawn in', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('gives a <pre> the page\'s font once the diagram is drawn in it', async () => {
    const element = host('<pre class="mermaid">pie\n  "Dogs" : 3</pre>');

    await renderMermaid(pie, element);

    expect(element.style.fontFamily).toBe('inherit');
  });

  it('leaves a host that is not a <pre> alone', async () => {
    const element = host('<div class="mermaid">pie\n  "Dogs" : 3</div>');

    await renderMermaid(pie, element);

    expect(element.style.fontFamily).toBe('');
  });

  it('keeps a font set on the <pre> itself', async () => {
    const element = host('<pre class="mermaid" style="font-family: Georgia">pie\n  "Dogs" : 3</pre>');

    await renderMermaid(pie, element);

    expect(element.style.fontFamily).toBe('Georgia');
  });

  it('leaves a <pre> whose diagram could not be drawn in its own font', async () => {
    const element = host('<pre class="mermaid">not a diagram</pre>');
    const broken: MermaidApi = { ...pie, render: async () => Promise.reject(new Error('no diagram')) };

    await expect(renderMermaid(broken, element)).rejects.toThrow('no diagram');

    expect(element.style.fontFamily).toBe('');
  });
});

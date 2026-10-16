/**
 * @jest-environment jsdom
 */

import type { MermaidApi } from '@adapters/mermaid/types';
import { bindMermaid } from '@adapters/mermaid/bind';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * bindMermaid against a stand-in Mermaid, which does not load under jsdom.
 *
 * Its `render` draws an empty SVG with the id it is given, and fails on text
 * starting with `broken`; its parser reads a pie, and fails on text starting
 * with `unknown`, so a diagram can fail before it is drawn or after.
 */

const PIE = 'pie title Pets\n  "Dogs" : 3';

/**
 * A stand-in Mermaid that counts its calls.
 *
 * @returns The API and the texts each method was called with
 */
function standIn(): { mermaid: MermaidApi; rendered: string[]; parsed: string[] } {
  const rendered: string[] = [];
  const parsed: string[] = [];
  const mermaid: MermaidApi = {
    mermaidAPI: {
      getDiagramFromText: async (text) => {
        parsed.push(text);
        if (text.startsWith('unknown')) {
          throw new Error('No diagram type detected');
        }
        return { type: 'pie', db: { getSections: () => new Map([['Dogs', 3]]) } };
      },
    },
    render: async (id, text) => {
      rendered.push(text);
      if (text.startsWith('broken')) {
        throw new Error('Parse error on line 1');
      }
      return { svg: `<svg id="${id}"></svg>` };
    },
  };
  return { mermaid, rendered, parsed };
}

describe('bindMermaid called again', () => {
  let errors: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errors.mockRestore();
    document.body.innerHTML = '';
  });

  it.each([
    ['fails to render', 'broken diagram'],
    ['renders but fails to convert', 'unknown diagram'],
  ])('leaves a diagram that %s alone, and reports it once', async (_, bad) => {
    document.body.innerHTML = `
      <pre class="mermaid" id="a">${PIE}</pre>
      <pre class="mermaid" id="bad">${bad}</pre>
      <pre class="mermaid" id="b">${PIE}</pre>`;
    const { mermaid, rendered } = standIn();

    expect(await bindMermaid(mermaid)).toHaveLength(2);
    expect(await bindMermaid(mermaid)).toHaveLength(0);

    expect(rendered.filter(text => text === bad)).toHaveLength(1);
    expect(rendered).toHaveLength(3);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain('[maidr/mermaid]');
    expect(String(errors.mock.calls[0][0])).toContain('#bad');
    for (const id of ['a', 'b']) {
      expect(document.querySelector(`#${id} svg[maidr]`)).not.toBeNull();
    }
    expect(document.querySelector('#bad svg[maidr]')).toBeNull();
  });

  it('tries a failed diagram again once its text changes', async () => {
    document.body.innerHTML = '<pre class="mermaid" id="bad">broken diagram</pre>';
    const { mermaid, rendered } = standIn();
    await bindMermaid(mermaid);

    document.querySelector('#bad')!.setAttribute('data-maidr-mermaid-source', PIE);
    expect(await bindMermaid(mermaid)).toHaveLength(1);
    expect(rendered).toEqual(['broken diagram', PIE]);
    expect(document.querySelector('#bad svg[maidr]')).not.toBeNull();
    expect(document.querySelector('#bad')!.hasAttribute('data-maidr-mermaid-failed')).toBe(false);
  });

  it('reads a changed text in place of the one it failed on', async () => {
    document.body.innerHTML = '<pre class="mermaid" id="bad">broken diagram</pre>';
    const { mermaid, rendered } = standIn();
    await bindMermaid(mermaid);

    const element = document.querySelector('#bad')!;
    element.textContent = PIE;
    element.removeAttribute('data-maidr-mermaid-source');
    expect(await bindMermaid(mermaid)).toHaveLength(1);
    expect(rendered).toEqual(['broken diagram', PIE]);
  });
});

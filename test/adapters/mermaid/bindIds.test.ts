/**
 * @jest-environment jsdom
 */

import type { MermaidApi } from '@adapters/mermaid/types';
import type { MaidrLayer } from '@type/grammar';
import { bindMermaid, renderMermaid } from '@adapters/mermaid/bind';
import { beforeEach, describe, expect, it } from '@jest/globals';

/**
 * The ids `bindMermaid` renders under.
 *
 * Mermaid does not load under jsdom, so a stand-in plays its part: `render`
 * first removes whatever element already has the id it is given, as
 * Mermaid's own does, then draws a pie whose `<svg>` carries that id and
 * whose slices are `path.pieCircle`.
 */

const pie: MermaidApi = {
  mermaidAPI: {
    getDiagramFromText: async () => ({
      type: 'pie',
      db: { getSections: () => new Map([['Dogs', 3], ['Cats', 2]]) },
    }),
  },
  render: async (id: string) => {
    document.getElementById(id)?.remove();
    return {
      svg: `<svg id="${id}"><g><path class="pieCircle"></path><path class="pieCircle"></path></g></svg>`,
    };
  },
};

/**
 * Every selector a layer names, as a list.
 *
 * @param layer - The layer
 * @returns Its selectors
 */
function selectorsOf(layer: MaidrLayer): string[] {
  const { selectors } = layer;
  if (selectors === undefined) {
    return [];
  }
  return (Array.isArray(selectors) ? selectors : [selectors]) as string[];
}

describe('bindMermaid ids', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps two containers that share an id apart', async () => {
    document.body.innerHTML = `
      <pre class="mermaid" id="chart">pie\n  "Dogs" : 3\n  "Cats" : 2</pre>
      <pre class="mermaid" id="chart">pie\n  "Dogs" : 3\n  "Cats" : 2</pre>`;

    const figures = await bindMermaid(pie);
    expect(figures).toHaveLength(2);

    const containers = [...document.querySelectorAll('pre.mermaid')];
    const drawings = containers.map(container => container.querySelector('svg'));
    // Neither render took the other's drawing off the page.
    expect(drawings.every(drawing => drawing !== null)).toBe(true);
    const [first, second] = drawings as SVGSVGElement[];
    expect(first.id).not.toBe(second.id);
    expect(document.querySelectorAll(`[id="${first.id}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`[id="${second.id}"]`)).toHaveLength(1);
    expect(figures[0].id).not.toBe(figures[1].id);

    figures.forEach((figure, at) => {
      const own = drawings[at] as SVGSVGElement;
      const layer = figure.subplots[0][0].layers[0];
      const selectors = selectorsOf(layer);
      expect(selectors.length).toBeGreaterThan(0);
      for (const selector of selectors) {
        const matched = [...document.querySelectorAll(selector)];
        expect(matched).toHaveLength(2);
        expect(matched.every(element => own.contains(element))).toBe(true);
      }
    });
  });

  it('gives each render of the same element its own id', async () => {
    document.body.innerHTML = '<pre id="again">pie\n  "Dogs" : 3</pre>';
    const element = document.getElementById('again') as Element;
    const before = await renderMermaid(pie, element);
    const after = await renderMermaid(pie, element);
    expect(after.id).not.toBe(before.id);
  });

  it('renders under an id Mermaid can select, whatever the element is called', async () => {
    document.body.innerHTML = '<pre id="my chart.1">pie\n  "Dogs" : 3</pre>';
    const element = document.querySelector('pre') as Element;
    const ids: string[] = [];
    await renderMermaid({ ...pie, render: async (id, text) => {
      ids.push(id);
      return pie.render(id, text);
    } }, element);
    expect(ids[0]).toMatch(/^[A-Z][\w-]*$/i);
    expect(ids[0]).toContain('my-chart-1');
  });
});

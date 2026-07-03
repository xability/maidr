import type { VictoryLayerInfo } from '@adapters/victory/types';
import type { BarPoint } from '@type/grammar';
import {
  clearTaggedElements,
  getTaggedElements,
  PANEL_ATTR,
  resolvePanelSvgs,
  tagLayerElements,
} from '@adapters/victory/selectors';
import { buildVictorySubplots } from '@adapters/victory/useVictoryAdapter';
import { describe, expect, it, jest } from '@jest/globals';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Tests only use the public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds a container holding one Victory-style panel per entry: a wrapper div
 * with an `<svg role="img">` containing `barCount` `<path role="presentation">`
 * marks (Victory's Bar primitive renders paths).
 */
function buildContainer(panelBarCounts: number[]): { container: HTMLElement; doc: Document } {
  const dom = new JSDOM('<!doctype html><body><div id="mv-test"></div></body>');
  const doc = dom.window.document as Document;
  const container = doc.getElementById('mv-test') as HTMLElement;

  for (const barCount of panelBarCounts) {
    const wrapper = doc.createElement('div');
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('role', 'img');
    for (let i = 0; i < barCount; i++) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('role', 'presentation');
      path.setAttribute('d', `M ${i * 10}, 100 L ${i * 10 + 5}, 50`);
      svg.appendChild(path);
    }
    wrapper.appendChild(svg);
    container.appendChild(wrapper);
  }

  return { container, doc };
}

function barLayer(id: string, count: number): VictoryLayerInfo {
  const points: BarPoint[] = Array.from({ length: count }, (_, i) => ({ x: `c${i}`, y: i }));
  return {
    id,
    victoryType: 'VictoryBar',
    data: { kind: 'bar', points },
    dataCount: count,
  };
}

describe('resolvePanelSvgs', () => {
  it('returns Victory container svgs in document order', () => {
    const { container } = buildContainer([2, 3]);
    const svgs = resolvePanelSvgs(container, 2);

    expect(svgs).toHaveLength(2);
    expect(svgs[0].querySelectorAll('path')).toHaveLength(2);
    expect(svgs[1].querySelectorAll('path')).toHaveLength(3);
  });

  it('skips decorative svgs without role="img"', () => {
    const { container, doc } = buildContainer([2, 3]);
    const icon = doc.createElementNS(SVG_NS, 'svg');
    container.insertBefore(icon, container.firstChild);

    const svgs = resolvePanelSvgs(container, 2);

    expect(svgs).toHaveLength(2);
    expect(svgs[0].querySelectorAll('path')).toHaveLength(2);
  });

  it('falls back to all svgs when the role filter finds too few', () => {
    const { container } = buildContainer([2, 3]);
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      svg.removeAttribute('role');
    }

    const svgs = resolvePanelSvgs(container, 2);

    expect(svgs).toHaveLength(2);
  });

  it('excludes MAIDR-owned hidden clone svgs from panel resolution', () => {
    const { container } = buildContainer([2, 3]);
    // Simulate the core's focus-in behavior: a hidden clone of each panel svg
    // (role and marks preserved by cloneNode) inserted right after the
    // original, marked only with data-maidr-owned.
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute('data-maidr-owned', 'true');
      svg.after(clone);
    }

    const svgs = resolvePanelSvgs(container, 2);

    expect(svgs).toHaveLength(2);
    expect(svgs[0].querySelectorAll('path')).toHaveLength(2);
    expect(svgs[1].querySelectorAll('path')).toHaveLength(3);
    expect(svgs.every(svg => !svg.hasAttribute('data-maidr-owned'))).toBe(true);
  });

  it('excludes MAIDR-owned clones in the all-svgs fallback too', () => {
    const { container } = buildContainer([2, 3]);
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      svg.removeAttribute('role');
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute('data-maidr-owned', 'true');
      svg.after(clone);
    }

    const svgs = resolvePanelSvgs(container, 2);

    expect(svgs).toHaveLength(2);
    expect(svgs.every(svg => !svg.hasAttribute('data-maidr-owned'))).toBe(true);
  });
});

describe('tagLayerElements', () => {
  it('keeps the flat single-panel attribute naming when panelIndex is null', () => {
    const { container } = buildContainer([2]);
    const svg = container.querySelector('svg') as SVGElement;

    const selector = tagLayerElements(svg, barLayer('0', 2), 0, new Set(), '#mv-test ');

    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    expect(svg.querySelectorAll('[data-maidr-victory-0]')).toHaveLength(2);
  });

  it('folds the panel index into attribute names and selectors', () => {
    const { container } = buildContainer([2, 3]);
    const svgs = resolvePanelSvgs(container, 2);
    const scope = `#mv-test [${PANEL_ATTR}="1"] `;

    const selector = tagLayerElements(svgs[1], barLayer('1_0', 3), 0, new Set(), scope, 1);

    expect(selector).toBe(`#mv-test [${PANEL_ATTR}="1"] [data-maidr-victory-1-0]`);
    expect(svgs[1].querySelectorAll('[data-maidr-victory-1-0]')).toHaveLength(3);
    // No leakage into the other panel.
    expect(svgs[0].querySelectorAll('[data-maidr-victory-1-0]')).toHaveLength(0);
  });

  it('reconciles counts per panel with per-panel claimed sets', () => {
    const { container } = buildContainer([3, 3]);
    const svgs = resolvePanelSvgs(container, 2);

    // Same mark count in both panels: tagging panel 1 must not depend on
    // panel 0's claims (the old single-svg logic broke exactly here).
    const sel0 = tagLayerElements(svgs[0], barLayer('0_0', 3), 0, new Set(), 'a ', 0);
    const sel1 = tagLayerElements(svgs[1], barLayer('1_0', 3), 0, new Set(), 'b ', 1);

    expect(sel0).toBe('a [data-maidr-victory-0-0]');
    expect(sel1).toBe('b [data-maidr-victory-1-0]');
    expect(svgs[0].querySelectorAll('[data-maidr-victory-0-0]')).toHaveLength(3);
    expect(svgs[1].querySelectorAll('[data-maidr-victory-1-0]')).toHaveLength(3);
  });

  it('never tags marks inside MAIDR-owned clones', () => {
    const { container } = buildContainer([2]);
    const svg = container.querySelector('svg') as SVGElement;
    // Simulate the core's per-mark highlight clones inserted next to the
    // originals inside the same svg during a focused re-tag pass.
    for (const path of Array.from(svg.querySelectorAll('path'))) {
      const clone = path.cloneNode(true) as Element;
      clone.setAttribute('data-maidr-owned', 'true');
      path.after(clone);
    }

    const selector = tagLayerElements(svg, barLayer('0', 2), 0, new Set(), '#mv-test ');

    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    const tagged = Array.from(svg.querySelectorAll('[data-maidr-victory-0]'));
    expect(tagged).toHaveLength(2);
    expect(tagged.every(el => !el.hasAttribute('data-maidr-owned'))).toBe(true);
  });
});

describe('getTaggedElements / clearTaggedElements', () => {
  it('finds and clears both flat and panel-scoped tags across all panels', () => {
    const { container } = buildContainer([2, 3]);
    const svgs = resolvePanelSvgs(container, 2);

    tagLayerElements(svgs[0], barLayer('0_0', 2), 0, new Set(), 'a ', 0);
    tagLayerElements(svgs[1], barLayer('1_0', 3), 0, new Set(), 'b ', 1);

    expect(getTaggedElements(container)).toHaveLength(5);

    clearTaggedElements(container);

    expect(getTaggedElements(container)).toHaveLength(0);
    expect(container.querySelectorAll('[data-maidr-victory-0-0]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-maidr-victory-1-0]')).toHaveLength(0);
  });

  it('leaves the panel stamp on svg roots intact when clearing', () => {
    const { container } = buildContainer([2]);
    const svg = container.querySelector('svg') as SVGElement;
    svg.setAttribute(PANEL_ATTR, '0');

    tagLayerElements(svg, barLayer('0_0', 2), 0, new Set(), 'a ', 0);
    clearTaggedElements(container);

    expect(svg.getAttribute(PANEL_ATTR)).toBe('0');
  });

  it('finds and clears tags for panel indices of 10 and above', () => {
    const { container } = buildContainer([2]);
    const svg = container.querySelector('svg') as SVGElement;

    const selector = tagLayerElements(svg, barLayer('11_0', 2), 0, new Set(), 'a ', 11);

    expect(selector).toBe('a [data-maidr-victory-11-0]');
    expect(getTaggedElements(container)).toHaveLength(2);

    clearTaggedElements(container);

    expect(getTaggedElements(container)).toHaveLength(0);
    expect(container.querySelectorAll('[data-maidr-victory-11-0]')).toHaveLength(0);
  });

  it('ignores tag attributes inside MAIDR-owned clones when finding and clearing', () => {
    const { container } = buildContainer([2]);
    const svg = container.querySelector('svg') as SVGElement;
    tagLayerElements(svg, barLayer('0', 2), 0, new Set(), 'a ');
    // Clone the tagged svg the way the core does on focus-in — cloneNode
    // preserves the tag attributes on the clone's marks.
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute('data-maidr-owned', 'true');
    svg.after(clone);

    expect(getTaggedElements(container)).toHaveLength(2);

    clearTaggedElements(container);

    expect(getTaggedElements(container)).toHaveLength(0);
    // Owned clones are left untouched — the core disposes them itself.
    expect(clone.querySelectorAll('[data-maidr-victory-0]')).toHaveLength(2);
  });
});

describe('buildVictorySubplots', () => {
  const scope = '#mv-test ';

  it('emits the original single-subplot shape for one panel', () => {
    const { container } = buildContainer([2]);
    const subplots = buildVictorySubplots(container, [{ layers: [barLayer('0', 2)] }], scope);

    expect(subplots).toHaveLength(1);
    expect(subplots[0]).toHaveLength(1);
    const subplot = subplots[0][0];
    expect(subplot.selector).toBeUndefined();
    expect(subplot.layers).toHaveLength(1);
    expect(subplot.layers[0].id).toBe('0');
    expect(subplot.layers[0].title).toBeUndefined();
    expect(subplot.layers[0].selectors).toBe('#mv-test [data-maidr-victory-0]');
    // No panel stamps in single-panel mode.
    expect(container.querySelectorAll(`[${PANEL_ATTR}]`)).toHaveLength(0);
  });

  it('emits one subplot per panel with panel-scoped selectors and stamps', () => {
    const { container } = buildContainer([2, 3]);
    const subplots = buildVictorySubplots(container, [
      { layers: [barLayer('0_0', 2)], title: 'Panel A' },
      { layers: [barLayer('1_0', 3)] },
    ], scope);

    expect(subplots).toEqual([[
      expect.objectContaining({ selector: `#mv-test [${PANEL_ATTR}="0"]` }),
      expect.objectContaining({ selector: `#mv-test [${PANEL_ATTR}="1"]` }),
    ]]);

    const [first, second] = subplots[0];
    expect(first.layers[0].title).toBe('Panel A');
    expect(first.layers[0].selectors)
      .toBe(`#mv-test [${PANEL_ATTR}="0"] [data-maidr-victory-0-0]`);
    expect(second.layers[0].title).toBe('Panel 2');
    expect(second.layers[0].selectors)
      .toBe(`#mv-test [${PANEL_ATTR}="1"] [data-maidr-victory-1-0]`);

    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs[0].getAttribute(PANEL_ATTR)).toBe('0');
    expect(svgs[1].getAttribute(PANEL_ATTR)).toBe('1');

    // Each panel-scoped selector resolves to exactly its own panel's marks.
    const doc = container.ownerDocument;
    expect(doc.querySelectorAll(first.layers[0].selectors as string)).toHaveLength(2);
    expect(doc.querySelectorAll(second.layers[0].selectors as string)).toHaveLength(3);
  });

  it('drops empty panels but keeps svg index alignment', () => {
    const { container } = buildContainer([2, 1, 3]);
    const subplots = buildVictorySubplots(container, [
      { layers: [barLayer('0_0', 2)] },
      { layers: [] }, // chart without supported data
      { layers: [barLayer('2_0', 3)] },
    ], scope);

    expect(subplots).toHaveLength(1);
    expect(subplots[0]).toHaveLength(2);
    // The third chart still binds to the third svg (panel index 2).
    expect(subplots[0][1].selector).toBe(`#mv-test [${PANEL_ATTR}="2"]`);
    expect(subplots[0][1].layers[0].selectors)
      .toBe(`#mv-test [${PANEL_ATTR}="2"] [data-maidr-victory-2-0]`);

    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs[1].hasAttribute(PANEL_ATTR)).toBe(false);
    expect(svgs[2].getAttribute(PANEL_ATTR)).toBe('2');
  });

  it('binds panels to their own svgs when a standalone Victory sibling precedes them', () => {
    const { container, doc } = buildContainer([2, 3]);
    // Simulate a standalone VictoryScatter sibling: its svg is document-first,
    // also role="img", and its markers are path[role="presentation"] like bars.
    const wrapper = doc.createElement('div');
    const standalone = doc.createElementNS(SVG_NS, 'svg');
    standalone.setAttribute('role', 'img');
    for (let i = 0; i < 2; i++) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('role', 'presentation');
      standalone.appendChild(path);
    }
    wrapper.appendChild(standalone);
    container.insertBefore(wrapper, container.firstChild);

    const subplots = buildVictorySubplots(container, [
      { layers: [barLayer('0_0', 2)], svgIndex: 1 },
      { layers: [barLayer('1_0', 3)], svgIndex: 2 },
    ], scope);

    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs[0].hasAttribute(PANEL_ATTR)).toBe(false);
    expect(svgs[1].getAttribute(PANEL_ATTR)).toBe('0');
    expect(svgs[2].getAttribute(PANEL_ATTR)).toBe('1');

    const ownerDoc = container.ownerDocument;
    expect(ownerDoc.querySelectorAll(subplots[0][0].layers[0].selectors as string)).toHaveLength(2);
    expect(ownerDoc.querySelectorAll(subplots[0][1].layers[0].selectors as string)).toHaveLength(3);
    // The standalone component's marks stay untagged.
    expect(standalone.querySelectorAll('[data-maidr-victory-0-0]')).toHaveLength(0);
  });

  it('chunks panels row-major with an explicit layout', () => {
    const { container } = buildContainer([1, 1, 1, 1]);
    const subplots = buildVictorySubplots(container, [
      { layers: [barLayer('0_0', 1)] },
      { layers: [barLayer('1_0', 1)] },
      { layers: [barLayer('2_0', 1)] },
      { layers: [barLayer('3_0', 1)] },
    ], scope, { columns: 2 });

    expect(subplots).toHaveLength(2);
    expect(subplots[0]).toHaveLength(2);
    expect(subplots[1]).toHaveLength(2);
    expect(subplots[1][0].layers[0].id).toBe('2_0');
  });

  it('gives every cell of a multi-row grid a selector resolving to its own panel svg', () => {
    // The core's resolveSubplotLayout measures each panel's rendered geometry
    // through subplot.selector (via its hidden-clone highlight element) to
    // compute visual ordering and vertical arrow direction for multi-row
    // grids — so every emitted subplot must carry a selector matching exactly
    // its own panel element.
    const { container } = buildContainer([1, 1, 1, 1]);
    const subplots = buildVictorySubplots(container, [
      { layers: [barLayer('0_0', 1)] },
      { layers: [barLayer('1_0', 1)] },
      { layers: [barLayer('2_0', 1)] },
      { layers: [barLayer('3_0', 1)] },
    ], scope, { columns: 2 });

    const svgs = Array.from(container.querySelectorAll('svg'));
    const ownerDoc = container.ownerDocument;
    let panel = 0;
    for (const row of subplots) {
      for (const subplot of row) {
        expect(subplot.selector).toBe(`#mv-test [${PANEL_ATTR}="${panel}"]`);
        const matched = ownerDoc.querySelectorAll(subplot.selector as string);
        expect(matched).toHaveLength(1);
        expect(matched[0]).toBe(svgs[panel]);
        panel++;
      }
    }
    expect(panel).toBe(4);
  });

  it('keeps grid cells aligned with the layout when a panel is empty', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { container } = buildContainer([1, 1, 1, 1]);
      const subplots = buildVictorySubplots(container, [
        { layers: [barLayer('0_0', 1)] },
        { layers: [] }, // chart without supported data
        { layers: [barLayer('2_0', 1)] },
        { layers: [barLayer('3_0', 1)] },
      ], scope, { columns: 2 });

      // The empty panel's cell is dropped from its own row only — the
      // remaining panels keep the rows/columns of the visual arrangement.
      expect(subplots).toHaveLength(2);
      expect(subplots[0].map(s => s.layers[0].id)).toEqual(['0_0']);
      expect(subplots[1].map(s => s.layers[0].id)).toEqual(['2_0', '3_0']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('removes rows left entirely empty after dropping empty panels', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { container } = buildContainer([1, 1, 1, 1]);
      const subplots = buildVictorySubplots(container, [
        { layers: [barLayer('0_0', 1)] },
        { layers: [barLayer('1_0', 1)] },
        { layers: [] },
        { layers: [] },
      ], scope, { columns: 2 });

      expect(subplots).toEqual([[
        expect.objectContaining({ selector: `#mv-test [${PANEL_ATTR}="0"]` }),
        expect.objectContaining({ selector: `#mv-test [${PANEL_ATTR}="1"]` }),
      ]]);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('emits undefined selectors when a panel svg is missing', () => {
    const { container } = buildContainer([2]); // only one svg for two panels
    const subplots = buildVictorySubplots(container, [
      { layers: [barLayer('0_0', 2)] },
      { layers: [barLayer('1_0', 3)] },
    ], scope);

    expect(subplots[0]).toHaveLength(2);
    expect(subplots[0][0].layers[0].selectors)
      .toBe(`#mv-test [${PANEL_ATTR}="0"] [data-maidr-victory-0-0]`);
    expect(subplots[0][1].selector).toBeUndefined();
    expect(subplots[0][1].layers[0].selectors).toBeUndefined();
  });
});

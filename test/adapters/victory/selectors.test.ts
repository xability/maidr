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
import { describe, expect, it } from '@jest/globals';
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

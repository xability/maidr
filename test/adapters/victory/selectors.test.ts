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

  it('ignores a user role="img" svg between panels when VictoryContainer wrappers are present', () => {
    const { container, doc } = buildContainer([2, 3]);
    // Real Victory stamps its wrapper divs with the VictoryContainer class.
    for (const wrapper of Array.from(container.children)) {
      wrapper.classList.add('VictoryContainer');
    }
    // A user-supplied accessible illustration between the two panels: passes
    // the role="img" filter but is not a Victory chart svg.
    const interloper = doc.createElementNS(SVG_NS, 'svg');
    interloper.setAttribute('role', 'img');
    container.insertBefore(interloper, container.children[1]);

    const svgs = resolvePanelSvgs(container, 2);

    expect(svgs).toHaveLength(2);
    expect(svgs[0].querySelectorAll('path')).toHaveLength(2);
    expect(svgs[1].querySelectorAll('path')).toHaveLength(3);
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

// ---------------------------------------------------------------------------
// Post-pie trace types
// ---------------------------------------------------------------------------

/** An empty jsdom container with one `<svg role="img">` panel inside it. */
function buildSvg(): { container: HTMLElement; doc: Document; svg: SVGElement } {
  const dom = new JSDOM('<!doctype html><body><div id="mv-test"></div></body>');
  const doc = dom.window.document as Document;
  const container = doc.getElementById('mv-test') as HTMLElement;
  const wrapper = doc.createElement('div');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('role', 'img');
  wrapper.appendChild(svg);
  container.appendChild(wrapper);
  return { container, doc, svg };
}

/** Appends a `<path role="presentation">` with the given attributes. */
function appendPath(
  doc: Document,
  parent: Element,
  attrs: Record<string, string>,
): Element {
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('role', 'presentation');
  for (const [name, value] of Object.entries(attrs)) {
    path.setAttribute(name, value);
  }
  parent.appendChild(path);
  return path;
}

describe('tagLayerElements: area', () => {
  it('tags the single area path, the way it does a line', () => {
    const { doc, svg } = buildSvg();
    // Victory's Area primitive closes the line back along the baseline, so the
    // path carries twice the vertices plus the closing point.
    appendPath(doc, svg, { d: 'M50,170L225,130L400,50L400,250L225,250L50,250Z' });
    const layer: VictoryLayerInfo = {
      id: '0',
      victoryType: 'VictoryArea',
      data: { kind: 'area', points: [[{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }]] },
      dataCount: 3,
    };

    const selector = tagLayerElements(svg, layer, 0, new Set(), '#mv-test ');

    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    expect(svg.querySelectorAll('[data-maidr-victory-0]')).toHaveLength(1);
  });
});

describe('tagLayerElements: stacked area', () => {
  function stackedAreaLayer(bandCount: number): VictoryLayerInfo {
    const points = Array.from({ length: bandCount }, (_, band) => [
      { x: 2020, y: band + 1, z: `S${band}` },
    ]);
    return {
      id: '0',
      victoryType: 'VictoryStack',
      data: { kind: 'stackedArea', points, normalized: false },
      dataCount: bandCount,
    };
  }

  it('maps bands to paths back to front, matching VictoryStack render order', () => {
    const { container, doc, svg } = buildSvg();
    // VictoryStack reverses its children so the topmost band paints last: the
    // first path in the DOM is the LAST band of the payload.
    const top = appendPath(doc, svg, { d: 'M0,0L1,1' });
    const bottom = appendPath(doc, svg, { d: 'M0,2L1,3' });

    const selectors = tagLayerElements(svg, stackedAreaLayer(2), 0, new Set(), '#mv-test ');

    expect(selectors).toEqual([
      '#mv-test [data-maidr-victory-0-band-0]',
      '#mv-test [data-maidr-victory-0-band-1]',
    ]);
    expect(bottom.hasAttribute('data-maidr-victory-0-band-0')).toBe(true);
    expect(top.hasAttribute('data-maidr-victory-0-band-1')).toBe(true);
    // One selector per band, each resolving to exactly one path.
    for (const selector of selectors as string[]) {
      expect(container.ownerDocument.querySelectorAll(selector)).toHaveLength(1);
    }
  });

  it('clears band tags along with the layer tag', () => {
    const { container, doc, svg } = buildSvg();
    appendPath(doc, svg, { d: 'M0,0L1,1' });
    appendPath(doc, svg, { d: 'M0,2L1,3' });

    tagLayerElements(svg, stackedAreaLayer(2), 0, new Set(), '#mv-test ');
    expect(getTaggedElements(container)).toHaveLength(2);

    clearTaggedElements(container);

    expect(getTaggedElements(container)).toHaveLength(0);
    expect(container.querySelectorAll('[data-maidr-victory-0-band-0]')).toHaveLength(0);
  });

  it('gives up when the stack rendered fewer paths than bands', () => {
    const { doc, svg } = buildSvg();
    appendPath(doc, svg, { d: 'M0,0L1,1' });

    expect(tagLayerElements(svg, stackedAreaLayer(2), 0, new Set(), '#mv-test '))
      .toBeUndefined();
  });
});

describe('tagLayerElements: error bar', () => {
  /**
   * Builds the DOM VictoryErrorBar renders: one `<g>` per sample holding two
   * cap lines and two whisker lines, each marked with Victory's `data-type`.
   */
  function buildErrorBars(sampleCount: number): { container: HTMLElement; svg: SVGElement } {
    const { container, doc, svg } = buildSvg();
    const outer = doc.createElementNS(SVG_NS, 'g');
    outer.setAttribute('role', 'presentation');
    svg.appendChild(outer);

    for (let i = 0; i < sampleCount; i++) {
      const group = doc.createElementNS(SVG_NS, 'g');
      group.setAttribute('role', 'presentation');
      for (const type of ['border-bottom', 'border-top', 'cross-bottom', 'cross-top']) {
        const line = doc.createElementNS(SVG_NS, 'line');
        line.setAttribute('role', 'presentation');
        line.setAttribute('data-type', type);
        group.appendChild(line);
      }
      outer.appendChild(group);
    }
    return { container, svg };
  }

  function errorBarLayer(sampleCount: number): VictoryLayerInfo {
    return {
      id: '0',
      victoryType: 'VictoryErrorBar',
      data: {
        kind: 'errorBar',
        points: Array.from({ length: sampleCount }, (_, i) => ({ x: i, y: i, yMin: i - 1, yMax: i + 1 })),
      },
      dataCount: sampleCount,
    };
  }

  it('tags exactly one whisker per sample', () => {
    const { container, svg } = buildErrorBars(3);

    const selector = tagLayerElements(svg, errorBarLayer(3), 0, new Set(), '#mv-test ');

    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    // The trace requires one element per sample: any more and it drops the
    // highlight entirely.
    expect(container.ownerDocument.querySelectorAll(selector as string)).toHaveLength(3);
    for (const group of Array.from(svg.querySelectorAll('g > g'))) {
      expect(group.querySelectorAll('[data-maidr-victory-0]')).toHaveLength(1);
    }
  });

  it('never tags a cap line', () => {
    const { svg } = buildErrorBars(2);

    tagLayerElements(svg, errorBarLayer(2), 0, new Set(), '#mv-test ');

    const tagged = Array.from(svg.querySelectorAll('[data-maidr-victory-0]'));
    expect(tagged.every(el => el.getAttribute('data-type')?.startsWith('cross-'))).toBe(true);
  });

  it('claims every line of a sample so a sibling layer cannot reuse them', () => {
    const { svg } = buildErrorBars(2);
    const claimed = new Set<Element>();

    tagLayerElements(svg, errorBarLayer(2), 0, claimed, '#mv-test ');

    expect(claimed.size).toBe(8);
  });

  it('ignores lines with no data-type, which belong to axes and box plots', () => {
    const { doc, svg } = buildSvg();
    const group = doc.createElementNS(SVG_NS, 'g');
    const bare = doc.createElementNS(SVG_NS, 'line');
    bare.setAttribute('role', 'presentation');
    group.appendChild(bare);
    svg.appendChild(group);

    expect(tagLayerElements(svg, errorBarLayer(1), 0, new Set(), '#mv-test '))
      .toBeUndefined();
  });
});

describe('tagLayerElements: polar area', () => {
  function polarAreaLayer(wedgeCount: number): VictoryLayerInfo {
    return {
      id: '0',
      victoryType: 'VictoryBar',
      data: {
        kind: 'polarArea',
        points: [Array.from({ length: wedgeCount }, (_, i) => ({ x: i, y: i + 1 }))],
      },
      dataCount: wedgeCount,
    };
  }

  it.each([
    ['before', true],
    ['after', false],
  ])('skips the polar axis path rendered %s the wedges', (_position, axisFirst) => {
    const { doc, svg } = buildSvg();
    // The polar axis is a role="presentation" path too, but Victory leaves it
    // untransformed while every polar mark is translated to the chart origin.
    const addAxis = (): Element =>
      appendPath(doc, svg, { d: 'M 325, 150 A 100, 100, 0, 0, 0, 125, 150' });
    const axis = axisFirst ? addAxis() : null;
    const wedges = [0, 1, 2].map(i =>
      appendPath(doc, svg, { d: `M ${i},0 A 1,1,0,0,0,0,0 L 0,0 z`, transform: 'translate(225, 150)' }));
    const trailingAxis = axis ?? addAxis();

    const selector = tagLayerElements(svg, polarAreaLayer(3), 0, new Set(), '#mv-test ');

    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    expect(wedges.every(w => w.hasAttribute('data-maidr-victory-0'))).toBe(true);
    expect(trailingAxis.hasAttribute('data-maidr-victory-0')).toBe(false);
  });

  it('gives up rather than tag too few wedges', () => {
    const { doc, svg } = buildSvg();
    appendPath(doc, svg, { d: 'M 0,0 z', transform: 'translate(225, 150)' });

    expect(tagLayerElements(svg, polarAreaLayer(3), 0, new Set(), '#mv-test '))
      .toBeUndefined();
  });
});

describe('tagLayerElements: dot plot', () => {
  function dotLayer(count: number): VictoryLayerInfo {
    const points: BarPoint[] = Array.from({ length: count }, (_, i) => ({ x: `c${i}`, y: i }));
    return {
      id: '0',
      victoryType: 'VictoryScatter',
      data: { kind: 'dot', points },
      dataCount: count,
    };
  }

  it('tags one mark per category', () => {
    const { doc, svg } = buildSvg();
    const marks = [0, 1, 2].map(i => appendPath(doc, svg, { d: `M ${i * 40}, 100 a 3,3 0 1,0 -6,0` }));

    const selector = tagLayerElements(svg, dotLayer(3), 0, new Set(), '#mv-test ');

    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    expect(marks.every(mark => mark.hasAttribute('data-maidr-victory-0'))).toBe(true);
  });

  it('leaves the scatter cx/cy stamp off a dot plot', () => {
    const { doc, svg } = buildSvg();
    const marks = [0, 1].map(i => appendPath(doc, svg, { d: `M ${i * 40}, 100 a 3,3 0 1,0 -6,0` }));

    tagLayerElements(svg, dotLayer(2), 0, new Set(), '#mv-test ');

    // The stamp exists for ScatterTrace, which groups its points by cx/cy. A
    // dot plot is read by the bar trace, which locates its marks by position
    // in the selector's result.
    expect(marks.some(mark => mark.hasAttribute('cx'))).toBe(false);
  });

  it('still stamps cx/cy on a bivariate scatter', () => {
    const { doc, svg } = buildSvg();
    const mark = appendPath(doc, svg, { d: 'M 74, 226 a 3,3 0 1,0 -6,0' });
    const layer: VictoryLayerInfo = {
      id: '0',
      victoryType: 'VictoryScatter',
      data: { kind: 'scatter', points: [{ x: 1, y: 2 }] },
      dataCount: 1,
    };

    tagLayerElements(svg, layer, 0, new Set(), '#mv-test ');

    expect(mark.getAttribute('cx')).toBe('74');
    expect(mark.getAttribute('cy')).toBe('226');
  });
});

describe('tagLayerElements: diverging bar', () => {
  it('tags every bar of both sides under one selector', () => {
    const { doc, svg } = buildSvg();
    const bars = [0, 1, 2, 3].map(i => appendPath(doc, svg, { d: `M ${i * 40}, 150 L ${i * 40}, 60 z` }));
    const layer: VictoryLayerInfo = {
      id: '0',
      victoryType: 'VictoryStack',
      data: {
        kind: 'diverging',
        points: [
          [{ x: '0-14', y: 1140, z: 'Women' }, { x: '15-29', y: 1100, z: 'Women' }],
          [{ x: '0-14', y: -1200, z: 'Men' }, { x: '15-29', y: -1150, z: 'Men' }],
        ],
      },
      dataCount: 4,
      legend: ['Women', 'Men'],
    };

    const selector = tagLayerElements(svg, layer, 0, new Set(), '#mv-test ');

    // `SegmentedTrace` resolves one flat selector and splits the result across
    // the sides itself, so every bar of both sides carries the same tag.
    expect(selector).toBe('#mv-test [data-maidr-victory-0]');
    expect(bars.every(bar => bar.hasAttribute('data-maidr-victory-0'))).toBe(true);
  });
});

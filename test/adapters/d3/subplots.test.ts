import type { BoxSelector, MaidrSubplot } from '@type/grammar';
import { bindD3Bar } from '@adapters/d3/binders/bar';
import { bindD3Facets, bindD3Subplots } from '@adapters/d3/binders/subplots';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface BarDatum {
  x: string;
  y: number;
}

interface FacetPanelSpec {
  key: string;
  bars: BarDatum[];
  transform?: string;
  id?: string;
}

function setDatum(el: Element, datum: unknown): void {
  (el as unknown as { __data__: unknown }).__data__ = datum;
}

/** Builds one SVG containing a `<g class="panel">` per spec, each holding `rect.bar` marks. */
function buildFacetSvg(panels: FacetPanelSpec[]): { svg: SVGElement; doc: Document } {
  const dom = new JSDOM(`<!doctype html><body><svg xmlns="${SVG_NS}" id="facet-svg"></svg></body>`);
  const doc = dom.window.document as Document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;

  for (const panel of panels) {
    const group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'panel');
    if (panel.transform) {
      group.setAttribute('transform', panel.transform);
    }
    if (panel.id) {
      group.setAttribute('id', panel.id);
    }
    // d3.groups-style datum: [key, values]
    setDatum(group, [panel.key, panel.bars]);
    for (const bar of panel.bars) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'bar');
      setDatum(rect, bar);
      group.appendChild(rect);
    }
    svg.appendChild(group);
  }

  return { svg, doc };
}

function subplotGrid(maidrSubplots: unknown): MaidrSubplot[][] {
  return maidrSubplots as MaidrSubplot[][];
}

describe('bindD3Facets', () => {
  test('emits one subplot per panel with panel-scoped selectors and stamps', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }, { x: 'q', y: 2 }] },
      { key: 'B', bars: [{ x: 'p', y: 3 }, { x: 'q', y: 4 }] },
    ]);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: {
        selector: 'rect.bar',
        title: 'Faceted Bars',
        axes: { x: 'X', y: 'Y' },
        x: 'x',
        y: 'y',
      },
      layout: 'row',
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(1);
    expect(subplots[0]).toHaveLength(2);
    expect(result.layers).toHaveLength(2);

    // Figure-level title comes from the inner config; panel names go on layers.
    expect(result.maidr.title).toBe('Faceted Bars');
    expect(subplots[0][0].layers[0].title).toBe('A');
    expect(subplots[0][1].layers[0].title).toBe('B');

    // Panel elements are stamped in grid order.
    const panels = Array.from(svg.querySelectorAll('g.panel'));
    expect(panels[0].getAttribute('data-maidr-panel')).toBe('0');
    expect(panels[1].getAttribute('data-maidr-panel')).toBe('1');

    // Layer selectors are anchored to the SVG id AND narrowed per panel.
    expect(subplots[0][0].layers[0].selectors).toBe('#facet-svg [data-maidr-panel="0"] rect.bar');
    expect(subplots[0][1].layers[0].selectors).toBe('#facet-svg [data-maidr-panel="1"] rect.bar');

    // Subplot selector points at the panel container itself.
    expect(subplots[0][0].selector).toBe('#facet-svg [data-maidr-panel="0"]');
    expect(subplots[0][1].selector).toBe('#facet-svg [data-maidr-panel="1"]');

    // Each panel's data is extracted from that panel only.
    expect(subplots[0][0].layers[0].data).toEqual([{ x: 'p', y: 1 }, { x: 'q', y: 2 }]);
    expect(subplots[0][1].layers[0].data).toEqual([{ x: 'p', y: 3 }, { x: 'q', y: 4 }]);

    // Layer ids are unique across the whole figure.
    expect(result.layers[0].id).not.toBe(result.layers[1].id);

    // Panel selectors actually resolve to only their own panel's marks.
    const doc = svg.ownerDocument;
    expect(doc.querySelectorAll(subplots[0][0].layers[0].selectors as string)).toHaveLength(2);

    // autoApply defaults to true: the schema lands on the SVG.
    expect(svg.getAttribute('maidr-data')).toBe(JSON.stringify(result.maidr));
  });

  test('resolves panel titles via the panelTitle accessor with index fallback', () => {
    const { svg } = buildFacetSvg([
      { key: '4', bars: [{ x: 'p', y: 1 }] },
      { key: '6', bars: [{ x: 'p', y: 2 }] },
    ]);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      panelTitle: (d: unknown) => `cyl = ${(d as [string, BarDatum[]])[0]}`,
      layout: 'row',
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots[0][0].layers[0].title).toBe('cyl = 4');
    expect(subplots[0][1].layers[0].title).toBe('cyl = 6');
  });

  test('falls back to "Panel <n>" when a panel has no usable datum', () => {
    const { svg } = buildFacetSvg([{ key: 'A', bars: [{ x: 'p', y: 1 }] }]);
    // Overwrite the group datum with something the auto-detection cannot use.
    setDatum(svg.querySelector('g.panel')!, 42);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: 'row',
    });

    expect(subplotGrid(result.maidr.subplots)[0][0].layers[0].title).toBe('Panel 1');
  });

  test('infers a 2x2 grid from translate transforms in visual reading order', () => {
    // Appended in shuffled DOM order to prove geometry sorting.
    const { svg } = buildFacetSvg([
      { key: 'bottom-right', bars: [{ x: 'p', y: 4 }], transform: 'translate(300, 200)' },
      { key: 'top-left', bars: [{ x: 'p', y: 1 }], transform: 'translate(0, 0)' },
      { key: 'top-right', bars: [{ x: 'p', y: 2 }], transform: 'translate(300, 0)' },
      { key: 'bottom-left', bars: [{ x: 'p', y: 3 }], transform: 'translate(0, 200)' },
    ]);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(2);
    expect(subplots[0]).toHaveLength(2);
    expect(subplots[1]).toHaveLength(2);
    const titles = subplots.map(row => row.map(subplot => subplot.layers[0].title));
    expect(titles).toEqual([
      ['top-left', 'top-right'],
      ['bottom-left', 'bottom-right'],
    ]);
  });

  test('honors an explicit ragged { columns } layout over geometry', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }] },
      { key: 'B', bars: [{ x: 'p', y: 2 }] },
      { key: 'C', bars: [{ x: 'p', y: 3 }] },
    ]);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: { columns: 2 },
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(2);
    expect(subplots[0]).toHaveLength(2);
    expect(subplots[1]).toHaveLength(1); // ragged last row, never empty
  });

  test('layout "column" stacks panels one per row', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }] },
      { key: 'B', bars: [{ x: 'p', y: 2 }] },
    ]);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: 'column',
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(2);
    expect(subplots[0]).toHaveLength(1);
    expect(subplots[1]).toHaveLength(1);
  });

  test('stamps axes_* ids on anonymous <g> panels for core panel outlines', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }] },
      { key: 'B', bars: [{ x: 'p', y: 2 }] },
    ]);

    bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: 'row',
    });

    const panels = Array.from(svg.querySelectorAll('g.panel'));
    expect(panels[0].id).toBe('axes_facet-svg_0');
    expect(panels[1].id).toBe('axes_facet-svg_1');
  });

  test('never overwrites user-assigned panel ids', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }], id: 'my-panel' },
      { key: 'B', bars: [{ x: 'p', y: 2 }] },
    ]);

    bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: 'row',
    });

    const panels = Array.from(svg.querySelectorAll('g.panel'));
    expect(panels[0].id).toBe('my-panel');
    // All-or-nothing: a user id anywhere disables axes stamping entirely.
    expect(panels[1].id).toBe('');
  });

  test('rebinding is idempotent (stamps and selectors are stable)', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }] },
      { key: 'B', bars: [{ x: 'p', y: 2 }] },
    ]);
    const facetsConfig = {
      panelSelector: 'g.panel',
      chartType: 'bar' as const,
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: 'row' as const,
    };

    const first = bindD3Facets(svg, facetsConfig);
    const second = bindD3Facets(svg, facetsConfig);

    const panels = Array.from(svg.querySelectorAll('g.panel'));
    expect(panels.map(panel => panel.getAttribute('data-maidr-panel'))).toEqual(['0', '1']);
    expect(panels.map(panel => panel.id)).toEqual(['axes_facet-svg_0', 'axes_facet-svg_1']);

    const firstSelectors = subplotGrid(first.maidr.subplots)[0].map(subplot => subplot.layers[0].selectors);
    const secondSelectors = subplotGrid(second.maidr.subplots)[0].map(subplot => subplot.layers[0].selectors);
    expect(secondSelectors).toEqual(firstSelectors);
  });

  test('errors from a panel mention the panel index', () => {
    const { svg, doc } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }] },
    ]);
    // Second panel exists but holds no marks.
    const empty = doc.createElementNS(SVG_NS, 'g');
    empty.setAttribute('class', 'panel');
    svg.appendChild(empty);

    expect(() => bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
      layout: 'row',
    })).toThrow(/panel 1/);
  });

  test('throws an actionable error when the panel selector matches nothing', () => {
    const { svg } = buildFacetSvg([{ key: 'A', bars: [{ x: 'p', y: 1 }] }]);

    expect(() => bindD3Facets(svg, {
      panelSelector: 'g.nope',
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'x', y: 'y' },
    })).toThrow(/no panel elements found/);
  });

  test('composes panel scoping with line-path index stamping', () => {
    const dom = new JSDOM(`<!doctype html><body><svg xmlns="${SVG_NS}" id="line-facets"></svg></body>`);
    const doc = dom.window.document as Document;
    const svg = doc.querySelector('svg') as unknown as SVGElement;

    for (const panelKey of ['A', 'B']) {
      const group = doc.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'panel');
      setDatum(group, [panelKey, []]);
      for (const series of ['s1', 's2']) {
        const path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'line');
        setDatum(path, [
          { x: 1, y: 10, fill: `${panelKey}-${series}` },
          { x: 2, y: 20, fill: `${panelKey}-${series}` },
        ]);
        group.appendChild(path);
      }
      svg.appendChild(group);
    }

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'line',
      config: { selector: 'path.line' },
      layout: 'row',
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots[0][0].layers[0].selectors).toEqual([
      '#line-facets [data-maidr-panel="0"] path.line[data-maidr-line-index="0"]',
      '#line-facets [data-maidr-panel="0"] path.line[data-maidr-line-index="1"]',
    ]);
    expect(subplots[0][1].layers[0].selectors).toEqual([
      '#line-facets [data-maidr-panel="1"] path.line[data-maidr-line-index="0"]',
      '#line-facets [data-maidr-panel="1"] path.line[data-maidr-line-index="1"]',
    ]);
    // Per-panel legends survive.
    expect(subplots[0][0].legend).toEqual(['A-s1', 'A-s2']);
  });
});

describe('bindD3Subplots', () => {
  function buildHeterogeneousSvg(): { svg: SVGElement; doc: Document } {
    const dom = new JSDOM(`<!doctype html><body><svg xmlns="${SVG_NS}" id="composed"></svg></body>`);
    const doc = dom.window.document as Document;
    const svg = doc.querySelector('svg') as unknown as SVGElement;

    const barPanel = doc.createElementNS(SVG_NS, 'g');
    barPanel.setAttribute('class', 'revenue');
    for (const datum of [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }]) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'bar');
      setDatum(rect, datum);
      barPanel.appendChild(rect);
    }
    svg.appendChild(barPanel);

    const scatterPanel = doc.createElementNS(SVG_NS, 'g');
    scatterPanel.setAttribute('class', 'spread');
    for (const datum of [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]) {
      const circle = doc.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'dot');
      setDatum(circle, datum);
      scatterPanel.appendChild(circle);
    }
    svg.appendChild(scatterPanel);

    return { svg, doc };
  }

  test('composes different chart types into an explicit 2D grid', () => {
    const { svg } = buildHeterogeneousSvg();

    const result = bindD3Subplots(svg, {
      title: 'Sales Overview',
      subplots: [[
        { chartType: 'bar', root: 'g.revenue', config: { selector: 'rect.bar', title: 'Revenue', x: 'x', y: 'y' } },
        { chartType: 'scatter', root: 'g.spread', config: { selector: 'circle.dot', title: 'Spread', x: 'x', y: 'y' } },
      ]],
    });

    expect(result.maidr.title).toBe('Sales Overview');
    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(1);
    expect(subplots[0]).toHaveLength(2);

    expect(subplots[0][0].layers[0].type).toBe(TraceType.BAR);
    expect(subplots[0][1].layers[0].type).toBe(TraceType.SCATTER);
    expect(subplots[0][0].layers[0].title).toBe('Revenue');
    expect(subplots[0][1].layers[0].title).toBe('Spread');

    expect(subplots[0][0].layers[0].selectors).toBe('#composed [data-maidr-panel="0"] rect.bar');
    expect(subplots[0][1].layers[0].selectors).toBe('#composed [data-maidr-panel="1"] circle.dot');
    expect(subplots[0][0].selector).toBe('#composed [data-maidr-panel="0"]');

    expect(subplots[0][0].layers[0].data).toEqual([{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }]);
    expect(subplots[0][1].layers[0].data).toHaveLength(3);

    expect(result.layers.map(layer => layer.type)).toEqual([TraceType.BAR, TraceType.SCATTER]);
    expect(svg.getAttribute('maidr-data')).toBe(JSON.stringify(result.maidr));
  });

  test('accepts Element roots and a flat array with layout "column"', () => {
    const { svg } = buildHeterogeneousSvg();
    const barPanel = svg.querySelector('g.revenue')!;
    const scatterPanel = svg.querySelector('g.spread')!;

    const result = bindD3Subplots(svg, {
      subplots: [
        { chartType: 'bar', root: barPanel, config: { selector: 'rect.bar', title: 'Revenue', x: 'x', y: 'y' } },
        { chartType: 'scatter', root: scatterPanel, config: { selector: 'circle.dot', x: 'x', y: 'y' } },
      ],
      layout: 'column',
    });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(2);
    expect(subplots[0]).toHaveLength(1);
    expect(subplots[1]).toHaveLength(1);
    // Untitled panels fall back to a positional display name.
    expect(subplots[1][0].layers[0].title).toBe('Panel 2');
  });

  test('rejects empty rows and unresolvable roots', () => {
    const { svg } = buildHeterogeneousSvg();

    expect(() => bindD3Subplots(svg, {
      subplots: [[]],
    })).toThrow(/row 0 .* is empty/);

    expect(() => bindD3Subplots(svg, {
      subplots: [[{ chartType: 'bar', root: 'g.missing', config: { selector: 'rect.bar' } }]],
    })).toThrow(/no element found for panel root selector/);
  });

  test('composes panel scoping with box part-attribute stamping', () => {
    const dom = new JSDOM(`<!doctype html><body><svg xmlns="${SVG_NS}" id="box-grid"></svg></body>`);
    const doc = dom.window.document as Document;
    const svg = doc.querySelector('svg') as unknown as SVGElement;

    const panel = doc.createElementNS(SVG_NS, 'g');
    panel.setAttribute('class', 'left');
    const boxGroup = doc.createElementNS(SVG_NS, 'g');
    boxGroup.setAttribute('class', 'box');
    setDatum(boxGroup, { fill: 'A', min: 1, q1: 2, q2: 3, q3: 4, max: 5 });

    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '50');
    rect.setAttribute('y', '50');
    rect.setAttribute('width', '20');
    rect.setAttribute('height', '20');
    boxGroup.appendChild(rect);
    const median = doc.createElementNS(SVG_NS, 'line');
    median.setAttribute('x1', '50');
    median.setAttribute('y1', '60');
    median.setAttribute('x2', '70');
    median.setAttribute('y2', '60');
    boxGroup.appendChild(median);
    panel.appendChild(boxGroup);
    svg.appendChild(panel);

    const result = bindD3Subplots(svg, {
      subplots: [[{ chartType: 'box', root: 'g.left', config: { selector: 'g.box', title: 'Left' } }]],
    });

    const selectors = subplotGrid(result.maidr.subplots)[0][0].layers[0].selectors as BoxSelector[];
    expect(selectors).toHaveLength(1);
    expect(selectors[0].iq).toBe(
      '#box-grid [data-maidr-panel="0"] g.box[data-maidr-box-index="0"] [data-maidr-box-part="iq"]',
    );
  });
});

describe('core-model integration', () => {
  test('the emitted multi-panel Maidr constructs a navigable Figure', () => {
    const { svg } = buildFacetSvg([
      { key: 'A', bars: [{ x: 'p', y: 1 }, { x: 'q', y: 2 }] },
      { key: 'B', bars: [{ x: 'p', y: 3 }, { x: 'q', y: 4 }] },
    ]);

    const result = bindD3Facets(svg, {
      panelSelector: 'g.panel',
      chartType: 'bar',
      config: { selector: 'rect.bar', title: 'Faceted Bars', x: 'x', y: 'y' },
      layout: 'row',
    });

    // The model resolves selectors via the page-global `document`; point it
    // at this test's JSDOM document for the duration of the assertion.
    const globals = globalThis as { document?: Document };
    const previousDocument = globals.document;
    globals.document = svg.ownerDocument;
    try {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state).toMatchObject({ size: 2 });
      const summaries = figure.getSubplotSummaries();
      expect(summaries).toHaveLength(2);
      expect(summaries.map(summary => summary.title)).toEqual(['A', 'B']);
      expect(summaries.map(summary => summary.traceTypes)).toEqual([['bar'], ['bar']]);

      // Reading the state exercises Subplot/Trace construction end-to-end
      // (this is exactly what crashes on empty subplots or bad selectors).
      const state = figure.state;
      expect(state.empty).toBe(false);
      if (!state.empty) {
        expect(state.size).toBe(2);
      }
    } finally {
      if (previousDocument === undefined) {
        delete globals.document;
      } else {
        globals.document = previousDocument;
      }
    }
  });
});

describe('single-panel regression', () => {
  test('bindD3Bar still emits a 1x1 grid with an unpanelled selector', () => {
    const dom = new JSDOM(`<!doctype html><body><svg xmlns="${SVG_NS}" id="solo"></svg></body>`);
    const doc = dom.window.document as Document;
    const svg = doc.querySelector('svg') as unknown as SVGElement;
    for (const datum of [{ x: 'a', y: 1 }, { x: 'b', y: 2 }]) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'bar');
      setDatum(rect, datum);
      svg.appendChild(rect);
    }

    const result = bindD3Bar(svg, { selector: 'rect.bar', title: 'Solo', x: 'x', y: 'y' });

    const subplots = subplotGrid(result.maidr.subplots);
    expect(subplots).toHaveLength(1);
    expect(subplots[0]).toHaveLength(1);
    expect(subplots[0][0].layers).toEqual([result.layer]);
    expect(subplots[0][0].selector).toBeUndefined();
    expect(result.layer.selectors).toBe('#solo rect.bar');
    expect(result.layer.title).toBe('Solo');
    expect(result.maidr.title).toBe('Solo');
    expect(svg.getAttribute('maidr-data')).toBe(JSON.stringify(result.maidr));
  });
});

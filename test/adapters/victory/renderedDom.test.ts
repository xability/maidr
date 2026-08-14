/**
 * Tagging checked against the markup Victory really renders.
 *
 * The other two suites build their DOM by hand, which keeps them fast but
 * also means they only ever assert what this adapter already believes about
 * Victory. Every selector strategy in `selectors.ts` is a claim about
 * somebody else's markup — that an area is one `<path role="presentation">`,
 * that `VictoryStack` paints its bands back to front, that only an error bar's
 * lines carry `data-type`, that a polar axis is the one presentation path
 * without a `transform` — and a hand-built fixture cannot falsify any of them.
 *
 * So this suite renders the real components and runs the real extraction and
 * tagging over the result. It is the file that fails when a Victory upgrade
 * changes the markup, which is the failure that would otherwise reach a reader
 * as a chart that announces correctly and highlights nothing.
 */

import type { MaidrLayer } from '@type/grammar';
import type { ReactElement } from 'react';
import { extractVictoryLayers, toMaidrLayer } from '@adapters/victory/converters';
import { tagLayerElements } from '@adapters/victory/selectors';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  VictoryArea,
  VictoryBar,
  VictoryChart,
  VictoryErrorBar,
  VictoryPolarAxis,
  VictoryStack,
} from 'victory';

const SCOPE = '#mv ';

/**
 * Renders `children`, extracts its layers, and tags the rendered svg — the
 * same three steps `useVictoryAdapter` performs on mount.
 */
function renderAndTag(children: ReactElement): { doc: Document; layers: MaidrLayer[] } {
  const dom = new JSDOM(
    `<!doctype html><body><div id="mv">${renderToStaticMarkup(children)}</div></body>`,
  );
  const doc = dom.window.document as unknown as Document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;

  const claimed = new Set<Element>();
  const layers = extractVictoryLayers(children).map((layer, index) =>
    toMaidrLayer(layer, tagLayerElements(svg, layer, index, claimed, SCOPE)));

  return { doc, layers };
}

/** Resolves a layer's selectors the way the model does, one series at a time. */
function resolveSeries(doc: Document, layer: MaidrLayer): Element[][] {
  const selectors = layer.selectors as string[];
  return selectors.map(selector => Array.from(doc.querySelectorAll(selector)));
}

describe('victory area', () => {
  it('tags the one path an area renders', () => {
    const { doc, layers } = renderAndTag(createElement(
      VictoryChart,
      null,
      createElement(VictoryArea, { data: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }] }),
    ));

    expect(layers[0].type).toBe(TraceType.AREA);
    expect(resolveSeries(doc, layers[0])).toEqual([[expect.anything()]]);
  });
});

describe('victory stacked area', () => {
  it('binds band 0 to the bottom band despite the reversed render order', () => {
    const { doc, layers } = renderAndTag(createElement(
      VictoryChart,
      null,
      createElement(
        VictoryStack,
        null,
        createElement(VictoryArea, { key: 'a', name: 'Solar', data: [{ x: 1, y: 2 }, { x: 2, y: 3 }] }),
        createElement(VictoryArea, { key: 'b', name: 'Wind', data: [{ x: 1, y: 1 }, { x: 2, y: 4 }] }),
      ),
    ));

    expect(layers[0].type).toBe(TraceType.STACKED_AREA);
    const [solar, wind] = resolveSeries(doc, layers[0]);
    expect(solar).toHaveLength(1);
    expect(wind).toHaveLength(1);

    // The bottom band's top edge is drawn at the first series' own values, the
    // upper band's at the running total, so the y of the first vertex says
    // which band each selector actually found. `VictoryStack` paints the
    // topmost band first, so getting this backwards is the live risk.
    expect(firstVertexY(solar[0])).toBeGreaterThan(firstVertexY(wind[0]));
  });

  /** The y of a path's initial moveto — smaller is higher up the chart. */
  function firstVertexY(path: Element): number {
    const match = (path.getAttribute('d') ?? '').match(/M\s*-?[\d.]+[,\s]+(-?[\d.]+)/);
    return match ? Number.parseFloat(match[1]) : Number.NaN;
  }
});

describe('victory error bar', () => {
  it('tags exactly one whisker per sample', () => {
    const { doc, layers } = renderAndTag(createElement(
      VictoryChart,
      null,
      createElement(VictoryErrorBar, {
        data: [
          { x: 1, y: 2, errorY: 0.5 },
          { x: 2, y: 3, errorY: [0.4, 0.2] },
          { x: 3, y: 5, errorY: 0.3 },
        ],
      }),
    ));

    expect(layers[0].type).toBe(TraceType.ERROR_BAR);
    // One element per sample is the trace's contract; any other count and it
    // discards the highlight for the whole layer.
    expect(doc.querySelectorAll(layers[0].selectors as string)).toHaveLength(3);
  });
});

describe('victory waterfall', () => {
  it('tags one bar per step', () => {
    const { doc, layers } = renderAndTag(createElement(
      VictoryChart,
      null,
      createElement(VictoryBar, {
        data: [
          { x: 'Open', y: 100, y0: 0 },
          { x: 'Sales', y: 160, y0: 100 },
          { x: 'Costs', y: 130, y0: 160 },
        ],
      }),
    ));

    expect(layers[0].type).toBe(TraceType.WATERFALL);
    expect(doc.querySelectorAll(layers[0].selectors as string)).toHaveLength(3);
  });
});

describe('victory polar area', () => {
  it('tags the wedges and never the polar axis', () => {
    const { doc, layers } = renderAndTag(createElement(
      VictoryChart,
      { polar: true },
      createElement(VictoryPolarAxis, { key: 'axis' }),
      createElement(VictoryBar, { key: 'bar', data: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }] }),
    ));

    expect(layers[0].type).toBe(TraceType.POLAR_AREA);
    const [wedges] = resolveSeries(doc, layers[0]);
    expect(wedges).toHaveLength(3);
    // The axis is a presentation path too; the origin translate is what tells
    // a mark from it.
    expect(wedges.every(wedge => wedge.hasAttribute('transform'))).toBe(true);
  });
});

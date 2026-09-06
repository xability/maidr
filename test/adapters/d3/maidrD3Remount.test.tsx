/**
 * @jest-environment jsdom
 */

/**
 * What survives the `<Maidr>` swap.
 *
 * `MaidrD3` renders its children bare until the first bind succeeds and then
 * re-renders them inside `<Maidr>`, which wraps them in
 * `<article><figure><div>`. The element type at that position changes, so
 * React unmounts the bare subtree and mounts a brand-new `<svg>` host node.
 *
 * Everything a binder writes onto the SVG — the container `id` every emitted
 * selector is anchored to, and the `data-maidr-*` stamps the per-mark
 * selectors key off — is a direct DOM mutation on the node that was just
 * destroyed. Unless the adapter binds again against the node that replaced
 * it, no emitted selector resolves and the chart is silently left with no
 * highlighting at all.
 */

import type { D3AdapterSpec } from '@adapters/d3/useD3Adapter';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX, ReactNode } from 'react';
import { MaidrD3 } from '@adapters/d3/MaidrD3';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react';
import { useCallback, useRef } from 'react';

/** The schema handed to `<Maidr>` on the most recent render. */
let mockRenderedData: MaidrData | null = null;

/**
 * `<Maidr>` stands in for itself: the real component reaches `react-markdown`
 * (ESM-only) through the chat panel, and this project compiles to CommonJS.
 * The stub keeps the one property this file is about — the wrapping element
 * that changes the tree shape and therefore remounts the `<svg>`.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { data: MaidrData; children: ReactNode }): ReactNode => {
    mockRenderedData = props.data;
    return (
      <article>
        <figure>
          <div>{props.children}</div>
        </figure>
      </article>
    );
  },
}));

const SVG_NS = 'http://www.w3.org/2000/svg';

const SALES = [
  { quarter: 'Q1', revenue: 120 },
  { quarter: 'Q2', revenue: 240 },
  { quarter: 'Q3', revenue: 180 },
];

/** A `d3-hexbin` bin: the points that fell in it, carrying its centre. */
const BINS = [
  Object.assign([0, 1, 2, 3], { x: 2, y: 10 }),
  Object.assign([0, 1], { x: 1, y: 10 }),
  Object.assign([0, 1, 2], { x: 0.5, y: 20 }),
];

/**
 * Appends one mark per datum, binding each the way
 * `selectAll(tag).data(...).join(tag)` would leave it.
 *
 * @param node - The SVG to draw into.
 * @param tag - The SVG element name to draw.
 * @param className - The class every mark carries.
 * @param data - The data to bind, one datum per mark.
 */
function draw(node: SVGSVGElement, tag: string, className: string, data: unknown[]): void {
  node.replaceChildren();
  for (const datum of data) {
    const mark = node.ownerDocument.createElementNS(SVG_NS, tag);
    mark.setAttribute('class', className);
    (mark as unknown as { __data__: unknown }).__data__ = datum;
    node.appendChild(mark);
  }
}

/**
 * The shipped usage pattern: D3 draws in a ref callback, so the redraw
 * re-fires when the `<Maidr>` swap remounts the `<svg>`.
 *
 * @param props - The chart to render.
 * @param props.spec - The binder spec to run against the SVG.
 * @param props.onMount - The drawing to run whenever the SVG mounts.
 * @returns The wrapped chart.
 */
function Chart(props: { spec: D3AdapterSpec; onMount: (node: SVGSVGElement) => void }): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { spec, onMount } = props;

  const attachSvg = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    if (node) {
      onMount(node);
    }
  }, [onMount]);

  return (
    <MaidrD3 svgRef={svgRef} {...spec}>
      <svg ref={attachSvg} />
    </MaidrD3>
  );
}

/**
 * Reads the single layer of the schema `<Maidr>` was last handed.
 *
 * @returns The layer, or `undefined` when nothing was published.
 */
function publishedLayer(): MaidrData['subplots'][number][number]['layers'][number] | undefined {
  return mockRenderedData?.subplots[0][0].layers[0];
}

describe('the D3 adapter after the <Maidr> swap', () => {
  beforeEach(() => {
    mockRenderedData = null;
  });

  test('resolves the emitted selector against the SVG the reader can see', () => {
    render(
      <Chart
        spec={{
          chartType: 'bar',
          config: { selector: 'rect.bar', x: 'quarter', y: 'revenue', title: 'Sales' },
        }}
        onMount={node => draw(node, 'rect', 'bar', SALES)}
      />,
    );

    const selector = publishedLayer()?.selectors;
    expect(typeof selector).toBe('string');
    expect(document.querySelectorAll(selector as string)).toHaveLength(SALES.length);
  });

  test('restores the per-mark stamps the ordered selectors key off', () => {
    render(
      <Chart
        spec={{
          chartType: 'hexbin',
          config: { selector: 'path.hexagon', title: 'Density' },
        }}
        onMount={node => draw(node, 'path', 'hexagon', BINS)}
      />,
    );

    // One selector per bin, each stamped onto the mark it names — the model
    // withdraws the whole layer's highlighting when one of them resolves to
    // anything other than exactly one element.
    const selectors = publishedLayer()?.selectors as string[][];
    expect(selectors.flat()).toHaveLength(BINS.length);
    for (const selector of selectors.flat()) {
      expect(document.querySelectorAll(selector)).toHaveLength(1);
    }
  });

  test('keeps the figure id the first bind published', () => {
    const seen: string[] = [];
    const spec: D3AdapterSpec = {
      chartType: 'bar',
      config: { selector: 'rect.bar', x: 'quarter', y: 'revenue' },
    };

    render(
      <Chart
        spec={spec}
        onMount={(node) => {
          draw(node, 'rect', 'bar', SALES);
          if (mockRenderedData) {
            seen.push(mockRenderedData.id);
          }
        }}
      />,
    );

    // The re-bind settles rather than publishing a fresh figure on every
    // commit, and the id a screen reader may already have reached is stable.
    expect(new Set(seen.concat(mockRenderedData?.id ?? '')).size).toBe(1);
  });
});

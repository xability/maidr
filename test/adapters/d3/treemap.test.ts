import type { TreemapPoint } from '@type/grammar';
import { bindD3Icicle, bindD3Sunburst, bindD3Treemap } from '@adapters/d3/binders/treemap';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/** A node of the tree the caller hands to `d3.hierarchy()`. */
interface Row {
  name: string;
  population?: number;
  children?: Row[];
}

/**
 * A `d3.hierarchy()` node, built here rather than pulled in: the adapter
 * imports no d3 code, so the datum shape is what has to be reproduced —
 * `data`, `depth`, the summed `value`, and `ancestors()`.
 */
interface Node {
  data: Row;
  depth: number;
  value: number;
  parent: Node | null;
  ancestors: () => Node[];
}

/**
 * Wraps a row tree the way `d3.hierarchy(root).sum(d => d.population)` does,
 * returning every node in the order `descendants()` yields them (root first,
 * then each subtree).
 */
function hierarchy(row: Row, depth = 0, parent: Node | null = null): Node[] {
  const node: Node = {
    data: row,
    depth,
    value: 0,
    parent,
    ancestors() {
      const chain: Node[] = [];
      for (let at: Node | null = node; at !== null; at = at.parent) {
        chain.push(at);
      }
      return chain;
    },
  };
  const descendants = (row.children ?? [])
    .flatMap(child => hierarchy(child, depth + 1, node));
  node.value = row.population
    ?? descendants
      .filter(child => child.parent === node)
      .reduce((total, child) => total + child.value, 0);
  return [node, ...descendants];
}

const WORLD: Row = {
  name: 'World',
  children: [
    { name: 'Asia', children: [
      { name: 'China', population: 1425 },
      { name: 'India', population: 1428 },
    ] },
    { name: 'Africa', children: [
      { name: 'Nigeria', population: 224 },
    ] },
  ],
};

/** Builds an SVG holding one element of `tag` per node, in the given order. */
function buildTreeSvg(id: string, tag: string, className: string, data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="${id}"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const element = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    element.setAttribute('class', className);
    (element as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(element);
  }
  return svg;
}

/** The leaves, which is what `d3.treemap()(root).leaves()` yields. */
function leaves(): Node[] {
  return hierarchy(WORLD).filter(node => node.data.children === undefined);
}

describe('bindD3Treemap', () => {
  test('names each leaf and walks its ancestors into a path', () => {
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', leaves());

    const result = bindD3Treemap(svg, {
      selector: 'rect.leaf',
      title: 'World population by region',
      axes: { x: 'Region', y: 'Population, millions' },
    });

    expect(result.layer.type).toBe(TraceType.TREEMAP);
    // Root first and excluding the node itself, which is what the grammar
    // asks for and what the reader is told as a breadcrumb.
    expect(result.layer.data).toEqual([
      { x: 'China', y: 1425, path: ['World', 'Asia'] },
      { x: 'India', y: 1428, path: ['World', 'Asia'] },
      { x: 'Nigeria', y: 224, path: ['World', 'Africa'] },
    ]);
  });

  test('reads the total the layout itself summed', () => {
    // `.sum(...)` is what the rectangle's area was drawn from, so reading it
    // back keeps the sonified magnitude identical to the mark on screen.
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', hierarchy(WORLD));

    const result = bindD3Treemap(svg, { selector: 'rect.leaf' });

    const [root] = result.layer.data as TreemapPoint[];
    expect(root).toEqual({ x: 'World', y: 3077 });
  });

  test('honours an explicit y over the layout\'s total', () => {
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', leaves());

    const result = bindD3Treemap(svg, { selector: 'rect.leaf', y: 'population' });

    const [china] = result.layer.data as TreemapPoint[];
    expect(china.y).toBe(1425);
  });

  test('reads a tree drawn without d3.hierarchy from declared paths', () => {
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', [
      { name: 'China', value: 1425, path: ['World', 'Asia'] },
      { name: 'Nigeria', value: 224, path: ['World', 'Africa'] },
    ]);

    const result = bindD3Treemap(svg, { selector: 'rect.leaf' });

    expect(result.layer.data).toEqual([
      { x: 'China', y: 1425, path: ['World', 'Asia'] },
      { x: 'Nigeria', y: 224, path: ['World', 'Africa'] },
    ]);
  });

  test('highlights every node through one scoped selector', () => {
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', leaves());

    const result = bindD3Treemap(svg, { selector: 'rect.leaf' });

    // The trace indexes the matches by declaration order and withdraws
    // highlighting on a count mismatch, so the element count must be exactly
    // the number of points emitted.
    expect(result.layer.selectors).toBe('#tm-svg rect.leaf');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength((result.layer.data as TreemapPoint[]).length);
  });

  test('throws an actionable error when the selector matches no nodes', () => {
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', leaves());

    expect(() => bindD3Treemap(svg, { selector: 'rect.tile' })).toThrow(/treemap node/);
  });
});

describe('bindD3Sunburst', () => {
  test('emits the interior arcs a partition draws, alongside the leaves', () => {
    // A partition lays out interior nodes too, and every arc the reader can
    // see has to be a point they can reach — and highlight.
    const arcs = hierarchy(WORLD).slice(1);
    const svg = buildTreeSvg('sb-svg', 'path', 'arc', arcs);

    const result = bindD3Sunburst(svg, {
      selector: 'path.arc',
      title: 'World population by region',
      axes: { x: 'Region', y: 'Population, millions' },
    });

    expect(result.layer.type).toBe(TraceType.SUNBURST);
    expect(result.layer.data).toEqual([
      { x: 'Asia', y: 2853, path: ['World'] },
      { x: 'China', y: 1425, path: ['World', 'Asia'] },
      { x: 'India', y: 1428, path: ['World', 'Asia'] },
      { x: 'Africa', y: 224, path: ['World'] },
      { x: 'Nigeria', y: 224, path: ['World', 'Africa'] },
    ]);
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(arcs.length);
  });
});

describe('bindD3Icicle', () => {
  test('reads the same partition a sunburst does, as bands', () => {
    // An icicle is the sunburst's partition in cartesian coordinates: the
    // tree is identical, and only the type the layer announces differs.
    const bands = hierarchy(WORLD).slice(1);
    const svg = buildTreeSvg('ic-svg', 'rect', 'band', bands);

    const result = bindD3Icicle(svg, {
      selector: 'rect.band',
      title: 'World population by region',
      axes: { x: 'Region', y: 'Population, millions' },
    });

    expect(result.layer.type).toBe(TraceType.ICICLE);
    expect(result.layer.data).toEqual([
      { x: 'Asia', y: 2853, path: ['World'] },
      { x: 'China', y: 1425, path: ['World', 'Asia'] },
      { x: 'India', y: 1428, path: ['World', 'Asia'] },
      { x: 'Africa', y: 224, path: ['World'] },
      { x: 'Nigeria', y: 224, path: ['World', 'Africa'] },
    ]);
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(bands.length);
  });
});

describe('core-model integration', () => {
  test('a treemap layer constructs a navigable Figure', () => {
    const svg = buildTreeSvg('tm-svg', 'rect', 'leaf', leaves());
    const result = bindD3Treemap(svg, {
      selector: 'rect.leaf',
      title: 'World population by region',
      axes: { x: 'Region', y: 'Population, millions' },
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.TREEMAP]);
    });
  });

  test('an icicle layer constructs a navigable Figure', () => {
    const svg = buildTreeSvg('ic-svg', 'rect', 'band', hierarchy(WORLD).slice(1));
    const result = bindD3Icicle(svg, {
      selector: 'rect.band',
      title: 'World population by region',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.ICICLE]);
    });
  });

  test('a sunburst layer constructs a navigable Figure', () => {
    const svg = buildTreeSvg('sb-svg', 'path', 'arc', hierarchy(WORLD).slice(1));
    const result = bindD3Sunburst(svg, {
      selector: 'path.arc',
      title: 'World population by region',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.SUNBURST]);
    });
  });
});

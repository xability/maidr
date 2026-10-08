import type { DirectedGraphPoint } from '@type/grammar';
import { bindD3DirectedGraph } from '@adapters/d3/binders/directedGraph';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

const SVG_NS = 'http://www.w3.org/2000/svg';

const NODES = [
  { id: 'input', name: 'Input' },
  { id: 'dense', name: 'Dense' },
  { id: 'relu', name: 'ReLU' },
  { id: 'output', name: 'Output' },
];

/** The links after `d3.forceLink().id(d => d.id)`: each end is the node object. */
const LINKS = [['input', 'dense'], ['dense', 'relu'], ['relu', 'output'], ['input', 'output']]
  .map(([source, target]) => ({
    source: NODES.find(node => node.id === source),
    target: NODES.find(node => node.id === target),
  }));

function buildSvg(): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="${SVG_NS}" id="dg-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const link of LINKS) {
    const line = doc.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'edge');
    (line as unknown as { __data__: unknown }).__data__ = link;
    svg.appendChild(line);
  }
  for (const node of NODES) {
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'op');
    circle.setAttribute('r', '5');
    (circle as unknown as { __data__: unknown }).__data__ = node;
    svg.appendChild(circle);
  }
  return svg;
}

describe('bindD3DirectedGraph', () => {
  test('reads each node, in DOM order, with the links pointing at it as its inputs', () => {
    const result = bindD3DirectedGraph(buildSvg(), {
      selector: 'line.edge',
      nodeSelector: 'circle.op',
      label: 'name',
    });

    expect(result.layer.type).toBe(TraceType.DIRECTED_GRAPH);
    expect(result.layer.data as DirectedGraphPoint[]).toEqual([
      { id: 'input', label: 'Input' },
      { id: 'dense', label: 'Dense', inputs: ['input'] },
      { id: 'relu', label: 'ReLU', inputs: ['dense'] },
      { id: 'output', label: 'Output', inputs: ['relu', 'input'] },
    ]);
    expect(result.layer.selectors).toBe('#dg-svg circle.op');
  });

  test('outlines one node element per declared node', () => {
    const svg = buildSvg();
    const result = bindD3DirectedGraph(svg, { selector: 'line.edge', nodeSelector: 'circle.op' });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      const trace = figure.subplots[0][0].traces[0][0] as unknown as { highlightValues: unknown[][] | null };

      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.DIRECTED_GRAPH]);
      expect(trace.highlightValues).not.toBeNull();
    });
  });

  test('derives the nodes from the links when the chart names none, and outlines nothing', () => {
    const result = bindD3DirectedGraph(buildSvg(), { selector: 'line.edge' });

    expect((result.layer.data as DirectedGraphPoint[]).map(node => node.id))
      .toEqual(['input', 'dense', 'relu', 'output']);
    expect(result.layer.selectors).toBeUndefined();
  });
});

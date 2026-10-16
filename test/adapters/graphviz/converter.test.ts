/**
 * @jest-environment jsdom
 */
import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import { bindGraphviz } from '@adapters/graphviz/bind';
import { createMaidrFromGraphviz } from '@adapters/graphviz/converter';
import { isGraphvizSvg, readGraphviz, splitEdgeTitle } from '@adapters/graphviz/read';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { empty, pipeline, tricky, undirected } from './fixtures';

/** Puts drawings in the page, each in a figure of its own, as Quarto does. */
function mount(...drawings: string[]): SVGSVGElement[] {
  document.body.innerHTML = drawings.map(svg => `<figure>${svg}</figure>`).join('');
  return [...document.querySelectorAll('svg')];
}

/** The only layer of a figure. */
function layerOf(svg: SVGSVGElement): MaidrLayer {
  const figure = createMaidrFromGraphviz(svg);
  const layers = figure.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readGraphviz', () => {
  test('reads the nodes in drawing order, each by its name and its drawn text', () => {
    const [svg] = mount(pipeline);
    const graph = readGraphviz(svg);

    expect(graph.label).toBe('Release pipeline');
    expect(graph.nodes.map(node => [node.name, node.label])).toEqual([
      ['checkout', 'Check out'],
      // A two-line label is drawn as two <text>s.
      ['build', 'Compile sources'],
      ['test', 'Tests pass?'],
      ['ship', 'ship'],
      ['fix', 'fix'],
      // shape=point draws no text.
      ['done', ''],
    ]);
  });

  test('reads each edge\'s ends and label', () => {
    const [svg] = mount(pipeline);
    const edges = readGraphviz(svg).edges.map(({ tail, head, directed, label }) => ({ tail, head, directed, label }));

    expect(edges).toEqual(expect.arrayContaining([
      { tail: 'checkout', head: 'build', directed: true, label: undefined },
      { tail: 'test', head: 'ship', directed: true, label: 'yes' },
      { tail: 'test', head: 'fix', directed: true, label: 'no' },
      { tail: 'fix', head: 'build', directed: true, label: undefined },
    ]));
    expect(edges).toHaveLength(6);
  });

  test('reads names holding the operator or a colon, ports, links and end labels', () => {
    const [svg] = mount(tricky);
    const graph = readGraphviz(svg);

    expect(graph.nodes.map(node => [node.name, node.label])).toEqual([
      ['a->b', 'left right'],
      ['c:d', 'c:d'],
      // Drawn inside a link, which carries a <title> of its own.
      ['e', 'e'],
    ]);
    expect(graph.edges.map(({ tail, head, label }) => [tail, head, label])).toEqual([
      ['a->b', 'c:d', undefined],
      ['c:d', 'e', 'h t'],
      ['e', 'e', undefined],
    ]);
  });

  test('reads an anonymous graph, whose group Graphviz leaves untitled', () => {
    const [svg] = mount(tricky);

    expect(svg.querySelector('g.graph > title')).toBeNull();
    expect(isGraphvizSvg(svg)).toBe(true);
  });

  test('throws on an SVG Graphviz did not draw', () => {
    const [svg] = mount('<svg><g class="bars"><rect/></g></svg>');

    expect(isGraphvizSvg(svg)).toBe(false);
    expect(() => readGraphviz(svg)).toThrow('not a Graphviz drawing');
  });
});

describe('splitEdgeTitle', () => {
  const names = new Set(['a', 'b', 'a->b', 'x:y']);

  test('takes the first split whose sides both name a node', () => {
    expect(splitEdgeTitle('a->b->a', names)).toEqual({ tail: 'a->b', head: 'a', directed: true });
    expect(splitEdgeTitle('a--b', names)).toEqual({ tail: 'a', head: 'b', directed: false });
  });

  test('drops a port and compass point, keeping a colon that is part of a name', () => {
    expect(splitEdgeTitle('x:y:p:ne->a:w', names)).toEqual({ tail: 'x:y', head: 'a', directed: true });
  });

  test('gives null when no split names two nodes', () => {
    expect(splitEdgeTitle('a->z', names)).toBeNull();
  });
});

describe('createMaidrFromGraphviz', () => {
  test('makes a digraph a directed_graph whose nodes name the nodes feeding them', () => {
    const [svg] = mount(pipeline);
    const figure = createMaidrFromGraphviz(svg);
    const layer = figure.subplots[0][0].layers[0];

    expect(figure.title).toBe('Release pipeline');
    expect(layer.type).toBe(TraceType.DIRECTED_GRAPH);
    expect(layer.data as DirectedGraphPoint[]).toEqual([
      { id: 'checkout', label: 'Check out' },
      { id: 'build', label: 'Compile sources', inputs: ['checkout', 'fix'] },
      { id: 'test', label: 'Tests pass?', inputs: ['build'] },
      { id: 'ship', inputs: ['test'], inputLabels: ['yes'] },
      { id: 'fix', inputs: ['test'], inputLabels: ['no'] },
      { id: 'done', inputs: ['ship'] },
    ]);
  });

  test('pairs each node with its own group, in this drawing alone', () => {
    // Graphviz numbers node1, node2, ... afresh in each drawing.
    const [first, second] = mount(pipeline, pipeline);
    createMaidrFromGraphviz(first);
    const layer = layerOf(second);
    const selectors = layer.selectors as string[];

    expect(selectors).toHaveLength(6);
    selectors.forEach((selector, index) => {
      const matched = document.querySelectorAll(selector);
      expect(matched).toHaveLength(1);
      expect(second.contains(matched[0])).toBe(true);
      expect(matched[0].querySelector('title')?.textContent).toBe((layer.data as DirectedGraphPoint[])[index].id);
    });
  });

  test('gives a layer the directed graph trace reads, with every node highlighted', () => {
    const [svg] = mount(pipeline);
    const trace = TraceFactory.create(layerOf(svg));

    expect(trace).toBeDefined();
    // The trace resolves each selector to the node and draws its outline
    // from a hidden copy of it.
    expect(document.querySelectorAll('[data-maidr-graphviz-node][data-maidr-owned]')).toHaveLength(6);
  });

  test('takes the title, caption and node noun it is given', () => {
    const [svg] = mount(pipeline);
    const figure = createMaidrFromGraphviz(svg, { id: 'release', title: 'Releasing', caption: 'How a change ships', nodeLabel: 'Step' });

    expect(figure.id).toBe('release');
    expect(figure.title).toBe('Releasing');
    expect(figure.caption).toBe('How a change ships');
    expect(figure.subplots[0][0].layers[0]).toMatchObject({ id: 'release-graph', axes: { x: { label: 'Step' } } });
  });

  test('makes a graph with no nodes a figure with nothing in it', () => {
    const [svg] = mount(empty);
    const figure = createMaidrFromGraphviz(svg);

    expect(figure.title).toBe('Nothing yet');
    expect(figure.subplots[0][0].layers).toEqual([]);
  });

  test('refuses an undirected graph rather than giving its links a direction', () => {
    const [svg] = mount(undirected);

    expect(() => createMaidrFromGraphviz(svg)).toThrow('Undirected graphs');
  });
});

describe('bindGraphviz', () => {
  test('binds every Graphviz drawing on the page once, and nothing else', () => {
    mount(pipeline, '<svg><rect/></svg>', tricky);

    const figures = bindGraphviz();

    expect(figures).toHaveLength(2);
    expect(document.querySelectorAll('svg[maidr]')).toHaveLength(2);
    expect(bindGraphviz()).toEqual([]);
  });

  test('reports a drawing it cannot convert and binds the rest', () => {
    mount(undirected, pipeline);
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const figures = bindGraphviz();

    expect(figures).toHaveLength(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  test('binds one drawing with the id it is given', () => {
    const [svg] = mount(pipeline, pipeline);

    const [figure] = bindGraphviz(svg, { id: 'only' });

    expect(figure.id).toBe('only');
    expect(JSON.parse(svg.getAttribute('maidr') ?? '{}').id).toBe('only');
    expect(document.querySelectorAll('svg[maidr]')).toHaveLength(1);
  });
});

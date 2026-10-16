/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import { createMaidrFromGraphviz } from '@adapters/graphviz/converter';
import { afterAll, afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { undirected } from './fixtures';
import { friends, twins } from './networkFixtures';

/** Puts drawings in the page, each in a figure of its own, as Quarto does. */
function mount(...drawings: string[]): SVGSVGElement[] {
  document.body.innerHTML = drawings.map(svg => `<figure>${svg}</figure>`).join('');
  return [...document.querySelectorAll('svg')];
}

/** The only layer of a figure. */
function layerOf(svg: SVGSVGElement): MaidrLayer {
  const layers = createMaidrFromGraphviz(svg).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

// friends draws a node no edge touches, which the adapter warns about.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  document.body.innerHTML = '';
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

describe('an undirected Graphviz graph', () => {
  test('becomes a network with one link per edge, each end named by its drawn text', () => {
    const [svg] = mount(friends);
    const figure = createMaidrFromGraphviz(svg);
    const layer = figure.subplots[0][0].layers[0];

    expect(figure.title).toBe('Who knows whom');
    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.data as NetworkPoint[]).toEqual([
      { source: 'Ada', target: 'Grace' },
      { source: 'Grace', target: 'Alan' },
      { source: 'Alan', target: 'Ada' },
      { source: 'Edsger', target: 'Barbara' },
      // A loop is kept: the network trace reports it apart from the degrees.
      { source: 'Barbara', target: 'Barbara' },
    ]);
  });

  test('warns about a node no edge touches, which a network cannot read', () => {
    createMaidrFromGraphviz(mount(friends)[0]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('1 node with no edge (Loner)');
  });

  test('does not warn when every node has an edge', () => {
    createMaidrFromGraphviz(mount(undirected)[0]);

    expect(warn).not.toHaveBeenCalled();
  });

  test('names every node by its DOT name when two are drawn with the same text', () => {
    // One name for both servers would merge them into one node of degree 2.
    const [svg] = mount(twins);

    expect(layerOf(svg).data as NetworkPoint[]).toEqual([
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ]);
  });

  test('pairs each link with its own edge group, in this drawing alone', () => {
    const [first, second] = mount(friends, friends);
    createMaidrFromGraphviz(first);
    const layer = layerOf(second);
    const selectors = layer.selectors as string[];

    expect(selectors).toHaveLength(5);
    selectors.forEach((selector) => {
      const matched = document.querySelectorAll(selector);
      expect(matched).toHaveLength(1);
      expect(second.contains(matched[0])).toBe(true);
      expect(matched[0].getAttribute('class')).toBe('edge');
    });
  });

  test('gives a layer the network trace reads, with every link highlighted', () => {
    const [svg] = mount(undirected);
    const layer = layerOf(svg);

    expect(layer.id).toMatch(/-network$/);
    expect(TraceFactory.create(layer)).toBeDefined();
    expect(document.querySelectorAll('[data-maidr-graphviz-edge][data-maidr-owned]')).toHaveLength(2);
  });

  test('takes the node noun it is given', () => {
    const [svg] = mount(undirected);

    expect(createMaidrFromGraphviz(svg, { nodeLabel: 'Person' }).subplots[0][0].layers[0])
      .toMatchObject({ axes: { x: { label: 'Person' } } });
  });
});

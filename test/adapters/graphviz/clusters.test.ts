/**
 * @jest-environment jsdom
 */
import type { DirectedGraphPoint } from '@type/grammar';
import { createMaidrFromGraphviz } from '@adapters/graphviz/converter';
import { readGraphviz } from '@adapters/graphviz/read';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { services, spring } from './clusterFixtures';

/** Puts a drawing in the page. */
function mount(svg: string): SVGSVGElement {
  document.body.innerHTML = `<figure>${svg}</figure>`;
  const drawing = document.querySelector('svg');
  if (drawing === null) {
    throw new Error('no SVG');
  }
  return drawing;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Graphviz clusters', () => {
  test('are read with their labels, each inside the clusters drawn around it', () => {
    const clusters = readGraphviz(mount(services)).clusters;

    expect(clusters.map(({ name, label, path }) => ({ name, label, path }))).toEqual([
      { name: 'cluster_backend', label: 'Backend', path: [] },
      // style=rounded draws the outline as a path rather than a polygon.
      { name: 'cluster_data', label: 'Data', path: ['Backend'] },
      // A cluster that draws no label is called by its name, prefix dropped.
      { name: 'cluster_queue', label: 'queue', path: [] },
    ]);
  });

  test('put each node inside the clusters drawn around it, outermost first', () => {
    const nodes = readGraphviz(mount(services)).nodes;

    expect(Object.fromEntries(nodes.map(node => [node.name, node.path]))).toEqual({
      user: [],
      api: ['Backend'],
      db: ['Backend', 'Data'],
      cache: ['Backend', 'Data'],
      worker: ['queue'],
    });
  });

  test('become the scopes of a directed graph, as each node\'s path', () => {
    const layer = createMaidrFromGraphviz(mount(services)).subplots[0][0].layers[0];
    const byId = Object.fromEntries((layer.data as DirectedGraphPoint[]).map(point => [point.id, point]));

    expect(byId.user.path).toBeUndefined();
    expect(byId.api).toMatchObject({ label: 'API', path: ['Backend'], inputs: ['user'] });
    expect(byId.cache).toMatchObject({ path: ['Backend', 'Data'], inputs: ['api'], inputLabels: ['read'] });
    expect(byId.worker).toMatchObject({ path: ['queue'], inputs: ['db'] });
  });

  test('give a layer the directed graph trace reads', () => {
    const layer = createMaidrFromGraphviz(mount(services)).subplots[0][0].layers[0];

    expect(TraceFactory.create(layer)).toBeDefined();
  });

  test('are read the same from a layout other than dot', () => {
    const nodes = readGraphviz(mount(spring)).nodes;

    expect(Object.fromEntries(nodes.map(node => [node.name, node.path]))).toEqual({
      a: ['Left'],
      b: ['Left'],
      c: ['Right'],
    });
  });
});

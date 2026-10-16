/**
 * @jest-environment jsdom
 */
import type { TreemapPoint } from '@type/grammar';
import { createMaidrFromGraphviz } from '@adapters/graphviz/converter';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { coincident } from './clusterFixtures';
import { pipeline } from './fixtures';
import { disk } from './patchworkFixtures';

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

describe('a graph the patchwork layout drew', () => {
  test('becomes a treemap: clusters as branches, nodes as leaves sized by their area', () => {
    const figure = createMaidrFromGraphviz(mount(disk), { layout: 'patchwork' });
    const layer = figure.subplots[0][0].layers[0];

    expect(figure.title).toBe('Disk use');
    expect(layer.type).toBe(TraceType.TREEMAP);
    // Each leaf's area= attribute, read back from its rectangle.
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'home' },
      { x: 'system' },
      { x: 'docs', y: 4, path: ['home'] },
      { x: 'photos', y: 9, path: ['home'] },
      { x: 'lib', y: 3, path: ['system'] },
      { x: 'bin', y: 1, path: ['system'] },
      { x: 'tmp', y: 2 },
    ]);
    expect(layer.axes).toEqual({ y: { label: 'Area' } });
  });

  test('pairs every branch and leaf with its own rectangle, in declared order', () => {
    const svg = mount(disk);
    const layer = createMaidrFromGraphviz(svg, { layout: 'patchwork' }).subplots[0][0].layers[0];
    const selectors = layer.selectors as string[];

    const titles = selectors.map((selector) => {
      const matched = svg.querySelectorAll(selector);
      expect(matched).toHaveLength(1);
      return matched[0].querySelector('title')?.textContent;
    });

    expect(titles).toEqual(['cluster_home', 'cluster_system', 'docs', 'photos', 'lib', 'bin', 'tmp']);
  });

  test('gives a layer the treemap trace reads, with every rectangle highlighted', () => {
    const layer = createMaidrFromGraphviz(mount(disk), { layout: 'patchwork', nodeLabel: 'Folder' }).subplots[0][0].layers[0];

    expect(layer.axes?.x).toEqual({ label: 'Folder' });
    expect(TraceFactory.create(layer)).toBeDefined();
    expect(document.querySelectorAll('[data-maidr-graphviz-cell][data-maidr-owned]')).toHaveLength(7);
  });

  test('nests a cluster holding only a cluster, whose outlines coincide', () => {
    const layer = createMaidrFromGraphviz(mount(coincident), { layout: 'patchwork' }).subplots[0][0].layers[0];
    const data = layer.data as TreemapPoint[];

    expect(data.slice(0, 2)).toEqual([{ x: 'outer' }, { x: 'inner', path: ['outer'] }]);
    expect(data.find(point => point.x === 'a')?.path).toEqual(['outer', 'inner']);
  });

  test('is read only when the caller says patchwork drew it', () => {
    const layer = createMaidrFromGraphviz(mount(pipeline)).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DIRECTED_GRAPH);
  });
});

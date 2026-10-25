/**
 * @jest-environment jsdom
 */
import type { TreemapPoint } from '@type/grammar';
import { createMaidrFromGraphviz } from '@adapters/graphviz/converter';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { coincident } from './clusterFixtures';
import { pipeline } from './fixtures';
import { disk, large } from './patchworkFixtures';

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

  test('recovers the area attribute at any size, whatever size= the graph was drawn at', () => {
    // size="1,1" scales the drawing from outside the graph's coordinates.
    const layer = createMaidrFromGraphviz(mount(large), { layout: 'patchwork' }).subplots[0][0].layers[0];

    expect((layer.data as TreemapPoint[]).map(point => [point.x, point.y])).toEqual([
      ['big', 12345],
      ['mid', 1234],
      ['small', 0.5],
      ['odd', 60.25],
    ]);
  });

  test('warns about a node that drew no rectangle, rather than reading it as nothing', () => {
    const svg = mount(disk);
    svg.querySelector('g.node polygon')?.remove();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const layer = createMaidrFromGraphviz(svg, { layout: 'patchwork' }).subplots[0][0].layers[0];

    expect((layer.data as TreemapPoint[]).find(point => point.x === 'docs')?.y).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('1 node (docs) drew no rectangle');
    warn.mockRestore();
  });
});

describe('the one word the Graphviz adapter writes itself', () => {
  afterEach(() => {
    localStorage.clear();
    delete (window as unknown as { maidrLive?: unknown }).maidrLive;
  });

  test('is in the language asked for, or else the one the reader chose', () => {
    const asked = createMaidrFromGraphviz(mount(disk), { layout: 'patchwork', language: 'ko' });
    localStorage.setItem('maidr-settings', JSON.stringify({ general: { language: 'de' } }));
    const chosen = createMaidrFromGraphviz(mount(disk), { layout: 'patchwork' });

    expect(asked.subplots[0][0].layers[0].axes).toEqual({ y: { label: '면적' } });
    expect(chosen.subplots[0][0].layers[0].axes).toEqual({ y: { label: 'Fläche' } });
  });

  test('is written again when the reader changes language, and MAIDR handed the drawing read again', async () => {
    const setData = jest.fn(() => true);
    (window as unknown as { maidrLive?: unknown }).maidrLive = { setData };
    const svg = mount(disk);
    svg.setAttribute('maidr', JSON.stringify(createMaidrFromGraphviz(svg, { layout: 'patchwork' })));
    // MAIDR's copy of the node the reader is on, beside it, as it is while
    // MAIDR shows the drawing: read again, it is not a node of its own.
    const docs = [...svg.querySelectorAll('g.node')].find(node => node.querySelector('title')?.textContent === 'docs');
    const copy = docs?.cloneNode(true) as Element;
    copy.setAttribute('data-maidr-owned', 'true');
    docs?.after(copy);

    document.dispatchEvent(new CustomEvent('maidr:languagechange', { detail: { language: 'fr' } }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(setData).toHaveBeenCalledTimes(1);
    const layer = (setData.mock.calls[0] as unknown as [{ subplots: { layers: { axes: unknown; data: TreemapPoint[] }[] }[][] }])[0].subplots[0][0].layers[0];
    expect(layer.axes).toEqual({ y: { label: 'Aire' } });
    expect(layer.data.map(point => point.x)).toEqual(['home', 'system', 'docs', 'photos', 'lib', 'bin', 'tmp']);
  });
});

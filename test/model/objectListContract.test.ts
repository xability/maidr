import type { AbstractTrace } from '@model/abstract';
import type { Maidr, MaidrLayer } from '@type/grammar';
import type { ChartObjectList } from '@type/objectList';
import type { Observer } from '@type/observable';
import type { NonEmptyTraceState, TraceState } from '@type/state';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { arrangeObjects } from '@util/objectList';

/**
 * The object list's contract, held over every chart that offers one, on the
 * data the repository's own example pages ship.
 *
 * Each trace builds its list from its own structure, so each could break the
 * promises the dialog relies on in its own way: a key that repeats or comes
 * from where the object sits, a cell the cursor cannot reach, a filter that
 * shows nothing, a jump that lands on another object than the one named.
 * These hold them all to the same rules.
 */

const EXAMPLES = join(__dirname, '..', '..', 'examples');

/**
 * Decodes the HTML entities an example's `maidr` attribute is written with.
 * @param text - The attribute's raw text
 * @returns The JSON it holds
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * The first layer an example page declares in its `maidr` attribute, with its
 * selectors dropped: there is no chart to resolve them against here, and the
 * list does not depend on them.
 * @param file - The example's file name
 * @returns The layer
 */
function exampleLayer(file: string): MaidrLayer {
  const html = readFileSync(join(EXAMPLES, file), 'utf8');
  const match = /maidr=(['"])([\s\S]*?)\1/.exec(html);
  if (match === null) {
    throw new Error(`${file} declares no maidr attribute`);
  }
  const maidr = JSON.parse(decodeEntities(match[2])) as Maidr;
  const { selectors: _selectors, ...layer } = maidr.subplots[0][0].layers[0];
  return layer as MaidrLayer;
}

/** Charts whose example page carries no inline attribute to read. */
const INLINE: Record<string, MaidrLayer> = {
  venn: {
    id: 'venn',
    type: TraceType.VENN,
    title: 'Features',
    data: [
      { sets: ['Desirable'], size: 10 },
      { sets: ['Feasible'], size: 10 },
      { sets: ['Viable'], size: 8 },
      { sets: ['Desirable', 'Feasible'], size: 2.5, label: 'Buildable' },
      { sets: ['Feasible', 'Viable'], size: 2, label: 'Sustainable' },
      { sets: ['Desirable', 'Viable'], size: 2.5, label: 'Marketable' },
      { sets: ['Desirable', 'Feasible', 'Viable'], size: 1, label: 'Ship it' },
    ],
  },
  pie: {
    id: 'pie',
    type: TraceType.PIE,
    title: 'Fruit',
    data: [
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
      { x: 'Apples', y: 10 },
    ],
  },
  tree: {
    id: 'org',
    type: TraceType.TREE,
    title: 'Organisation',
    data: [
      { x: 'CEO' },
      { x: 'CTO', path: ['CEO'] },
      { x: 'CFO', path: ['CEO'] },
      { x: 'Engineer', path: ['CEO', 'CTO'] },
      { x: 'Engineer', path: ['CEO', 'CFO'] },
    ],
  } as MaidrLayer,
};

const CHARTS: [string, () => MaidrLayer][] = [
  ['network', () => exampleLayer('network.html')],
  ['directed graph', () => exampleLayer('directed-graph.html')],
  ['sankey', () => exampleLayer('sankey.html')],
  ['alluvial', () => exampleLayer('alluvial.html')],
  ['chord', () => exampleLayer('chord.html')],
  ['treemap', () => exampleLayer('treemap.html')],
  ['sunburst', () => exampleLayer('sunburst.html')],
  ['icicle', () => exampleLayer('icicle.html')],
  ['word cloud', () => exampleLayer('wordcloud.html')],
  ['choropleth', () => exampleLayer('choropleth.html')],
  ['venn', () => INLINE.venn],
  ['pie', () => INLINE.pie],
  ['unvalued tree', () => INLINE.tree],
];

/**
 * A trace of the layer and its list.
 * @param layer - The layer
 * @returns Both
 */
function build(layer: MaidrLayer): { trace: AbstractTrace; list: ChartObjectList } {
  const trace = TraceFactory.create(layer) as AbstractTrace;
  const list = trace.getObjectList();
  if (list === null) {
    throw new Error(`${layer.type} offers no object list`);
  }
  return { trace, list };
}

describe.each(CHARTS)('the %s object list', (_name, layerOf) => {
  test('should list objects with unique keys taken from the data', () => {
    const { list } = build(layerOf());

    const keys = list.objects.map(object => object.key);

    expect(list.objects.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const object of list.objects) {
      expect(object.key).not.toBe(`${object.row},${object.col}`);
      expect(object.key).not.toBe(`${object.row}:${object.col}`);
      expect(object.label).not.toBe('');
    }
  });

  test('should give each object a cell of its own that the cursor can reach', () => {
    const { trace, list } = build(layerOf());

    const cells = list.objects.map(object => `${object.row},${object.col}`);

    expect(new Set(cells).size).toBe(cells.length);
    for (const object of list.objects) {
      expect(trace.isMovable([object.row, object.col])).toBe(true);
    }
  });

  test('should give the same objects the same keys and names when built again', () => {
    const first = build(layerOf()).list;
    const second = build(layerOf()).list;

    expect(second.objects.map(object => [object.key, object.label]))
      .toEqual(first.objects.map(object => [object.key, object.label]));
  });

  test('should offer sorts and filters that each change something', () => {
    const { list } = build(layerOf());

    const sortIds = list.sorts.map(sort => sort.id);
    const filterIds = list.filters.map(filter => filter.id);
    const measureIds = new Set(list.measures.map(measure => measure.id));

    expect(list.sorts.length).toBeGreaterThan(0);
    expect(new Set(sortIds).size).toBe(sortIds.length);
    expect(new Set(filterIds).size).toBe(filterIds.length);
    for (const sort of list.sorts) {
      expect(sort.label).not.toBe('');
      if (sort.order.kind === 'measure') {
        expect(measureIds.has(sort.order.measure)).toBe(true);
      }
    }
    for (const filter of list.filters) {
      const shown = arrangeObjects(list.objects, { kind: 'chart' }, filter.id);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(list.objects.length);
    }
  });

  test('should work out each deferred measure as one value per object', () => {
    const { list } = build(layerOf());

    for (const compute of Object.values(list.deferred ?? {})) {
      expect(compute()).toHaveLength(list.objects.length);
    }
  });

  test('should move to each object, announcing it once by the name the list gives it', () => {
    const { trace, list } = build(layerOf());
    const seen: TraceState[] = [];
    trace.addObserver({ update: (state: TraceState) => void seen.push(state) } as Observer<TraceState>);

    for (const object of list.objects) {
      seen.length = 0;

      expect(trace.moveToObject(object.key)).toBe(true);

      expect(seen).toHaveLength(1);
      expect(trace.row).toBe(object.row);
      expect(trace.col).toBe(object.col);
      expect(String((seen[0] as NonEmptyTraceState).text.main.value)).toBe(object.label);
    }
  });

  test('should refuse a key it does not have, without moving', () => {
    const { trace } = build(layerOf());
    const seen: TraceState[] = [];
    trace.addObserver({ update: (state: TraceState) => void seen.push(state) } as Observer<TraceState>);

    expect(trace.moveToObject('no such object')).toBe(false);
    expect(seen).toHaveLength(0);
  });
});

describe('charts walked along their axes', () => {
  const LAYERS: MaidrLayer[] = [
    { id: 'bar', type: TraceType.BAR, data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] },
    { id: 'line', type: TraceType.LINE, data: [[{ x: 1, y: 1 }, { x: 2, y: 3 }]] },
    { id: 'scatter', type: TraceType.SCATTER, data: [{ x: 1, y: 1 }, { x: 2, y: 3 }] },
    { id: 'heat', type: TraceType.HEATMAP, data: { x: ['a', 'b'], y: ['c'], points: [[1, 2]] } },
  ] as MaidrLayer[];

  test.each(LAYERS.map(layer => [layer.type, layer] as const))('should offer no object list on a %s chart', (_type, layer) => {
    const trace = TraceFactory.create(layer) as AbstractTrace;

    expect(trace.getObjectList()).toBeNull();
    expect(trace.moveToObject('anything')).toBe(false);
  });
});

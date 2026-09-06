/**
 * `Tree` and `Pack` were read as hierarchies (#1140) but never given a
 * highlight.
 *
 * `classifySeriesKind` returns `'tree'` and `'pack'`, and the adapter emits
 * them as `TraceType.TREE` and `TraceType.PACK` -- but `groupSeries` bucketed
 * neither and `addEntryResolvers` registered a resolver for neither, so
 * `navMap.resolve()` answered `[]` at every position and the binder's overlay
 * cleared. Their treemap, icicle and sunburst siblings, which share the same
 * converter and the same node walk, highlighted normally.
 */
import type { AmXYChart } from '@adapters/amcharts/types';
import type { MaidrLayer } from '@type/grammar';
import { buildNavigationMap, groupSeries } from '@adapters/amcharts/navmap';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeHierarchySeries, itemOf } from './helpers';

const CONTINENTS = {
  category: 'Root',
  children: [
    { category: 'Asia', children: [{ category: 'China', value: 1425 }] },
    { category: 'Africa', children: [{ category: 'Nigeria', value: 224 }] },
  ],
};

/** The nav map for one standalone hierarchy series, built the way the binder does. */
function navMapFor(className: string, type: MaidrLayer['type']): ReturnType<typeof buildNavigationMap> {
  const series = fakeHierarchySeries('Population', CONTINENTS, className);
  const chart = fakeChart({ series: [series] }) as unknown as AmXYChart;
  return buildNavigationMap([{
    chart,
    layers: [{ id: 'nodes', type, data: [] }],
    groups: groupSeries(chart),
  }]);
}

describe('amCharts hierarchy highlight', () => {
  it.each([
    ['Tree', TraceType.TREE],
    ['LinkedHierarchy', TraceType.TREE],
    ['Pack', TraceType.PACK],
  ] as const)('resolves a %s node by [depth, index within depth]', (className, type) => {
    const navMap = navMapFor(className, type);

    expect(itemOf(navMap.resolve('nodes', 0, 1)[0]).get('category')).toBe('Africa');
    expect(itemOf(navMap.resolve('nodes', 1, 1)[0]).get('category')).toBe('Nigeria');
  });

  it.each([
    ['Tree', TraceType.TREE],
    ['Pack', TraceType.PACK],
  ] as const)('measures a %s node as a rectangle, the way a treemap block is', (className, type) => {
    const navMap = navMapFor(className, type);

    expect(navMap.resolve('nodes', 0, 0)[0].kind).toBe('column');
  });

  it('outlines nothing below a tree\'s deepest level', () => {
    const navMap = navMapFor('Tree', TraceType.TREE);

    expect(navMap.resolve('nodes', 2, 0)).toEqual([]);
  });

  it('buckets a tree and a pack alongside the treemap they share a walk with', () => {
    const tree = fakeHierarchySeries('T', CONTINENTS, 'Tree');
    const pack = fakeHierarchySeries('P', CONTINENTS, 'Pack');
    const chart = fakeChart({ series: [tree, pack] }) as unknown as AmXYChart;

    const groups = groupSeries(chart);

    expect(groups.hierarchySeriesList).toEqual([tree, pack]);
  });
});

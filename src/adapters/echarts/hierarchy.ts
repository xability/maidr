/**
 * The ECharts series that carry a hierarchy (#1195, tier 3).
 *
 * `treemap`, `sunburst` and `tree` are one shape drawn three ways: a rooted
 * forest of named nodes, some of which carry a magnitude. MAIDR has a trace
 * for each, and all three take the same `TreemapPoint[]` -- a flat list where
 * every node names its ancestors -- so the reading is one walk and three
 * labels.
 *
 * Measured on echarts 6.1.0, `data.tree.root` is the walk's entry point and
 * carries a **synthetic root** the author never wrote: its name is `''` and
 * its value is the sum of everything below it. The real forest is
 * `root.children`, so the walk starts one level down and the path it records
 * drops that empty name.
 *
 * ## What a node's value means
 *
 * `node.getValue()` answers the **rolled-up sum** for an interior node, and
 * ECharts writes that sum back into the raw data item -- so "did the author
 * declare this?" cannot be recovered by reading the data back.
 *
 * `TreemapPoint.y` wants it anyway: omitted for an interior node whose value
 * is the sum of its children, kept where it differs, "a parent may carry mass
 * no child accounts for". That is derivable without asking ECharts anything
 * it will not say -- compare the node's value with its children's sum, which
 * is what `carriesOwnValue` does. Measured against a chart with both cases:
 * `A` (children 1 and 2, nothing declared) reports 3, and `B` (declared 5,
 * one child of 2) reports 5.
 *
 * ## Which of the three can be outlined
 *
 * Only `sunburst`, and it took colour-tagging every node to establish it --
 * reading the default palette had suggested the opposite. Giving each node an
 * explicit `itemStyle.color` and reading the fills in document order:
 *
 *     sunburst   the marks are in exactly the walk's order
 *     treemap    only the *leaves* are painted; interior nodes are the white
 *                borders between them, and the leaf order is not the walk's
 *     tree       the node symbols stay `#fff` whatever `itemStyle` says,
 *                which the adapter's paint filter counts as furniture
 *
 * So a treemap can never satisfy a count against its node total, and a tree
 * has nothing to count. Both are read without an outline rather than pointed
 * at a mark that means something else.
 */

import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { EChartsSeriesModel, EChartsTreeNode } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';

/** The series types this module reads. */
export const HIERARCHY: ReadonlySet<string> = new Set([
  'treemap',
  'sunburst',
  'tree',
]);

/**
 * The series types whose marks can be paired with the walk.
 *
 * Only `sunburst`. See the note at the head of this file for what the other
 * two do instead, and how it was measured.
 */
export const OUTLINED_HIERARCHY: ReadonlySet<string> = new Set(['sunburst']);

const TRACE: Record<string, TraceType> = {
  treemap: TraceType.TREEMAP,
  sunburst: TraceType.SUNBURST,
  tree: TraceType.TREE,
};

/**
 * Builds the layer for one hierarchy series.
 *
 * @param seriesModel - The series to read
 * @param selectors   - One selector per node in walk order, when the series
 *                      is one whose marks can be paired with it
 * @returns The layer, or `undefined` when the series carries no nodes
 */
export function hierarchyLayer(
  seriesModel: EChartsSeriesModel,
  selectors: string[] | undefined,
): MaidrLayer | undefined {
  const points = walk(seriesModel);
  if (points.length === 0) {
    return undefined;
  }

  const type = TRACE[seriesModel.subType];
  if (type === undefined) {
    return undefined;
  }

  const named = seriesModel.get('name');
  const name = typeof named === 'string' ? named : '';

  return {
    id: nextId('layer'),
    type,
    ...(name ? { name } : {}),
    ...(selectors ? { selectors } : {}),
    axes: {},
    data: points,
  };
}

/**
 * How many nodes a hierarchy series drew.
 *
 * The walk's length, which is what a sunburst paints one mark for. A treemap
 * and a tree never reach the count check -- see the head of this file -- so
 * this is only ever asked of a sunburst.
 *
 * @param seriesModel - The series to read
 * @returns The number of real nodes, the synthetic root excluded
 */
export function drawnNodeCount(seriesModel: EChartsSeriesModel): number {
  return walk(seriesModel).length;
}

/**
 * Every real node of the series, depth first, in the tree's own order.
 *
 * The order is the tree's rather than the data's on purpose: measured, a
 * sunburst reorders its children (`B` before `A`, `A2` before `A1`) and paints
 * them in the reordered order, so a reading that followed the data would
 * announce the nodes in one order and outline them in another.
 *
 * @param seriesModel - The series to read
 * @returns One point per node, the synthetic root excluded
 */
function walk(seriesModel: EChartsSeriesModel): TreemapPoint[] {
  const root = seriesModel.getData().tree?.root;
  if (!root) {
    return [];
  }

  const points: TreemapPoint[] = [];
  const visit = (node: EChartsTreeNode, path: string[]): void => {
    // `path` is empty only for the synthetic root, which the author never
    // wrote and which no reader should meet.
    if (path.length > 0 || node !== root) {
      const own = carriesOwnValue(node);
      points.push({
        x: node.name,
        ...(own === undefined ? {} : { y: own }),
        ...(path.length > 0 ? { path: [...path] } : {}),
      });
    }
    const children = node.children ?? [];
    const below = node === root ? path : [...path, node.name];
    children.forEach(child => visit(child, below));
  };
  visit(root, []);

  return points;
}

/**
 * The magnitude a node carries in its own right, if any.
 *
 * A leaf's value is its own. An interior node's is the sum of its children
 * unless the author declared something else, and only the difference tells
 * the two apart -- see the note at the head of this file.
 *
 * @param node - The node to weigh
 * @returns The value to emit, or `undefined` when there is none to emit
 */
function carriesOwnValue(node: EChartsTreeNode): number | undefined {
  const value = node.getValue();
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const children = node.children ?? [];
  if (children.length === 0) {
    return value;
  }

  let sum = 0;
  for (const child of children) {
    const each = child.getValue();
    if (typeof each !== 'number' || !Number.isFinite(each)) {
      // A child with no magnitude makes the sum meaningless, so the node's
      // value is reported as its own rather than compared against it.
      return value;
    }
    sum += each;
  }
  return sum === value ? undefined : value;
}

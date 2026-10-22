/**
 * Builds a `tree` layer from a Mermaid hierarchy.
 */

import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { DiagramContext } from './types';
import { TraceType } from '@type/grammar';
import { selectorsFor } from './read';

/** One node of a hierarchy. */
export interface TreeNode {
  name: string;
  children?: TreeNode[];
  /** The node's magnitude, when the diagram gives one. */
  value?: number;
  /** What sort of node it is, where the levels differ: `Column`, `Card`. */
  kind?: string;
  /** The element Mermaid drew for it, when it was found. */
  element?: Element | null;
}

/** What {@link treeLayer} reads. */
export interface TreeParts {
  roots: TreeNode[];
  /**
   * What the layer calls a node: `Topic`, `Cause`, `Event`. A node is
   * announced with it unless it names its own kind.
   */
  nodeLabel?: string;
  /** What the magnitude measures, when there is one. */
  valueLabel?: string;
  /** The layer's name, when the figure has several. */
  name?: string;
  /** `tree` unless the diagram is drawn as nested areas. */
  type?: TraceType.TREE | TraceType.TREEMAP;
}

/**
 * Builds the layer, depth first, in the order the diagram lists the nodes.
 *
 * A tree names a node by its path, so two siblings sharing a name would be
 * read as one; the second is numbered instead, `Uses (2)`, which is how a
 * reader tells them apart without seeing them.
 *
 * @param context - The diagram being converted
 * @param parts - The hierarchy
 * @returns The layer, or null when there is nothing in it
 */
export function treeLayer(context: DiagramContext, parts: TreeParts): MaidrLayer | null {
  const data: TreemapPoint[] = [];
  const elements: (Element | null | undefined)[] = [];
  const visit = (nodes: TreeNode[], path: string[]): void => {
    const seen = new Map<string, number>();
    for (const node of nodes) {
      const base = node.name.trim() || '(blank)';
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const name = count === 1 ? base : `${base} (${count})`;
      const point: TreemapPoint = { x: name };
      if (path.length > 0) {
        point.path = path;
      }
      if (node.kind) {
        point.kind = node.kind;
      }
      if (node.value !== undefined && Number.isFinite(node.value)) {
        point.y = node.value;
      }
      data.push(point);
      elements.push(node.element);
      visit(node.children ?? [], [...path, name]);
    }
  };
  visit(parts.roots, []);
  if (data.length === 0) {
    return null;
  }

  const selectors = selectorsFor(elements);
  const axes = parts.nodeLabel || parts.valueLabel
    ? {
        axes: {
          ...(parts.nodeLabel ? { x: { label: parts.nodeLabel } } : {}),
          ...(parts.valueLabel ? { y: { label: parts.valueLabel } } : {}),
        },
      }
    : {};
  return {
    id: context.layerId(parts.name ? `tree-${parts.name}` : 'tree'),
    type: parts.type ?? TraceType.TREE,
    ...(parts.name ? { name: parts.name } : {}),
    ...axes,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * Pairs tree nodes with drawn text by what the text says.
 *
 * Diagrams that draw their labels with no id to find them by -- an Ishikawa
 * diagram, a tree view, a timeline -- still draw each label once, so a node
 * is paired with the first unpaired element whose text matches its name.
 * Whitespace is ignored, because a long label is wrapped across lines.
 *
 * @param candidates - The elements that could carry labels, in document order
 * @returns A function pairing a name with its element
 */
export function textMatcher(candidates: Element[]): (name: string) => Element | null {
  const used = new Set<Element>();
  const squash = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, '').toLowerCase();
  return (name: string): Element | null => {
    const wanted = squash(name);
    const found = candidates.find(element => !used.has(element) && squash(element.textContent) === wanted) ?? null;
    if (found) {
      used.add(found);
    }
    return found;
  };
}

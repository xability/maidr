/**
 * The Mermaid diagrams that are hierarchies: mindmaps, kanban boards, tree
 * views, Ishikawa (fishbone) diagrams, timelines, railroad grammars and the
 * Cynefin framework. Each becomes a `tree` layer, read parent to child.
 */

import type { GraphEdge, GraphNode } from '../graph';
import type { Row } from '../read';
import type { TreeNode } from '../tree';
import type { DiagramContext, DiagramConversion } from '../types';
import { directedGraphLayer } from '../graph';
import { all, call, findById, num, plain, rows, str } from '../read';
import { textMatcher, treeLayer } from '../tree';

/**
 * A conversion holding the one layer, or none.
 *
 * @param layer - The layer, or null
 * @returns The conversion
 */
function single(layer: ReturnType<typeof treeLayer>): DiagramConversion {
  return { layers: layer ? [layer] : [] };
}

/**
 * Mindmaps: a central topic and its branches.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function mindmap(context: DiagramContext): DiagramConversion {
  const root = call(context.db, 'getMindmap') as Row | undefined;
  const candidates = all(context.svg, 'g.node[id], g[id].node');
  const used = new Set<Element>();
  const visit = (node: Row): TreeNode => ({
    name: plain(node.descr) || plain(node.nodeId),
    element: findById(candidates, context.svgId, [`node_${str(node.id) ?? ''}`], used),
    children: rows(node.children).map(visit),
  });
  return single(root ? treeLayer(context, { roots: [visit(root)], nodeLabel: 'Topic' }) : null);
}

/**
 * Kanban boards: columns and the cards in them, each card with its ticket,
 * assignee and priority. Each is announced as the one it is; together they
 * are the board's items.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function kanban(context: DiagramContext): DiagramConversion {
  const data = call(context.db, 'getData') as Row | undefined;
  const nodes = rows(data?.nodes);
  const candidates = all(context.svg, 'g.node[id], g.cluster[id], g[id].node, g[id].cluster');
  const used = new Set<Element>();
  const columns: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  for (const row of nodes.filter(one => one.isGroup === true)) {
    const column: TreeNode = {
      name: plain(row.label) || (str(row.id) ?? ''),
      kind: 'Column',
      element: findById(candidates, context.svgId, [str(row.id)], used),
      children: [],
    };
    columns.push(column);
    byId.set(str(row.id) ?? '', column);
  }
  for (const row of nodes.filter(one => one.isGroup !== true)) {
    const details = [
      ['ticket', plain(row.ticket)],
      ['assigned to', plain(row.assigned)],
      ['priority', plain(row.priority)],
    ].filter(([, value]) => value !== '').map(([key, value]) => `${key} ${value}`);
    const label = plain(row.label) || (str(row.id) ?? '');
    const card: TreeNode = {
      name: details.length > 0 ? `${label} (${details.join(', ')})` : label,
      kind: 'Card',
      element: findById(candidates, context.svgId, [str(row.id)], used),
    };
    const column = byId.get(str(row.parentId) ?? '');
    if (column) {
      column.children?.push(card);
    } else {
      columns.push(card);
    }
  }
  return single(treeLayer(context, { roots: columns, nodeLabel: 'Item' }));
}

/**
 * Tree views: a directory listing, folders and the files in them.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function treeView(context: DiagramContext): DiagramConversion {
  const root = call(context.db, 'getRoot') as Row | undefined;
  const match = textMatcher(all(context.svg, 'text.treeView-node-label, .treeView-node-label'));
  const visit = (node: Row): TreeNode => {
    const name = plain(node.name);
    return {
      name: str(node.nodeType) === 'directory' && name !== '/' ? `${name}/` : name,
      element: match(name),
      children: rows(node.children).map(visit),
    };
  };
  return single(root ? treeLayer(context, { roots: [visit(root)], nodeLabel: 'Entry' }) : null);
}

/**
 * Ishikawa (fishbone) diagrams: an effect, its categories of cause, and the
 * causes under each.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function ishikawa(context: DiagramContext): DiagramConversion {
  const root = call(context.db, 'getRoot') as Row | undefined;
  const match = textMatcher(all(context.svg, 'text.ishikawa-head-label, text.ishikawa-label'));
  // A cause may have causes of its own, so every level below the categories
  // is a cause.
  const kinds = ['Effect', 'Category'];
  const visit = (node: Row, depth: number): TreeNode => {
    const name = plain(node.text ?? node.label);
    return {
      name,
      kind: kinds[depth] ?? 'Cause',
      element: match(name),
      children: rows(node.children).map(child => visit(child, depth + 1)),
    };
  };
  return single(root ? treeLayer(context, { roots: [visit(root, 0)], nodeLabel: 'Cause' }) : null);
}

/**
 * Timelines: periods in order, each with its events, grouped in sections
 * when the timeline has them.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function timeline(context: DiagramContext): DiagramConversion {
  const sections = (call(context.db, 'getSections') as unknown[] | undefined ?? []).map(plain);
  const tasks = rows(call(context.db, 'getTasks'));
  const match = textMatcher(all(context.svg, 'g.timeline-node'));
  const period = (task: Row): TreeNode => {
    const name = plain(task.task);
    return {
      name,
      kind: 'Period',
      element: match(name),
      children: (Array.isArray(task.events) ? task.events : []).map((event) => {
        const text = plain(event);
        return { name: text, kind: 'Event', element: match(text) };
      }),
    };
  };
  const roots: TreeNode[] = [];
  const bySection = new Map<string, TreeNode>();
  for (const name of sections) {
    const section: TreeNode = { name, kind: 'Section', element: match(name), children: [] };
    bySection.set(name, section);
    roots.push(section);
  }
  for (const task of tasks) {
    const section = bySection.get(plain(task.section));
    if (section) {
      section.children?.push(period(task));
    } else {
      roots.push(period(task));
    }
  }
  return single(treeLayer(context, { roots, nodeLabel: 'Period' }));
}

/**
 * One expression of a railroad grammar as a tree node.
 *
 * @param node - The expression
 * @returns The node: a terminal, a rule reference, or a construct holding its parts
 */
function grammarNode(node: Row): TreeNode {
  return { kind: 'Expression', ...grammarPart(node) };
}

/**
 * What one expression is made of, and the sort of expression it is when it
 * is not a construct: a terminal or a reference to a rule.
 *
 * @param node - The expression
 * @returns The node, before it is given its default kind
 */
function grammarPart(node: Row): TreeNode {
  switch (str(node.type)) {
    case 'terminal':
      return { name: `"${plain(node.value)}"`, kind: 'Terminal' };
    case 'nonterminal':
      return { name: `rule ${plain(node.name)}`, kind: 'Reference' };
    case 'special':
      return { name: plain(node.text) };
    case 'sequence':
      return { name: 'sequence', children: rows(node.elements).map(grammarNode) };
    case 'choice':
      return { name: 'one of', children: rows(node.alternatives).map(grammarNode) };
    case 'optional':
      return { name: 'optional', children: [grammarNode(node.element as Row ?? {})] };
    case 'repetition': {
      const min = num(node.min) ?? 0;
      const max = num(node.max);
      const times = max === undefined || !Number.isFinite(max)
        ? `${min} or more times`
        : min === max ? `${min} times` : `${min} to ${max} times`;
      const separator = node.separator
        ? [{ name: 'separated by', kind: 'Expression', children: [grammarNode(node.separator as Row)] }]
        : [];
      return { name: `repeated ${times}`, children: [grammarNode(node.element as Row ?? {}), ...separator] };
    }
    default:
      return { name: plain(node.type) || 'element' };
  }
}

/**
 * Railroad (syntax) diagrams: each grammar rule and the expression it is
 * made of -- sequences, choices, optional and repeated parts.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function railroad(context: DiagramContext): DiagramConversion {
  const rules = rows(call(context.db, 'getRules')).map((rule): TreeNode => {
    const definition = grammarNode((rule.definition as Row) ?? {});
    // A rule that is a sequence reads as its parts directly.
    const children = definition.name === 'sequence' ? definition.children ?? [] : [definition];
    const comment = plain(rule.comment);
    return { name: comment ? `${plain(rule.name)} (${comment})` : plain(rule.name), kind: 'Rule', children };
  });
  return {
    layers: [treeLayer(context, { roots: rules, nodeLabel: 'Rule' })].filter(layer => layer !== null),
    title: plain(call(context.db, 'getTitle')) || undefined,
  };
}

/**
 * The Cynefin framework: its domains and what is placed in each, and -- when
 * the diagram draws them -- the transitions between domains as a second
 * layer.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function cynefin(context: DiagramContext): DiagramConversion {
  const domainLabels = textMatcher(all(context.svg, 'text.cynefinDomainLabel'));
  const itemLabels = textMatcher(all(context.svg, 'text.cynefinItemText'));
  const domainName = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);
  const domains = rows(call(context.db, 'getDomains'));
  const roots: TreeNode[] = domains.map((domain) => {
    const name = domainName(plain(domain.name));
    return {
      name,
      kind: 'Domain',
      element: domainLabels(name),
      children: rows(domain.items).map((item) => {
        const label = plain(item.label);
        return { name: label, kind: 'Item', element: itemLabels(label) };
      }),
    };
  });
  const layers = [treeLayer(context, { roots, nodeLabel: 'Domain', name: 'Domains' })];

  const transitions = rows(call(context.db, 'getTransitions'));
  if (transitions.length > 0) {
    const nodes: GraphNode[] = domains.map(domain => ({
      id: plain(domain.name),
      label: domainName(plain(domain.name)),
    }));
    const edges: GraphEdge[] = transitions.map(one => ({
      from: plain(one.from),
      to: plain(one.to),
      label: plain(one.label),
    }));
    layers.push(directedGraphLayer(context, { nodes, edges, nodeLabel: 'Domain', name: 'Transitions' }));
  }
  return { layers: layers.filter(layer => layer !== null) };
}

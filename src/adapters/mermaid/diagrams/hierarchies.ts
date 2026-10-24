/**
 * The Mermaid diagrams that are hierarchies: mindmaps, kanban boards, tree
 * views, Ishikawa (fishbone) diagrams, timelines, railroad grammars and the
 * Cynefin framework. Each becomes a `tree` layer, read parent to child.
 */

import type { GraphEdge, GraphNode } from '../graph';
import type { Row } from '../read';
import type { TreeNode } from '../tree';
import type { DiagramContext, DiagramConversion } from '../types';
import { DIAGRAM_TYPES } from '../diagramTypes';
import { directedGraphLayer } from '../graph';
import { all, call, drawnText, findById, num, plain, rows, str } from '../read';
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
  return single(root ? treeLayer(context, { roots: [visit(root)], nodeLabel: 'Topic', diagram: DIAGRAM_TYPES.mindmap }) : null);
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
  return single(treeLayer(context, { roots: columns, nodeLabel: 'Item', diagram: DIAGRAM_TYPES.kanban }));
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
  return single(root ? treeLayer(context, { roots: [visit(root)], nodeLabel: 'Entry', diagram: DIAGRAM_TYPES.treeView }) : null);
}

/**
 * Ishikawa (fishbone) diagrams: an effect, its categories of cause, and the
 * causes under each. Each is announced as the one it is; together they are
 * the diagram's items.
 *
 * Each is paired with the group Mermaid draws it as -- the effect's head, a
 * category's box, a cause's branch line, each with its label -- rather than
 * with the label alone, so the highlight outlines the shape and leaves the
 * label as drawn. A group's text is its label, so it is found by it all the
 * same.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function ishikawa(context: DiagramContext): DiagramConversion {
  const root = call(context.db, 'getRoot') as Row | undefined;
  const match = textMatcher(all(context.svg, 'g.ishikawa-head-group, g.ishikawa-label-group, g.ishikawa-sub-group'));
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
  return single(root ? treeLayer(context, { roots: [visit(root, 0)], nodeLabel: 'Item', diagram: DIAGRAM_TYPES.ishikawa }) : null);
}

/**
 * Timelines: periods in order, each with its events, grouped in sections
 * when the timeline has them. Each is announced as the one it is; together
 * they are the timeline's items.
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
  return single(treeLayer(context, { roots, nodeLabel: 'Item', diagram: DIAGRAM_TYPES.timeline }));
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
 * made of -- sequences, choices, optional and repeated parts. Each is
 * announced as the one it is; together they are the grammar's items.
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
    layers: [treeLayer(context, { roots: rules, nodeLabel: 'Item', diagram: DIAGRAM_TYPES.railroad })].filter(layer => layer !== null),
    title: plain(call(context.db, 'getTitle')) || undefined,
  };
}

/**
 * The framework text Mermaid draws under each Cynefin domain's name: its
 * decision model and its practice, and "Disorder" under Confusion.
 *
 * Mermaid keeps that text in its renderer rather than in the database, and
 * draws it only while `showDomainDescriptions` is on, so it is read from the
 * drawing. A line belongs to the label above it in the same column; a
 * drawing laid out some other way leaves the domains with their bare names.
 *
 * @param svg - The drawing
 * @returns Each domain's lines, top to bottom, by the domain's drawn name
 */
function cynefinDescriptions(svg: Element): Map<string, string[]> {
  const labels = all(svg, 'text.cynefinDomainLabel');
  const lines = new Map<string, string[]>();
  for (const line of all(svg, 'text.cynefinSubtitle')) {
    const text = drawnText(line);
    const y = num(line.getAttribute('y'));
    if (text === '' || y === undefined) {
      continue;
    }
    let owner: Element | undefined;
    let ownerY = Number.NEGATIVE_INFINITY;
    for (const label of labels) {
      const labelY = num(label.getAttribute('y'));
      if (label.getAttribute('x') === line.getAttribute('x') && labelY !== undefined && labelY <= y && labelY > ownerY) {
        owner = label;
        ownerY = labelY;
      }
    }
    const name = drawnText(owner);
    if (name !== '') {
      lines.set(name, [...(lines.get(name) ?? []), text]);
    }
  }
  return lines;
}

/**
 * The Cynefin framework: its domains, each with the framework text drawn
 * under it, and what is placed in each, and -- when the diagram draws them
 * -- the transitions between domains as a second layer.
 *
 * Mermaid draws all five domains, Confusion included, whichever the diagram
 * places anything in. A domain it draws that the diagram leaves empty is
 * still a domain a reader can reach, after the ones the diagram declares.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function cynefin(context: DiagramContext): DiagramConversion {
  const domainLabels = textMatcher(all(context.svg, 'text.cynefinDomainLabel'));
  const itemLabels = textMatcher(all(context.svg, 'text.cynefinItemText'));
  const descriptions = cynefinDescriptions(context.svg);
  // Announced with the framework text Mermaid draws under it, the way a
  // railroad rule is with its comment.
  const described = (name: string): string => {
    const lines = descriptions.get(name) ?? [];
    return lines.length > 0 ? `${name} (${lines.join(', ')})` : name;
  };
  const domainName = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);
  const domains = rows(call(context.db, 'getDomains'));
  const declared = new Set<string>();
  const roots: TreeNode[] = domains.map((domain) => {
    const name = domainName(plain(domain.name));
    declared.add(name);
    return {
      name: described(name),
      kind: 'Domain',
      element: domainLabels(name),
      children: rows(domain.items).map((item) => {
        const label = plain(item.label);
        return { name: label, kind: 'Item', element: itemLabels(label) };
      }),
    };
  });
  for (const label of all(context.svg, 'text.cynefinDomainLabel')) {
    const name = drawnText(label);
    if (name !== '' && !declared.has(name)) {
      declared.add(name);
      roots.push({ name: described(name), kind: 'Domain', element: label });
    }
  }
  // Named by neither of its kinds, as a kanban board's layer is; "Item" is
  // already what the things placed in a domain are called.
  const layers = [treeLayer(context, { roots, nodeLabel: 'Node', name: 'Domains', diagram: DIAGRAM_TYPES.cynefin })];

  const transitions = rows(call(context.db, 'getTransitions'));
  if (transitions.length > 0) {
    // Outlined by the same drawn labels the domains layer pairs them with:
    // `roots` begins with the declared domains, in this order.
    const nodes: GraphNode[] = domains.map((domain, at) => ({
      id: plain(domain.name),
      label: domainName(plain(domain.name)),
      element: roots[at].element,
    }));
    const edges: GraphEdge[] = transitions.map(one => ({
      from: plain(one.from),
      to: plain(one.to),
      label: plain(one.label),
    }));
    layers.push(directedGraphLayer(context, { nodes, edges, nodeLabel: 'Domain', name: 'Transitions', diagram: DIAGRAM_TYPES.cynefin }));
  }
  return { layers: layers.filter(layer => layer !== null) };
}

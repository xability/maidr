/**
 * The Mermaid diagrams that are boxes and arrows but keep their own
 * database rather than the unified renderer's: C4, block, architecture, git
 * graph and event modeling diagrams. Each becomes a `directed_graph`.
 */

import type { GraphEdge, GraphGroup, GraphNode } from '../graph';
import type { Row } from '../read';
import type { DiagramContext, DiagramConversion } from '../types';
import { directedGraphLayer } from '../graph';
import { all, call, findById, plain, rows, str } from '../read';

/**
 * A conversion holding the one layer, or none.
 *
 * @param layer - The layer, or null
 * @returns The conversion
 */
function single(layer: ReturnType<typeof directedGraphLayer>): DiagramConversion {
  return { layers: layer ? [layer] : [] };
}

/**
 * Attributes with the empty ones left out.
 *
 * @param entries - Name and value pairs
 * @returns The attributes that have a value
 */
function present(entries: [string, string][]): Record<string, string> {
  return Object.fromEntries(entries.filter(([, value]) => value !== ''));
}

/**
 * C4 diagrams: people, systems, containers and components inside their
 * boundaries, joined by relationships labelled with what they do and the
 * technology they use.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function c4(context: DiagramContext): DiagramConversion {
  const groups: GraphGroup[] = [];
  const visit = (parent: string): void => {
    for (const boundary of rows(call(context.db, 'getBoundaries', parent))) {
      const alias = str(boundary.alias) ?? '';
      if (alias === '' || alias === 'global' || groups.some(one => one.id === alias)) {
        continue;
      }
      const kind = plain(boundary.type).toLowerCase();
      groups.push({
        id: alias,
        label: kind && kind !== 'boundary' ? `${plain(boundary.label)} (${kind})` : plain(boundary.label),
        parent: parent === 'global' ? undefined : parent,
      });
      visit(alias);
    }
  };
  visit('global');

  const candidates = all(context.svg, 'g[id]');
  const used = new Set<Element>();
  const nodes: GraphNode[] = rows(call(context.db, 'getC4ShapeArray')).map((shape) => {
    const id = str(shape.alias) ?? '';
    const parent = str(shape.parentBoundary);
    return {
      id,
      label: plain(shape.label) || id,
      parent: parent && parent !== 'global' ? parent : undefined,
      attributes: present([
        ['Type', plain(shape.typeC4Shape).replace(/_/g, ' ')],
        ['Technology', plain(shape.techn)],
        ['Description', plain(shape.descr)],
      ]),
      element: findById(candidates, context.svgId, [id], used),
    };
  });

  const edges: GraphEdge[] = [];
  for (const rel of rows(call(context.db, 'getRels'))) {
    const from = str(rel.from) ?? '';
    const to = str(rel.to) ?? '';
    const technology = plain(rel.techn);
    const label = technology ? `${plain(rel.label)} [${technology}]` : plain(rel.label);
    edges.push({ from, to, label });
    if (/^birel/i.test(str(rel.type) ?? '')) {
      edges.push({ from: to, to: from, label });
    }
  }
  return single(directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'Element' }));
}

/**
 * Block diagrams: blocks laid out in columns, composite blocks holding
 * others, joined by edges.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function block(context: DiagramContext): DiagramConversion {
  const candidates = all(context.svg, 'g.node[id], g[id].node');
  const used = new Set<Element>();
  const nodes: GraphNode[] = [];
  const groups: GraphGroup[] = [];
  const visit = (blocks: Row[], parent?: string): void => {
    for (const one of blocks) {
      const id = str(one.id) ?? '';
      const type = str(one.type);
      // Spacing is drawing, not a block.
      if (id === '' || type === 'space') {
        continue;
      }
      const children = rows(one.children);
      if (type === 'composite' || children.length > 0) {
        if (id !== 'root') {
          groups.push({ id, label: plain(one.label) || id, parent });
        }
        visit(children, id === 'root' ? undefined : id);
        continue;
      }
      const directions = Array.isArray(one.directions) ? one.directions.map(String).join(' and ') : '';
      const label = plain(one.label).trim();
      nodes.push({
        id,
        // A block arrow is labelled with spaces as often as with words.
        label: label || (type === 'block_arrow' ? 'arrow' : id),
        parent,
        attributes: type === 'block_arrow' ? { Kind: `arrow pointing ${directions}` } : {},
        element: findById(candidates, context.svgId, [id], used),
      });
    }
  };
  const tree = rows(call(context.db, 'getBlocks'));
  visit(tree.length > 0 ? tree : rows(call(context.db, 'getBlocksFlat')).filter(one => str(one.id) === 'root'));
  const edges: GraphEdge[] = rows(call(context.db, 'getEdges')).map(edge => ({
    from: str(edge.start) ?? '',
    to: str(edge.end) ?? '',
    label: plain(edge.label),
  }));
  return single(directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'Block' }));
}

/**
 * Architecture diagrams: services and junctions inside groups, joined by
 * connections. A connection drawn with one arrow runs the way it points;
 * one drawn as a plain line, or with an arrow at each end, joins its ends
 * both ways, as a C4 two-way relationship does. Services, junctions and
 * groups are all called elements, and each node's kind says which it is.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function architecture(context: DiagramContext): DiagramConversion {
  const groups: GraphGroup[] = rows(call(context.db, 'getGroups')).map(group => ({
    id: str(group.id) ?? '',
    label: plain(group.title) || str(group.id),
    parent: str(group.in),
  }));
  const candidates = all(context.svg, 'g[id], rect[id]');
  const used = new Set<Element>();
  const service = (one: Row, kind: string): GraphNode => {
    const id = str(one.id) ?? '';
    return {
      id,
      label: plain(one.title) || (kind === 'junction' ? `junction ${id}` : id),
      parent: str(one.in),
      attributes: present([['Kind', kind], ['Icon', plain(one.icon)]]),
      element: findById(candidates, context.svgId, [`service-${id}`, `node-${id}`, `junction-${id}`, id], used),
    };
  };
  const nodes = [
    ...rows(call(context.db, 'getServices')).map(one => service(one, 'service')),
    ...rows(call(context.db, 'getJunctions')).map(one => service(one, 'junction')),
  ];
  const edges: GraphEdge[] = rows(call(context.db, 'getEdges')).flatMap((edge) => {
    const lhs = str(edge.lhsId) ?? '';
    const rhs = str(edge.rhsId) ?? '';
    const label = plain(edge.title);
    const intoLhs = edge.lhsInto === true;
    if (intoLhs === (edge.rhsInto === true)) {
      // No arrow, or one at each end: neither side leads to the other.
      return [{ from: lhs, to: rhs, label }, { from: rhs, to: lhs, label }];
    }
    return [intoLhs ? { from: rhs, to: lhs, label } : { from: lhs, to: rhs, label }];
  });
  return single(directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'Element' }));
}

/** Mermaid's commit types, in its own numbering. */
const COMMIT_TYPES = ['normal', 'reverse', 'highlight', 'merge', 'cherry-pick'];

/**
 * Git graphs: commits on their branches, each commit fed by its parents --
 * so a merge has two inputs and a branch point two outputs.
 *
 * A commit Mermaid named itself is announced by its message or its place in
 * the history rather than by the generated hash, which changes every time the
 * diagram is drawn.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function gitGraph(context: DiagramContext): DiagramConversion {
  const commits = rows(call(context.db, 'getCommitsArray'));
  // A commit is drawn as one shape or several -- a highlight is two
  // rectangles, a cherry-pick three circles and two lines -- each carrying
  // the commit's id among its classes. Runs of shapes sharing those classes
  // are one commit each, in the order the commits were made.
  const style = /^commit(?:\d+|-.+)?$/;
  const runs: Element[] = [];
  let previous = '';
  for (const mark of all(context.svg, '.commit-bullets > .commit')) {
    const key = [...mark.classList].filter(name => !style.test(name)).join(' ');
    if (runs.length === 0 || key !== previous) {
      runs.push(mark);
    }
    previous = key;
  }
  const generated = /^\d+-[0-9a-f]{7}$/;
  const nodes: GraphNode[] = commits.map((commit, at) => {
    const id = str(commit.id) ?? String(at);
    const seq = str(commit.seq) ?? String(at);
    const message = plain(commit.message);
    const label = generated.test(id) || commit.customId === false
      ? (message || `commit ${Number(seq) + 1}`)
      : id;
    const type = COMMIT_TYPES[Number(commit.type)] ?? '';
    const tags = Array.isArray(commit.tags) ? commit.tags.map(plain).filter(Boolean) : [];
    const element = runs.length === commits.length ? runs[at] : null;
    return {
      id,
      label,
      parent: plain(commit.branch) || undefined,
      attributes: present([
        ['Type', type === 'normal' ? '' : type],
        ['Tags', tags.join(', ')],
        ['Message', label === message ? '' : message],
      ]),
      element,
    };
  });
  const groups: GraphGroup[] = [...new Set(nodes.map(node => node.parent).filter((one): one is string => !!one))]
    .map(name => ({ id: name, label: name }));
  const edges: GraphEdge[] = commits.flatMap((commit, at) =>
    (Array.isArray(commit.parents) ? commit.parents : []).map(parent => ({
      from: String(parent),
      to: nodes[at].id,
    })));
  return single(directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'Commit' }));
}

/** What an event model's entity types are called. */
const EVENT_MODEL_TYPES: Record<string, string> = {
  ui: 'UI',
  cmd: 'command',
  command: 'command',
  evt: 'event',
  event: 'event',
  rmo: 'read model',
  readmodel: 'read model',
  pcr: 'processor',
  processor: 'processor',
};

/**
 * Event modeling diagrams: time frames in their swimlanes -- UI, commands and
 * read models, events -- joined by the flow from one frame to the next.
 *
 * A box is announced as the frame's entity, `Entity is CartUI`, and the
 * frame it is in as `Frame is 01`.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function eventModeling(context: DiagramContext): DiagramConversion {
  const state = call(context.db, 'getState') as Row | undefined;
  const boxes = rows(state?.boxes);
  const drawn = all(context.svg, 'g.em-box');
  const nodes: GraphNode[] = boxes.map((box, at) => {
    const frame = (box.frame as Row | undefined) ?? {};
    const lane = plain((box.swimlane as Row | undefined)?.label);
    const type = str(frame.modelEntityType) ?? '';
    return {
      id: String(box.index ?? at),
      label: plain(box.text) || plain(frame.entityIdentifier),
      parent: lane || undefined,
      attributes: present([
        ['Frame', plain(frame.name)],
        ['Type', EVENT_MODEL_TYPES[type] ?? type],
      ]),
      element: drawn.length === boxes.length ? drawn[at] : null,
    };
  });
  const groups: GraphGroup[] = [...new Set(nodes.map(node => node.parent).filter((one): one is string => !!one))]
    .map(name => ({ id: name, label: name }));
  const edges: GraphEdge[] = rows(state?.relations).map(relation => ({
    from: String((relation.sourceBox as Row | undefined)?.index ?? ''),
    to: String((relation.targetBox as Row | undefined)?.index ?? ''),
  }));
  return single(directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'Entity' }));
}

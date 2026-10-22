/**
 * The diagrams Mermaid lays out with its unified renderer: flowcharts,
 * swimlanes, agent flows, state, class, entity-relationship, requirement and
 * use case diagrams.
 *
 * Their databases share `getData()`, which hands back the same nodes, groups
 * and edges the renderer drew. That is read here once, and each diagram adds
 * what its boxes and arrows mean -- a class's members, an entity's
 * attributes, a relationship's cardinality.
 */

import type { GraphEdge, GraphGroup, GraphNode } from '../graph';
import type { Row } from '../read';
import type { DiagramContext, DiagramConversion } from '../types';
import { directedGraphLayer } from '../graph';
import { all, call, findById, plain, rows, str } from '../read';

/** Shapes every box of a diagram has, which are not worth announcing. */
const PLAIN_SHAPES = new Set([
  'rect',
  'squareRect',
  'roundedRect',
  'classBox',
  'erBox',
  'requirementBox',
  'kanbanItem',
  'usecaseEllipse',
  'usecaseActor',
  'note',
  'stateStart',
  'stateEnd',
]);

/** Shapes whose name is a word a reader knows, rather than a drawing term. */
const SHAPE_NAMES: Record<string, string> = {
  'diamond': 'decision',
  'question': 'decision',
  'diam': 'decision',
  'cylinder': 'database',
  'cyl': 'database',
  'lined-cylinder': 'disk',
  'stadium': 'terminal',
  'circle': 'circle',
  'doublecircle': 'stop',
  'circ': 'circle',
  'subroutine': 'subprocess',
  'hexagon': 'preparation',
  'lean-right': 'input or output',
  'lean-left': 'output or input',
  'trapezoid': 'manual operation',
  'inv-trapezoid': 'manual operation',
  'choice': 'choice',
  'fork': 'fork',
  'join': 'join',
  'forkJoin': 'fork or join',
  'divider': 'divider',
};

/**
 * A shape's name as announced, or undefined for an ordinary box.
 *
 * @param shape - The shape Mermaid drew
 * @returns The word for it
 */
function shapeName(shape: string | undefined): string | undefined {
  if (shape === undefined || PLAIN_SHAPES.has(shape)) {
    return undefined;
  }
  return SHAPE_NAMES[shape] ?? shape.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
}

/** What the arrowhead names on a class or ER edge mean. */
const ARROW_WORDS: Record<string, string> = {
  extension: 'inherits from',
  composition: 'composed of',
  aggregation: 'aggregates',
  dependency: 'depends on',
  lollipop: 'provides interface',
  only_one: 'exactly one',
  zero_or_one: 'zero or one',
  zero_or_more: 'zero or more',
  one_or_more: 'one or more',
  md_parent: 'parent',
};

/** The arrowheads that only end a line, saying nothing about it. */
const PLAIN_ARROWS = new Set(['none', '', 'arrow_point', 'arrow_open', 'arrow_barb', 'arrow_circle', 'arrow_cross', 'normal', 'requirement_arrow', 'requirement_contains']);

/** The heads drawn at the whole of a class relation, the end it runs from. */
const DIAMONDS = new Set(['composition', 'aggregation']);

/** A node of `getData()`. */
interface DataNode {
  row: Row;
  id: string;
}

/**
 * Pairs the nodes no id found with the node elements no node claimed, in
 * order, when the two counts agree.
 *
 * Some ids are drawn at random -- a state diagram's concurrent regions get a
 * fresh one on every parse -- so the parse the adapter reads names them
 * differently from the parse that drew them. What is left over on both sides
 * is the same nodes in the same order.
 *
 * @param nodes - Every node, some with an element
 * @param leftovers - The node elements not yet paired, in document order
 */
function pairLeftovers(nodes: GraphNode[], leftovers: Element[]): void {
  const missing = nodes.filter(node => !node.element);
  if (missing.length > 0 && missing.length === leftovers.length) {
    missing.forEach((node, at) => {
      node.element = leftovers[at];
    });
  }
}

/**
 * Reads `getData()` into nodes, groups and edges.
 *
 * Notes are folded into the node they are attached to, as a `Note`
 * attribute, rather than read as boxes of their own: a note annotates a
 * state or a class, and as a node it would sit in the reading order as
 * though it were a step.
 *
 * @param context - The diagram
 * @returns The parts, before any diagram adds its own details
 */
function readData(context: DiagramContext): {
  nodes: GraphNode[];
  groups: GraphGroup[];
  edges: (GraphEdge & { row: Row })[];
  byId: Map<string, GraphNode>;
  raw: Map<string, Row>;
} {
  const data = call(context.db, 'getData') as Row | undefined;
  const dataNodes: DataNode[] = rows(data?.nodes)
    .map(row => ({ row, id: str(row.id) ?? '' }))
    .filter(node => node.id !== '');
  // Any group with an id: a node drawn as an icon or image is not a `.node`.
  const candidates = all(context.svg, 'g[id]');
  const used = new Set<Element>();

  const groups: GraphGroup[] = [];
  const regions = new Map<string, number>();
  const nodes: GraphNode[] = [];
  const raw = new Map<string, Row>();
  const notes = new Map<string, string>();
  for (const { row, id } of dataNodes) {
    raw.set(id, row);
    if (row.isGroup === true) {
      const parent = str(row.parentId);
      let label = plain(row.label);
      if (str(row.shape) === 'divider' && label === '') {
        // A concurrent region of a state has no name of its own.
        const count = (regions.get(parent ?? '') ?? 0) + 1;
        regions.set(parent ?? '', count);
        label = `region ${count}`;
      }
      groups.push({ id, label: label || id, parent });
      continue;
    }
    if (str(row.shape) === 'note' || /^note\d*$/i.test(id)) {
      notes.set(id, plain(row.label));
      continue;
    }
    const shape = shapeName(str(row.shape));
    nodes.push({
      id,
      label: plain(row.label),
      parent: str(row.parentId),
      attributes: shape ? { Shape: shape } : {},
      element: findById(candidates, context.svgId, [str(row.domId), id], used),
    });
  }
  pairLeftovers(nodes, candidates.filter(element => !used.has(element) && element.classList.contains('node')));
  const byId = new Map(nodes.map(node => [node.id, node]));

  const edges: (GraphEdge & { row: Row })[] = [];
  for (const row of rows(data?.edges)) {
    const from = str(row.start) ?? '';
    const to = str(row.end) ?? '';
    const noteEnd = notes.has(from) ? from : notes.has(to) ? to : undefined;
    if (noteEnd !== undefined) {
      const target = byId.get(noteEnd === from ? to : from);
      const text = notes.get(noteEnd);
      if (target && text) {
        target.attributes = { ...target.attributes, Note: text };
        notes.delete(noteEnd);
      }
      continue;
    }
    edges.push({ from, to, label: plain(row.label), row });
  }
  // A note attached to nothing is still something the diagram says.
  for (const [id, text] of notes) {
    if (text) {
      nodes.push({ id, label: text, attributes: { Kind: 'note' }, element: findById(candidates, context.svgId, [id], used) });
    }
  }
  return { nodes, groups, edges, byId: new Map(nodes.map(node => [node.id, node])), raw };
}

/**
 * The words for what an arrowhead says, when it says something.
 *
 * @param arrow - The arrowhead's name
 * @returns The words, or undefined for a plain head
 */
function arrowWords(arrow: unknown): string | undefined {
  const name = str(arrow);
  if (name === undefined || PLAIN_ARROWS.has(name)) {
    return undefined;
  }
  return ARROW_WORDS[name] ?? name.replace(/_/g, ' ');
}

/**
 * The words for what a class relation's head says, read with the line it
 * ends: a dashed inheritance is a realization, and an open arrow on a solid
 * line an association rather than a dependency -- Mermaid names the head of
 * `-->` and of `..>` alike.
 *
 * @param arrow - The arrowhead's name
 * @param dashed - Whether the line is dashed
 * @returns The words, or undefined for a plain head
 */
function relationWords(arrow: unknown, dashed: boolean): string | undefined {
  const words = arrowWords(arrow);
  if (words === ARROW_WORDS.extension && dashed) {
    return 'realizes';
  }
  if (words === ARROW_WORDS.dependency && !dashed) {
    return 'associated with';
  }
  return words;
}

/**
 * Joins the parts of an edge label that are present.
 *
 * @param parts - The parts
 * @returns The label, or undefined when none is present
 */
function joinLabel(...parts: (string | undefined)[]): string | undefined {
  const present = parts.map(part => part?.trim()).filter((part): part is string => !!part);
  return present.length > 0 ? present.join(', ') : undefined;
}

/**
 * A layer for a diagram read through `getData()` with no details of its own.
 *
 * @param context - The diagram
 * @param nodeLabel - What a node is called on it
 * @returns The conversion
 */
function plainGraph(context: DiagramContext, nodeLabel: string): DiagramConversion {
  const { nodes, groups, edges } = readData(context);
  const layer = directedGraphLayer(context, { nodes, groups, edges, nodeLabel });
  return { layers: layer ? [layer] : [] };
}

/**
 * Flowcharts, swimlanes and agent flows: steps joined by labelled arrows,
 * nested in subgraphs, lanes or flows.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function flowchart(context: DiagramContext): DiagramConversion {
  return plainGraph(context, 'Step');
}

/**
 * State diagrams: states joined by transitions labelled with their events,
 * composite states as groups, and the start and end pseudo-states named.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function state(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges, raw } = readData(context);
  for (const node of nodes) {
    const shape = str(raw.get(node.id)?.shape);
    if (shape === 'stateStart') {
      node.label = 'start';
    } else if (shape === 'stateEnd') {
      node.label = 'end';
    }
    if (!node.label) {
      node.label = node.id;
    }
  }
  const layer = directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'State' });
  return { layers: layer ? [layer] : [] };
}

/** The words for a member's visibility marker. */
const VISIBILITY: Record<string, string> = {
  '+': 'public',
  '-': 'private',
  '#': 'protected',
  '~': 'package',
};

/**
 * A class member as announced: `public int age`.
 *
 * @param member - The member, as `getClasses()` stores it
 * @returns The text
 */
function memberText(member: Row): string {
  const visibility = VISIBILITY[str(member.visibility) ?? ''];
  let text = plain(member.text);
  if (visibility && /^[+\-#~]/.test(text)) {
    text = `${visibility} ${text.slice(1).trim()}`;
  }
  const classifier = str(member.classifier);
  if (classifier === '$') {
    text = `${text}, static`;
  } else if (classifier === '*') {
    text = `${text}, abstract`;
  }
  return text;
}

/**
 * Class diagrams: classes with their attributes and methods, joined by
 * relations named for what they are -- inheritance, composition,
 * aggregation, association -- with their cardinalities, nested in
 * namespaces.
 *
 * Each head of a relation says which way it runs. An arrow or a lollipop
 * marks the end it runs to: a class edge drawn `Animal <|-- Duck` has its
 * head at `Animal`, so Duck is the one that inherits and the edge runs from
 * Duck to Animal. A diamond marks the whole, the end it runs from:
 * `Car *-- Wheel` and `Wheel --* Car` are both Car composed of Wheel. A
 * relation whose heads run opposite ways runs both ways, each in the words
 * of its own head, and one with no head runs as it was written. The
 * cardinalities are read in the order the edge runs.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function classDiagram(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges, byId } = readData(context);
  for (const one of rows(call(context.db, 'getClasses'))) {
    const node = byId.get(str(one.id) ?? '');
    if (node === undefined) {
      continue;
    }
    const annotations = (Array.isArray(one.annotations) ? one.annotations : []).map(plain).filter(Boolean);
    const attributes = rows(one.members).map(memberText).filter(Boolean);
    const methods = rows(one.methods).map(memberText).filter(Boolean);
    node.attributes = {
      ...node.attributes,
      ...(annotations.length > 0 ? { Annotation: annotations.join(', ') } : {}),
      ...(attributes.length > 0 ? { Attributes: attributes.join('; ') } : {}),
      ...(methods.length > 0 ? { Methods: methods.join('; ') } : {}),
    };
    const generic = plain(one.type);
    if (generic) {
      node.label = `${node.label ?? node.id}<${generic}>`;
    }
  }
  const relations = rows(call(context.db, 'getRelations'));
  const taken = new Set<Row>();
  const labelled = edges.flatMap((edge) => {
    // Paired by their ends, the first not yet taken, since two classes can
    // be related twice.
    const relation = relations.find(one => !taken.has(one)
      && str(one.id1) === edge.from && str(one.id2) === edge.to);
    if (relation) {
      taken.add(relation);
    }
    // relationTitle1 sits at the start, relationTitle2 at the end.
    const titles = relation === undefined
      ? []
      : [relation.relationTitle1, relation.relationTitle2].map(title => (str(title) !== 'none' ? plain(title) : undefined));
    const dashed = str(edge.row.pattern) === 'dashed' || str(edge.row.pattern) === 'dotted';
    const heads = [
      { arrow: edge.row.arrowTypeStart, at: edge.from, other: edge.to },
      { arrow: edge.row.arrowTypeEnd, at: edge.to, other: edge.from },
    ].flatMap(({ arrow, at, other }) => {
      const words = relationWords(arrow, dashed);
      if (words === undefined) {
        return [];
      }
      return [DIAMONDS.has(str(arrow) ?? '') ? { from: at, to: other, words } : { from: other, to: at, words }];
    });
    const label = (from: string, words?: string): string | undefined => {
      const cardinality = joinLabel(...(from === edge.from ? titles : [...titles].reverse()));
      return joinLabel(edge.label, words, cardinality ? `cardinality ${cardinality}` : undefined);
    };
    if (heads.length === 0) {
      return [{ ...edge, label: label(edge.from) }];
    }
    // Two heads that run the same way -- `Car *--> Wheel` -- are one edge.
    const runs = heads.length === 2 && heads[0].from === heads[1].from
      ? [{ ...heads[0], words: joinLabel(heads[0].words, heads[1].words) }]
      : heads;
    return runs.map(head => ({ ...edge, from: head.from, to: head.to, label: label(head.from, head.words) }));
  });
  const layer = directedGraphLayer(context, { nodes, groups, edges: labelled, nodeLabel: 'Class' });
  return { layers: layer ? [layer] : [] };
}

/**
 * Entity-relationship diagrams: entities with their attributes and keys,
 * joined by relationships labelled with their verb and both cardinalities.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function entityRelationship(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges, byId } = readData(context);
  for (const entity of rows(call(context.db, 'getEntities'))) {
    const node = byId.get(str(entity.id) ?? '');
    if (node === undefined) {
      continue;
    }
    const alias = plain(entity.alias);
    if (alias) {
      node.label = alias;
    }
    const attributes = rows(entity.attributes).map((attribute) => {
      const keys = Array.isArray(attribute.keys) ? attribute.keys.map(String).join(' ') : '';
      return [plain(attribute.type), plain(attribute.name), keys, plain(attribute.comment)]
        .filter(Boolean)
        .join(' ');
    }).filter(Boolean);
    if (attributes.length > 0) {
      node.attributes = { ...node.attributes, Attributes: attributes.join('; ') };
    }
  }
  const labelled = edges.map((edge) => {
    const from = arrowWords(edge.row.arrowTypeStart);
    const to = arrowWords(edge.row.arrowTypeEnd);
    const cardinality = from && to ? `${from} to ${to}` : from ?? to;
    const optional = str(edge.row.pattern) === 'dashed' ? 'non-identifying' : undefined;
    return { ...edge, label: joinLabel(edge.label, cardinality, optional) };
  });
  const layer = directedGraphLayer(context, { nodes, groups, edges: labelled, nodeLabel: 'Entity' });
  return { layers: layer ? [layer] : [] };
}

/**
 * Requirement diagrams: requirements with their id, text, risk and
 * verification method, elements with their type and document, joined by
 * relationships named for what they assert.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function requirement(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges, raw } = readData(context);
  for (const node of nodes) {
    const row = raw.get(node.id);
    if (row === undefined) {
      continue;
    }
    node.label = plain(row.name) || node.label;
    const fields: [string, unknown][] = [
      ['Type', row.type],
      ['ID', row.requirementId],
      ['Text', row.text],
      ['Risk', row.risk],
      ['Verification', row.verifyMethod],
      ['Document', row.docRef],
    ];
    node.attributes = {
      ...node.attributes,
      ...Object.fromEntries(fields.map(([key, value]) => [key, plain(value)]).filter(([, value]) => value !== '')),
    };
  }
  const labelled = edges.map(edge => ({ ...edge, label: edge.label?.replace(/^<<(.*)>>$/, '$1') }));
  const layer = directedGraphLayer(context, { nodes, groups, edges: labelled, nodeLabel: 'Requirement' });
  return { layers: layer ? [layer] : [] };
}

/**
 * Use case diagrams: actors and use cases inside system boundaries, joined by
 * associations, includes and extends.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function usecase(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges, raw } = readData(context);
  for (const node of nodes) {
    const shape = str(raw.get(node.id)?.shape);
    const kind = shape === 'usecaseActor' ? 'actor' : shape === 'usecaseEllipse' ? 'use case' : undefined;
    if (kind) {
      node.attributes = { Kind: kind, ...node.attributes };
    }
  }
  const layer = directedGraphLayer(context, { nodes, groups, edges, nodeLabel: 'Element' });
  return { layers: layer ? [layer] : [] };
}

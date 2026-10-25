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
import type { Say, WordKey } from '../words';
import { DiagramType } from '@type/grammar';
import { directedGraphLayer } from '../graph';
import { all, call, findById, plain, rows, str } from '../read';
import { sayKnown } from '../words';

/** Shapes every box of a diagram has, which are not worth announcing. */
const PLAIN_SHAPES = new Set([
  'rect',
  'squareRect',
  'proc',
  'process',
  'rectangle',
  'rounded',
  'roundedRect',
  'event',
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

/**
 * Shapes by what they stand for, under every name Mermaid accepts for them:
 * its short name, its aliases and the name of the shape that draws it, which
 * is what a flowchart written with the classic brackets records.
 */
const SHAPE_WORDS: Record<string, WordKey> = {
  'diamond': 'shape.decision',
  'question': 'shape.decision',
  'diam': 'shape.decision',
  'decision': 'shape.decision',
  'cylinder': 'shape.database',
  'cyl': 'shape.database',
  'db': 'shape.database',
  'database': 'shape.database',
  'lined-cylinder': 'shape.disk',
  'lin-cyl': 'shape.disk',
  'disk': 'shape.disk',
  'linedCylinder': 'shape.disk',
  'stadium': 'shape.terminal',
  'terminal': 'shape.terminal',
  'pill': 'shape.terminal',
  'circle': 'shape.circle',
  'circ': 'shape.circle',
  'ellipse': 'shape.ellipse',
  'sm-circ': 'shape.start',
  'start': 'shape.start',
  'small-circle': 'shape.start',
  'doublecircle': 'shape.stop',
  'dbl-circ': 'shape.stop',
  'double-circle': 'shape.stop',
  'fr-circ': 'shape.stop',
  'stop': 'shape.stop',
  'framed-circle': 'shape.stop',
  'subroutine': 'shape.subprocess',
  'fr-rect': 'shape.subprocess',
  'subprocess': 'shape.subprocess',
  'subproc': 'shape.subprocess',
  'framed-rectangle': 'shape.subprocess',
  'hexagon': 'shape.preparation',
  'hex': 'shape.preparation',
  'prepare': 'shape.preparation',
  'lean-right': 'shape.inputOrOutput',
  'lean_right': 'shape.inputOrOutput',
  'lean-r': 'shape.inputOrOutput',
  'in-out': 'shape.inputOrOutput',
  'lean-left': 'shape.outputOrInput',
  'lean_left': 'shape.outputOrInput',
  'lean-l': 'shape.outputOrInput',
  'out-in': 'shape.outputOrInput',
  'trapezoid': 'shape.priorityAction',
  'trap-b': 'shape.priorityAction',
  'priority': 'shape.priorityAction',
  'trapezoid-bottom': 'shape.priorityAction',
  'inv-trapezoid': 'shape.manualOperation',
  'inv_trapezoid': 'shape.manualOperation',
  'trap-t': 'shape.manualOperation',
  'manual': 'shape.manualOperation',
  'trapezoid-top': 'shape.manualOperation',
  'odd': 'shape.asymmetric',
  'rect_left_inv_arrow': 'shape.asymmetric',
  'datastore': 'shape.dataStore',
  'data-store': 'shape.dataStore',
  'folder': 'shape.folder',
  'directory': 'shape.folder',
  'bucket': 'shape.bucket',
  'console': 'shape.console',
  'consoleWindow': 'shape.console',
  'browser': 'shape.browser',
  'person': 'shape.person',
  'bang': 'shape.bang',
  'cloud': 'shape.cloud',
  'text': 'shape.textBlock',
  'notch-rect': 'shape.card',
  'card': 'shape.card',
  'notched-rectangle': 'shape.card',
  'lin-rect': 'shape.linedProcess',
  'lined-rectangle': 'shape.linedProcess',
  'lined-process': 'shape.linedProcess',
  'lin-proc': 'shape.linedProcess',
  'shaded-process': 'shape.linedProcess',
  'shadedProcess': 'shape.linedProcess',
  'hourglass': 'shape.collate',
  'collate': 'shape.collate',
  'brace': 'shape.comment',
  'brace-l': 'shape.comment',
  'brace-r': 'shape.comment',
  'braces': 'shape.comment',
  'comment': 'shape.comment',
  'curlyBraceLeft': 'shape.comment',
  'curlyBraceRight': 'shape.comment',
  'curlyBraces': 'shape.comment',
  'bolt': 'shape.communicationLink',
  'com-link': 'shape.communicationLink',
  'lightning-bolt': 'shape.communicationLink',
  'lightningBolt': 'shape.communicationLink',
  'doc': 'shape.document',
  'document': 'shape.document',
  'waveEdgedRectangle': 'shape.document',
  'delay': 'shape.delay',
  'half-rounded-rectangle': 'shape.delay',
  'halfRoundedRectangle': 'shape.delay',
  'h-cyl': 'shape.directAccessStorage',
  'das': 'shape.directAccessStorage',
  'horizontal-cylinder': 'shape.directAccessStorage',
  'tiltedCylinder': 'shape.directAccessStorage',
  'curv-trap': 'shape.display',
  'curved-trapezoid': 'shape.display',
  'display': 'shape.display',
  'curvedTrapezoid': 'shape.display',
  'div-rect': 'shape.dividedProcess',
  'div-proc': 'shape.dividedProcess',
  'divided-rectangle': 'shape.dividedProcess',
  'divided-process': 'shape.dividedProcess',
  'dividedRectangle': 'shape.dividedProcess',
  'tri': 'shape.extract',
  'extract': 'shape.extract',
  'triangle': 'shape.extract',
  'win-pane': 'shape.internalStorage',
  'internal-storage': 'shape.internalStorage',
  'window-pane': 'shape.internalStorage',
  'windowPane': 'shape.internalStorage',
  'f-circ': 'shape.junction',
  'junction': 'shape.junction',
  'filled-circle': 'shape.junction',
  'filledCircle': 'shape.junction',
  'notch-pent': 'shape.loopLimit',
  'loop-limit': 'shape.loopLimit',
  'notched-pentagon': 'shape.loopLimit',
  'trapezoidalPentagon': 'shape.loopLimit',
  'flip-tri': 'shape.manualFile',
  'manual-file': 'shape.manualFile',
  'flipped-triangle': 'shape.manualFile',
  'flippedTriangle': 'shape.manualFile',
  'sl-rect': 'shape.manualInput',
  'manual-input': 'shape.manualInput',
  'sloped-rectangle': 'shape.manualInput',
  'slopedRect': 'shape.manualInput',
  'docs': 'shape.documents',
  'documents': 'shape.documents',
  'st-doc': 'shape.documents',
  'stacked-document': 'shape.documents',
  'multiWaveEdgedRectangle': 'shape.documents',
  'st-rect': 'shape.processes',
  'procs': 'shape.processes',
  'processes': 'shape.processes',
  'stacked-rectangle': 'shape.processes',
  'multiRect': 'shape.processes',
  'bow-rect': 'shape.storedData',
  'stored-data': 'shape.storedData',
  'bow-tie-rectangle': 'shape.storedData',
  'bowTieRect': 'shape.storedData',
  'cross-circ': 'shape.summary',
  'summary': 'shape.summary',
  'crossed-circle': 'shape.summary',
  'crossedCircle': 'shape.summary',
  'tag-doc': 'shape.taggedDocument',
  'tagged-document': 'shape.taggedDocument',
  'taggedWaveEdgedRectangle': 'shape.taggedDocument',
  'tag-rect': 'shape.taggedProcess',
  'tagged-rectangle': 'shape.taggedProcess',
  'tag-proc': 'shape.taggedProcess',
  'tagged-process': 'shape.taggedProcess',
  'taggedRect': 'shape.taggedProcess',
  'flag': 'shape.paperTape',
  'paper-tape': 'shape.paperTape',
  'waveRectangle': 'shape.paperTape',
  'lin-doc': 'shape.linedDocument',
  'lined-document': 'shape.linedDocument',
  'linedWaveEdgedRect': 'shape.linedDocument',
  'icon': 'shape.icon',
  'iconCircle': 'shape.icon',
  'iconSquare': 'shape.icon',
  'iconRounded': 'shape.icon',
  'imageSquare': 'shape.image',
  'choice': 'shape.choice',
  'fork': 'shape.fork',
  'join': 'shape.join',
  'forkJoin': 'shape.forkOrJoin',
  'divider': 'shape.divider',
};

/**
 * A shape's name as announced, or undefined for an ordinary box. A shape
 * Mermaid has added since is announced by its name, its words spaced out.
 *
 * @param shape - The shape Mermaid drew
 * @param say - Writes the adapter's words
 * @returns The word for it
 */
function shapeName(shape: string | undefined, say: Say): string | undefined {
  if (shape === undefined || PLAIN_SHAPES.has(shape)) {
    return undefined;
  }
  const word = Object.hasOwn(SHAPE_WORDS, shape) ? SHAPE_WORDS[shape] : undefined;
  return word === undefined
    ? shape.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase()
    : say(word);
}

/** What the arrowhead names on a class or ER edge mean. */
const ARROW_WORDS: Record<string, WordKey> = {
  extension: 'relation.inheritsFrom',
  composition: 'relation.composedOf',
  aggregation: 'relation.aggregates',
  dependency: 'relation.dependsOn',
  lollipop: 'relation.providesInterface',
  only_one: 'cardinality.exactlyOne',
  zero_or_one: 'cardinality.zeroOrOne',
  zero_or_more: 'cardinality.zeroOrMore',
  one_or_more: 'cardinality.oneOrMore',
  md_parent: 'cardinality.parent',
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
        label = context.say('state.region', { index: count });
      }
      groups.push({ id, label: label || id, parent });
      continue;
    }
    if (str(row.shape) === 'note' || /^note\d*$/i.test(id)) {
      notes.set(id, plain(row.label));
      continue;
    }
    const shape = shapeName(str(row.shape), context.say);
    nodes.push({
      id,
      label: plain(row.label),
      parent: str(row.parentId),
      attributes: shape ? { [context.say('attribute.shape')]: shape } : {},
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
        target.attributes = { ...target.attributes, [context.say('attribute.note')]: text };
        notes.delete(noteEnd);
      }
      continue;
    }
    edges.push({ from, to, label: plain(row.label), row });
  }
  // A note attached to nothing is still something the diagram says.
  for (const [id, text] of notes) {
    if (text) {
      nodes.push({
        id,
        label: text,
        attributes: { [context.say('attribute.kind')]: context.say('kind.note') },
        element: findById(candidates, context.svgId, [id], used),
      });
    }
  }
  return { nodes, groups, edges, byId: new Map(nodes.map(node => [node.id, node])), raw };
}

/**
 * The words for what an arrowhead says, when it says something. A head
 * Mermaid has added since is announced by its name, its words spaced out.
 *
 * @param arrow - The arrowhead's name
 * @param say - Writes the adapter's words
 * @returns The words, or undefined for a plain head
 */
function arrowWords(arrow: unknown, say: Say): string | undefined {
  const name = str(arrow);
  if (name === undefined || PLAIN_ARROWS.has(name)) {
    return undefined;
  }
  const word = Object.hasOwn(ARROW_WORDS, name) ? ARROW_WORDS[name] : undefined;
  return word === undefined ? name.replace(/_/g, ' ') : say(word);
}

/**
 * The words for what a class relation's head says, read with the line it
 * ends: a dashed inheritance is a realization, and an open arrow on a solid
 * line an association rather than a dependency -- Mermaid names the head of
 * `-->` and of `..>` alike.
 *
 * @param arrow - The arrowhead's name
 * @param dashed - Whether the line is dashed
 * @param say - Writes the adapter's words
 * @returns The words, or undefined for a plain head
 */
function relationWords(arrow: unknown, dashed: boolean, say: Say): string | undefined {
  const name = str(arrow);
  if (name === 'extension' && dashed) {
    return say('relation.realizes');
  }
  if (name === 'dependency' && !dashed) {
    return say('relation.associatedWith');
  }
  return arrowWords(arrow, say);
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
 * @param diagram - What the diagram is called and what it is
 * @returns The conversion
 */
function plainGraph(context: DiagramContext, nodeLabel: WordKey, diagram: DiagramType): DiagramConversion {
  const { nodes, groups, edges } = readData(context);
  const layer = directedGraphLayer(context, { nodes, groups, edges, nodeLabel: context.say(nodeLabel), diagram });
  return { layers: layer ? [layer] : [] };
}

/**
 * Flowcharts: steps joined by labelled arrows, nested in subgraphs.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function flowchart(context: DiagramContext): DiagramConversion {
  return plainGraph(context, 'node.step', DiagramType.FLOWCHART);
}

/**
 * Swimlane diagrams: a flowchart's steps, each in the lane of whoever carries
 * it out.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function swimlane(context: DiagramContext): DiagramConversion {
  return plainGraph(context, 'node.step', DiagramType.SWIMLANE);
}

/** What an agent flow's kinds are called. */
const AGENT_FLOW_KINDS: Record<string, WordKey> = {
  task: 'kind.task',
  tool: 'kind.tool',
  input: 'kind.input',
  decision: 'kind.decision',
  action: 'kind.action',
  refdoc: 'kind.referenceDocument',
  connector: 'kind.connector',
};

/**
 * Agent flows: an agent's steps inside its flows, each by the kind its author
 * gave it -- task, tool, input, decision, action, reference document or
 * connector -- rather than its shape. Mermaid draws each kind as a flowchart
 * shape, a tool as a subroutine and an action as a hexagon, and those shapes'
 * flowchart names, subprocess and preparation, are not what the author wrote.
 * The kinds come from `getSemanticModel()`; without it, the shapes are read
 * as a flowchart's.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function agentflow(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges } = readData(context);
  const model = call(context.db, 'getSemanticModel') as Row | undefined;
  const kinds = new Map<string, string>();
  for (const vertex of rows(model?.vertices)) {
    const id = str(vertex.id);
    const kind = str(vertex.vertexKind);
    if (id !== undefined && kind) {
      kinds.set(id, kind);
    }
  }
  for (const connector of rows(model?.connectors)) {
    const id = str(connector.id);
    if (id !== undefined) {
      kinds.set(id, 'connector');
    }
  }
  const shapeKey = context.say('attribute.shape');
  for (const node of nodes) {
    const kind = kinds.get(node.id);
    if (kind) {
      const { [shapeKey]: _shape, ...rest } = node.attributes ?? {};
      node.attributes = { [context.say('attribute.kind')]: sayKnown(kind, AGENT_FLOW_KINDS, context.say), ...rest };
    }
  }
  const layer = directedGraphLayer(context, {
    nodes,
    groups,
    edges,
    nodeLabel: context.say('node.step'),
    diagram: DiagramType.AGENT_FLOW,
  });
  return { layers: layer ? [layer] : [] };
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
      node.label = context.say('state.start');
    } else if (shape === 'stateEnd') {
      node.label = context.say('state.end');
    }
    if (!node.label) {
      node.label = node.id;
    }
  }
  const layer = directedGraphLayer(context, { nodes, groups, edges, nodeLabel: context.say('node.state'), diagram: DiagramType.STATE });
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
 * of its own head, and one with no head runs as it was written. Each
 * cardinality is read with its class, in the order the edge runs:
 * `cardinality many Circle to 1 Shape`.
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
      ...(annotations.length > 0 ? { [context.say('attribute.annotation')]: annotations.join(', ') } : {}),
      ...(attributes.length > 0 ? { [context.say('attribute.attributes')]: attributes.join('; ') } : {}),
      ...(methods.length > 0 ? { [context.say('attribute.methods')]: methods.join('; ') } : {}),
    };
    const generic = plain(one.type);
    if (generic) {
      node.label = `${node.label ?? node.id}<${generic}>`;
    }
  }
  const relations = rows(call(context.db, 'getRelations'));
  const taken = new Set<Row>();
  const labelled = edges.flatMap((edge, at) => {
    // Paired by their ends, the first not yet taken, since two classes can
    // be related twice.
    const relation = relations.find(one => !taken.has(one)
      && str(one.id1) === edge.from && str(one.id2) === edge.to);
    if (relation) {
      taken.add(relation);
    }
    // Each cardinality with the class it sits at: relationTitle1 at the
    // start, relationTitle2 at the end.
    const cardinalities = relation === undefined
      ? []
      : ([[relation.relationTitle1, edge.from], [relation.relationTitle2, edge.to]] as const).map(([title, id]) => {
          const value = str(title) !== 'none' ? plain(title).trim() : '';
          return value ? `${value} ${byId.get(id)?.label || id}` : undefined;
        });
    const dashed = str(edge.row.pattern) === 'dashed' || str(edge.row.pattern) === 'dotted';
    const heads = [
      { arrow: edge.row.arrowTypeStart, at: edge.from, other: edge.to },
      { arrow: edge.row.arrowTypeEnd, at: edge.to, other: edge.from },
    ].flatMap(({ arrow, at, other }) => {
      const words = relationWords(arrow, dashed, context.say);
      if (words === undefined) {
        return [];
      }
      return [DIAMONDS.has(str(arrow) ?? '') ? { from: at, to: other, words } : { from: other, to: at, words }];
    });
    const label = (from: string, words?: string): string | undefined => {
      const ends = (from === edge.from ? cardinalities : [...cardinalities].reverse())
        .filter((end): end is string => !!end);
      const cardinality = ends.length > 1
        ? context.say('relation.cardinalities', { from: ends[0], to: ends[1] })
        : ends.length === 1 ? context.say('relation.cardinality', { end: ends[0] }) : undefined;
      return joinLabel(edge.label, words, cardinality);
    };
    if (heads.length === 0) {
      return [{ ...edge, label: label(edge.from) }];
    }
    // Two heads that run the same way -- `Car *--> Wheel` -- are one edge.
    const runs = heads.length === 2 && heads[0].from === heads[1].from
      ? [{ ...heads[0], words: joinLabel(heads[0].words, heads[1].words) }]
      : heads;
    // Two that run opposite ways are one line read both ways.
    const drawn = runs.length > 1 ? `relation-${at}` : undefined;
    return runs.map(head => ({
      ...edge,
      from: head.from,
      to: head.to,
      label: label(head.from, head.words),
      ...(drawn === undefined ? {} : { drawn }),
    }));
  });
  const layer = directedGraphLayer(context, {
    nodes,
    groups,
    edges: labelled,
    nodeLabel: context.say('node.class'),
    diagram: DiagramType.CLASS,
  });
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
      node.attributes = { ...node.attributes, [context.say('attribute.attributes')]: attributes.join('; ') };
    }
  }
  const labelled = edges.map((edge) => {
    const from = arrowWords(edge.row.arrowTypeStart, context.say);
    const to = arrowWords(edge.row.arrowTypeEnd, context.say);
    const cardinality = from && to ? context.say('cardinality.both', { from, to }) : from ?? to;
    const optional = str(edge.row.pattern) === 'dashed' ? context.say('relation.nonIdentifying') : undefined;
    return { ...edge, label: joinLabel(edge.label, cardinality, optional) };
  });
  const layer = directedGraphLayer(context, {
    nodes,
    groups,
    edges: labelled,
    nodeLabel: context.say('node.entity'),
    diagram: DiagramType.ENTITY_RELATIONSHIP,
  });
  return { layers: layer ? [layer] : [] };
}

/** A requirement's types, as Mermaid names them, and the words for each. */
const REQUIREMENT_TYPES: Record<string, WordKey> = {
  'Requirement': 'kind.requirement',
  'Functional Requirement': 'kind.functionalRequirement',
  'Interface Requirement': 'kind.interfaceRequirement',
  'Performance Requirement': 'kind.performanceRequirement',
  'Physical Requirement': 'kind.physicalRequirement',
  'Design Constraint': 'kind.designConstraint',
};

/** A requirement's risks, as Mermaid names them, and the words for each. */
const RISKS: Record<string, WordKey> = {
  Low: 'risk.low',
  Medium: 'risk.medium',
  High: 'risk.high',
};

/** How a requirement is verified, as Mermaid names it, and the words for each. */
const VERIFICATIONS: Record<string, WordKey> = {
  Analysis: 'verification.analysis',
  Demonstration: 'verification.demonstration',
  Inspection: 'verification.inspection',
  Test: 'verification.test',
};

/** What a requirement relationship asserts, as Mermaid names it, and the words for each. */
const REQUIREMENT_RELATIONS: Record<string, WordKey> = {
  contains: 'requirement.contains',
  copies: 'requirement.copies',
  derives: 'requirement.derives',
  satisfies: 'requirement.satisfies',
  verifies: 'requirement.verifies',
  refines: 'requirement.refines',
  traces: 'requirement.traces',
};

/**
 * Requirement diagrams: requirements with their id, text, risk and
 * verification method, elements with their type and document, joined by
 * relationships named for what they assert.
 *
 * Each box is named by its kind, as Mermaid draws it: a requirement by its
 * requirement type, `Functional Requirement`, and an element as `Element`.
 * A diagram holding an element calls its boxes nodes rather than
 * requirements.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function requirement(context: DiagramContext): DiagramConversion {
  const { nodes, groups, edges, raw } = readData(context);
  const elements = new Set(rows(call(context.db, 'getElements')).map(row => str(row.name)));
  let anyElement = false;
  for (const node of nodes) {
    const row = raw.get(node.id);
    if (row === undefined) {
      continue;
    }
    const element = elements.has(node.id);
    anyElement ||= element;
    node.label = plain(row.name) || node.label;
    // A requirement's type is its kind; an element's is a type of its own.
    const say = context.say;
    const fields: [WordKey, string][] = [
      ['attribute.kind', element ? say('kind.element') : sayKnown(plain(row.type), REQUIREMENT_TYPES, say)],
      ['attribute.type', element ? plain(row.type) : ''],
      ['attribute.id', plain(row.requirementId)],
      ['attribute.text', plain(row.text)],
      ['attribute.risk', sayKnown(plain(row.risk), RISKS, say)],
      ['attribute.verification', sayKnown(plain(row.verifyMethod), VERIFICATIONS, say)],
      ['attribute.document', plain(row.docRef)],
    ];
    node.attributes = {
      ...node.attributes,
      ...Object.fromEntries(fields.filter(([, value]) => value !== '').map(([key, value]) => [say(key), value])),
    };
  }
  const labelled = edges.map(edge => ({
    ...edge,
    label: edge.label === undefined
      ? undefined
      : sayKnown(edge.label.replace(/^<<(.*)>>$/, '$1'), REQUIREMENT_RELATIONS, context.say),
  }));
  const layer = directedGraphLayer(context, {
    nodes,
    groups,
    edges: labelled,
    nodeLabel: anyElement ? undefined : context.say('node.requirement'),
    diagram: DiagramType.REQUIREMENT,
  });
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
    const kind: WordKey | undefined = shape === 'usecaseActor'
      ? 'kind.actor'
      : shape === 'usecaseEllipse' ? 'kind.useCase' : undefined;
    if (kind) {
      node.attributes = { [context.say('attribute.kind')]: context.say(kind), ...node.attributes };
    }
  }
  const layer = directedGraphLayer(context, {
    nodes,
    groups,
    edges,
    nodeLabel: context.say('node.element'),
    diagram: DiagramType.USE_CASE,
  });
  return { layers: layer ? [layer] : [] };
}

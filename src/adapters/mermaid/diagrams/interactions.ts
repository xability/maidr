/**
 * The Mermaid diagrams with traces of their own: sequence diagrams become a
 * `sequence`, Venn diagrams a `venn`, and Wardley maps a `point` layer of
 * their components beside a `directed_graph` of what each depends on.
 */

import type {
  MaidrLayer,
  ScatterPoint,
  SequenceMessage,
  SequenceMessageKind,
  SequenceParticipant,
  VennPoint,
} from '@type/grammar';
import type { GraphEdge, GraphNode } from '../graph';
import type { Row } from '../read';
import type { DiagramContext, DiagramConversion } from '../types';
import { TraceType } from '@type/grammar';
import { cssEscape } from '../../shared/selectorUtil';
import { directedGraphLayer } from '../graph';
import { all, call, num, plain, rows, selectorsFor, str } from '../read';

/** Mermaid's sequence line types, used when the database does not expose them. */
const LINETYPE: Record<string, number> = {
  SOLID: 0,
  DOTTED: 1,
  NOTE: 2,
  SOLID_CROSS: 3,
  DOTTED_CROSS: 4,
  SOLID_OPEN: 5,
  DOTTED_OPEN: 6,
  LOOP_START: 10,
  LOOP_END: 11,
  ALT_START: 12,
  ALT_ELSE: 13,
  ALT_END: 14,
  OPT_START: 15,
  OPT_END: 16,
  ACTIVE_START: 17,
  ACTIVE_END: 18,
  PAR_START: 19,
  PAR_AND: 20,
  PAR_END: 21,
  RECT_START: 22,
  RECT_END: 23,
  SOLID_POINT: 24,
  DOTTED_POINT: 25,
  AUTONUMBER: 26,
  CRITICAL_START: 27,
  CRITICAL_OPTION: 28,
  CRITICAL_END: 29,
  BREAK_START: 30,
  BREAK_END: 31,
  PAR_OVER_START: 32,
  BIDIRECTIONAL_SOLID: 33,
  BIDIRECTIONAL_DOTTED: 34,
  CENTRAL_CONNECTION: 59,
  CENTRAL_CONNECTION_REVERSE: 60,
  CENTRAL_CONNECTION_DUAL: 61,
};

/** The fragment a start line type opens, and the word it is labelled with. */
const FRAGMENT_STARTS: Record<string, string> = {
  LOOP_START: 'loop',
  ALT_START: 'alt',
  OPT_START: 'opt',
  PAR_START: 'par',
  PAR_OVER_START: 'par',
  CRITICAL_START: 'critical',
  BREAK_START: 'break',
};

/** The line types that close a fragment. */
const FRAGMENT_ENDS = ['LOOP_END', 'ALT_END', 'OPT_END', 'PAR_END', 'CRITICAL_END', 'BREAK_END'];

/** The line types that open the next section of the fragment they are in. */
const FRAGMENT_SECTIONS: Record<string, string> = {
  ALT_ELSE: 'else',
  PAR_AND: 'and',
  CRITICAL_OPTION: 'option',
};

/**
 * Sequence diagrams: participants and the messages between them, notes in
 * their place, each message with the fragment it sits in and its number.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function sequence(context: DiagramContext): DiagramConversion {
  const db = context.db;
  const exposed = (db as Row | null)?.LINETYPE;
  const types: Record<string, number> = exposed !== null && typeof exposed === 'object'
    ? { ...LINETYPE, ...(exposed as Record<string, number>) }
    : LINETYPE;
  const nameOf = new Map(Object.entries(types).map(([name, value]) => [value, name]));

  const actors = call(db, 'getActors');
  const actorMap = actors instanceof Map ? actors : new Map(Object.entries((actors as Record<string, unknown>) ?? {}));
  const keys = (call(db, 'getActorKeys') as unknown[] | undefined) ?? [...actorMap.keys()];
  const groupOf = new Map<string, string>();
  for (const box of rows(call(db, 'getBoxes'))) {
    for (const key of Array.isArray(box.actorKeys) ? box.actorKeys : []) {
      groupOf.set(String(key), plain(box.name));
    }
  }
  const participants: SequenceParticipant[] = keys.map((key) => {
    const actor = (actorMap.get(String(key)) as Row | undefined) ?? {};
    const kind = plain(actor.type);
    const group = groupOf.get(String(key));
    return {
      id: String(key),
      label: plain(actor.description) || String(key),
      ...(kind && kind !== 'participant' ? { kind } : {}),
      ...(group ? { group } : {}),
    };
  });

  const created = call(db, 'getCreatedActors');
  const destroyed = call(db, 'getDestroyedActors');
  const createdAt = new Set(created instanceof Map ? [...created.values()].map(Number) : []);
  const destroyedAt = new Set(destroyed instanceof Map ? [...destroyed.values()].map(Number) : []);

  const messages: SequenceMessage[] = [];
  const elements: (Element | null)[] = [];
  const fragments: string[] = [];
  // The label each open fragment opened with, so a later section names the
  // fragment it belongs to rather than only its operator word.
  const openers: string[] = [];
  let numbering = call(db, 'showSequenceNumbers') === true;
  let next = 1;
  let step = 1;
  const list = rows(call(db, 'getMessages'));
  if (list.some(message => nameOf.get(Number(message.type)) === 'AUTONUMBER')) {
    numbering = false;
  }
  list.forEach((message, index) => {
    const type = nameOf.get(Number(message.type)) ?? '';
    const text = plain(message.message);
    if (type === 'AUTONUMBER') {
      const settings = (message.message as Row | undefined) ?? {};
      next = num(settings.start) ?? next;
      step = num(settings.step) ?? step;
      numbering = settings.visible !== false;
      return;
    }
    if (type in FRAGMENT_STARTS) {
      const label = text ? `${FRAGMENT_STARTS[type]} ${text}` : FRAGMENT_STARTS[type];
      fragments.push(label);
      openers.push(label);
      return;
    }
    if (type in FRAGMENT_SECTIONS) {
      if (fragments.length > 0) {
        // `alt Two-factor enabled, else`: the section with the fragment it
        // is the alternative of, which `alt, else` left unsaid.
        const section = text ? `${FRAGMENT_SECTIONS[type]} ${text}` : FRAGMENT_SECTIONS[type];
        fragments[fragments.length - 1] = `${openers[openers.length - 1]}, ${section}`;
      }
      return;
    }
    if (FRAGMENT_ENDS.includes(type)) {
      fragments.pop();
      openers.pop();
      return;
    }
    const from = str(message.from);
    // Activations, highlight boxes and the dots of a central connection
    // are drawing on a message, not messages.
    if (from === undefined || type === 'ACTIVE_START' || type === 'ACTIVE_END'
      || type === 'RECT_START' || type === 'RECT_END' || type.startsWith('CENTRAL_CONNECTION')
      || (type !== 'NOTE' && str(message.to) === undefined)) {
      return;
    }
    const id = str(message.id) ?? String(index);
    if (type === 'NOTE') {
      messages.push({
        from,
        to: str(message.to) ?? from,
        text,
        kind: 'note',
        ...(fragments.length > 0 ? { fragments: [...fragments] } : {}),
      });
      elements.push(context.svg.querySelector(`[data-et="note"][data-id="i${cssEscape(id)}"], .note.i${cssEscape(id)}`));
      return;
    }
    let kind: SequenceMessageKind = /DOTTED/.test(type) ? 'reply' : /OPEN|POINT/.test(type) ? 'async' : 'sync';
    if (createdAt.has(index)) {
      kind = 'create';
    } else if (destroyedAt.has(index)) {
      kind = 'destroy';
    }
    messages.push({
      from,
      to: str(message.to) ?? from,
      text,
      kind,
      ...(fragments.length > 0 ? { fragments: [...fragments] } : {}),
      ...(numbering ? { number: next } : {}),
    });
    if (numbering) {
      next += step;
    }
    elements.push(context.svg.querySelector(`[data-et="message"][data-id="i${cssEscape(id)}"], line.message.i${cssEscape(id)}, path.message.i${cssEscape(id)}`));
  });

  if (participants.length === 0 && messages.length === 0) {
    return { layers: [] };
  }
  const selectors = selectorsFor(pairedByOrder(context.svg, messages, elements));
  const layer: MaidrLayer = {
    id: context.layerId('sequence'),
    type: TraceType.SEQUENCE,
    ...(selectors ? { selectors } : {}),
    data: { participants, messages },
  };
  return { layers: [layer] };
}

/**
 * A sequence's drawn messages and notes, paired by drawing order when they
 * cannot be paired by id.
 *
 * Mermaid 12 tags each message line and note with its id; Mermaid 11, which
 * Quarto bundles, does not, and draws each message as a
 * `.messageLine0` (solid) or `.messageLine1` (dotted) and each note as a
 * `rect.note`. It draws each kind in the order the diagram declares them, so
 * the messages pair with the lines and the notes with the notes, in order,
 * when the counts agree.
 *
 * @param svg - The rendered diagram
 * @param messages - The messages read, notes included, in declared order
 * @param elements - What each was paired with by id, null where nothing was
 * @returns The elements, by id where every one was found, else by order
 */
function pairedByOrder(
  svg: SVGSVGElement,
  messages: SequenceMessage[],
  elements: (Element | null)[],
): (Element | null)[] {
  if (!elements.includes(null)) {
    return elements;
  }
  const lines = all(svg, '.messageLine0, .messageLine1');
  const notes = all(svg, 'rect.note');
  const noteCount = messages.filter(message => message.kind === 'note').length;
  if (lines.length !== messages.length - noteCount || notes.length !== noteCount) {
    return elements;
  }
  let line = 0;
  let note = 0;
  return messages.map(message => (message.kind === 'note' ? notes[note++] : lines[line++]));
}

/**
 * Venn diagrams: each set and each overlap, with its name, the items written
 * in it, and its size when the diagram gives one.
 *
 * Mermaid sizes an unsized region itself, as ten over the square of the
 * number of sets it joins, to lay the circles out. Those sizes are the
 * layout's, not the author's, so a diagram whose every size is that default
 * is read without sizes.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function venn(context: DiagramContext): DiagramConversion {
  const subsets = rows(call(context.db, 'getSubsetData'));
  const texts = rows(call(context.db, 'getTextData'));
  const setIds = (row: Row): string[] => (Array.isArray(row.sets) ? row.sets.map(String) : []);
  const names = new Map<string, string>();
  for (const subset of subsets) {
    const sets = setIds(subset);
    if (sets.length === 1) {
      names.set(sets[0], plain(subset.label) || sets[0]);
    }
  }
  const nameOf = (id: string): string => names.get(id) ?? id;
  const defaulted = subsets.every((subset) => {
    const size = num(subset.size);
    return size === undefined || Math.abs(size - 10 / setIds(subset).length ** 2) < 1e-9;
  });

  const data: VennPoint[] = subsets.map((subset) => {
    const sets = setIds(subset);
    const key = [...sets].sort().join('\u0000');
    const items = texts
      .filter(text => [...setIds(text)].sort().join('\u0000') === key)
      .map(text => plain(text.label) || plain(text.id));
    const size = num(subset.size);
    const label = plain(subset.label);
    return {
      sets: sets.map(nameOf),
      ...(defaulted || size === undefined ? {} : { size }),
      ...(sets.length > 1 && label ? { label } : {}),
      ...(items.length > 0 ? { items } : {}),
    };
  });
  const areas = all(context.svg, 'g.venn-area');
  const elements = subsets.map((subset) => {
    const joined = setIds(subset).join('_');
    return areas.find(area => area.getAttribute('data-venn-sets') === joined) ?? null;
  });
  const selectors = selectorsFor(elements);
  const layer: MaidrLayer = {
    id: context.layerId('venn'),
    type: TraceType.VENN,
    ...(selectors ? { selectors } : {}),
    data,
  };
  return { layers: data.length > 0 ? [layer] : [] };
}

/**
 * The one shape Mermaid draws at a Wardley node's position: a component's
 * dot, the ring round a market or a sourced pipeline, a pipeline's square, or
 * an anchor's label, which is all an anchor draws.
 *
 * @param group - The group Mermaid drew for the node
 * @returns The shape, or null when it drew none of them
 */
function wardleyMark(group: Element): Element | null {
  const children = Array.from(group.children);
  const circle = (overlay: boolean): Element | undefined => children.find(child => child.localName === 'circle'
    && (overlay ? (child.getAttribute('class') ?? '').endsWith('-overlay') : !child.hasAttribute('class')));
  return circle(false)
    ?? circle(true)
    ?? children.find(child => child.localName === 'rect')
    ?? children.find(child => child.localName === 'text' && child.classList.contains('wardley-node-label'))
    ?? null;
}

/**
 * Whether marks stand where their points do, relative to one another.
 *
 * A point layer outlines a column of points by the marks drawn at one x, and
 * a row by those at one y, so marks at one evolution must share their x, and
 * a later evolution be drawn further right; visibility likewise, upwards. A
 * pipeline's square is read at its corner and an anchor's label just above
 * its place, so where either shares a value with another node, its marks
 * would light the wrong row or column.
 *
 * @param points - The points, in the marks' order
 * @param marks - One mark per point
 * @returns Whether every pair of marks is ordered as its points are, which no
 *   missing mark is
 */
function drawnInOrder(points: ScatterPoint[], marks: (Element | null)[]): boolean {
  // Where the point layer reads a mark: `x` and `y`, or else a circle's centre.
  const placed = marks.map((mark) => {
    const read = (name: string): number => Number.parseFloat(mark?.getAttribute(name) ?? '');
    const [x, y] = [read('x'), read('y')];
    return Number.isNaN(x) || Number.isNaN(y) ? { x: read('cx'), y: read('cy') } : { x, y };
  });
  return points.every((point, i) => points.every((other, j) =>
    Math.sign(point.x - other.x) === Math.sign(placed[i].x - placed[j].x)
    // Down the page is less visible.
    && Math.sign(point.y - other.y) === Math.sign(placed[j].y - placed[i].y)));
}

/**
 * Wardley maps: each component placed by its evolution and its visibility to
 * the user, and what it depends on.
 *
 * The first layer is the map itself, a labelled point per component on two
 * axes running from 0 to 1, outlined by the shape drawn at each; the second
 * is the value chain, read along its dependencies and outlined by each node's
 * whole drawing.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function wardley(context: DiagramContext): DiagramConversion {
  const map = call(context.db, 'getWardleyData') as Row | undefined;
  const nodes = rows(map?.nodes);
  const trends = new Map(rows(map?.trends).map(trend => [str(trend.nodeId) ?? '', num(trend.targetX)]));
  const groups = all(context.svg, 'g.wardley-node');
  const elements = groups.length === nodes.length ? groups : [];

  const points: ScatterPoint[] = nodes.map((node) => {
    const evolution = (num(node.x) ?? 0) / 100;
    const visibility = (num(node.y) ?? 0) / 100;
    const target = trends.get(str(node.id) ?? '');
    const kind = plain(node.className);
    const name = plain(node.label) || plain(node.id);
    const notes = [
      kind && kind !== 'component' ? kind : '',
      node.inertia === true ? 'inertia' : '',
      target !== undefined ? `evolving to ${target / 100}` : '',
    ].filter(Boolean).join(', ');
    // The notes in parentheses, which a layer switch reads as notes on the
    // name, so the value chain's "Kettle" finds "Kettle (evolving to 0.62)".
    // After a comma they read as part of the name, and the switch lost the
    // component.
    const label = notes === '' ? name : `${name} (${notes})`;
    return { x: evolution, y: visibility, label };
  });
  const marks = elements.map(wardleyMark);
  const refs = selectorsFor(marks);
  const layers: MaidrLayer[] = [];
  if (points.length > 0) {
    // A step of a quarter cuts evolution into Mermaid's four default stages,
    // and visibility alike. Without a step there is no grid, and so no
    // braille: a scatter has a braille surface only in grid navigation.
    layers.push({
      id: context.layerId('map'),
      type: TraceType.SCATTER,
      name: 'Components',
      axes: {
        x: { label: 'Evolution', min: 0, max: 1, tickStep: 0.25 },
        y: { label: 'Visibility', min: 0, max: 1, tickStep: 0.25 },
      },
      // One string, as a point layer reads: in document order, which is the
      // nodes' order, since Mermaid draws a group per node in turn.
      ...(refs && drawnInOrder(points, marks) ? { selectors: refs.join(', ') } : {}),
      data: points,
    });
  }

  const graphNodes: GraphNode[] = nodes.map((node, at) => ({
    id: str(node.id) ?? String(at),
    label: plain(node.label) || str(node.id),
    attributes: {
      Evolution: (num(node.x) ?? 0) / 100,
      Visibility: (num(node.y) ?? 0) / 100,
    },
    element: elements[at] ?? null,
  }));
  const edges: GraphEdge[] = rows(map?.links).map(link => ({
    from: str(link.source) ?? '',
    to: str(link.target) ?? '',
    label: link.dashed === true ? 'dashed' : plain(link.label),
  }));
  if (edges.length > 0) {
    const graph = directedGraphLayer(context, {
      nodes: graphNodes,
      edges,
      nodeLabel: 'Component',
      name: 'Value chain',
    });
    if (graph) {
      layers.push(graph);
    }
  }
  return { layers };
}

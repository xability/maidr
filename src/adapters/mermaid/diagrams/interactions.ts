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
      fragments.push(text ? `${FRAGMENT_STARTS[type]} ${text}` : FRAGMENT_STARTS[type]);
      return;
    }
    if (type in FRAGMENT_SECTIONS) {
      if (fragments.length > 0) {
        const opened = fragments[fragments.length - 1].split(' ')[0];
        const section = text ? `${FRAGMENT_SECTIONS[type]} ${text}` : FRAGMENT_SECTIONS[type];
        fragments[fragments.length - 1] = `${opened}, ${section}`;
      }
      return;
    }
    if (FRAGMENT_ENDS.includes(type)) {
      fragments.pop();
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
  const selectors = selectorsFor(elements);
  const layer: MaidrLayer = {
    id: context.layerId('sequence'),
    type: TraceType.SEQUENCE,
    ...(selectors ? { selectors } : {}),
    data: { participants, messages },
  };
  return { layers: [layer] };
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
 * Wardley maps: each component placed by its evolution and its visibility to
 * the user, and what it depends on.
 *
 * The first layer is the map itself, a labelled point per component on two
 * axes running from 0 to 1; the second is the value chain, read along its
 * dependencies.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function wardley(context: DiagramContext): DiagramConversion {
  const map = call(context.db, 'getWardleyData') as Row | undefined;
  const nodes = rows(map?.nodes);
  const trends = new Map(rows(map?.trends).map(trend => [str(trend.nodeId) ?? '', num(trend.targetX)]));
  const marks = all(context.svg, 'g.wardley-node');
  const elements = marks.length === nodes.length ? marks : [];

  const points: ScatterPoint[] = nodes.map((node) => {
    const evolution = (num(node.x) ?? 0) / 100;
    const visibility = (num(node.y) ?? 0) / 100;
    const target = trends.get(str(node.id) ?? '');
    const kind = plain(node.className);
    const label = [
      plain(node.label) || plain(node.id),
      kind && kind !== 'component' ? kind : '',
      node.inertia === true ? 'inertia' : '',
      target !== undefined ? `evolving to ${target / 100}` : '',
    ].filter(Boolean).join(', ');
    return { x: evolution, y: visibility, label };
  });
  const layers: MaidrLayer[] = [];
  if (points.length > 0) {
    layers.push({
      id: context.layerId('map'),
      type: TraceType.SCATTER,
      name: 'Components',
      axes: {
        x: { label: 'Evolution', min: 0, max: 1 },
        y: { label: 'Visibility', min: 0, max: 1 },
      },
      ...(elements.length > 0 ? { selectors: `#${cssEscape(context.svgId)} g.wardley-node` } : {}),
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

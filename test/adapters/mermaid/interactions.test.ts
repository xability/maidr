/**
 * @jest-environment jsdom
 */

import type { ScatterPoint, SequenceData, VennPoint } from '@type/grammar';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf, matched } from './helpers';

/**
 * Sequence, Venn and Wardley diagrams (`diagrams/interactions.ts`).
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

describe('a sequence diagram', () => {
  const db = {
    getActorKeys: () => ['B', 'S'],
    getActors: () => new Map([
      ['B', { description: 'Browser', type: 'actor' }],
      ['S', { description: 'Server', type: 'participant' }],
    ]),
    getBoxes: () => [{ name: 'Front', actorKeys: ['B'] }],
    getCreatedActors: () => new Map(),
    getDestroyedActors: () => new Map(),
    showSequenceNumbers: () => true,
    getMessages: () => [
      { id: '0', type: 0, from: 'B', to: 'S', message: 'GET /' },
      { id: '1', type: 12, message: 'cached' },
      { id: '2', type: 1, from: 'S', to: 'B', message: '304' },
      { id: '3', type: 13, message: 'fresh' },
      { id: '4', type: 1, from: 'S', to: 'B', message: '200' },
      { id: '5', type: 14, message: '' },
      { id: '6', type: 17, from: 'S', message: '' },
      { id: '7', type: 2, from: 'S', to: 'S', message: 'log it' },
      { id: '8', type: 5, from: 'B', to: 'S', message: 'ping' },
    ],
  };
  const markup = `${['0', '2', '4', '8']
    .map(id => `<line data-et="message" data-id="i${id}"></line>`)
    .join('')
  }<g data-et="note" data-id="i7"></g>`;

  it('reads participants, kinds, fragments and sequence numbers', () => {
    const layer = layersOf(convert('sequence', db, drawn('s', markup)))[0];
    const data = layer.data as SequenceData;
    expect(layer.type).toBe(TraceType.SEQUENCE);
    expect(data.participants).toEqual([
      { id: 'B', label: 'Browser', kind: 'actor', group: 'Front' },
      { id: 'S', label: 'Server' },
    ]);
    expect(data.messages).toEqual([
      { from: 'B', to: 'S', text: 'GET /', kind: 'sync', number: 1 },
      { from: 'S', to: 'B', text: '304', kind: 'reply', fragments: ['alt cached'], number: 2 },
      { from: 'S', to: 'B', text: '200', kind: 'reply', fragments: ['alt cached, else fresh'], number: 3 },
      { from: 'S', to: 'S', text: 'log it', kind: 'note' },
      { from: 'B', to: 'S', text: 'ping', kind: 'async', number: 4 },
    ]);
  });

  it('names each else with the fragment it is the alternative of, nested ones too', () => {
    // `alt, else` said nothing about which alternative a reader had reached,
    // and two alts' else branches read the same.
    const nested = {
      ...db,
      getMessages: () => [
        { id: '0', type: 12, message: 'signed in' },
        { id: '1', type: 0, from: 'B', to: 'S', message: 'load' },
        { id: '2', type: 13, message: '' },
        { id: '3', type: 12, message: 'has a cookie' },
        { id: '4', type: 0, from: 'B', to: 'S', message: 'refresh' },
        { id: '5', type: 13, message: '' },
        { id: '6', type: 0, from: 'B', to: 'S', message: 'log in' },
        { id: '7', type: 14, message: '' },
        { id: '8', type: 14, message: '' },
      ],
    };
    const data = layersOf(convert('sequence', nested, drawn('s')))[0].data as SequenceData;

    expect(data.messages.map(message => message.fragments)).toEqual([
      ['alt signed in'],
      ['alt signed in, else', 'alt has a cookie'],
      ['alt signed in, else', 'alt has a cookie, else'],
    ]);
  });

  it('pairs every message and note with its drawing', () => {
    const layer = layersOf(convert('sequence', db, drawn('s', markup)))[0];
    expect(matched(layer)).toBe(5);
  });

  // Mermaid 11, which Quarto bundles, tags no message line or note with its
  // id: each message is a `.messageLine0` or `.messageLine1` and each note a
  // `rect.note`, drawn in declared order.
  const mermaid11 = '<rect class="note"></rect>'
    + '<line class="messageLine0" data-n="GET /"></line>'
    + '<line class="messageLine1" data-n="304"></line>'
    + '<line class="messageLine1" data-n="200"></line>'
    + '<line class="messageLine0" data-n="ping"></line>';

  it('pairs Mermaid 11\'s untagged lines and notes by drawing order', () => {
    const svg = drawn('s11', mermaid11);
    const layer = layersOf(convert('sequence', db, svg))[0];

    const selectors = layer.selectors as string[];
    const named = selectors.map(selector => svg.querySelector(selector)?.getAttribute('data-n') ?? svg.querySelector(selector)?.getAttribute('class'));
    expect(named).toEqual(['GET /', '304', '200', 'note', 'ping']);
  });

  it('leaves Mermaid 11\'s drawing unpaired when the counts disagree', () => {
    const layer = layersOf(convert('sequence', db, drawn('s11b', mermaid11.replace('<rect class="note"></rect>', ''))))[0];

    expect(layer.selectors).toBeUndefined();
  });
});

describe('a Venn diagram', () => {
  it('names sets by their labels and drops the sizes Mermaid made up', () => {
    const figure = convert('venn', {
      getSubsetData: () => [
        { sets: ['A'], size: 10, label: 'Frontend' },
        { sets: ['B'], size: 10, label: 'Backend' },
        { sets: ['A', 'B'], size: 2.5, label: 'Shared' },
      ],
      getTextData: () => [{ sets: ['A', 'B'], id: 'AB1', label: 'OpenAPI' }],
    }, drawn('v', '<g class="venn-area" data-venn-sets="A"></g><g class="venn-area" data-venn-sets="B"></g><g class="venn-area" data-venn-sets="A_B"></g>'));
    const layer = layersOf(figure)[0];
    expect(layer.data as VennPoint[]).toEqual([
      { sets: ['Frontend'] },
      { sets: ['Backend'] },
      { sets: ['Frontend', 'Backend'], label: 'Shared', items: ['OpenAPI'] },
    ]);
    expect(matched(layer)).toBe(3);
  });

  it('keeps the sizes an author wrote', () => {
    const data = layersOf(convert('venn', {
      getSubsetData: () => [{ sets: ['A'], size: 20 }, { sets: ['B'], size: 10 }, { sets: ['A', 'B'], size: 3 }],
    }))[0].data as VennPoint[];
    expect(data.map(point => point.size)).toEqual([20, 10, 3]);
  });
});

describe('a Wardley map', () => {
  it('reads a Wardley map as its components and their value chain', () => {
    const layers = layersOf(convert('wardley', {
      getWardleyData: () => ({
        nodes: [{ id: 'User', label: 'User', x: 50, y: 95, className: 'anchor' }, { id: 'Tea', label: 'Tea', x: 80, y: 60 }],
        links: [{ source: 'User', target: 'Tea' }],
        trends: [{ nodeId: 'Tea', targetX: 90 }],
      }),
    }));
    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER, TraceType.DIRECTED_GRAPH]);
    expect(layers[0].data as ScatterPoint[]).toEqual([
      { x: 0.5, y: 0.95, label: 'User (anchor)' },
      { x: 0.8, y: 0.6, label: 'Tea (evolving to 0.9)' },
    ]);
  });

  it('keeps the reader on a component with a note when they switch layers', () => {
    // The map wrote "Kettle, evolving to 0.62", which no switch reads as a
    // note, so Page Up from Kettle entered the value chain on its first node.
    const layers = layersOf(convert('wardley', {
      getWardleyData: () => ({
        nodes: [
          { id: 'Business', label: 'Business', x: 63, y: 95, className: 'anchor' },
          { id: 'Kettle', label: 'Kettle', x: 35, y: 43 },
        ],
        links: [{ source: 'Business', target: 'Kettle' }],
        trends: [{ nodeId: 'Kettle', targetX: 62 }],
      }),
    }));
    const subplot = new Figure({ id: 'map', subplots: [[{ layers }]] }).activeSubplot;
    subplot.activeTrace?.moveOnce('FORWARD'); // Kettle, the least evolved.
    const read = (): unknown => {
      const state = subplot.activeTrace?.state;
      return state === undefined || state.empty ? undefined : state.text;
    };

    expect(read()).toMatchObject({ main: { value: 0.35 }, asides: [{ value: 'Kettle (evolving to 0.62)' }] });
    subplot.switchLayer('UPWARD');
    expect(read()).toMatchObject({ main: { value: 'Kettle' } });
    subplot.activeTrace?.moveOnce('BACKWARD');
    expect(read()).toMatchObject({ main: { value: 'Business' } });
    subplot.switchLayer('DOWNWARD');
    expect(read()).toMatchObject({ main: { value: 0.63 }, asides: [{ value: 'Business (anchor)' }] });
  });

  /**
   * A map's nodes as Mermaid 12 draws them, placed at 100 + 4 x evolution
   * across and 400 - 4 x visibility down: an anchor as its label, 3px above
   * its place, a component as a dot and a label.
   */
  const anchor = (x: number, y: number, label: string): string =>
    `<g class="wardley-node wardley-node--anchor"><text class="wardley-node-label" x="${x}" y="${y - 3}">${label}</text></g>`;
  const component = (x: number, y: number, label: string): string =>
    `<g class="wardley-node wardley-node--component"><circle cx="${x}" cy="${y}" r="6"></circle>`
    + `<text class="wardley-node-label" x="${x + 8}" y="${y - 8}">${label}</text></g>`;
  const node = (id: string, x: number, y: number, className?: string): object =>
    ({ id, label: id, x, y, ...(className ? { className } : {}) });
  const map = (nodes: object[], markup: string): ReturnType<typeof layersOf> => layersOf(convert('wardley', {
    getWardleyData: () => ({ nodes, links: [{ source: 'User', target: 'Tea' }], trends: [] }),
  }, drawn('w', `<g class="wardley-nodes">${markup}</g>`)));

  it('outlines each component by the shape drawn at its place, and its value chain by the whole node', () => {
    const layers = map([node('User', 50, 95, 'anchor'), node('Tea', 80, 60)], anchor(300, 20, 'User') + component(420, 160, 'Tea'));
    const selectors = layers[0].selectors;
    expect(typeof selectors).toBe('string');
    expect([...document.querySelectorAll(selectors as string)].map(mark => mark.tagName)).toEqual(['text', 'circle']);

    // Built as MAIDR builds them, the map first: the copies it hides beside
    // its marks leave the value chain one node each.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const points = TraceFactory.create(layers[0]);
    const graph = TraceFactory.create(layers[1]);
    expect(points.getAllHighlightElements().length).toBeGreaterThan(0);
    expect(graph.getAllHighlightElements()).toHaveLength(2);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('resolved to no element');
    graph.dispose();
    points.dispose();
    warn.mockRestore();
  });

  it('outlines a market by the ring Mermaid draws round its dots', () => {
    const market = '<g class="wardley-node wardley-node--component">'
      + '<circle class="wardley-market-overlay" cx="180" cy="200" r="12"></circle>'
      + '<circle class="wardley-market-dot" cx="180" cy="193" r="4"></circle>'
      + '<text class="wardley-node-label" x="198" y="182">Shop</text></g>';
    const layers = map([node('Shop', 20, 50), node('Tea', 80, 60)], market + component(420, 160, 'Tea'));
    expect(document.querySelector(layers[0].selectors as string)?.getAttribute('class')).toBe('wardley-market-overlay');
  });

  it('leaves the map unoutlined where a mark is not drawn where its node is', () => {
    // An anchor sharing its visibility with a component: its label is drawn
    // above the dot, so the row of the two would light the dot alone.
    const shared = map(
      [node('User', 50, 95, 'anchor'), node('Rival', 70, 95), node('Tea', 80, 60)],
      anchor(300, 20, 'User') + component(380, 20, 'Rival') + component(420, 160, 'Tea'),
    );
    expect(shared[0].selectors).toBeUndefined();
    expect(matched(shared[1])).toBe(3);

    // A pipeline's square, read at its corner, beside a component of the
    // pipeline at the same visibility.
    const square = '<g class="wardley-node"><rect x="255.2" y="275.2" width="9.6" height="9.6"></rect>'
      + '<text class="wardley-node-label" x="268" y="272">Kettle</text></g>';
    const pipeline = map(
      [node('Kettle', 40, 30), node('Electric', 60, 30), node('Tea', 80, 60)],
      square + component(340, 280, 'Electric') + component(420, 160, 'Tea'),
    );
    expect(pipeline[0].selectors).toBeUndefined();
  });
});

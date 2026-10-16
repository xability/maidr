/**
 * @jest-environment jsdom
 */

import type { ScatterPoint, SequenceData, VennPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
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
      { from: 'S', to: 'B', text: '200', kind: 'reply', fragments: ['alt, else fresh'], number: 3 },
      { from: 'S', to: 'S', text: 'log it', kind: 'note' },
      { from: 'B', to: 'S', text: 'ping', kind: 'async', number: 4 },
    ]);
  });

  it('pairs every message and note with its drawing', () => {
    const layer = layersOf(convert('sequence', db, drawn('s', markup)))[0];
    expect(matched(layer)).toBe(5);
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
      { x: 0.5, y: 0.95, label: 'User, anchor' },
      { x: 0.8, y: 0.6, label: 'Tea, evolving to 0.9' },
    ]);
  });
});

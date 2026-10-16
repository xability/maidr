/**
 * @jest-environment jsdom
 */

import type { SequenceData } from '@type/grammar';
import { convertMermaidDiagram } from '@adapters/mermaid/converter';
import { describe, expect, it } from '@jest/globals';
import { drawn, layersOf, matched } from './helpers';

/**
 * ZenUML diagrams (`diagrams/zenuml.ts`), read from the text.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

describe('a ZenUML diagram', () => {
  /** A booking: a sync call with a nested call, an alternative and a reply. */
  const TEXT = `zenuml
    title Booking
    // a comment is not a message
    @Actor Customer
    S as "Seat store"
    Customer->API.book(seat) {
      available = S.check(seat)
      if(available) {
        new Ticket(seat)
        return confirmation
      } else {
        return "sold out"
      }
    }
    @return
    API->Customer: receipt`;

  it('reads participants, nesting, fragments and replies from the text', () => {
    const figure = convertMermaidDiagram({ type: 'zenuml', db: {}, text: TEXT }, drawn('z'));
    const data = layersOf(figure)[0].data as SequenceData;
    expect(figure.title).toBe('Booking');
    expect(data.participants).toEqual([
      { id: 'Customer', kind: 'actor' },
      { id: 'S', label: 'Seat store' },
      { id: 'API' },
      { id: 'Ticket' },
    ]);
    expect(data.messages).toEqual([
      { from: 'Customer', to: 'API', text: 'book(seat)', kind: 'sync' },
      { from: 'API', to: 'S', text: 'check(seat)', kind: 'sync' },
      { from: 'S', to: 'API', text: 'available', kind: 'reply' },
      { from: 'API', to: 'Ticket', text: 'new Ticket(seat)', kind: 'create', fragments: ['alt available'] },
      { from: 'API', to: 'Customer', text: 'confirmation', kind: 'reply', fragments: ['alt available'] },
      { from: 'API', to: 'Customer', text: 'sold out', kind: 'reply', fragments: ['alt, else'] },
      { from: 'API', to: 'Customer', text: 'receipt', kind: 'reply' },
    ]);
  });

  it('sends a top-level call from the starter, and names a loop and a try', () => {
    const data = layersOf(convertMermaidDiagram({
      type: 'zenuml',
      db: {},
      text: 'zenuml\n  A.load()\n  while(more) {\n    A->B: next\n  }\n  try {\n    B.save()\n  } catch {\n    B->A: failed\n  }',
    }, drawn('z')))[0].data as SequenceData;
    expect(data.participants[0]).toEqual({ id: '_STARTER_', label: 'Starter' });
    expect(data.messages.map(message => [message.from, message.to, message.fragments ?? []])).toEqual([
      ['_STARTER_', 'A', []],
      ['A', 'B', ['loop more']],
      ['_STARTER_', 'B', ['try']],
      ['B', 'A', ['try, catch']],
    ]);
  });

  it('pairs each message and reply with the group the plugin drew for it', () => {
    const svg = drawn('z', '<g class="message"></g><g class="message"></g><g class="return"></g>');
    const layer = layersOf(convertMermaidDiagram({ type: 'zenuml', db: {}, text: 'zenuml\n  x = A.get()\n  A->B: hi' }, svg))[0];
    expect(matched(layer)).toBe(3);
  });
});

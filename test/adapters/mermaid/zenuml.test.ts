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
      { from: 'API', to: 'Customer', text: 'sold out', kind: 'reply', fragments: ['alt available, else'] },
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

  it('names every section of an else-if chain with the condition the chain opened on', () => {
    const data = layersOf(convertMermaidDiagram({
      type: 'zenuml',
      db: {},
      text: 'zenuml\n  if(a) {\n    A->B: x\n  } else if(b) {\n    A->B: y\n  } else {\n    A->B: z\n  }',
    }, drawn('z')))[0].data as SequenceData;

    expect(data.messages.map(message => message.fragments)).toEqual([
      ['alt a'],
      ['alt a, else if b'],
      ['alt a, else'],
    ]);
  });

  /**
   * What each of a layer's selectors outlines.
   *
   * @param selectors - The layer's selectors
   * @returns The text of the element each one matches
   */
  const outlined = (selectors: unknown): string[] =>
    (selectors as string[]).map(one => document.querySelector(one)?.textContent ?? '');

  it('pairs each message and reply with the group the plugin drew for it, in time', () => {
    // Drawn as the plugin draws them: every call before every reply, each at
    // the height of its moment.
    const svg = drawn('z', '<g class="message"><line y1="87"></line><text y="84">get()</text></g>'
      + '<g class="message"><line y1="152"></line><text y="149">hi</text></g>'
      + '<g class="return"><line y1="119"></line><text y="116">x</text></g>');
    const layer = layersOf(convertMermaidDiagram({ type: 'zenuml', db: {}, text: 'zenuml\n  x = A.get()\n  A->B: hi' }, svg))[0];
    expect(matched(layer)).toBe(3);
    expect(outlined(layer.selectors)).toEqual(['get()', 'x', 'hi']);
  });

  it('places a call to self and its reply by their labels, which they draw without a line', () => {
    const svg = drawn('z', '<g class="message"><line y1="87"></line><text y="84">go()</text></g>'
      + '<g class="message"><line y1="250"></line><text y="247">hi</text></g>'
      + '<g class="message self-call"><svg y="128"></svg><text y="126">validate()</text></g>'
      + '<g class="return return-self"><g transform="translate(1,148)"></g><text y="159">fine</text></g>');
    const text = 'zenuml\n  A.go() {\n    A.validate() {\n      return fine\n    }\n  }\n  A->B: hi';
    const layer = layersOf(convertMermaidDiagram({ type: 'zenuml', db: {}, text }, svg))[0];
    expect((layer.data as SequenceData).messages.map(message => message.text)).toEqual(['go()', 'validate()', 'fine', 'hi']);
    expect(outlined(layer.selectors)).toEqual(['go()', 'validate()', 'fine', 'hi']);
  });

  it('withdraws the highlight when a group says nothing of where it was drawn', () => {
    const svg = drawn('z', '<g class="message"><line y1="87"></line></g><g class="message"><path></path></g>'
      + '<g class="return"><line y1="119"></line></g>');
    const layer = layersOf(convertMermaidDiagram({ type: 'zenuml', db: {}, text: 'zenuml\n  x = A.get()\n  A->B: hi' }, svg))[0];
    expect(layer.selectors).toBeUndefined();
  });
});

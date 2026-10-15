import type { MaidrLayer, SequenceData } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { SequenceTrace } from '@model/sequence';
import { TraceType } from '@type/grammar';

/**
 * A login: the browser asks the server, which checks the database inside a
 * loop and answers. The database is declared last but drawn as a lifeline,
 * and `Cache` is declared and never messaged.
 */
const LOGIN: SequenceData = {
  participants: [
    { id: 'B', label: 'Browser', kind: 'actor' },
    { id: 'S', label: 'Server' },
    { id: 'D', label: 'Database', kind: 'database' },
    { id: 'C', label: 'Cache' },
  ],
  messages: [
    { from: 'B', to: 'S', text: 'POST /login', number: 1 },
    { from: 'S', to: 'D', text: 'find user', fragments: ['loop retry'] },
    { from: 'D', to: 'S', text: 'user row', kind: 'reply', fragments: ['loop retry'] },
    { from: 'S', to: 'S', text: 'check password' },
    { from: 'S', to: 'B', text: '200 OK', kind: 'reply' },
    { from: 'S', to: 'S', text: 'cache warm', kind: 'note' },
  ],
};

/**
 * Builds an entered sequence trace.
 * @param data - The diagram
 * @returns The trace, on its first message
 */
function sequence(data: SequenceData = LOGIN): SequenceTrace {
  const layer: MaidrLayer = { id: 'seq', type: TraceType.SEQUENCE, title: 'Login', data };
  const trace = TraceFactory.create(layer) as SequenceTrace;
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The trace's populated state.
 * @param trace - The trace
 * @returns Its state
 */
function state(trace: SequenceTrace): NonEmptyTraceState {
  const current = trace.state;
  if (current.empty) {
    throw new Error('Expected a non-empty state');
  }
  return current;
}

/**
 * One aside of the announcement.
 * @param trace - The trace
 * @param label - The aside's label
 * @returns Its value
 */
function aside(trace: SequenceTrace, label: string): string | undefined {
  return state(trace).text.asides?.find(one => one.label === label)?.value;
}

/**
 * One statistic of the description.
 * @param trace - The trace
 * @param label - The statistic's label
 * @returns Its value
 */
function stat(trace: SequenceTrace, label: string): string | number | undefined {
  return trace.description.stats.find(one => one.label === label)?.value;
}

describe('sequence registration', () => {
  test('the factory builds a SequenceTrace that names itself', () => {
    const trace = sequence();
    expect(trace).toBeInstanceOf(SequenceTrace);
    expect(trace.description.chartType).toBe('Sequence Diagram');
  });
});

describe('left and right walk the messages in time', () => {
  test('it enters on the first message, with its route and number', () => {
    const trace = sequence();
    expect(state(trace).text.main.value).toBe('POST /login');
    expect(aside(trace, 'Route')).toBe('Browser to Server');
    expect(aside(trace, 'Number')).toBe('1');
    expect(aside(trace, 'Order')).toBe('1 of 6');
  });

  test('a message inside a fragment says which, and a reply says it is one', () => {
    const trace = sequence();
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    expect(state(trace).text.main.value).toBe('user row');
    expect(aside(trace, 'Fragment')).toBe('loop retry');
    expect(aside(trace, 'Kind')).toBe('reply');
  });

  test('a message to oneself and a note are announced as such', () => {
    const trace = sequence();
    trace.moveToIndex(0, 3);
    expect(aside(trace, 'Route')).toBe('Server to itself');
    trace.moveToIndex(0, 5);
    expect(state(trace).text.main.label).toBe('Note');
    expect(aside(trace, 'Route')).toBe('over Server');
  });
});

describe('down walks a lifeline and keeps the moment', () => {
  test('down moves onto the first participant\'s own messages', () => {
    const trace = sequence();
    trace.moveOnce('DOWNWARD');
    expect(aside(trace, 'Lifeline')).toBe('Browser, actor');
    expect(state(trace).text.main.value).toBe('POST /login');
    trace.moveOnce('FORWARD');
    expect(state(trace).text.main.value).toBe('200 OK');
  });

  test('changing lifeline lands on the latest message at or before the moment', () => {
    const trace = sequence();
    trace.moveToIndex(0, 2);
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    expect(aside(trace, 'Lifeline')).toBe('Database, database');
    expect(state(trace).text.main.value).toBe('user row');
  });

  test('a participant no message reaches is passed over', () => {
    const trace = sequence();
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    expect(trace.isMovable('DOWNWARD')).toBe(false);
  });
});

describe('the rotor jumps between fragments', () => {
  test('the unit is offered only when the diagram has a fragment', () => {
    expect(sequence().getRotorFilterUnits().map(unit => unit.key)).toContain('fragments');
    expect(sequence({ participants: [], messages: [{ from: 'a', to: 'b' }] })
      .getRotorFilterUnits().map(unit => unit.key)).not.toContain('fragments');
  });

  test('forward lands where the loop opens, and again where it closes', () => {
    const trace = sequence();
    expect(trace.moveToRotorFilter('fragments', 'right')).toBe(true);
    expect(state(trace).text.main.value).toBe('find user');
    expect(trace.moveToRotorFilter('fragments', 'right')).toBe(true);
    expect(state(trace).text.main.value).toBe('check password');
  });
});

describe('the modalities agree with the announcement', () => {
  test('the pitch is the arriving participant, gliding with the arrow', () => {
    const trace = sequence();
    const audio = state(trace).audio;
    expect(audio.freq.raw).toBe(1);
    expect(audio.glide).toBe('up');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    expect(state(trace).audio.glide).toBe('down');
  });

  test('a participant named only by a message becomes a lane', () => {
    const trace = sequence({ participants: [{ id: 'a' }], messages: [{ from: 'a', to: 'z', text: 'hi' }] });
    expect(aside(trace, 'Route')).toBe('a to z');
    expect(stat(trace, 'Number of participants')).toBe(2);
  });
});

describe('the description', () => {
  test('counts participants, messages, notes and fragments', () => {
    const trace = sequence();
    expect(stat(trace, 'Number of participants')).toBe(4);
    expect(stat(trace, 'Number of messages')).toBe(5);
    expect(stat(trace, 'Notes')).toBe(1);
    expect(stat(trace, 'Fragments')).toBe(1);
    expect(stat(trace, 'Messages to self')).toBe(1);
    expect(stat(trace, 'Busiest participant')).toBe('Server, in 5 messages');
  });

  test('tabulates every message in order', () => {
    const table = sequence().description.dataTable;
    expect(table.headers).toEqual(['Number', 'From', 'To', 'Kind', 'Message', 'Fragment']);
    expect(table.rows[1]).toEqual([2, 'Server', 'Database', 'call', 'find user', 'loop retry']);
  });
});

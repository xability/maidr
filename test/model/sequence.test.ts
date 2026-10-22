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
    expect(aside(trace, 'Lifeline')).toBe('Browser (actor)');
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
    expect(aside(trace, 'Lifeline')).toBe('Database (database)');
    expect(state(trace).text.main.value).toBe('user row');
  });

  /**
   * A relay: A asks B, B asks C, C asks D, twice. No lifeline but D's own
   * holds the last message, so each row down lands somewhere else -- and a
   * cursor that took its moment from the row it just left would slide one
   * message earlier on every move.
   */
  const RELAY: SequenceData = {
    participants: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    messages: [
      { from: 'A', to: 'B', text: 'a' },
      { from: 'B', to: 'C', text: 'b' },
      { from: 'C', to: 'D', text: 'c' },
      { from: 'A', to: 'B', text: 'd' },
      { from: 'B', to: 'C', text: 'e' },
      { from: 'C', to: 'D', text: 'f' },
    ],
  };

  test('a run of moves down four lifelines keeps the moment chosen on the first row', () => {
    const trace = sequence(RELAY);
    trace.moveToIndex(0, 5);

    const landed = ['DOWNWARD', 'DOWNWARD', 'DOWNWARD', 'DOWNWARD'].map((direction) => {
      trace.moveOnce(direction as 'DOWNWARD');
      return state(trace).text.main.value;
    });

    // A holds only `a` and `d`; B, whose latest is `e`, would read `d` had
    // the moment drifted to where A landed.
    expect(landed).toEqual(['d', 'e', 'f', 'f']);
  });

  test('a run of moves back up keeps the same moment, and the first row returns to it', () => {
    const trace = sequence(RELAY);
    trace.moveToIndex(0, 5);
    for (let at = 0; at < 4; at++) {
      trace.moveOnce('DOWNWARD');
    }

    const landed = ['UPWARD', 'UPWARD', 'UPWARD', 'UPWARD'].map((direction) => {
      trace.moveOnce(direction as 'UPWARD');
      return state(trace).text.main.value;
    });

    expect(landed).toEqual(['f', 'e', 'd', 'f']);
  });

  test('a move along a lifeline sets a new moment that later rows keep', () => {
    const trace = sequence(RELAY);
    trace.moveToIndex(0, 5);
    for (let at = 0; at < 4; at++) {
      trace.moveOnce('DOWNWARD');
    }
    trace.moveOnce('BACKWARD');

    const landed = ['UPWARD', 'UPWARD', 'UPWARD', 'DOWNWARD'].map((direction) => {
      trace.moveOnce(direction as 'UPWARD' | 'DOWNWARD');
      return state(trace).text.main.value;
    });

    // `c` on D's lifeline is the moment now: C holds it, B and A do not.
    expect(landed).toEqual(['c', 'b', 'a', 'b']);
  });

  test('a participant no message reaches is passed over', () => {
    const trace = sequence();
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    expect(trace.isMovable('DOWNWARD')).toBe(false);
  });

  test('control and up from a lifeline returns to the moment, as up does', () => {
    const trace = sequence();
    trace.moveToIndex(0, 5);
    trace.moveOnce('DOWNWARD');
    expect(state(trace).text.main.value).toBe('200 OK');

    trace.moveToExtreme('UPWARD');

    expect(state(trace).text.main.value).toBe('cache warm');
    expect(trace.row).toBe(0);
  });

  test('control and down keeps the moment, and control and up undoes it', () => {
    const trace = sequence();
    trace.moveToIndex(0, 5);

    trace.moveToExtreme('DOWNWARD');
    expect(aside(trace, 'Lifeline')).toBe('Database (database)');
    expect(state(trace).text.main.value).toBe('user row');
    trace.moveToExtreme('UPWARD');
    expect(state(trace).text.main.value).toBe('cache warm');

    // The next Down is relative to the message just announced.
    trace.moveOnce('DOWNWARD');
    expect(state(trace).text.main.value).toBe('200 OK');
  });

  test('control and down lands where a run of downs does', () => {
    const trace = sequence(RELAY);
    trace.moveToIndex(0, 5);
    trace.moveOnce('DOWNWARD');
    expect(state(trace).text.main.value).toBe('d');

    trace.moveToExtreme('DOWNWARD');

    expect(state(trace).text.main.value).toBe('f');
  });

  test('control and up on the first row, and down on the last lifeline, are the edges', () => {
    const trace = sequence();
    trace.moveToIndex(0, 5);
    expect(trace.moveToExtreme('UPWARD')).toBe(false);

    trace.moveToExtreme('DOWNWARD');
    expect(trace.moveToExtreme('DOWNWARD')).toBe(false);
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
    expect(audio.freq).toEqual({ min: 1, max: 4, raw: 2 });
    expect(audio.glide).toBe('up');
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    expect(state(trace).audio.glide).toBe('down');
  });

  test('a message arriving at the leftmost participant is the lowest pitch, not the zero marker', () => {
    // An exact 0 is the audio service's marker for a value of zero, which
    // plays before any glide: a reply to the browser sounded like a zero,
    // with no pitch for who receives it and no fall for the arrow.
    const trace = sequence();
    for (let i = 0; i < 4; i++) {
      trace.moveOnce('FORWARD');
    }

    const audio = state(trace).audio;

    expect(state(trace).text.main.value).toBe('200 OK');
    expect(audio.freq).toEqual({ min: 1, max: 4, raw: 1 });
    expect(audio.glide).toBe('down');
  });

  test('a self-message on the leftmost participant is a pitch', () => {
    const trace = sequence({ participants: [], messages: [{ from: 'a', to: 'a', text: 'think' }, { from: 'a', to: 'b' }] });

    const audio = state(trace).audio;

    expect(audio.freq.raw).toBe(1);
    expect(audio.freq.min).toBe(1);
    expect(audio.glide).toBeUndefined();
  });

  test('a one-participant diagram sounds rather than reading as zero', () => {
    const trace = sequence({ participants: [], messages: [{ from: 'a', to: 'a', text: 'think' }] });

    expect(state(trace).audio.freq).toEqual({ min: 1, max: 1, raw: 1 });
  });

  test('every lane but the leftmost keeps the pitch it had', () => {
    // The shift moves the scale with the value, so the fraction of the range
    // each lane sits at is its place across the diagram, as before.
    const trace = sequence();
    const lanes = 4;
    for (let col = 0; col < LOGIN.messages.length; col++) {
      const { freq, panning } = state(trace).audio;
      expect((Number(freq.raw) - freq.min) / (freq.max - freq.min)).toBeCloseTo(panning.x / (lanes - 1));
      trace.moveOnce('FORWARD');
    }
  });

  test('a participant named only by a message becomes a lane', () => {
    const trace = sequence({ participants: [{ id: 'a' }], messages: [{ from: 'a', to: 'z', text: 'hi' }] });
    expect(aside(trace, 'Route')).toBe('a to z');
    expect(stat(trace, 'Number of participants')).toBe(2);
  });
});

describe('braille', () => {
  test('a cell is the arriving participant counted from one, so the first is not a gap', () => {
    const braille = state(sequence()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.values[0]).toEqual([2, 3, 2, 2, 1, 2]);
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

  test.each([
    ['an alt and its else are one fragment', [['loop L'], ['loop L'], ['alt A'], ['alt A, else']], 2],
    ['two fragments with one label, apart in time, are two', [['loop L'], [], ['loop L']], 2],
    ['a return to the first section opens a new fragment', [['alt A'], ['alt A, else'], ['alt A']], 2],
    ['a loop in each section of an alt is two loops', [['alt A', 'loop L'], ['alt A, else', 'loop L']], 3],
    ['an alt nested in a loop', [['loop L'], ['loop L', 'alt A'], ['loop L', 'alt A, else'], ['loop L']], 2],
    ['every section of a par', [['par X'], ['par X, and Y'], ['par X, and Z']], 1],
    ['every section of an else-if chain', [['alt a'], ['alt a, else if b'], ['alt a, else']], 1],
    ['a label with a comma of its own', [['loop Every minute, forever'], ['loop Every minute, forever']], 1],
  ])('counts fragments as the diagram draws them: %s', (_name, paths, expected) => {
    // Counting the distinct labels counted an alt and its else as two, and
    // two loops of one label as one: "Fragments: 3" for a diagram that draws
    // two boxes.
    const trace = sequence({
      participants: [{ id: 'A' }, { id: 'B' }],
      messages: (paths as string[][]).map(fragments => ({ from: 'A', to: 'B', text: 'm', fragments })),
    });

    expect(stat(trace, 'Fragments')).toBe(expected);
  });

  test('lists the participants with each kind set off from its name', () => {
    // Joined with a comma, the kinds read as participants of their own:
    // "Browser, actor, Server, Database, database, Cache" -- six names for
    // the four the count had just announced.
    expect(stat(sequence(), 'Participants, left to right'))
      .toBe('Browser (actor), Server, Database (database), Cache');
  });

  test('tabulates every message in order', () => {
    const table = sequence().description.dataTable;
    expect(table.headers).toEqual(['Number', 'From', 'To', 'Kind', 'Message', 'Fragment']);
    expect(table.rows[0]).toEqual([1, 'Browser', 'Server', 'call', 'POST /login', '']);
    expect(table.rows[1]).toEqual(['', 'Server', 'Database', 'call', 'find user', 'loop retry']);
  });

  test('numbers only what the diagram numbers, a note never', () => {
    const table = sequence().description.dataTable;

    expect(table.rows.map(row => row[0])).toEqual([1, '', '', '', '', '']);
  });

  test('has no Number column when the diagram numbers nothing', () => {
    const table = sequence({ ...LOGIN, messages: LOGIN.messages.map(message => ({ ...message, number: undefined })) })
      .description
      .dataTable;

    expect(table.headers).toEqual(['From', 'To', 'Kind', 'Message', 'Fragment']);
    expect(table.columnAxes).toHaveLength(5);
    expect(table.rows[0][0]).toBe('Browser');
  });
});

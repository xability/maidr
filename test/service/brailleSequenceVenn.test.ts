import type { Context } from '@model/context';
import type { Trace } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { MaidrLayer, SequenceData, VennPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

/**
 * The braille display for sequence and Venn diagrams, driven by the states
 * the real traces emit rather than hand-built ones (#1418).
 *
 * A sequence diagram's braille is one row per row of the cursor: every
 * message, then each participant's lifeline. A lifeline holds only that
 * participant's messages, so its row is shorter than the first, and one a
 * participant no message reaches is empty. The encoder and the service's
 * cursor map are shared with bar charts, whose rows are all one length.
 */

/** A login: four participants, the last never messaged. */
const LOGIN: SequenceData = {
  participants: [
    { id: 'B', label: 'Browser', kind: 'actor' },
    { id: 'S', label: 'Server' },
    { id: 'D', label: 'Database', kind: 'database' },
    { id: 'C', label: 'Cache' },
  ],
  messages: [
    { from: 'B', to: 'S', text: 'POST /login' },
    { from: 'S', to: 'D', text: 'find user' },
    { from: 'D', to: 'S', text: 'user row', kind: 'reply' },
    { from: 'S', to: 'S', text: 'check password' },
    { from: 'S', to: 'B', text: '200 OK', kind: 'reply' },
    { from: 'S', to: 'S', text: 'cache warm', kind: 'note' },
  ],
};

/** Two sets and their overlap. */
const SPORTS: VennPoint[] = [
  { sets: ['Soccer'], size: 2 },
  { sets: ['Tennis'], size: 3 },
  { sets: ['Soccer', 'Tennis'], size: 1 },
];

const disposables: { dispose: () => void }[] = [];

afterEach(() => {
  disposables.splice(0).forEach(one => one.dispose());
});

/**
 * Builds an entered trace of a layer.
 * @param layer - The layer
 * @returns The trace, on its first point
 */
function entered(layer: MaidrLayer): Trace {
  const trace = TraceFactory.create(layer);
  disposables.push(trace);
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * A braille service with stand-in collaborators, at the default display size.
 * @returns The service, what it last emitted, and the cursor moves it asked for
 */
function brailleService(): {
  service: BrailleService;
  emitted: () => { value: string; index: number } | null;
  moveToIndex: ReturnType<typeof jest.fn<(row: number, col: number) => void>>;
} {
  const moveToIndex = jest.fn<(row: number, col: number) => void>();
  const context = { moveToIndex } as unknown as Context;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const display = { toggleFocus: jest.fn() } as unknown as DisplayService;
  const settings = {
    get: () => undefined,
    onChange: () => ({ dispose: () => {} }),
  } as unknown as SettingsService;
  const service = new BrailleService(context, notification, display, settings);
  disposables.push(service);

  let last: { value: string; index: number } | null = null;
  service.onChange((event) => {
    last = { value: event.value, index: event.index };
  });
  return { service, emitted: () => last, moveToIndex };
}

describe('the braille service reads sequence and Venn diagrams', () => {
  test.each([
    ['a sequence diagram', { id: 'seq', type: TraceType.SEQUENCE, data: LOGIN } as MaidrLayer],
    ['a Venn diagram', { id: 'venn', type: TraceType.VENN, data: SPORTS } as MaidrLayer],
  ])('shows %s on the display when braille is turned on', (_name, layer) => {
    const { service, emitted } = brailleService();
    const state: TraceState = entered(layer).state;

    service.toggle(state);

    expect(service.isEnabled).toBe(true);
    expect(emitted()).not.toBeNull();
    expect(emitted()?.value.trim()).not.toBe('');
    expect(emitted()?.index).toBe(0);
  });
});

describe('a sequence diagram\'s lifelines on the braille display', () => {
  // Each cell is the arriving participant counted from one, out of four:
  // Browser ⣀, Server ⠤, Database ⠒. The Cache lifeline is empty.
  const ROWS = [
    '⠤⠒⠤⠤⣀⠤', // every message
    '⠤⣀', // Browser
    '⠤⠒⠤⠤⣀⠤', // Server
    '⠒⠤', // Database
    '', // Cache
  ];

  test('encodes every row at its own length, a lifeline shorter than the first row included', () => {
    const { service, emitted } = brailleService();
    const trace = entered({ id: 'seq', type: TraceType.SEQUENCE, data: LOGIN });

    service.toggle(trace.state);

    expect(emitted()?.value).toBe(`${ROWS.join('\n')}\n`);
  });

  test('puts the cursor on the lifeline cell the reader is on', () => {
    const { service, emitted } = brailleService();
    const trace = entered({ id: 'seq', type: TraceType.SEQUENCE, data: LOGIN });
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');

    service.toggle(trace.state);

    // Past the first row and its newline, then one cell along Browser's.
    expect(emitted()?.index).toBe(ROWS[0].length + 1 + 1);
  });

  test('sends a press on a lifeline cell back to that message', () => {
    const { service, moveToIndex } = brailleService();
    const trace = entered({ id: 'seq', type: TraceType.SEQUENCE, data: LOGIN });
    service.toggle(trace.state);

    service.moveToIndex(ROWS[0].length + 1 + ROWS[1].length + 1 + 1);

    // The Server lifeline's second cell.
    expect(moveToIndex).toHaveBeenCalledWith(2, 1);
  });

  test('ignores a press on the end of a short lifeline, past its last message', () => {
    const { service, moveToIndex } = brailleService();
    const trace = entered({ id: 'seq', type: TraceType.SEQUENCE, data: LOGIN });
    service.toggle(trace.state);

    service.moveToIndex(ROWS[0].length + 1 + ROWS[1].length);

    expect(moveToIndex).not.toHaveBeenCalled();
  });
});

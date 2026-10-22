import type { MaidrLayer } from '@type/grammar';
import type { TextState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { NotificationService } from '@service/notification';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How terse mode joins its clauses when a state carries no cross value.
 *
 * A directed graph, a sequence diagram, a tree without magnitudes and a Venn
 * diagram without sizes have no cross axis to speak of, so their text states
 * leave `cross` out (#1153). Terse mode used to push the main value with a
 * comma after it on the assumption a cross value followed, then prefix every
 * later clause with its own comma: "Order received, , 0 inputs, ..." -- an
 * empty field a screen reader voices as a pause -- and a dangling comma on a
 * node with nothing after its name.
 */

/** A text service switched to terse mode. */
function terse(): TextService {
  const text = new TextService(new NotificationService());
  // Verbose is the default; one toggle reaches terse.
  text.toggle();
  return text;
}

/**
 * What terse mode says for a trace after the given moves.
 *
 * @param layer - The layer to read
 * @param moves - Moves after the first, which enters the trace
 * @returns The announcement
 */
function heard(layer: MaidrLayer, moves: ('FORWARD' | 'DOWNWARD')[] = []): string {
  const trace = TraceFactory.create(layer);
  trace.moveOnce('FORWARD');
  for (const move of moves) {
    trace.moveOnce(move);
  }
  return terse().format(trace.state);
}

/** A non-empty trace state carrying the given text, for the branches no trace reaches. */
function stateWith(text: TextState): TraceState {
  return {
    empty: false,
    type: 'trace',
    layerId: 'l',
    traceType: TraceType.BAR,
    plotType: 'bar',
    title: '',
    xAxis: 'X',
    yAxis: 'Y',
    z: '',
    hasMultiPoints: false,
    audio: {} as never,
    braille: {} as never,
    text,
    autoplay: {} as never,
    highlight: {} as never,
  };
}

const FLOW: MaidrLayer = {
  id: 'flow',
  type: TraceType.DIRECTED_GRAPH,
  title: 'Orders',
  axes: { x: { label: 'Step' } },
  data: [
    { id: 'a', label: 'Order received' },
    { id: 'b', label: 'In stock?', inputs: ['a'] },
    { id: 'c', label: 'Ship', inputs: ['b'] },
  ],
} as MaidrLayer;

const ORG: MaidrLayer = {
  id: 'org',
  type: TraceType.TREEMAP,
  title: 'Reporting lines',
  axes: { x: { label: 'Person' }, y: { label: 'Headcount' } },
  data: [{ x: 'Ada' }, { x: 'Bo', path: ['Ada'] }],
};

describe('terse mode with no cross value', () => {
  test('a directed graph node has no empty field after its name', () => {
    const spoken = heard(FLOW);

    expect(spoken).toMatch(/^Order received, 0 inputs, 1 output, /);
    expect(spoken).not.toContain(', , ');
  });

  test('a lone node ends on its last clause', () => {
    const lone = { ...FLOW, data: [{ id: 'a', label: 'Alone' }] } as MaidrLayer;

    const spoken = heard(lone);

    expect(spoken).toMatch(/^Alone, 0 inputs, 0 outputs, /);
    expect(spoken).not.toContain(', , ');
    expect(spoken).not.toMatch(/,\s*$/);
  });

  test('a sequence message has no empty field after its text', () => {
    const sequence = {
      id: 'login',
      type: TraceType.SEQUENCE,
      title: 'Login',
      data: {
        participants: [{ id: 'B', label: 'Browser' }, { id: 'S', label: 'Server' }],
        messages: [
          { from: 'B', to: 'S', text: 'POST /login' },
          { from: 'S', to: 'B', text: '200 OK', kind: 'reply' },
        ],
      },
    } as MaidrLayer;

    const spoken = heard(sequence);

    expect(spoken).toMatch(/^POST \/login, Browser to Server/);
    expect(spoken).not.toContain(', , ');
  });

  test('a leaf of a tree without magnitudes leaves no trailing comma', () => {
    const spoken = heard(ORG, ['DOWNWARD']);

    expect(spoken).toMatch(/^Bo\b/);
    expect(spoken).not.toContain(', , ');
    expect(spoken).not.toMatch(/,\s*$/);
  });

  test('a Venn region without sizes has no empty field', () => {
    const venn = {
      id: 'venn',
      type: TraceType.VENN,
      title: 'Teams',
      data: [{ sets: ['A'] }, { sets: ['B'] }, { sets: ['A', 'B'] }],
    } as MaidrLayer;

    const spoken = heard(venn);

    expect(spoken).toMatch(/^A, /);
    expect(spoken).not.toContain(', , ');
    expect(spoken).not.toMatch(/,\s*$/);
  });

  test('a main value alone is said alone', () => {
    expect(terse().format(stateWith({ main: { label: 'X', value: 'Alone' } }))).toBe('Alone');
  });

  test('a third value follows the main one with one comma', () => {
    const state = stateWith({ main: { label: 'X', value: 'A' }, z: { label: 'Z', value: 3 } });

    expect(terse().format(state)).toBe('A, 3');
  });

  test('a list of main values is set off from the cross value', () => {
    // Pushed with no separator at all, this read "[1, 2]3".
    const state = stateWith({ main: { label: 'X', value: [1, 2] }, cross: { label: 'Y', value: 3 } });

    expect(terse().format(state)).toBe('[1, 2], 3');
  });
});

describe('terse mode with a cross value reads as it did', () => {
  test('a bar', () => {
    const bar: MaidrLayer = {
      id: 'bar',
      type: TraceType.BAR,
      title: 'Bars',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
    };

    expect(heard(bar)).toBe('a, 1');
  });

  test('a section before its cross value', () => {
    const state = stateWith({
      main: { label: 'X', value: 'A' },
      cross: { label: 'Y', value: 3 },
      section: 'open',
    });

    expect(terse().format(state)).toBe('A, open 3');
  });

  test('a section with no cross value after it', () => {
    const state = stateWith({
      main: { label: 'X', value: 'A' },
      section: 'open',
    });

    expect(terse().format(state)).toBe('A, open');
  });

  test('a span on the cross axis and a third value', () => {
    const state = stateWith({
      main: { label: 'X', value: 'Task' },
      cross: { label: 'Y', value: 3 },
      crossRange: { min: 3, max: 9 },
      z: { label: 'Length', value: '6 days' },
    });

    expect(terse().format(state)).toBe('Task, 3-9, 6 days');
  });

  test('a grid cell before the point', () => {
    const state = stateWith({
      main: { label: 'X', value: 1 },
      cross: { label: 'Y', value: [2, 4] },
      gridPosition: { row: 1, col: 2 },
    });

    expect(terse().format(state)).toBe('Cell [1,2], 1, [2, 4]');
  });

  test('a cross value, a third value and an aside', () => {
    const state = stateWith({
      main: { label: 'X', value: 'A' },
      cross: { label: 'Y', value: 3 },
      z: { label: 'Z', value: 9 },
      asides: [{ label: 'Note', value: 'note' }],
    });

    expect(terse().format(state)).toBe('A, 3, 9, note');
  });
});

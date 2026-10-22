import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { AnnounceXCommand, AnnounceYCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/**
 * What `l x` and `l y` say on a chart whose layer authored no such label.
 *
 * The point text falls back to a generic 'X' or 'Y' when a layer names no
 * axis, so a bar reads "X is A" rather than " is A". That fallback reached the
 * trace state the label commands read, so `l y` on a sequence diagram, a tree
 * or a Venn diagram said "Y label is Y" -- a label that sounds authored, with
 * no warning tone -- where `l z` on the same chart said "not available".
 *
 * Built from real traces, since a hand-made state is exactly what hid this.
 */

/** A layer's state after the first move enters it. */
function enteredState(layer: MaidrLayer): TraceState {
  const trace = TraceFactory.create(layer);
  trace.moveOnce('FORWARD');
  return trace.state;
}

/**
 * Runs an axis-label command against a state.
 *
 * @param Command - The command for the axis
 * @param state - The trace state the reader is on
 * @param terse - Whether text is terse
 * @returns What was announced, and whether the warning tone played
 */
function announce(
  Command: typeof AnnounceXCommand | typeof AnnounceYCommand,
  state: TraceState,
  terse = false,
): { text: string; warned: boolean } {
  const update = jest.fn();
  const warn = jest.fn();
  const command = new Command(
    { scope: Scope.TRACE_LABEL, state } as unknown as Context,
    { update } as unknown as TextViewModel,
    { playWarningToneIfEnabled: warn } as unknown as AudioService,
    { isTerse: () => terse } as unknown as TextService,
    { exitLabelScope: jest.fn() } as unknown as DisplayService,
  );
  command.execute();
  return { text: String(update.mock.calls[0][0]), warned: warn.mock.calls.length > 0 };
}

/** A bar layer with the given axes. */
function bars(axes?: MaidrLayer['axes']): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    title: 'Bars',
    ...(axes ? { axes } : {}),
    data: [{ x: 'A', y: 3 }, { x: 'B', y: 4 }],
  };
}

describe('an axis the layer did not label', () => {
  test('is announced as not available, with the warning tone', () => {
    const state = enteredState(bars());

    expect(announce(AnnounceXCommand, state)).toEqual({ text: 'X label is not available', warned: true });
    expect(announce(AnnounceYCommand, state)).toEqual({ text: 'Y label is not available', warned: true });
    expect(announce(AnnounceYCommand, state, true)).toEqual({ text: 'unavailable', warned: true });
  });

  test('still names the point by the generic axis', () => {
    const state = enteredState(bars());
    if (state.empty) {
      throw new Error('expected a point');
    }

    expect(state.text.main.label).toBe('X');
    expect(state.xAxis).toBe('');
    expect(state.yAxis).toBe('');
  });

  test('a blank label is as good as none', () => {
    const state = enteredState(bars({ x: { label: '' }, y: { label: '   ' } }));

    expect(announce(AnnounceXCommand, state).warned).toBe(true);
    expect(announce(AnnounceYCommand, state).warned).toBe(true);
  });

  test('a chart with only an x label answers for x and not for y', () => {
    const state = enteredState(bars({ x: { label: 'Day' } }));

    expect(announce(AnnounceXCommand, state)).toEqual({ text: 'X label is Day', warned: false });
    expect(announce(AnnounceYCommand, state)).toEqual({ text: 'Y label is not available', warned: true });
  });

  test('an authored label that happens to be X is still announced', () => {
    const state = enteredState(bars({ x: { label: 'X' }, y: { label: 'Y' } }));

    expect(announce(AnnounceXCommand, state)).toEqual({ text: 'X label is X', warned: false });
    expect(announce(AnnounceYCommand, state)).toEqual({ text: 'Y label is Y', warned: false });
  });

  test('a Venn diagram, which names no axis, has neither label', () => {
    const state = enteredState({
      id: 'venn',
      type: TraceType.VENN,
      title: 'Teams',
      data: [{ sets: ['Frontend'], size: 20 }, { sets: ['Backend'], size: 12 }, { sets: ['Frontend', 'Backend'], size: 5 }],
    } as MaidrLayer);

    expect(announce(AnnounceXCommand, state).text).toBe('X label is not available');
    expect(announce(AnnounceYCommand, state).text).toBe('Y label is not available');
  });
});

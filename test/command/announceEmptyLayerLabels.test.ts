import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { AnnounceTitleCommand, AnnounceXCommand, AnnounceYCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { isAuthoredTitle } from '@model/plot';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/**
 * What `l x`, `l y` and `l t` say on a layer with no data.
 *
 * py-maidr's legacy candlestick example sends its candlestick layer with no
 * data, and its title and axes with it. On that layer `l x` said "X label is
 * not available", `l y` "Y label is not available" and `l t` "No title
 * available", with the warning tone, while the description dialog read
 * "Title: Stock Price Candlestick Chart", "X axis: Date" and "Y axis:
 * Price": the label keys read the layer's labels from its state, and the
 * state of a layer with nothing to read carried none.
 */

const EMPTY_CANDLES: MaidrLayer = {
  id: 'candles',
  type: TraceType.CANDLESTICK,
  title: 'Stock Price Candlestick Chart',
  axes: { x: { label: 'Date' }, y: { label: 'Price' } },
  data: [],
};

type LabelCommand = typeof AnnounceXCommand | typeof AnnounceYCommand | typeof AnnounceTitleCommand;

/**
 * Runs a label command on a single-panel chart whose reader is on the state.
 *
 * @param Command - The command for the label
 * @param state - The trace state the reader is on
 * @returns What was announced, and whether the warning tone played
 */
function announce(Command: LabelCommand, state: TraceState): { text: string; warned: boolean } {
  const update = jest.fn();
  const warn = jest.fn();
  const context = {
    scope: Scope.TRACE_LABEL,
    state,
    isMultiPanel: false,
    figureTitle: '',
    isAuthoredTitle,
  } as unknown as Context;
  const command = new Command(
    context,
    { update } as unknown as TextViewModel,
    { playWarningToneIfEnabled: warn } as unknown as AudioService,
    { isTerse: () => false } as unknown as TextService,
    { exitLabelScope: jest.fn() } as unknown as DisplayService,
  );
  command.execute();
  return { text: String(update.mock.calls[0][0]), warned: warn.mock.calls.length > 0 };
}

describe('the label keys on a layer with no data', () => {
  test('read the axis labels the layer authored', () => {
    const state = TraceFactory.create(EMPTY_CANDLES).state;
    expect(state.empty).toBe(true);

    expect(announce(AnnounceXCommand, state)).toEqual({ text: 'X label is Date', warned: false });
    expect(announce(AnnounceYCommand, state)).toEqual({ text: 'Y label is Price', warned: false });
  });

  test('read the title the layer authored', () => {
    const state = TraceFactory.create(EMPTY_CANDLES).state;

    expect(announce(AnnounceTitleCommand, state)).toEqual({
      text: 'Title is Stock Price Candlestick Chart',
      warned: false,
    });
  });

  test('still say an axis the layer did not label is not available', () => {
    const state = TraceFactory.create({ ...EMPTY_CANDLES, axes: { x: { label: 'Date' } } }).state;

    expect(announce(AnnounceYCommand, state)).toEqual({ text: 'Y label is not available', warned: true });
  });

  test('still say there is no title at a step off the edge, whose state names no layer', () => {
    const edge: TraceState = {
      empty: true,
      type: 'trace',
      traceType: TraceType.CANDLESTICK,
      audio: { x: 0, y: 0, rows: 1, cols: 1 },
    };

    expect(announce(AnnounceTitleCommand, edge)).toEqual({ text: 'No title available', warned: true });
    expect(announce(AnnounceXCommand, edge)).toEqual({ text: 'X label is not available', warned: true });
  });
});

import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { BrailleService } from '@service/braille';
import { TraceType } from '@type/grammar';

/**
 * The braille display across a layer switch onto a layer with no data.
 *
 * py-maidr's legacy candlestick example sends its candlestick layer with no
 * data beside a volume line. With braille on, Page Down from the line onto
 * the candlestick layer left the line's cells on the display, the caret on
 * the point just left, as though they were the candlestick layer's.
 */

const EMPTY_CANDLES: MaidrLayer = { id: 'candles', type: TraceType.CANDLESTICK, data: [] };

const VOLUME: MaidrLayer = {
  id: 'volume',
  type: TraceType.LINE,
  data: [[{ x: 1, y: 10 }, { x: 2, y: 30 }, { x: 3, y: 20 }]],
};

interface Shown {
  value: string;
  index: number;
}

const disposables: { dispose: () => void }[] = [];

afterEach(() => {
  disposables.splice(0).forEach(one => one.dispose());
});

/**
 * A chart of an empty layer under a populated one, wired to a braille service
 * as the controller wires it, with the reader on the populated layer and
 * braille on.
 * @returns The context and everything the display was sent
 */
function chart(): { context: Context; shown: Shown[] } {
  const figure = new Figure({ id: 'chart', subplots: [[{ layers: [EMPTY_CANDLES, VOLUME] }]] });
  disposables.push(figure);
  const context = new Context(figure);
  const settings = {
    get: () => undefined,
    onChange: () => ({ dispose: () => {} }),
  } as unknown as SettingsService;
  const braille = new BrailleService(
    context,
    { notify: jest.fn() } as unknown as NotificationService,
    { toggleFocus: jest.fn() } as unknown as DisplayService,
    settings,
  );
  disposables.push(braille);
  const shown: Shown[] = [];
  braille.onChange(event => shown.push({ value: event.value, index: event.index }));
  figure.subplots.flat().forEach((subplot) => {
    subplot.addObserver(braille);
    subplot.traces.flat().forEach(trace => trace.addObserver(braille));
  });
  context.stepTrace('UPWARD');
  context.moveOnce('FORWARD');
  const state = context.state;
  if (state.type !== 'trace') {
    throw new Error('expected the reader on a layer');
  }
  braille.toggle(state);
  return { context, shown };
}

describe('braille across a switch onto a layer with no data', () => {
  test('empties the display rather than keep the last layer\'s cells', () => {
    const { context, shown } = chart();
    expect(shown.at(-1)?.value).not.toBe('');

    context.stepTrace('DOWNWARD');

    expect(shown.at(-1)).toEqual({ value: '', index: -1 });
  });

  test('shows the populated layer again on the way back', () => {
    const { context, shown } = chart();
    const line = shown.at(-1);
    context.stepTrace('DOWNWARD');

    context.stepTrace('UPWARD');

    expect(shown.at(-1)).toEqual(line);
  });
});

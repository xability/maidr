import type { NotificationService } from '@service/notification';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * Page Up and Page Down onto a layer with no data, as the text service hears
 * them through the real model.
 *
 * py-maidr's legacy candlestick example sends its candlestick layer with no
 * data beside a volume line. Page Down from the line onto it said "No more
 * data to display" over the boundary chord, the words and tone of a step off
 * the edge of the data, though the switch had happened: the next Page Down
 * said "No additional layer". The reader was never told which layer they
 * were on.
 */

const VOLUME: MaidrLayer = {
  id: 'volume',
  type: TraceType.LINE,
  title: 'Volume Chart',
  axes: { x: { label: 'Date' }, y: { label: 'Volume' } },
  data: [[{ x: 18628, y: 171914 }, { x: 18631, y: 438280 }]],
};

/**
 * A chart of an empty layer under a populated one, wired to a text service
 * as the controller wires it, with the reader on the populated layer.
 * @param empty - The layer with no data
 * @returns The context, what was notified and what was shown
 */
function chart(empty: MaidrLayer): { context: Context; notified: string[]; shown: string[] } {
  const figure = new Figure({ id: 'chart', subplots: [[{ layers: [empty, VOLUME] }]] });
  const context = new Context(figure);
  const notified: string[] = [];
  const notification = { notify: (text: string) => notified.push(text) } as unknown as NotificationService;
  const text = new TextService(notification);
  const shown: string[] = [];
  text.onChange(event => shown.push(event.value));
  figure.subplots.flat().forEach((subplot) => {
    subplot.addObserver(text);
    subplot.traces.flat().forEach(trace => trace.addObserver(text));
  });
  context.stepTrace('UPWARD');
  context.moveOnce('FORWARD');
  notified.length = 0;
  shown.length = 0;
  return { context, notified, shown };
}

/**
 * A layer of the given type with no data.
 * @param type - The layer's type
 * @param name - The name its producer gave it, if any
 * @returns The layer
 */
function emptyLayer(type: TraceType, name?: string): MaidrLayer {
  return {
    id: 'empty',
    type,
    ...(name === undefined ? {} : { name }),
    title: 'Stock Price Candlestick Chart',
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: [],
  };
}

describe('a layer switch onto a layer with no data', () => {
  test('names the layer and says it is empty', () => {
    const { context, notified, shown } = chart(emptyLayer(TraceType.CANDLESTICK));

    context.stepTrace('DOWNWARD');

    expect(notified).toEqual(['Layer 1 of 2: candlestick plot, empty']);
    expect(shown).toEqual([]);
  });

  test('names the layer by the name its producer gave it', () => {
    const { context, notified } = chart(emptyLayer(TraceType.CANDLESTICK, 'Prices'));

    context.stepTrace('DOWNWARD');

    expect(notified).toEqual(['Layer 1 of 2: Prices, empty']);
  });

  test('names the layer\'s type in words', () => {
    const { context, notified } = chart(emptyLayer(TraceType.ERROR_BAR));

    context.stepTrace('DOWNWARD');

    expect(notified).toEqual(['Layer 1 of 2: error bar plot, empty']);
  });

  test('is announced the same way when the description dialog closes on it', () => {
    const { context, notified } = chart(emptyLayer(TraceType.CANDLESTICK));
    context.selectTrace(0);

    context.notifyActiveTrace();

    expect(notified).toEqual(['Layer 1 of 2: candlestick plot, empty']);
  });

  test('leaves the boundary past the last layer as it was', () => {
    const { context, notified } = chart(emptyLayer(TraceType.CANDLESTICK));
    context.stepTrace('DOWNWARD');
    notified.length = 0;

    context.stepTrace('DOWNWARD');

    expect(notified).toEqual(['No additional layer']);
  });
});

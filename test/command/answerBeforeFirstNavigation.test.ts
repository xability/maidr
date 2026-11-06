import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { MaidrLayer } from '@type/grammar';
import type { PlotState } from '@type/state';
import { AnnouncePositionCommand, AnnounceTitleCommand, AnnounceXCommand, AnnounceYCommand } from '@command/describe';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TextMode, TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * P and the label keys, pressed before the reader's first move.
 *
 * What a chart says is held back until the reader's first navigation, so the
 * instruction shown when it takes focus is not read out twice. A move opens
 * that gate as it is answered; these keys answer through the text view
 * without one, so pressed straight after focus they were shown and not
 * spoken. The audit's probe heard nothing to P, L X, L Y or L T on
 * maidr/barplot, maidr/facet_barplot and py-maidr's legacy candlestick
 * example until an arrow had moved.
 */

const BARS: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  title: 'Tips by day',
  axes: { x: { label: 'Day' }, y: { label: 'Count' } },
  data: [{ x: 'Sat', y: 87 }, { x: 'Sun', y: 76 }, { x: 'Thu', y: 62 }],
};

const AUDIO = {
  playWarningTone: () => {},
  playWarningToneIfEnabled: () => {},
} as unknown as AudioService;

const DISPLAY = { exitLabelScope: () => {} } as unknown as DisplayService;

interface Chart {
  context: Context;
  text: TextService;
  textViewModel: TextViewModel;
  /** The gate's event and each answer shown, in the order they came. */
  events: string[];
}

/**
 * A bar chart the reader has focused and not yet moved on, with a text
 * service as the controller builds it and a text view that records what it
 * is given.
 * @param layer - Its one layer, the bar chart unless another is given
 * @returns The chart and what it has done so far
 */
function chart(layer: MaidrLayer = BARS): Chart {
  const context = new Context(new Figure({ id: 'chart', subplots: [[{ layers: [layer] }]] }));
  const text = new TextService({ notify: () => {} } as unknown as NotificationService);
  const events: string[] = [];
  text.onNavigation(event => events.push(event.type));
  const textViewModel = {
    update: (value: string | PlotState) => events.push(text.format(value)),
    warnIfTextOff: () => text.isOff(),
  } as unknown as TextViewModel;
  return { context, text, textViewModel, events };
}

const KEYS: Array<[string, (chart: Chart) => { execute: () => void }, string]> = [
  ['P', c => new AnnouncePositionCommand(c.context, c.text, c.textViewModel, AUDIO, DISPLAY), 'Position is 1 of 3'],
  ['L X', c => new AnnounceXCommand(c.context, c.textViewModel, AUDIO, c.text, DISPLAY), 'X label is Day'],
  ['L Y', c => new AnnounceYCommand(c.context, c.textViewModel, AUDIO, c.text, DISPLAY), 'Y label is Count'],
  ['L T', c => new AnnounceTitleCommand(c.context, c.textViewModel, AUDIO, c.text, DISPLAY), 'Title is Tips by day'],
];

describe('an answer asked for before the first move', () => {
  test.each(KEYS)('opens the announcement gate as %s is answered', (_key, command, answer) => {
    const c = chart();

    command(c).execute();

    expect(c.events).toEqual(['first_navigation', answer]);
  });

  test('opens it once, however many answers follow', () => {
    const c = chart();
    const [[, position], [, xLabel]] = KEYS;

    position(c).execute();
    xLabel(c).execute();

    expect(c.events).toEqual(['first_navigation', 'Position is 1 of 3', 'X label is Day']);
  });

  test('opens it as P answers on a layer with no data', () => {
    // py-maidr's legacy candlestick example opens on such a layer.
    const c = chart({ ...BARS, data: [] });
    const [[, position]] = KEYS;

    position(c).execute();

    expect(c.events).toEqual(['first_navigation', 'No data here, so no position to show.']);
  });

  test('leaves it shut while text is off, as a move does', () => {
    // A label is still put in the text view with text off; it is not spoken
    // until text is turned back on and the reader moves or asks again.
    const c = chart();
    c.text.setMode(TextMode.OFF);
    const [, [, xLabel]] = KEYS;

    xLabel(c).execute();

    expect(c.events).not.toContain('first_navigation');
  });
});

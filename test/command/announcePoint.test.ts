import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { HighlightService } from '@service/highlight';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { BarPoint, Maidr, MaidrSubplot } from '@type/grammar';
import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import { AnnouncePointCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * Space before the reader has moved.
 *
 * Space replays the current point, and before the first move there is none:
 * the cursor sits parked where entry will land. Space read that parked point
 * straight from the state -- no highlight, since the trace withholds one
 * before entry, and silence on a screen reader, since announcements only
 * start on the first navigation -- and left the trace un-entered, so the
 * next ArrowRight entered at the same point and announced it again.
 */

/** A subplot of three bars. */
function bars(id: string): MaidrSubplot {
  const data: BarPoint[] = [{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }];
  return { layers: [{ id, type: TraceType.BAR, axes: { x: { label: 'X' }, y: { label: 'Y' } }, data }] };
}

/**
 * A context over a figure, the command, its stubbed modalities, and every
 * state the active element notified.
 */
function setup(maidr: Maidr): {
  context: Context;
  command: AnnouncePointCommand;
  modalities: Record<'audio' | 'highlight' | 'braille' | 'text', { update: jest.Mock }>;
  notified: PlotState[];
} {
  const context = new Context(new Figure(maidr));
  const modalities = {
    audio: { update: jest.fn() },
    highlight: { update: jest.fn() },
    braille: { update: jest.fn() },
    text: { update: jest.fn() },
  };
  const command = new AnnouncePointCommand(
    context,
    modalities.audio as unknown as AudioService,
    modalities.highlight as unknown as HighlightService,
    modalities.braille as unknown as BrailleViewModel,
    modalities.text as unknown as TextViewModel,
    { isTerse: () => false } as unknown as TextService,
    {} as unknown as DisplayService,
  );
  const notified: PlotState[] = [];
  const observer: Observer<PlotState> = { update: state => notified.push(state) };
  context.active.addObserver(observer as never);
  return { context, command, modalities, notified };
}

describe('Space before the reader has moved', () => {
  test('enters the chart as the first arrow would, so the next arrow moves on', () => {
    const { context, command, modalities, notified } = setup({ id: 'f', subplots: [[bars('b')]] });
    expect(context.active.isInitialEntry).toBe(true);

    command.execute();

    expect(context.active.isInitialEntry).toBe(false);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ type: 'trace', empty: false });
    // The observers announce it, as they do any move; nothing is replayed
    // on top of that.
    expect(modalities.text.update).not.toHaveBeenCalled();
    expect(modalities.audio.update).not.toHaveBeenCalled();

    context.moveOnce('FORWARD');

    expect(context.active.col).toBe(1);
  });

  test('enters a figure of several panels on its first panel', () => {
    const { context, command, notified } = setup({ id: 'f', subplots: [[bars('a'), bars('b')]] });
    expect(context.active.level).toBe('figure');

    command.execute();

    expect(context.active.isInitialEntry).toBe(false);
    expect(notified).toHaveLength(1);
    expect(context.active.col).toBe(0);

    context.moveOnce('FORWARD');

    expect(context.active.col).toBe(1);
  });
});

describe('Space once the reader has moved', () => {
  test('replays the current point without moving', () => {
    const { context, command, modalities, notified } = setup({ id: 'f', subplots: [[bars('b')]] });
    context.moveOnce('FORWARD');
    context.moveOnce('FORWARD');
    notified.length = 0;

    command.execute();

    expect(context.active.col).toBe(1);
    expect(notified).toHaveLength(0);
    expect(modalities.text.update).toHaveBeenCalledTimes(1);
    expect(modalities.audio.update).toHaveBeenCalledTimes(1);
    expect(modalities.braille.update).toHaveBeenCalledTimes(1);
    expect(modalities.highlight.update).toHaveBeenCalledTimes(1);
  });
});

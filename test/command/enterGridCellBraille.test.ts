/**
 * Enter pressed in the braille field where there is no grid cell to open.
 *
 * Braille mode binds Enter so a reader on a quadrant chart or a Wardley map in
 * grid navigation can open a cell from the braille field. Everywhere else --
 * a bar chart, or such a map read point by point -- Enter has nothing to do
 * there, and before it was bound it answered as any key braille mode does not
 * use: "Invalid key" and the warning tone. Bound, it said nothing at all, and
 * a braille reader could not tell the key from a chart that had stopped
 * answering. The chart's own scope keeps Enter quiet outside a grid.
 *
 * The command is built by the factory, as the key binding builds it.
 */

import type { CommandContext } from '@command/command';
import type { ScatterTrace } from '@model/scatter';
import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { Keys } from '@type/event';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { CommandFactory } from '@command/factory';
import { describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';
import { t } from '@util/i18n';
import { Platform } from '@util/platform';

const BARS: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  axes: { x: { label: 'Day' }, y: { label: 'Count' } },
  data: [{ x: 'Saturday', y: 87 }, { x: 'Sunday', y: 76 }],
};

/** A 2 x 2 grid with a point in its lower-left cell, as a quadrant chart draws. */
const GRID: MaidrLayer = {
  id: 'points',
  type: TraceType.SCATTER,
  axes: {
    x: { label: 'Reach', min: 0, max: 1, tickStep: 0.5 },
    y: { label: 'Engagement', min: 0, max: 1, tickStep: 0.5 },
  },
  data: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.9 }],
};

const INVALID_KEY = t('text.invalidKey', { modifier: Platform.ctrlSpoken });

interface Setup {
  context: Context;
  pressEnter: (modifiers?: Partial<KeyboardEvent>) => void;
  notify: jest.Mock<(message: string) => void>;
  playWarningToneIfEnabled: jest.Mock<() => void>;
}

/**
 * A chart of one layer with the reader in `scope`, and Enter as its key runs.
 * @param layer - The chart's only layer
 * @param scope - Where the reader is when they press Enter
 * @returns The context, a way to press Enter, and what speaks and sounds
 */
function setUp(layer: MaidrLayer, scope: Scope): Setup {
  const maidr: Maidr = { id: 'enter-in-braille', subplots: [[{ layers: [layer] }]] };
  const context = new Context(new Figure(maidr));
  context.toggleScope(scope);
  const notify = jest.fn<(message: string) => void>();
  const playWarningToneIfEnabled = jest.fn<() => void>();
  const factory = new CommandFactory({
    context,
    notificationService: { notify } as unknown as NotificationService,
    audioService: { playWarningToneIfEnabled } as unknown as AudioService,
  } as unknown as CommandContext);
  const pressEnter = (modifiers: Partial<KeyboardEvent> = {}): void => {
    const event = { key: 'Enter', ...modifiers } as unknown as Event;
    factory.create('ENTER_GRID_CELL' as Keys).execute(event);
  };
  return { context, pressEnter, notify, playWarningToneIfEnabled };
}

describe('enter in braille mode with no grid cell to open', () => {
  it('warns as an unassigned key on a bar chart', () => {
    const { pressEnter, notify, playWarningToneIfEnabled } = setUp(BARS, Scope.BRAILLE);

    pressEnter();

    expect(notify).toHaveBeenCalledWith(INVALID_KEY);
    expect(playWarningToneIfEnabled).toHaveBeenCalledTimes(1);
  });

  it('warns on a grid read point by point, outside grid navigation', () => {
    const { context, pressEnter, notify, playWarningToneIfEnabled } = setUp(GRID, Scope.BRAILLE);

    pressEnter();

    expect(notify).toHaveBeenCalledWith(INVALID_KEY);
    expect(playWarningToneIfEnabled).toHaveBeenCalledTimes(1);
    expect(context.scope).toBe(Scope.BRAILLE);
  });

  it('warns once for a held key, as every unassigned key does', () => {
    const { pressEnter, notify, playWarningToneIfEnabled } = setUp(BARS, Scope.BRAILLE);

    pressEnter({ repeat: true });

    expect(notify).not.toHaveBeenCalled();
    expect(playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  it('stays quiet in the chart scope, where Enter is quiet outside a grid', () => {
    const { pressEnter, notify, playWarningToneIfEnabled } = setUp(BARS, Scope.TRACE);

    pressEnter();

    expect(notify).not.toHaveBeenCalled();
    expect(playWarningToneIfEnabled).not.toHaveBeenCalled();
  });
});

describe('enter in braille mode on a grid in grid navigation', () => {
  it('opens the cell without a warning', () => {
    const { context, pressEnter, notify, playWarningToneIfEnabled } = setUp(GRID, Scope.BRAILLE);
    (context.active as ScatterTrace).setGridMode(true);

    pressEnter();

    expect(context.scope).toBe(Scope.GRID_CELL);
    expect(notify).not.toHaveBeenCalled();
    expect(playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  it('says an empty cell is empty, not that the key is invalid', () => {
    const { context, pressEnter, notify, playWarningToneIfEnabled } = setUp(GRID, Scope.BRAILLE);
    const trace = context.active as ScatterTrace;
    trace.setGridMode(true);
    trace.moveGridRight();

    pressEnter();

    expect(notify).toHaveBeenCalledWith(t('text.noPointsInCell'));
    expect(playWarningToneIfEnabled).not.toHaveBeenCalled();
    expect(context.scope).toBe(Scope.BRAILLE);
  });
});

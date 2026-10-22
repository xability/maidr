import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { MaidrLayer } from '@type/grammar';
import { EnterGridCellCommand } from '@command/gridCell';
import { describe, expect, jest, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';
import { t } from '@util/i18n';

/**
 * Enter on a real scatter whose axes declare a grid: Wardley maps, quadrant
 * charts and most py-maidr scatters. In ordinary navigation the reader stands
 * on a point, and Enter answered "No points in this cell" there.
 */

const LAYER: MaidrLayer = {
  id: 'points',
  type: TraceType.SCATTER,
  axes: {
    x: { label: 'Evolution', min: 0, max: 4, tickStep: 2 },
    y: { label: 'Visibility', min: 0, max: 4, tickStep: 2 },
  },
  data: [{ x: 1, y: 1 }, { x: 3, y: 3 }],
};

function setUp(): { trace: ScatterTrace; command: EnterGridCellCommand; notify: jest.Mock } {
  const trace = new ScatterTrace(LAYER);
  const context = {
    active: trace,
    enterGridCell: () => trace.enterGridCell(),
  } as unknown as Context;
  const notify = jest.fn();
  const command = new EnterGridCellCommand(
    context,
    { notify } as unknown as NotificationService,
    { playWarningToneIfEnabled: jest.fn() } as unknown as AudioService,
  );
  return { trace, command, notify };
}

describe('Enter on a scatter with a grid', () => {
  test('is silent on a point outside grid navigation', () => {
    const { trace, command, notify } = setUp();
    trace.moveOnce('FORWARD');

    expect(trace.supportsGridMode()).toBe(true);
    command.execute();

    expect(notify).not.toHaveBeenCalled();
    expect(trace.isInCellMode()).toBe(false);
  });

  test('opens a populated cell in grid navigation', () => {
    const { trace, command, notify } = setUp();
    trace.setGridMode(true);

    command.execute();

    expect(notify).not.toHaveBeenCalled();
    expect(trace.isInCellMode()).toBe(true);
  });

  test('says an empty cell is empty in grid navigation', () => {
    const { trace, command, notify } = setUp();
    trace.setGridMode(true);
    trace.moveGridRight();

    command.execute();

    expect(notify).toHaveBeenCalledWith(t('text.noPointsInCell'));
  });
});

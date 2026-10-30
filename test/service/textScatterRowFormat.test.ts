import type { NotificationService } from '@service/notification';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { VolcanoTrace } from '@model/volcano';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A scatter read by rows formats each value with its own axis's format.
 *
 * Up and Down walk a scatter by y: each step announces one y and every x
 * sharing it, the y first. `TextService` formats `main` with the x axis's
 * format and `cross` with the y axis's unless the state names their axes, and
 * the row states did not, so the y was formatted as an x and the x values as
 * a y. On the regression example whose x is `fixed 1` and y `fixed 2`, Right
 * said "x is 0.1, y is 0.22" and Up "y is 0.5, x is 0.00".
 */

/** Minimal NotificationService stub. */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/**
 * Three points, two of them sharing a y, on axes formatted differently
 * enough that a value read with the other axis's format is recognisable.
 */
const LAYER: MaidrLayer = {
  id: 'points',
  type: TraceType.SCATTER,
  axes: {
    x: { label: 'x', format: { type: 'fixed', decimals: 1 } },
    y: { label: 'y', format: { type: 'fixed', decimals: 3 } },
  },
  data: [
    { x: 0.04, y: 1.23456 },
    { x: 0.96, y: 1.23456 },
    { x: 2.5, y: 7.5 },
  ],
};

/**
 * The text service, formatting with the layer's own axis formats.
 * @param layer - The layer whose formats to use.
 * @returns The service.
 */
function textService(layer: MaidrLayer = LAYER): TextService {
  const figure = { id: 'figure', subplots: [[{ layers: [layer] }]] } as unknown as Maidr;
  return new TextService(createMockNotificationService(), new FormatterService(figure));
}

/**
 * The trace after Right then Up: on the lowest row, y = 1.23456, which holds
 * the first two points.
 * @returns The trace in row mode.
 */
function onLowestRow(): ScatterTrace {
  const trace = new ScatterTrace(LAYER);
  trace.moveOnce('FORWARD'); // Enters on the first column.
  trace.moveOnce('UPWARD'); // Turns into the row of that column's point.
  return trace;
}

describe('a scatter read by rows', () => {
  test('formats the y with the y format and the xs with the x format', () => {
    const trace = onLowestRow();

    const spoken = textService().format(trace.state);

    expect(spoken).toBe('y is 1.235, x are 0.0, 1.0');
  });

  test('does the same in terse text', () => {
    const trace = onLowestRow();
    const text = textService();
    text.toggle(); // Verbose to terse.

    const spoken = text.format(trace.state);

    expect(spoken).toBe('1.235, [0.0, 1.0]');
  });

  test('does the same for one point of the row in intersection mode', () => {
    const trace = onLowestRow();
    trace.setIntersectionMode(true);
    trace.moveToNextIntersection();

    const spoken = textService().format(trace.state);

    expect(spoken).toBe('y is 1.235, x is 1.0');
  });

  test.each([TraceType.VOLCANO, TraceType.MANHATTAN])(
    'does the same on a %s layer, which reads rows as a scatter does',
    (type) => {
      const layer = { ...LAYER, type };
      const trace = new VolcanoTrace(layer);
      trace.moveOnce('FORWARD');
      trace.moveOnce('UPWARD');

      const spoken = textService(layer).format(trace.state);

      expect(spoken).toBe('y is 1.235, x are 0.0, 1.0');
    },
  );

  test('leaves a column, x first, as it was', () => {
    const trace = new ScatterTrace(LAYER);
    trace.moveOnce('FORWARD');

    const spoken = textService().format(trace.state);

    expect(spoken).toBe('x is 0.0, y is 1.235');
  });

  test('leaves one point of a column in intersection mode, x first, as it was', () => {
    const trace = new ScatterTrace(LAYER);
    trace.moveOnce('FORWARD');
    trace.setIntersectionMode(true);

    const spoken = textService().format(trace.state);

    expect(spoken).toBe('x is 0.0, y is 1.235');
  });
});

import type { NotificationService } from '@service/notification';
import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { LayerSwitchTraceState, NonEmptyTraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { ErrorBarTrace } from '@model/errorBar';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How a subplot's layers are told apart when the reader switches between them.
 *
 * The switch announcement was built from the trace *type*, which answers the
 * question only when the layers differ in kind. The case it does not answer is
 * the one a grouped chart produces: a hue split emits one layer per level, so
 * every layer is an `error_bar` and every announcement reads the same. The
 * reader hears two different sets of numbers and is never told which series
 * each belongs to -- the whole content of the split, and what the legend gives
 * a sighted reader for free.
 */

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

const POINTS: ErrorBarPoint[] = [
  { x: 'Sat', y: 20.4, yMin: 18.5, yMax: 22.5 },
  { x: 'Sun', y: 21.4, yMin: 19.5, yMax: 23.3 },
];

/**
 * Build an error bar layer, named or not.
 * @param name What the layer is, when the producer said
 * @returns The layer definition
 */
function layerOf(name?: string): MaidrLayer {
  return {
    id: name ?? 'unnamed',
    type: TraceType.ERROR_BAR,
    // The figure's title, which every layer of a figure carries and which
    // therefore cannot say which layer this is.
    title: 'Total bill by day',
    name,
    axes: { x: { label: 'Day' }, y: { label: 'Total bill' } },
    data: POINTS,
  };
}

/**
 * Announce a layer switch onto a trace, as the navigation service does.
 * @param name What the layer is, when the producer said
 * @param index Which layer this is, one-based
 * @param size How many layers the subplot holds
 * @returns The announcement the notification service received
 */
function announceSwitch(name: string | undefined, index = 1, size = 2): string {
  const trace = new ErrorBarTrace(layerOf(name));
  trace.moveToIndex(1, 0);

  const notification = createMockNotificationService();
  const text = new TextService(notification);

  const state: LayerSwitchTraceState = {
    ...(trace.state as NonEmptyTraceState),
    isLayerSwitch: true,
    index,
    size,
  };
  text.update(state);

  return (notification.notify as jest.Mock).mock.calls[0][0] as string;
}

describe('announcing which layer the reader landed on', () => {
  test('names the layer when the producer named it', () => {
    expect(announceSwitch('Male')).toContain('Layer 1 of 2: Male');
  });

  test('tells two layers of one kind apart', () => {
    // The case the trace type cannot answer, and the reason the field exists.
    const first = announceSwitch('Male', 1, 2);
    const second = announceSwitch('Female', 2, 2);

    expect(first).not.toBe(second);
    expect(first).toContain('Male');
    expect(second).toContain('Female');
  });

  test('falls back to the trace type when the layer has no name', () => {
    // A figure whose layers differ in kind is better served by the type than
    // by a placeholder, so the existing wording is what an unnamed layer keeps.
    expect(announceSwitch(undefined)).toContain('Layer 1 of 2: error_bar plot');
  });

  test('does not mistake the figure title for the layer', () => {
    // Producers put the figure's title on every layer, so preferring it would
    // announce the same string for each -- the bug this replaces, in a new
    // costume.
    expect(announceSwitch(undefined)).not.toContain('Total bill by day');
  });

  test('treats a blank name as no name', () => {
    // A producer emitting an empty string for a layer it could not name should
    // get the type, not "Layer 1 of 2: ".
    expect(announceSwitch('   ')).toContain('Layer 1 of 2: error_bar plot');
  });

  test('still announces where in the data the reader is', () => {
    // The name replaces the type, not the position: a switch lands on the same
    // point in the new layer, and saying so is what makes the two comparable.
    const announcement = announceSwitch('Male');

    expect(announcement).toContain('Day is Sat');
    expect(announcement).toContain('20.4');
  });
});

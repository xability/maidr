import type { NotificationService } from '@service/notification';
import type { Maidr, MaidrLayer, ScatterPoint } from '@type/grammar';
import type { LayerSwitchTraceState, NonEmptyTraceState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How the text layer announces the third dimension of a 3D scatter point.
 *
 * A z reaches `TextService` as a scalar when one point carries it and as an
 * array when a whole column of them does, and both have to be read out the way
 * x and y already are: element by element, through the same formatter, joined
 * with a comma and a space. Interpolating the array into the sentence instead
 * would hand a reader `Array.prototype.toString` — `1,2,3`, unspaced and
 * unrounded, which is neither a list a screen reader pauses through nor the
 * precision the rest of the announcement uses.
 *
 * `formatCoordinateText` (what the AI chat and the position query read) is a
 * separate site from the verbose/terse announcement, so it is checked here too.
 */

const SCATTER_LAYER_ID = 'points';

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
}

/** Builds a scatter layer, with a z axis only when the data carries one. */
function scatterLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: SCATTER_LAYER_ID,
    type: TraceType.SCATTER,
    title: 'Ocean survey',
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Depth' } },
    data,
  };
}

/** A figure carrying one layer, as the formatter service reads it. */
function figureOf(layer: MaidrLayer): Maidr {
  return {
    id: 'figure',
    title: 'Figure',
    subplots: [[{ layers: [layer] }]],
  } as unknown as Maidr;
}

/** The text a service emits for one trace state, in the current text mode. */
function announce(text: TextService, state: TraceState): string {
  const changeListener = jest.fn();
  const disposable = text.onChange(changeListener);

  text.update(state);

  disposable.dispose();
  const event = changeListener.mock.calls[0][0] as { value: string };
  return event.value;
}

describe('announcing a third dimension', () => {
  test('reads a scalar z alongside x and y', () => {
    const trace = new ScatterTrace(scatterLayer([
      { x: 1, y: 2, z: 3 },
      { x: 5, y: 6, z: 7 },
    ]));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 0))).toBe('X is 1, Y is 2, Depth is 3');
  });

  test('reads an array z as a spoken list, not as one run-together number', () => {
    // Two points stacked on x = 1, so the column carries a z per point.
    const trace = new ScatterTrace(scatterLayer([
      { x: 1, y: 2, z: 10 },
      { x: 1, y: 4, z: 20 },
    ]));
    const text = new TextService(createMockNotificationService());

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).toBe('X is 1, Y are 2, 4, Depth is 10, 20');
    // What interpolating the raw array produced: `[10, 20].toString()`.
    expect(spoken).not.toContain('10,20');
  });

  test('formats every entry of an array z, not just the first', () => {
    // The raw-interpolation bug skipped the formatter entirely, so both
    // entries arrived at full float precision.
    const layer = scatterLayer([
      { x: 1, y: 2, z: 3.14159 },
      { x: 1, y: 4, z: 2.71828 },
    ]);
    const trace = new ScatterTrace(layer);
    const text = new TextService(
      createMockNotificationService(),
      new FormatterService(figureOf(layer)),
    );

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).toBe('X is 1, Y are 2, 4, Depth is 3.14, 2.72');
    expect(spoken).not.toContain('3.14159');
    expect(spoken).not.toContain('2.71828');
  });

  test('omits z entirely for a 2D point', () => {
    // A scatter without z data must sound exactly as it did before the third
    // dimension existed — no label, no empty slot.
    const trace = new ScatterTrace(scatterLayer([
      { x: 1, y: 2 },
      { x: 5, y: 6 },
    ]));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 0))).toBe('X is 1, Y is 2');
  });
});

describe('the other formatting paths', () => {
  test('reads an array z as a spoken list in the coordinate text', () => {
    // getCoordinateText() formats the state a second time, for the position
    // query and the AI chat, and had the same raw interpolation.
    const layer = scatterLayer([
      { x: 1, y: 2, z: 10.5 },
      { x: 1, y: 4, z: 20.25 },
    ]);
    const trace = new ScatterTrace(layer);
    const text = new TextService(
      createMockNotificationService(),
      new FormatterService(figureOf(layer)),
    );

    text.update(trace.getStateAt(0, 0));

    expect(text.getCoordinateText()).toBe('X is 1, Y is 2, 4, Depth is 10.5, 20.25');
  });

  test('reads an array z as a spoken list in the layer-switch announcement', () => {
    // The fourth z site, reached by switching layers rather than navigating,
    // and announced through the notification service rather than onChange.
    const layer = scatterLayer([
      { x: 1, y: 2, z: 10.5 },
      { x: 1, y: 4, z: 20.25 },
    ]);
    const trace = new ScatterTrace(layer);
    const notification = createMockNotificationService();
    const text = new TextService(notification, new FormatterService(figureOf(layer)));

    const layerSwitch: LayerSwitchTraceState = {
      ...(trace.getStateAt(0, 0) as NonEmptyTraceState),
      isLayerSwitch: true,
      index: 1,
      size: 2,
    };
    text.update(layerSwitch);

    // 'point' is the scatter trace's own plotType, which the announcement
    // prefers over the trace type.
    const announcement = (notification.notify as jest.Mock).mock.calls[0][0];
    expect(announcement).toBe(
      'Layer 1 of 2: point plot at X is 1, Y is 2, 4, Depth is 10.5, 20.25',
    );
  });
});

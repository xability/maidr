import type { NotificationService } from '@service/notification';
import type { MaidrLayer } from '@type/grammar';
import type { LayerSwitchTraceState, NonEmptyTraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { DirectedGraphTrace } from '@model/directedGraph';
import { ScatterTrace } from '@model/scatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A layer switch onto a scatter says which point the reader landed on.
 *
 * Mermaid's Wardley map is a scatter of components and a graph of their
 * value chain. Page Down back to the components said "Layer 1 of 2:
 * Components at Evolution is 0.8, Visibility is 0.52" and not that this was
 * Hot Water, though every step onto it says so: a point's name is an aside,
 * and the switch announcement read the axis values alone.
 */

const COMPONENTS: MaidrLayer = {
  id: 'map',
  type: TraceType.SCATTER,
  name: 'Components',
  axes: { x: { label: 'Evolution' }, y: { label: 'Visibility' } },
  data: [
    { x: 0.35, y: 0.43, label: 'Kettle' },
    { x: 0.8, y: 0.52, label: 'Hot Water' },
    { x: 0.8, y: 0.6, label: 'Tea' },
  ],
};

const VALUE_CHAIN: MaidrLayer = {
  id: 'chain',
  type: TraceType.DIRECTED_GRAPH,
  name: 'Value chain',
  axes: { x: { label: 'Component' } },
  data: [
    { id: 'tea', label: 'Tea' },
    { id: 'water', label: 'Hot Water', inputs: ['tea'] },
  ],
};

/**
 * The announcement a layer switch onto the trace makes, as the text service
 * hears it from `Subplot.notifyLayerSwitch`.
 * @param trace - The trace switched onto, at the point it landed on
 * @returns What the notification service was asked to say
 */
function switchOnto(trace: ScatterTrace | DirectedGraphTrace): string {
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const state: LayerSwitchTraceState = {
    ...(trace.state as NonEmptyTraceState),
    isLayerSwitch: true,
    index: 1,
    size: 2,
  };

  new TextService(notification).update(state);

  return (notification.notify as jest.Mock).mock.calls[0][0] as string;
}

describe('a layer switch onto a scatter', () => {
  test('names the point the reader landed on', () => {
    const trace = new ScatterTrace(COMPONENTS);
    trace.moveOnce('FORWARD');
    trace.moveOnce('UPWARD'); // Kettle's row.
    trace.moveOnce('UPWARD'); // Hot Water's.

    expect(switchOnto(trace)).toBe(
      'Layer 1 of 2: Components at Visibility is 0.52, Evolution is 0.8, Name is Hot Water',
    );
  });

  test('names none where it landed on several points', () => {
    const trace = new ScatterTrace(COMPONENTS);
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD'); // Hot Water and Tea share their evolution.

    expect(switchOnto(trace)).toBe(
      'Layer 1 of 2: Components at Evolution is 0.8, Visibility are 0.52, 0.6',
    );
  });

  test('a graph keeps its own facts for the next step', () => {
    // The graph's node is already named in `main`; its connections, role and
    // order are asides the switch has always left out.
    const trace = new DirectedGraphTrace(VALUE_CHAIN);
    trace.moveOnce('FORWARD');

    expect(switchOnto(trace)).toBe('Layer 1 of 2: Value chain at Component is Tea');
  });
});

import type { NotificationService } from '@service/notification';
import type { BoxPoint, CandlestickPoint, ErrorBarPoint, HistogramPoint, MaidrLayer } from '@type/grammar';
import type { LayerSwitchTraceState, NonEmptyTraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TextService } from '@service/text';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A layer switch reads the point it lands on as a step onto that point does.
 *
 * The switch composed its own reading of the point's main, cross and z
 * values, and dropped what a step says about each: a box plot's or a
 * candlestick's section, an error bar's bound, a histogram bin's range. So
 * "Layer 1 of 2: Male at Day is Sat, Total bill is 18.2" read a lower bound as
 * the point's value, Page Down back to a candlestick said "Price is 3,085.18"
 * without saying it was the close, a histogram bin was read by a centre the
 * reader never hears otherwise, and the violin's box layer said no value at
 * all.
 */

type Trace = ReturnType<typeof TraceFactory.create>;

/**
 * What a switch onto the trace says, and the state it says it from.
 * @param trace - The trace switched onto, at the point it landed on
 * @returns The announcement and the trace's state
 */
function switchOnto(trace: Trace): { switched: string; state: NonEmptyTraceState } {
  const state = trace.state as NonEmptyTraceState;
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const layerSwitch: LayerSwitchTraceState = { ...state, isLayerSwitch: true, index: 1, size: 2 };

  new TextService(notification).update(layerSwitch);

  return { switched: (notification.notify as jest.Mock).mock.calls[0][0] as string, state };
}

const BINS: HistogramPoint[] = [
  { x: -3.25, y: 0.004, xMin: -3.5, xMax: -3, yMin: 0, yMax: 0.004 },
  { x: -2.75, y: 0.01, xMin: -3, xMax: -2.5, yMin: 0, yMax: 0.01 },
];

const CANDLES: CandlestickPoint[] = [
  { value: 'Nov 7', open: 3050, high: 3100, low: 3040, close: 3085.18, volume: 100, volatility: 60 },
  { value: 'Nov 8', open: 3085, high: 3120, low: 3070, close: 3110, volume: 120, volatility: 50 },
];

const BOUNDS: ErrorBarPoint[] = [
  { x: 'Sat', y: 20.8, yMin: 18.2, yMax: 23.4 },
  { x: 'Sun', y: 21.4, yMin: 19.5, yMax: 23.3 },
];

const VIOLINS: BoxPoint[] = [
  { z: 'Fair', lowerOutliers: [], min: 337, q1: 2050, q2: 3282, q3: 5206, max: 9000, upperOutliers: [] },
  { z: 'Good', lowerOutliers: [], min: 327, q1: 1145, q2: 3050, q3: 5028, max: 9500, upperOutliers: [] },
];

/**
 * A one-layer chart of the given type over the data.
 * @param type - The layer's trace type
 * @param data - The layer's data
 * @param axes - The axis labels
 * @param axes.x - The x axis label
 * @param axes.y - The y axis label
 * @returns The trace, not yet entered
 */
function traceOf(type: TraceType, data: MaidrLayer['data'], axes: { x: string; y: string }): Trace {
  return TraceFactory.create({
    id: `${type}-layer`,
    type,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: axes.x }, y: { label: axes.y } },
    data,
  });
}

describe('a layer switch reads the point as a step onto it does', () => {
  test('a histogram bin by its range, not its centre', () => {
    const trace = traceOf(TraceType.HISTOGRAM, BINS, { x: 'Value', y: 'Density' });
    trace.moveOnce('FORWARD');

    const { switched } = switchOnto(trace);

    expect(switched).toContain('at Value is -3.5 through -3, Density is 0.004');
    expect(switched).not.toContain('-3.25');
  });

  test('a candlestick names the price it is on', () => {
    const trace = traceOf(TraceType.CANDLESTICK, CANDLES, { x: 'Date', y: 'Price' });
    trace.moveOnce('FORWARD');

    const { switched, state } = switchOnto(trace);

    expect(state.text.section).toBeDefined();
    expect(switched).toContain(`Date is Nov 7, ${state.text.section} Price is`);
  });

  test('an error bar names the bound it is on', () => {
    const trace = traceOf(TraceType.ERROR_BAR, BOUNDS, { x: 'Day', y: 'Total bill' });
    trace.moveToIndex(0, 0);

    const { switched, state } = switchOnto(trace);

    expect(state.text.section).toBeDefined();
    expect(switched).toContain(`Day is Sat, ${state.text.section} Total bill is`);
  });

  test('the violin\'s box layer says the value it lands on', () => {
    // It used to be left out on purpose, which left the switch naming the
    // violin and nothing else.
    const trace = traceOf(TraceType.VIOLIN_BOX, VIOLINS, { x: 'Cut', y: 'Price' });
    trace.moveOnce('FORWARD');

    const { switched, state } = switchOnto(trace);

    expect(state.text.section).toBeDefined();
    expect(switched).toContain(`Cut is Fair, ${state.text.section} Price is`);
  });

  test('says the reading a verbose step onto the point says', () => {
    const trace = traceOf(TraceType.HISTOGRAM, BINS, { x: 'Value', y: 'Density' });
    trace.moveOnce('FORWARD');
    const step = new TextService({ notify: jest.fn() } as unknown as NotificationService)
      .format(trace.state);

    const { switched } = switchOnto(trace);

    expect(switched.endsWith(` at ${step}`)).toBe(true);
  });
});

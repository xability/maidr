import type { WaterfallPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/** The classic Highcharts budget bridge, with both kinds of restating bar. */
const STEPS = [
  { name: 'Start', y: 120 },
  { name: 'Product Revenue', y: 569 },
  { name: 'Service Revenue', y: 231 },
  { name: 'Positive Balance', isIntermediateSum: true },
  { name: 'Fixed Costs', y: -342 },
  { name: 'Variable Costs', y: -233 },
  { name: 'Balance', isSum: true },
];

describe('highcharts waterfall series', () => {
  it('accumulates the running total each floating bar is drawn between', () => {
    const chart = fakeChart({
      title: 'Company profit',
      type: 'waterfall',
      renderToId: 'waterfall-chart',
      series: [fakeSeries({
        index: 0,
        type: 'waterfall',
        name: 'Cash',
        yAxis: fakeAxis({ options: { title: { text: 'USD (thousands)' } } }),
        data: STEPS,
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.title).toBe('Cash');
    // Highcharts declares only the contribution; the absolute positions the
    // bar floats between are accumulated here.
    expect(layer.data as WaterfallPoint[]).toEqual([
      { x: 'Start', start: 0, end: 120, delta: 120, kind: 'increase' },
      { x: 'Product Revenue', start: 120, end: 689, delta: 569, kind: 'increase' },
      { x: 'Service Revenue', start: 689, end: 920, delta: 231, kind: 'increase' },
      // A subtotal is drawn from the previous subtotal's edge — the baseline,
      // for the first one — up to the running total.
      { x: 'Positive Balance', start: 0, end: 920, delta: 920, kind: 'total' },
      { x: 'Fixed Costs', start: 920, end: 578, delta: -342, kind: 'decrease' },
      { x: 'Variable Costs', start: 578, end: 345, delta: -233, kind: 'decrease' },
      // A sum restates everything so far and sits on the baseline.
      { x: 'Balance', start: 0, end: 345, delta: 345, kind: 'total' },
    ]);
    // The dashed connectors between the bars carry no point class, so they
    // are already excluded.
    expect(layer.selectors).toBe(
      '#waterfall-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
    expect(layer.axes?.y?.label).toBe('USD (thousands)');
  });

  it('floats a second subtotal from the first one\'s edge', () => {
    const chart = fakeChart({
      type: 'waterfall',
      series: [fakeSeries({
        index: 0,
        type: 'waterfall',
        data: [
          { name: 'Revenue', y: 900 },
          { name: 'Gross', isIntermediateSum: true },
          { name: 'Costs', y: -500 },
          { name: 'Net', isIntermediateSum: true },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as WaterfallPoint[];

    // Highcharts draws the second subtotal spanning 400 to 900, not from the
    // baseline, so it contributes the -500 the steps between them netted.
    expect(data[3]).toEqual({ x: 'Net', start: 900, end: 400, delta: -500, kind: 'total' });
  });

  it('drops a step Highcharts draws no bar for', () => {
    const chart = fakeChart({
      type: 'waterfall',
      series: [fakeSeries({
        index: 0,
        type: 'waterfall',
        data: [{ name: 'Open', y: 50 }, { name: 'Unknown', y: null }, { name: 'Fees', y: -10 }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as WaterfallPoint[];

    // Keeping the gap would slide the Fees bar's highlight onto the Open one.
    expect(data).toEqual([
      { x: 'Open', start: 0, end: 50, delta: 50, kind: 'increase' },
      { x: 'Fees', start: 50, end: 40, delta: -10, kind: 'decrease' },
    ]);
  });
});

/**
 * A Highcharts timeline emitted no layer at all (#1138).
 *
 * `buildSubplot` sorts series into buckets by type and `timeline` is in none
 * of them, so the whole chart came out unread — and a timeline is a chart
 * whose entire payload is *which events happened, in what order*, which is
 * exactly what the grammar's {@link ScatterPoint.label} is for.
 *
 * **`y` is a constant.** That is the fact this reading is built around, and
 * it is measured rather than assumed. Highcharts 11.4.8 in Chromium, four
 * events and three, dated and undated alike:
 *
 *   point.y     1, 1, 1, 1
 *   point.x     0, 1, 2, 3        with no x declared, x axis hidden
 *   point.x     1579046400000 …   with `xAxis.type: 'datetime'`
 *
 * So the layer carries the 1 the chart drew. Sonifying it plays one pitch
 * for the whole row, which is what a chart with no magnitude sounds like;
 * pitching by `x` instead would announce a magnitude the chart does not
 * draw. What the reader gets is the sequence — `ScatterTrace` pans by
 * distinct x value — and each event's own name.
 *
 * **The box draws two strings.** Measured on an event declaring both:
 *
 *   data label text   "● First artificial satellite" then a zero-width
 *                     space then "1957 Sputnik 1"
 *
 * `name` on the first line, `label` on the second. Neither alone is the box,
 * and on the undated timeline `label` is the only place the *date* appears,
 * so both are joined into the one string the grammar has room for.
 * `description` is not drawn on the chart at all — it is the tooltip's text
 * — so it is not folded in.
 *
 * **The markers needed no new selector.** Measured: a timeline's markers
 * carry `highcharts-point` inside a `highcharts-markers` group that is a
 * sibling* of the series group but carries the same `highcharts-series-N`
 * class, so the existing `scatterSelector` resolved to exactly one element
 * per point, in point order, each identical to that point's own `graphic`.
 */
import type { ScatterPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/** The measured events, with both of the strings the box draws. */
const EVENTS = [
  { name: 'First artificial satellite', label: '1957 Sputnik 1' },
  { name: 'First human spaceflight', label: '1961 Vostok 1' },
  { name: 'First Moon landing', label: '1969 Apollo 11' },
];

/**
 * A timeline chart.
 *
 * @param points - The events, defaulting to the measured three
 * @returns The fake chart
 */
function timelineChart(
  points: Partial<{ x: number; y: number | null; name: string; label: string }>[] = EVENTS,
): ReturnType<typeof fakeChart> {
  return fakeChart({
    renderToId: 'timeline-chart',
    series: [fakeSeries({
      index: 0,
      type: 'timeline',
      name: 'Missions',
      xAxis: fakeAxis({ options: { title: { text: 'When' } } }),
      yAxis: fakeAxis({ options: { title: { text: 'Row' } } }),
      // The constant Highcharts puts on every event, unless overridden.
      data: points.map((point, i) => ({ x: i, y: 1, ...point })),
    })],
  });
}

/** The timeline layer of a chart. */
function events(chart: ReturnType<typeof fakeChart>): ScatterPoint[] {
  const layers = highchartsToMaidr(chart).subplots[0][0].layers;
  return layers[0].data as ScatterPoint[];
}

describe('highcharts timeline', () => {
  it('reads a timeline as a scatter rather than declining it', () => {
    const layers = highchartsToMaidr(timelineChart()).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.SCATTER);
    expect(layers[0].title).toBe('Missions');
  });

  it('names each event with the whole of the box the chart draws', () => {
    // Both lines. `name` alone would drop the date on an undated timeline,
    // which is every timeline whose x axis is hidden — the ordinary case.
    expect(events(timelineChart()).map(point => point.label)).toEqual([
      'First artificial satellite, 1957 Sputnik 1',
      'First human spaceflight, 1961 Vostok 1',
      'First Moon landing, 1969 Apollo 11',
    ]);
  });

  it('says an event once when its two strings are the same', () => {
    expect(events(timelineChart([{ name: 'Launch', label: 'Launch' }]))[0].label)
      .toBe('Launch');
  });

  it('names an event by whichever string it declared', () => {
    const only = events(timelineChart([
      { name: 'Launch' },
      { label: '1957' },
      {},
    ]));

    expect(only.map(point => point.label)).toEqual(['Launch', '1957', undefined]);
  });

  it('carries the constant the chart drew rather than inventing a value', () => {
    // Measured at 1 on every timeline built for this. A reading that put the
    // index on y — or the timestamp — would sonify a magnitude the chart
    // does not draw.
    expect(events(timelineChart()).map(point => point.y)).toEqual([1, 1, 1]);
  });

  it('keeps the positions the author declared, index or timestamp', () => {
    // An undated timeline is 0, 1, 2 …; a `datetime` one carries the real
    // milliseconds. Nothing here converts between them: the dates a reader
    // hears on an undated timeline come from the event's own text, which is
    // where the chart draws them.
    expect(events(timelineChart()).map(point => point.x)).toEqual([0, 1, 2]);

    const dated = events(timelineChart([
      { x: 1579046400000, name: 'v1' },
      { x: 1699488000000, name: 'v2' },
    ]));
    expect(dated.map(point => point.x)).toEqual([1579046400000, 1699488000000]);
  });

  it('takes the markers, which the scatter selector already reaches', () => {
    const layer = highchartsToMaidr(timelineChart()).subplots[0][0].layers[0];

    expect(layer.selectors).toBe(
      '#timeline-chart .highcharts-series-group .highcharts-series-0 '
      + '.highcharts-point:not([visibility="hidden"])',
    );
  });

  it('is bound to the axes the author titled', () => {
    const layer = highchartsToMaidr(timelineChart()).subplots[0][0].layers[0];

    expect(layer.axes).toEqual({
      x: { label: 'When' },
      y: { label: 'Row' },
    });
  });

  it('drops an event the chart drew nothing for', () => {
    expect(events(timelineChart([
      { name: 'Launch' },
      { name: 'Cancelled', y: null },
      { name: 'Landing' },
    ])).map(point => point.label)).toEqual(['Launch', 'Landing']);
  });
});

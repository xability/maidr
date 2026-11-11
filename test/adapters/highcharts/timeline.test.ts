/**
 * A Highcharts timeline, read as the row of events it draws.
 *
 * It emitted no layer at all until #1138, and was then read as a scatter
 * whose points carried each event's name. A timeline measures nothing, so
 * the two numbers a scatter reads before a point's name were both ones the
 * chart does not draw: every event was "X is 0, Y is 1, Name is First
 * artificial satellite, 1957 Sputnik 1" -- the index on a hidden x axis and
 * the constant Highcharts puts on `y`. Highcharts 11.4.8 in Chromium, four
 * events and three, dated and undated alike:
 *
 *   point.y     1, 1, 1, 1
 *   point.x     0, 1, 2, 3        with no x declared, x axis hidden
 *   point.x     1579046400000 …   with `xAxis.type: 'datetime'`
 *
 * It is read now as a tree of one level, as MAIDR reads a Mermaid timeline:
 * each event announced by its box, in order, and nothing else.
 *
 * **The box draws two strings.** Measured on an event declaring both:
 *
 *   data label text   "● First artificial satellite" then a zero-width
 *                     space then "1957 Sputnik 1"
 *
 * `name` on the first line, `label` on the second. Neither alone is the box,
 * and on the undated timeline `label` is the only place the *date* appears,
 * so both are joined into the event's name. `description` is not drawn on
 * the chart at all -- it is the tooltip's text -- so it is not folded in.
 *
 * **The markers needed no new selector.** Measured: a timeline's markers
 * carry `highcharts-point` inside a `highcharts-markers` group that is a
 * sibling of the series group but carries the same `highcharts-series-N`
 * class, so the existing `scatterSelector` resolved to exactly one element
 * per point, in point order, each identical to that point's own `graphic`.
 */
import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
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
 * @param xAxis - The axis the events are placed along
 * @returns The fake chart
 */
function timelineChart(
  points: Partial<{ x: number; y: number | null; name: string; label: string }>[] = EVENTS,
  xAxis = fakeAxis({ options: { visible: false } }),
): ReturnType<typeof fakeChart> {
  return fakeChart({
    renderToId: 'timeline-chart',
    series: [fakeSeries({
      index: 0,
      type: 'timeline',
      name: 'Missions',
      xAxis,
      // Highcharts still gives the hidden y axis its default title.
      yAxis: fakeAxis({ options: { visible: false, title: { text: 'Values' } } }),
      // The constant Highcharts puts on every event, unless overridden.
      data: points.map((point, i) => ({ x: i, y: 1, ...point })),
    })],
  });
}

/** The timeline layer of a chart. */
function layerOf(chart: ReturnType<typeof fakeChart>): MaidrLayer {
  return highchartsToMaidr(chart).subplots[0][0].layers[0];
}

/** The events of a chart's timeline layer, by name. */
function events(chart: ReturnType<typeof fakeChart>): (string | number)[] {
  return (layerOf(chart).data as TreemapPoint[]).map(point => point.x);
}

/**
 * What the reader is told on one event.
 *
 * Built without the selectors, which resolve against a `document` this
 * project does not have; what is under test is the reading, not the marks.
 *
 * @param chart - The chart to read
 * @param index - Which event
 * @returns The trace state there
 */
function readingAt(chart: ReturnType<typeof fakeChart>, index: number): NonEmptyTraceState {
  const trace = TraceFactory.create({ ...layerOf(chart), selectors: undefined });
  trace.moveToIndex(0, index);
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a populated trace state');
  }
  return state;
}

describe('highcharts timeline', () => {
  it('reads a timeline as a row of events rather than a scatter', () => {
    const layers = highchartsToMaidr(timelineChart()).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.TREE);
    expect(layers[0].name).toBe('Missions');
  });

  it('announces each event by its box, and no number the chart does not draw', () => {
    // Read as a scatter: "X is 0, Y is 1, Name is First artificial
    // satellite, 1957 Sputnik 1".
    const { text } = readingAt(timelineChart(), 1);

    expect(text.main).toEqual({ label: 'Event', value: 'First human spaceflight, 1961 Vostok 1' });
    expect(text.cross).toBeUndefined();
  });

  it('places an event among the rest when asked where it is', () => {
    expect(readingAt(timelineChart(), 2).treePosition).toMatchObject({ index: 2, count: 3 });
  });

  it('names its chart a timeline, with a guide to one', () => {
    const layer = layerOf(timelineChart());

    // Without it the reader was told the chart was a scatter plot "used to
    // see whether two measures are related", of a chart measuring nothing.
    expect(layer.typeLabel).toBe('Timeline');
    expect(layer.typeGuide).toEqual({
      definition: expect.stringContaining('events in the order they happened'),
      purpose: expect.any(String),
      appearance: expect.any(String),
    });
  });

  it('declares no magnitude and no axis but the events', () => {
    // The constant on `y` is not a measurement, and the hidden axes'
    // titles name nothing the chart draws.
    const layer = layerOf(timelineChart());

    expect((layer.data as TreemapPoint[]).every(point => point.y === undefined && point.path === undefined))
      .toBe(true);
    expect(layer.axes).toEqual({ x: { label: 'Event' } });
  });

  it('names each event with the whole of the box the chart draws', () => {
    // Both lines. `name` alone would drop the date on an undated timeline,
    // which is every timeline whose x axis is hidden — the ordinary case.
    expect(events(timelineChart())).toEqual([
      'First artificial satellite, 1957 Sputnik 1',
      'First human spaceflight, 1961 Vostok 1',
      'First Moon landing, 1969 Apollo 11',
    ]);
  });

  it('says an event once when its two strings are the same', () => {
    expect(events(timelineChart([{ name: 'Launch', label: 'Launch' }]))).toEqual(['Launch']);
  });

  it('names an event by whichever string it declared', () => {
    expect(events(timelineChart([{ name: 'Launch' }, { label: '1957' }, {}])))
      .toEqual(['Launch', '1957', '(blank)']);
  });

  it('tells apart two events that would be named alike', () => {
    // A tree's siblings are one node each by name: two "Launch" events would
    // be read as one, and the markers would outnumber the events.
    expect(events(timelineChart([{ name: 'Launch' }, { name: 'Landing' }, { name: 'Launch' }])))
      .toEqual(['Launch', 'Landing', 'Launch (2)']);
  });

  it('leads with the date on a timeline whose x axis counts time', () => {
    const dated = timelineChart(
      [
        { x: Date.UTC(2020, 0, 15), name: 'v1' },
        { x: Date.UTC(2023, 10, 9), name: 'v2', label: 'Second release' },
      ],
      fakeAxis({ options: { type: 'datetime', visible: false } }),
    );

    expect(events(dated)).toEqual(['Jan 15, 2020, v1', 'Nov 9, 2023, v2, Second release']);
  });

  it('takes the markers, which the scatter selector already reaches', () => {
    expect(layerOf(timelineChart()).selectors).toBe(
      '#timeline-chart .highcharts-series-group .highcharts-series-0 '
      + '.highcharts-point:not([visibility="hidden"])',
    );
  });

  it('drops an event the chart drew nothing for', () => {
    expect(events(timelineChart([
      { name: 'Launch' },
      { name: 'Cancelled', y: null },
      { name: 'Landing' },
    ]))).toEqual(['Launch', 'Landing']);
  });
});

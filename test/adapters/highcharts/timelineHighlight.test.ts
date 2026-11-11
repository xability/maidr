/**
 * @jest-environment jsdom
 */

/**
 * A Highcharts timeline's outline, on the markers the chart draws.
 *
 * The layer's selector matches every drawn marker, in event order, and the
 * tree pairs its events with those marks one for one. An event the chart
 * draws nothing for -- a gap, or one declared `visible: false` -- has no
 * marker, so it must not be one of the events either, or every event after
 * it is outlined on its neighbour's marker, or, with the counts apart,
 * nothing is outlined at all.
 */
import type { HighchartsAxis, HighchartsChart, HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import type { TraceState } from '@type/state';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Draws one marker per drawn event, as Highcharts does: in a markers group
 * that carries the series' class, inside the chart's series group.
 *
 * Built in this file's own document rather than with `./helpers`, whose
 * separate jsdom cannot load under the jsdom environment the selectors need.
 *
 * @param names - The drawn events, in order
 * @returns The chart's container
 */
function drawMarkers(names: string[]): HTMLElement {
  const container = document.createElement('div');
  container.id = 'timeline-chart';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const seriesGroup = document.createElementNS(SVG_NAMESPACE, 'g');
  seriesGroup.setAttribute('class', 'highcharts-series-group');
  const markers = document.createElementNS(SVG_NAMESPACE, 'g');
  markers.setAttribute('class', 'highcharts-markers highcharts-series-0 highcharts-timeline-series');
  for (const name of names) {
    const marker = document.createElementNS(SVG_NAMESPACE, 'path');
    marker.setAttribute('class', 'highcharts-point');
    marker.setAttribute('data-event', name);
    markers.appendChild(marker);
  }
  seriesGroup.appendChild(markers);
  svg.appendChild(seriesGroup);
  container.appendChild(svg);
  document.body.appendChild(container);
  return container;
}

/**
 * The trace a timeline of these events is read with, drawn in `container`.
 *
 * @param container - The chart's container, holding its markers
 * @param points - The events, as Highcharts reports them
 * @returns The trace
 */
function timelineTrace(container: HTMLElement, points: Partial<HighchartsPoint>[]): ReturnType<typeof TraceFactory.create> {
  const axis = { getExtremes: () => ({ min: 0, max: 100 }), options: { visible: false } } as HighchartsAxis;
  const series = {
    type: 'timeline',
    name: 'Missions',
    index: 0,
    visible: true,
    xAxis: axis,
    yAxis: axis,
    options: {},
    data: [] as HighchartsPoint[],
  } as HighchartsSeries;
  // The constant Highcharts puts on every event, a gap among them.
  series.data = points.map((point, i) => ({ x: i, y: 1, index: i, series, ...point } as HighchartsPoint));
  const chart = {
    series: [series],
    xAxis: [axis],
    yAxis: [axis],
    title: { textStr: 'Missions' },
    container,
    renderTo: container,
    options: { chart: {} },
  } as unknown as HighchartsChart;
  return TraceFactory.create(highchartsToMaidr(chart).subplots[0][0].layers[0]);
}

/**
 * The event the outline is on at a column.
 *
 * @param state - The trace state there
 * @returns The `data-event` of the outlined mark
 */
function outlined(state: TraceState): string | null {
  if (state.empty || state.highlight.empty) {
    return null;
  }
  const element = Array.isArray(state.highlight.elements) ? state.highlight.elements[0] : state.highlight.elements;
  return element.getAttribute('data-event');
}

describe('highcharts timeline outline', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('outlines each event on its own marker past an event the chart does not draw', () => {
    // Measured on Highcharts 13.1.1: the hidden event and the gap get no
    // marker, and `y` reads 1 on all five events.
    const container = drawMarkers(['Launch', 'Orbit', 'Landing']);
    const trace = timelineTrace(container, [
      { name: 'Launch' },
      { name: 'Hidden', visible: false },
      { name: 'Orbit' },
      { name: 'Scrubbed', isNull: true },
      { name: 'Landing' },
    ]);

    const reached = [0, 1, 2].map((col) => {
      trace.moveToIndex(0, col);
      const state = trace.state;
      return [state.empty ? null : state.text.main.value, outlined(state)];
    });

    expect(reached).toEqual([
      ['Launch', 'Launch'],
      ['Orbit', 'Orbit'],
      ['Landing', 'Landing'],
    ]);
  });

  it('reads a timeline the chart draws no event of as empty, without throwing', () => {
    const container = drawMarkers([]);
    const trace = timelineTrace(container, [{ name: 'Hidden', visible: false }, { name: 'Scrubbed', isNull: true }]);

    expect(trace.state.empty).toBe(true);
    expect(() => trace.moveOnce('FORWARD')).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });
});

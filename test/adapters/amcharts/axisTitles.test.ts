import type { AmAxis, AmChart } from '@adapters/amcharts/types';
import { fromAmCharts } from '@adapters/amcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { fakeBarSeries, fakeChart, fakeRoot } from './helpers';

const BAR_DATA = [
  { categoryX: 'Opening', valueY: 1200 },
  { categoryX: 'Marketing', valueY: 950 },
];

/**
 * An axis titled the way amCharts 5 documents it: no `title` setting at all,
 * and an `am5.Label` pushed into the axis' own children beside the containers
 * amCharts puts there itself.
 *
 * @param title - The drawn title, or nothing for an axis that draws none
 * @param ticks - Tick labels, kept a level down in the labels container as
 *   amCharts keeps them
 */
function drawnAxis(title?: string, ticks: string[] = []): AmAxis {
  const label = (text: string): Record<string, unknown> => ({
    className: 'Label',
    get: (key: string) => (key === 'text' ? text : undefined),
  });
  const labelsContainer = {
    className: 'Container',
    get: () => undefined,
    children: { values: ticks.map(label) },
  };
  return {
    get: () => undefined,
    dataItems: [],
    children: { values: [labelsContainer, ...(title != null ? [label(title)] : [])] },
  } as unknown as AmAxis;
}

/** A bar chart whose axes are the given ones, placed at `bounds` if given. */
function chartWithAxes(
  xAxis: AmAxis,
  yAxis: AmAxis,
  bounds?: { left: number; top: number; right: number; bottom: number },
): AmChart {
  const chart = fakeChart({ series: [fakeBarSeries('Budget', BAR_DATA)], bounds });
  chart.xAxes = { values: [xAxis] };
  chart.yAxes = { values: [yAxis] };
  return chart;
}

describe('amCharts axis titles', () => {
  it('reads the title an axis draws as a Label among its children', () => {
    // The waterfall on examples/amcharts-floating-columns.html: titles pushed
    // into the axes, no `axisLabels` option. Both used to read as "x" and "y".
    const chart = chartWithAxes(drawnAxis('Step'), drawnAxis('Amount (thousands)'));

    const layer = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers[0];

    expect(layer.axes).toEqual({
      x: { label: 'Step' },
      y: { label: 'Amount (thousands)' },
    });
  });

  it('does not take a tick label for the title', () => {
    // Tick labels live in the axis' labels container, a level down.
    const chart = chartWithAxes(
      drawnAxis('Step', ['Opening', 'Marketing']),
      drawnAxis(undefined, ['0', '500', '1,000']),
    );

    const layer = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers[0];

    expect(layer.axes?.x?.label).toBe('Step');
    expect(['0', '500', '1,000']).not.toContain(layer.axes?.y?.label);
  });

  it('names no axis the chart draws no title for', () => {
    // The two-panel example on examples/amcharts.html draws no axis titles and
    // passes no `axisLabels`, and was read as "x is Jan, y is 120", "X label
    // is x". A blank label is how a layer says it has no name for an axis.
    const chart = chartWithAxes(drawnAxis(undefined, ['Opening']), drawnAxis());

    const layer = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers[0];

    expect(layer.axes?.x?.label ?? '').toBe('');
    expect(layer.axes?.y?.label ?? '').toBe('');
  });

  it('names each panel\'s axes from the titles that panel draws', () => {
    // `axisLabels` is one setting for the whole figure, so two panels with
    // different value axes can only be told apart by what each one draws.
    const top = chartWithAxes(
      drawnAxis('Month'),
      drawnAxis('Revenue'),
      { left: 40, top: 0, right: 600, bottom: 180 },
    );
    const bottom = chartWithAxes(
      drawnAxis('Month'),
      drawnAxis('Growth rate'),
      { left: 40, top: 200, right: 600, bottom: 380 },
    );

    const { subplots } = fromAmCharts(fakeRoot([top, bottom]));

    // Rows are emitted bottom panel first.
    expect(subplots.map(row => row[0].layers[0].axes)).toEqual([
      { x: { label: 'Month' }, y: { label: 'Growth rate' } },
      { x: { label: 'Month' }, y: { label: 'Revenue' } },
    ]);
  });

  it('lets the axisLabels option override a drawn title', () => {
    const chart = chartWithAxes(drawnAxis('Step'), drawnAxis('Amount (thousands)'));

    const layer = fromAmCharts(fakeRoot([chart]), { axisLabels: { y: 'Change' } })
      .subplots[0][0]
      .layers[0];

    expect(layer.axes).toEqual({ x: { label: 'Step' }, y: { label: 'Change' } });
  });
});

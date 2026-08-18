import type { FrappeChart, FrappeChartType, FrappePanel } from '@adapters/frappe/types';
import type { BarPoint, LinePoint, MaidrLayer, PiePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { createMaidrFromFrappeChart, createMaidrFromFrappeCharts } from '@adapters/frappe/converters';
import { afterAll, beforeEach, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/** A minimal chart stub — the adapter only reads `chart.data`. */
function makeChart(values: number[] = [10, 20, 30], name = 'Series'): FrappeChart {
  return {
    data: {
      labels: ['A', 'B', 'C'].slice(0, values.length),
      datasets: [{ name, values }],
    },
  };
}

/** Builds a wrapper element containing `count` panel containers. */
function makeDom(count: number): { wrapper: HTMLElement; containers: HTMLElement[] } {
  const dom = new JSDOM('<!doctype html><html><body><div id="wrapper"></div></body></html>');
  const document = dom.window.document;
  const wrapper = document.getElementById('wrapper') as HTMLElement;
  const containers: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const container = document.createElement('div');
    wrapper.appendChild(container);
    containers.push(container);
  }
  return { wrapper, containers };
}

/**
 * Converts one chart and returns its only layer, with the container id pinned
 * to `chart` so the expected selector strings can be written out in full.
 */
function onlyLayer(
  chart: FrappeChart,
  chartType: FrappeChartType,
  axes?: { x?: string; y?: string; z?: string },
): MaidrLayer {
  const { containers } = makeDom(1);
  containers[0].id = 'chart';
  const maidr = createMaidrFromFrappeChart(chart, containers[0], {
    chartType,
    ...(axes ? { axes } : {}),
  });
  const layers = maidr.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

function panel(container: HTMLElement, title?: string, values?: number[]): FrappePanel {
  return {
    chart: makeChart(values),
    container,
    chartType: 'bar',
    ...(title ? { title } : {}),
  };
}

describe('createMaidrFromFrappeChart (single chart)', () => {
  it('produces an unchanged 1x1 figure without a subplot selector or layer title', () => {
    const { containers } = makeDom(1);
    const container = containers[0];
    container.id = 'chart';

    const maidr = createMaidrFromFrappeChart(makeChart(), container, {
      chartType: 'bar',
      title: 'My Chart',
      axes: { x: 'Category', y: 'Value' },
    });

    expect(maidr.id).toBe('chart');
    expect(maidr.title).toBe('My Chart');
    expect(maidr.subplots).toHaveLength(1);
    expect(maidr.subplots[0]).toHaveLength(1);

    const subplot = maidr.subplots[0][0];
    expect(subplot.selector).toBeUndefined();
    expect(subplot.layers).toHaveLength(1);

    const layer = subplot.layers[0];
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.title).toBeUndefined();
    expect(layer.selectors).toBe('#chart svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar');
    expect(layer.axes).toEqual({ x: { label: 'Category' }, y: { label: 'Value' } });
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'A', y: 10 },
      { x: 'B', y: 20 },
      { x: 'C', y: 30 },
    ]);
  });

  it('generates a container id when missing and uses it as the figure id', () => {
    const { containers } = makeDom(1);
    const container = containers[0];

    const maidr = createMaidrFromFrappeChart(makeChart(), container, { chartType: 'bar' });

    expect(container.id).not.toBe('');
    expect(maidr.id).toBe(container.id);
    expect(maidr.subplots[0][0].layers[0].selectors)
      .toBe(`#${container.id} svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar`);
  });
});

describe('createMaidrFromFrappeChart (area)', () => {
  /** Two series over the same months, as an overlapping area chart is built. */
  const twoSeries: FrappeChart = {
    data: {
      labels: ['Jan', 'Feb'],
      datasets: [
        { name: 'Product A', values: [18, 40] },
        { name: 'Product B', values: [36, 20] },
      ],
    },
  };

  it('emits an area layer whose selector matches the line group dots', () => {
    const layer = onlyLayer(makeChart(), 'area', { x: 'Month', y: 'Revenue' });

    expect(layer.type).toBe(TraceType.AREA);
    // The region fill is one <path> for the whole series, so the highlight
    // targets the per-point dots exactly as a line layer does.
    expect(layer.selectors)
      .toEqual(['#chart svg.frappe-chart .dataset-units.dataset-line circle']);
    expect(layer.axes).toEqual({ x: { label: 'Month' }, y: { label: 'Revenue' } });
    expect(layer.data as LinePoint[][]).toEqual([[
      { x: 'A', y: 10, z: 'Series' },
      { x: 'B', y: 20, z: 'Series' },
      { x: 'C', y: 30, z: 'Series' },
    ]]);
  });

  it('reads regionFill off the chart instance, so a line chart cannot be mislabelled', () => {
    const layer = onlyLayer({ ...makeChart(), lineOptions: { regionFill: 1 } }, 'line');

    expect(layer.type).toBe(TraceType.AREA);
  });

  it('stays a line layer when the instance does not fill the region', () => {
    const layer = onlyLayer({ ...makeChart(), lineOptions: {} }, 'line');

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('scopes one selector per series and emits a legend for overlapping bands', () => {
    const { containers } = makeDom(1);
    containers[0].id = 'chart';

    const maidr = createMaidrFromFrappeChart(twoSeries, containers[0], { chartType: 'area' });
    const subplot = maidr.subplots[0][0];

    // Plain AREA bands overlap rather than stack, so the two series are read
    // independently — the multi-line treatment, not a STACKED_AREA one.
    expect(subplot.legend).toEqual(['Product A', 'Product B']);
    expect(subplot.layers[0].selectors).toEqual([
      '#chart svg.frappe-chart .dataset-units.dataset-line.dataset-0 circle',
      '#chart svg.frappe-chart .dataset-units.dataset-line.dataset-1 circle',
    ]);
  });
});

describe('createMaidrFromFrappeChart (bump)', () => {
  /** A three-period table of ranks, 1 = best, as Frappe would be handed it. */
  const ranks: FrappeChart = {
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3'],
      datasets: [
        { name: 'Alpha', values: [1, 2, 1] },
        { name: 'Beta', values: [2, 1, 3] },
        { name: 'Gamma', values: [3, 3, 2] },
      ],
    },
  };

  it('emits a bump layer with one selector per competitor', () => {
    const { containers } = makeDom(1);
    containers[0].id = 'chart';

    const maidr = createMaidrFromFrappeChart(ranks, containers[0], {
      chartType: 'bump',
      axes: { x: 'Week', y: 'Rank' },
    });
    const subplot = maidr.subplots[0][0];
    const layer = subplot.layers[0];

    expect(layer.type).toBe(TraceType.BUMP);
    expect(subplot.legend).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(layer.selectors).toEqual([
      '#chart svg.frappe-chart .dataset-units.dataset-line.dataset-0 circle',
      '#chart svg.frappe-chart .dataset-units.dataset-line.dataset-1 circle',
      '#chart svg.frappe-chart .dataset-units.dataset-line.dataset-2 circle',
    ]);
  });

  it('emits the true rank, leaving the inversion to the trace', () => {
    const layer = onlyLayer(ranks, 'bump');

    // Frappe cannot reverse an axis, so a rank chart it draws puts rank 1 at
    // the bottom. The values must still be the ranks themselves: BumpTrace
    // inverts the pitch, and pre-inverted values would announce wrong ranks.
    expect((layer.data as LinePoint[][])[1]).toEqual([
      { x: 'Week 1', y: 2, z: 'Beta' },
      { x: 'Week 2', y: 1, z: 'Beta' },
      { x: 'Week 3', y: 3, z: 'Beta' },
    ]);
  });
});

describe('createMaidrFromFrappeChart (dot)', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    warn.mockClear();
  });

  afterAll(() => {
    warn.mockRestore();
  });

  it('emits a category/value dot layer highlighting the first dataset\'s dots', () => {
    const layer = onlyLayer(makeChart(), 'dot', { x: 'Region', y: 'Sales' });

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(layer.selectors)
      .toBe('#chart svg.frappe-chart .dataset-units.dataset-line.dataset-0 circle');
    expect(layer.axes).toEqual({ x: { label: 'Region' }, y: { label: 'Sales' } });
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'A', y: 10 },
      { x: 'B', y: 20 },
      { x: 'C', y: 30 },
    ]);
  });

  it('converts a scatter over category labels as a dot plot instead', () => {
    const layer = onlyLayer(makeChart(), 'scatter');

    // `Number('A')` is NaN, so a scatter layer built from these labels would
    // have no x values at all — and Frappe spaces the marks evenly anyway.
    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'A', y: 10 },
      { x: 'B', y: 20 },
      { x: 'C', y: 30 },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps a scatter over numeric labels a scatter plot', () => {
    const layer = onlyLayer(
      { data: { labels: [10, 20, 30], datasets: [{ name: 'Temp', values: [22, 25, 28] }] } },
      'scatter',
    );

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 10, y: 22 },
      { x: 20, y: 25 },
      { x: 30, y: 28 },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats a blank label as a category rather than as zero', () => {
    const layer = onlyLayer(
      { data: { labels: ['1', ' ', '3'], datasets: [{ values: [4, 5, 6] }] } },
      'scatter',
    );

    expect(layer.type).toBe(TraceType.DOT);
  });

  it('warns that only the first dataset of a multi-series dot plot is converted', () => {
    onlyLayer(
      {
        data: {
          labels: ['A', 'B'],
          datasets: [{ name: 'One', values: [1, 2] }, { name: 'Two', values: [3, 4] }],
        },
      },
      'dot',
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('2 datasets');
  });
});

describe('createMaidrFromFrappeChart (diverging)', () => {
  /** Men drawn below the zero line, women above, as Frappe renders them. */
  const pyramid: FrappeChart = {
    data: {
      labels: ['0-14', '15-29'],
      datasets: [
        { name: 'Men', values: [-1200, -1150] },
        { name: 'Women', values: [1140, 1100] },
      ],
    },
  };

  it('emits both sides as one segmented layer, signed as the chart draws them', () => {
    const layer = onlyLayer(pyramid, 'diverging', {
      x: 'Age band',
      y: 'People, thousands',
      z: 'Sex',
    });

    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(layer.axes).toEqual({
      x: { label: 'Age band' },
      y: { label: 'People, thousands' },
      z: { label: 'Sex' },
    });
    // The sign is a direction, not a magnitude: DivergingTrace takes the size
    // for the pitch and names the side, so stripping it here would leave it
    // nothing to name the sides with.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [
        { x: '0-14', y: -1200, z: 'Men' },
        { x: '15-29', y: -1150, z: 'Men' },
      ],
      [
        { x: '0-14', y: 1140, z: 'Women' },
        { x: '15-29', y: 1100, z: 'Women' },
      ],
    ]);
  });

  it('maps one broad selector across both dataset groups in series-major order', () => {
    const layer = onlyLayer(pyramid, 'diverging');

    // A segmented trace takes ONE selector and splits the match itself, so
    // this is the all-groups selector; Frappe appends dataset 0's rects and
    // then dataset 1's, which is what `order: 'row'` names.
    expect(layer.selectors)
      .toBe('#chart svg.frappe-chart .dataset-units.dataset-bars rect.bar');
    expect(layer.domMapping).toEqual({ order: 'row' });
  });

  it('names an unnamed side by its position so the two stay tellable apart', () => {
    const layer = onlyLayer(
      { data: { labels: ['A'], datasets: [{ values: [-1] }, { values: [2] }] } },
      'diverging',
    );

    expect((layer.data as SegmentedPoint[][]).map(side => side[0].z))
      .toEqual(['Series 1', 'Series 2']);
  });

  it('ignores zeros and gaps when reading which side a series is on', () => {
    const layer = onlyLayer(
      {
        data: {
          labels: ['A', 'B'],
          datasets: [
            { name: 'Down', values: [0, -5] },
            { name: 'Up', values: [3, 0] },
          ],
        },
      },
      'diverging',
    );

    expect(layer.type).toBe(TraceType.DIVERGING);
  });

  it('refuses a chart that is not two sided', () => {
    expect(() => onlyLayer(makeChart(), 'diverging')).toThrow('exactly two datasets');
  });

  it('refuses two series that grow the same way', () => {
    expect(() => onlyLayer(
      {
        data: {
          labels: ['A'],
          datasets: [{ name: 'One', values: [1] }, { name: 'Two', values: [2] }],
        },
      },
      'diverging',
    )).toThrow('opposite signs');
  });

  it('refuses a series that crosses the zero line, which has no side', () => {
    expect(() => onlyLayer(
      {
        data: {
          labels: ['A', 'B'],
          datasets: [
            { name: 'Mixed', values: [-1, 2] },
            { name: 'Up', values: [3, 4] },
          ],
        },
      },
      'diverging',
    )).toThrow('opposite signs');
  });
});

describe('createMaidrFromFrappeChart (pie and donut)', () => {
  /** A chart whose labels each carry one value, as a pie is normally built. */
  function makePieChart(
    slices: Array<[string, number]>,
    config?: { maxSlices?: number },
  ): FrappeChart {
    return {
      data: {
        labels: slices.map(([label]) => label),
        datasets: [{ name: 'Sales', values: slices.map(([, value]) => value) }],
      },
      ...(config ? { config } : {}),
    };
  }

  function pieLayer(chart: FrappeChart, chartType: 'donut' | 'pie'): MaidrLayer {
    const { containers } = makeDom(1);
    containers[0].id = 'chart';
    const maidr = createMaidrFromFrappeChart(chart, containers[0], { chartType });
    return maidr.subplots[0][0].layers[0];
  }

  it('emits a flat pie layer whose selector matches the pie wedges', () => {
    const layer = pieLayer(
      makePieChart([['Apples', 30], ['Bananas', 50], ['Cherries', 20]]),
      'pie',
    );

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.selectors).toBe('#chart svg.frappe-chart .pie-slices path.pie-path');
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
  });

  it('targets the donut components for a donut chart', () => {
    const layer = pieLayer(makePieChart([['Apples', 30]]), 'donut');

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.selectors).toBe('#chart svg.frappe-chart .donut-slices path.donut-path');
  });

  it('names the two dimensions when the caller supplies no axis labels', () => {
    const layer = pieLayer(makePieChart([['Apples', 30]]), 'pie');

    expect(layer.axes).toEqual({ x: { label: 'Label' }, y: { label: 'Value' } });
  });

  it('keeps caller-supplied axis labels', () => {
    const { containers } = makeDom(1);
    const maidr = createMaidrFromFrappeChart(
      makePieChart([['Apples', 30]]),
      containers[0],
      { chartType: 'pie', axes: { x: 'Fruit', y: 'Units' } },
    );

    expect(maidr.subplots[0][0].layers[0].axes)
      .toEqual({ x: { label: 'Fruit' }, y: { label: 'Units' } });
  });

  it('sums every dataset at each label, as Frappe does before drawing', () => {
    const layer = pieLayer(
      {
        data: {
          labels: ['Apples', 'Bananas'],
          datasets: [
            { name: 'Q1', values: [10, 20] },
            { name: 'Q2', values: [5, 1] },
          ],
        },
      },
      'pie',
    );

    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 15 },
      { x: 'Bananas', y: 21 },
    ]);
  });

  it('drops labels Frappe draws no wedge for, keeping slice k aligned with wedge k', () => {
    const layer = pieLayer(
      makePieChart([['Apples', 30], ['Owed', -5], ['Cherries', 20]]),
      'pie',
    );

    // The negative total gets no wedge, so carrying it would slide Cherries'
    // highlight onto the wedge before it. A zero total is a real slice.
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Cherries', y: 20 },
    ]);
  });

  it('collapses everything past maxSlices into one Rest slice, largest first', () => {
    const layer = pieLayer(
      makePieChart([['A', 1], ['B', 5], ['C', 3], ['D', 2]], { maxSlices: 3 }),
      'pie',
    );

    expect(layer.data as PiePoint[]).toEqual([
      { x: 'B', y: 5 },
      { x: 'C', y: 3 },
      { x: 'Rest', y: 3 },
    ]);
  });

  it('leaves the label order alone while the slices fit within maxSlices', () => {
    const layer = pieLayer(
      makePieChart([['A', 1], ['B', 5], ['C', 3]], { maxSlices: 3 }),
      'pie',
    );

    expect((layer.data as PiePoint[]).map(point => point.x)).toEqual(['A', 'B', 'C']);
  });
});

describe('createMaidrFromFrappeChart (percentage)', () => {
  /**
   * A percentage chart is built from the same `{ labels, datasets }` as a pie —
   * Frappe draws both from `AggregationChart.calc()` — so the fixture is the
   * pie's.
   */
  function makePercentageChart(
    bands: Array<[string, number]>,
    config?: { maxSlices?: number },
  ): FrappeChart {
    return {
      data: {
        labels: bands.map(([label]) => label),
        datasets: [{ name: 'Sessions', values: bands.map(([, value]) => value) }],
      },
      ...(config ? { config } : {}),
    };
  }

  function percentageLayer(
    chart: FrappeChart,
    axes?: { x?: string; y?: string; z?: string },
  ): MaidrLayer {
    const { containers } = makeDom(1);
    containers[0].id = 'chart';
    const maidr = createMaidrFromFrappeChart(chart, containers[0], {
      chartType: 'percentage',
      ...(axes ? { axes } : {}),
    });
    return maidr.subplots[0][0].layers[0];
  }

  it('reads the one bar as a normalized stack of one column', () => {
    // Frappe draws a single bar divided into labelled bands. That is a 100%
    // stacked bar whose column count happens to be one — the bands are the
    // series, so Up/Down walks them and Left/Right has nowhere to go.
    const layer = percentageLayer(makePercentageChart([
      ['Direct', 400],
      ['Search', 300],
      ['Social', 200],
      ['Referral', 100],
    ]));

    expect(layer.type).toBe(TraceType.NORMALIZED);
    // Horizontal, so the share is on `x` and the one column's name on `y`.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [{ x: 40, y: 'Total', z: 'Direct' }],
      [{ x: 30, y: 'Total', z: 'Search' }],
      [{ x: 20, y: 'Total', z: 'Social' }],
      [{ x: 10, y: 'Total', z: 'Referral' }],
    ]);
  });

  it('announces the shares the chart draws, not the counts the author wrote', () => {
    // `NORMALIZED` divides nothing itself, so passing the counts through would
    // pitch 1 against 3 as a three-fold rise while the chart shows a quarter of
    // the bar against three quarters of it.
    const layer = percentageLayer(makePercentageChart([['Failed', 1], ['Passed', 3]]));

    expect((layer.data as SegmentedPoint[][]).map(band => band[0].x)).toEqual([25, 75]);
  });

  it('leaves values already written as percentages where they are', () => {
    const layer = percentageLayer(makePercentageChart([['Failed', 25], ['Passed', 75]]));

    expect((layer.data as SegmentedPoint[][]).map(band => band[0].x)).toEqual([25, 75]);
  });

  it('names the share and the column when the caller supplies no axis labels', () => {
    const layer = percentageLayer(makePercentageChart([['Direct', 400]]));

    expect(layer.axes).toEqual({ x: { label: 'Share' }, y: { label: 'Total' } });
  });

  it('keeps caller-supplied axis labels, including the one naming the bands', () => {
    const layer = percentageLayer(
      makePercentageChart([['Direct', 400]]),
      { x: 'Percent of sessions', y: 'All traffic', z: 'Channel' },
    );

    expect(layer.axes).toEqual({
      x: { label: 'Percent of sessions' },
      y: { label: 'All traffic' },
      z: { label: 'Channel' },
    });
  });

  it('sums every dataset at each label, as Frappe does before drawing', () => {
    const layer = percentageLayer({
      data: {
        labels: ['Apples', 'Bananas'],
        datasets: [
          { name: 'Q1', values: [10, 20] },
          { name: 'Q2', values: [5, 5] },
        ],
      },
    });

    // 15 and 25 of 40.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [{ x: 37.5, y: 'Total', z: 'Apples' }],
      [{ x: 62.5, y: 'Total', z: 'Bananas' }],
    ]);
  });

  it('drops labels Frappe draws no band for, and their values with them', () => {
    const layer = percentageLayer(
      makePercentageChart([['Apples', 30], ['Owed', -5], ['Cherries', 20]]),
    );

    // Carrying the negative would slide Cherries' highlight onto the band
    // before it — and it is out of the denominator too, which is why the two
    // remaining bands are 60/40 of 50 rather than shares of 45.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [{ x: 60, y: 'Total', z: 'Apples' }],
      [{ x: 40, y: 'Total', z: 'Cherries' }],
    ]);
  });

  it('collapses everything past maxSlices into one Rest band, largest first', () => {
    const layer = percentageLayer(
      makePercentageChart([['A', 1], ['B', 5], ['C', 3], ['D', 1]], { maxSlices: 3 }),
    );

    // Measured against Frappe v1.6.2: a percentage chart and a pie given the
    // same data produce identical `state.labels` and `state.sliceTotals`, the
    // sort and the Rest wedge included.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [{ x: 50, y: 'Total', z: 'B' }],
      [{ x: 30, y: 'Total', z: 'C' }],
      [{ x: 20, y: 'Total', z: 'Rest' }],
    ]);
  });

  it('leaves the label order alone while the bands fit within maxSlices', () => {
    const layer = percentageLayer(
      makePercentageChart([['A', 10], ['B', 50], ['C', 40]], { maxSlices: 3 }),
    );

    expect((layer.data as SegmentedPoint[][]).map(band => band[0].z))
      .toEqual(['A', 'B', 'C']);
  });
});

describe('createMaidrFromFrappeCharts (multi-panel)', () => {
  it('maps a 2D panel grid 1:1 to subplots, allowing ragged rows', () => {
    const { wrapper, containers } = makeDom(3);

    const maidr = createMaidrFromFrappeCharts(
      [
        [panel(containers[0], 'North'), panel(containers[1], 'South')],
        [panel(containers[2], 'East')],
      ],
      wrapper,
    );

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(1);
  });

  it('places a flat panel array in a single row when columns is omitted', () => {
    const { wrapper, containers } = makeDom(3);

    const maidr = createMaidrFromFrappeCharts(containers.map(c => panel(c)), wrapper);

    expect(maidr.subplots).toHaveLength(1);
    expect(maidr.subplots[0]).toHaveLength(3);
  });

  it('chunks a flat panel array into rows of `columns` panels (row-major)', () => {
    const { wrapper, containers } = makeDom(3);

    const maidr = createMaidrFromFrappeCharts(
      [panel(containers[0], 'A'), panel(containers[1], 'B'), panel(containers[2], 'C')],
      wrapper,
      { columns: 2 },
    );

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(1);
    expect(maidr.subplots[0][0].layers[0].title).toBe('A');
    expect(maidr.subplots[0][1].layers[0].title).toBe('B');
    expect(maidr.subplots[1][0].layers[0].title).toBe('C');
  });

  it('scopes each panel\'s layer selectors to its own container id, without a subplot selector', () => {
    const { wrapper, containers } = makeDom(2);

    const maidr = createMaidrFromFrappeCharts(
      [[panel(containers[0]), panel(containers[1])]],
      wrapper,
    );

    const [first, second] = maidr.subplots[0];
    const firstId = containers[0].id;
    const secondId = containers[1].id;

    expect(firstId).not.toBe('');
    expect(secondId).not.toBe('');
    expect(firstId).not.toBe(secondId);

    // No subplot selector: the core would clone its match as a hidden
    // sibling, and Frappe's only whole-panel element is the top-level
    // `svg.frappe-chart` in HTML flow — its clone would double the panel's
    // height on every focus. Panel geometry is resolved from the first layer
    // selector instead (see multiPanelLayout.test.ts).
    expect(first.selector).toBeUndefined();
    expect(second.selector).toBeUndefined();
    expect(first.layers[0].selectors)
      .toBe(`#${firstId} svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar`);
    expect(second.layers[0].selectors)
      .toBe(`#${secondId} svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar`);
  });

  it('puts the panel title on the first layer only', () => {
    const { wrapper, containers } = makeDom(1);
    const mixed: FrappePanel = {
      chart: {
        data: {
          labels: ['A', 'B'],
          datasets: [
            { name: 'Sales', chartType: 'bar', values: [1, 2] },
            { name: 'Trend', chartType: 'line', values: [3, 4] },
          ],
        },
      },
      container: containers[0],
      chartType: 'axis-mixed',
      title: 'Store One',
    };

    const maidr = createMaidrFromFrappeCharts([[mixed]], wrapper);
    const layers = maidr.subplots[0][0].layers;

    expect(layers).toHaveLength(2);
    expect(layers[0].title).toBe('Store One');
    expect(layers[1].title).toBe('Trend');
  });

  it('assigns figure-unique layer ids across all panels', () => {
    const { wrapper, containers } = makeDom(4);

    const maidr = createMaidrFromFrappeCharts(
      [
        [panel(containers[0]), panel(containers[1])],
        [panel(containers[2]), panel(containers[3])],
      ],
      wrapper,
    );

    const ids = maidr.subplots
      .flat()
      .flatMap(subplot => subplot.layers.map((layer: MaidrLayer) => layer.id));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the wrapper id as the figure id, generating one when missing', () => {
    const { wrapper, containers } = makeDom(1);
    wrapper.removeAttribute('id');

    const maidr = createMaidrFromFrappeCharts([[panel(containers[0])]], wrapper);

    expect(wrapper.id).not.toBe('');
    expect(maidr.id).toBe(wrapper.id);
  });

  it('honors figure-level options', () => {
    const { wrapper, containers } = makeDom(1);

    const maidr = createMaidrFromFrappeCharts([[panel(containers[0])]], wrapper, {
      id: 'dashboard',
      title: 'Dashboard',
      subtitle: 'Q1',
      caption: 'Source: internal',
    });

    expect(maidr.id).toBe('dashboard');
    expect(maidr.title).toBe('Dashboard');
    expect(maidr.subtitle).toBe('Q1');
    expect(maidr.caption).toBe('Source: internal');
  });

  it('emits a per-panel legend for multi-line panels', () => {
    const { wrapper, containers } = makeDom(1);
    const multiLine: FrappePanel = {
      chart: {
        data: {
          labels: ['A', 'B'],
          datasets: [
            { name: 'One', values: [1, 2] },
            { name: 'Two', values: [3, 4] },
          ],
        },
      },
      container: containers[0],
      chartType: 'line',
      title: 'Lines',
    };

    const maidr = createMaidrFromFrappeCharts([[multiLine]], wrapper);

    expect(maidr.subplots[0][0].legend).toEqual(['One', 'Two']);
  });

  it('throws for an empty panel grid', () => {
    const { wrapper } = makeDom(0);

    expect(() => createMaidrFromFrappeCharts([], wrapper)).toThrow('at least one panel');
  });

  it('throws for an empty row in a 2D grid', () => {
    const { wrapper, containers } = makeDom(1);

    expect(() => createMaidrFromFrappeCharts([[panel(containers[0])], []], wrapper))
      .toThrow('row 1 is empty');
  });

  it('throws for a non-positive or fractional columns value', () => {
    const { wrapper, containers } = makeDom(1);

    expect(() => createMaidrFromFrappeCharts([panel(containers[0])], wrapper, { columns: 0 }))
      .toThrow('columns');
    expect(() => createMaidrFromFrappeCharts([panel(containers[0])], wrapper, { columns: 1.5 }))
      .toThrow('columns');
  });

  it('throws when a panel container is not a descendant of the wrapper', () => {
    const { wrapper, containers } = makeDom(1);
    const outside = wrapper.ownerDocument.createElement('div');
    wrapper.ownerDocument.body.appendChild(outside);

    expect(() =>
      createMaidrFromFrappeCharts([[panel(containers[0]), panel(outside)]], wrapper),
    ).toThrow('descendant of the wrapper');
  });

  it('throws when a panel container is the wrapper itself', () => {
    const { wrapper } = makeDom(0);

    expect(() => createMaidrFromFrappeCharts([[panel(wrapper)]], wrapper))
      .toThrow('descendant of the wrapper');
  });
});

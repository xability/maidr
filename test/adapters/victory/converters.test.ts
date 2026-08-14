import type { VictoryLayerInfo } from '@adapters/victory/types';
import type { BarPoint, SegmentedPoint } from '@type/grammar';
import type { ReactNode } from 'react';
import {
  computeSubplotGrid,
  extractVictoryLayers,
  extractVictorySubplots,
  toMaidrLayer,
} from '@adapters/victory/converters';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { createElement } from 'react';

// ---------------------------------------------------------------------------
// Victory component stubs
//
// The extraction only reads `displayName` (must start with 'Victory') and the
// element props, so lightweight stubs avoid pulling the real Victory renderer
// into unit tests.
// ---------------------------------------------------------------------------

interface VictoryStub {
  (props: Record<string, unknown>): null;
  displayName: string;
}

function stub(displayName: string): VictoryStub {
  const component = (): null => null;
  component.displayName = displayName;
  return component as VictoryStub;
}

const VictoryChart = stub('VictoryChart');
const VictoryAxis = stub('VictoryAxis');
const VictoryArea = stub('VictoryArea');
const VictoryBar = stub('VictoryBar');
const VictoryErrorBar = stub('VictoryErrorBar');
const VictoryLine = stub('VictoryLine');
const VictoryScatter = stub('VictoryScatter');
const VictoryStack = stub('VictoryStack');
const VictoryPie = stub('VictoryPie');

const barData = [
  { x: 'A', y: 1 },
  { x: 'B', y: 2 },
];
const lineData = [
  { x: 1, y: 10 },
  { x: 2, y: 20 },
];
const scatterData = [
  { x: 1, y: 2 },
  { x: 3, y: 4 },
];
const pieData = [
  { x: 'Apples', y: 30 },
  { x: 'Bananas', y: 50 },
  { x: 'Cherries', y: 20 },
];

function chart(props: Record<string, unknown>, ...children: ReactNode[]): ReactNode {
  return createElement(VictoryChart, props, ...children);
}

describe('extractVictoryLayers (single-panel, legacy)', () => {
  it('flattens a single chart into monotonic layer ids', () => {
    const children = chart(
      {},
      createElement(VictoryAxis, { label: 'Category' }),
      createElement(VictoryAxis, { dependentAxis: true, label: 'Value' }),
      createElement(VictoryBar, { data: barData }),
      createElement(VictoryLine, { data: lineData }),
    );

    const layers = extractVictoryLayers(children);

    expect(layers).toHaveLength(2);
    expect(layers[0].id).toBe('0');
    expect(layers[0].victoryType).toBe('VictoryBar');
    expect(layers[0].xAxisLabel).toBe('Category');
    expect(layers[0].yAxisLabel).toBe('Value');
    expect(layers[1].id).toBe('1');
    expect(layers[1].victoryType).toBe('VictoryLine');
  });

  it('keeps monotonic ids across multiple top-level charts (flat public API)', () => {
    const children = [
      chart({ key: 'a' }, createElement(VictoryBar, { data: barData })),
      chart({ key: 'b' }, createElement(VictoryLine, { data: lineData })),
      chart({ key: 'c' }, createElement(VictoryScatter, { data: scatterData })),
    ];

    const layers = extractVictoryLayers(children);

    expect(layers.map(l => l.id)).toEqual(['0', '1', '2']);
    expect(layers.map(l => l.victoryType)).toEqual(['VictoryBar', 'VictoryLine', 'VictoryScatter']);
  });

  it('extracts standalone data components outside any chart', () => {
    const children = [
      createElement(VictoryScatter, { key: 's1', data: scatterData }),
      createElement(VictoryBar, { key: 'b1', data: barData }),
    ];

    const layers = extractVictoryLayers(children);

    expect(layers.map(l => l.id)).toEqual(['0', '1']);
    expect(layers.map(l => l.victoryType)).toEqual(['VictoryScatter', 'VictoryBar']);
  });
});

describe('extractVictorySubplots', () => {
  it('returns one legacy subplot for a single chart (ids unchanged)', () => {
    const children = chart(
      { title: 'Ignored in single-panel mode' },
      createElement(VictoryBar, { data: barData }),
      createElement(VictoryLine, { data: lineData }),
    );

    const subplots = extractVictorySubplots(children);

    expect(subplots).toHaveLength(1);
    expect(subplots[0].title).toBeUndefined();
    expect(subplots[0].layers.map(l => l.id)).toEqual(['0', '1']);
  });

  it('returns one legacy subplot for standalone-only content', () => {
    const children = [
      createElement(VictoryScatter, { key: 's1', data: scatterData }),
      createElement(VictoryScatter, { key: 's2', data: scatterData }),
    ];

    const subplots = extractVictorySubplots(children);

    expect(subplots).toHaveLength(1);
    expect(subplots[0].layers.map(l => l.id)).toEqual(['0', '1']);
  });

  it('flattens one chart plus standalone siblings into a single legacy subplot', () => {
    const children = [
      chart({ key: 'c' }, createElement(VictoryBar, { data: barData })),
      createElement(VictoryScatter, { key: 's', data: scatterData }),
    ];

    const subplots = extractVictorySubplots(children);

    expect(subplots).toHaveLength(1);
    expect(subplots[0].layers.map(l => l.id)).toEqual(['0', '1']);
  });

  it('creates one subplot per chart with panel-scoped ids and per-chart axes', () => {
    const children = [
      chart(
        { key: 'a', title: 'Panel A' },
        createElement(VictoryAxis, { label: 'Quarter' }),
        createElement(VictoryAxis, { dependentAxis: true, label: 'Revenue' }),
        createElement(VictoryBar, { data: barData }),
        createElement(VictoryLine, { data: lineData }),
      ),
      chart(
        { key: 'b', title: 'Panel B' },
        createElement(VictoryAxis, { label: 'Month' }),
        createElement(VictoryLine, { data: lineData }),
      ),
    ];

    const subplots = extractVictorySubplots(children);

    expect(subplots).toHaveLength(2);
    expect(subplots[0].title).toBe('Panel A');
    expect(subplots[0].layers.map(l => l.id)).toEqual(['0_0', '0_1']);
    expect(subplots[0].layers[0].xAxisLabel).toBe('Quarter');
    expect(subplots[0].layers[0].yAxisLabel).toBe('Revenue');
    expect(subplots[1].title).toBe('Panel B');
    expect(subplots[1].layers.map(l => l.id)).toEqual(['1_0']);
    expect(subplots[1].layers[0].xAxisLabel).toBe('Month');
    expect(subplots[1].layers[0].yAxisLabel).toBeUndefined();
    expect(subplots.map(s => s.svgIndex)).toEqual([0, 1]);
  });

  it('keeps empty-chart entries so panel indices stay svg-aligned', () => {
    const children = [
      chart({ key: 'a' }, createElement(VictoryBar, { data: barData })),
      chart({ key: 'b' }), // no supported data components
      chart({ key: 'c' }, createElement(VictoryLine, { data: lineData })),
    ];

    const subplots = extractVictorySubplots(children);

    expect(subplots).toHaveLength(3);
    expect(subplots[0].layers.map(l => l.id)).toEqual(['0_0']);
    expect(subplots[1].layers).toHaveLength(0);
    expect(subplots[2].layers.map(l => l.id)).toEqual(['2_0']);
  });

  it('handles VictoryStack inside a panel', () => {
    const children = [
      chart({ key: 'a' }, createElement(VictoryBar, { data: barData })),
      chart(
        { key: 'b' },
        createElement(
          VictoryStack,
          {},
          createElement(VictoryBar, { name: 'S1', data: barData }),
          createElement(VictoryBar, { name: 'S2', data: barData }),
        ),
      ),
    ];

    const subplots = extractVictorySubplots(children);

    expect(subplots[1].layers).toHaveLength(1);
    expect(subplots[1].layers[0].id).toBe('1_0');
    expect(subplots[1].layers[0].victoryType).toBe('VictoryStack');
    expect(subplots[1].layers[0].legend).toEqual(['S1', 'S2']);
  });

  it('ignores standalone data siblings in multi-panel mode with a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const children = [
        chart({ key: 'a' }, createElement(VictoryBar, { data: barData })),
        createElement(VictoryScatter, { key: 's', data: scatterData }),
        chart({ key: 'b' }, createElement(VictoryLine, { data: lineData })),
      ];

      const subplots = extractVictorySubplots(children);

      expect(subplots).toHaveLength(2);
      expect(subplots.flatMap(s => s.layers.map(l => l.victoryType)))
        .toEqual(['VictoryBar', 'VictoryLine']);
      // The standalone sibling still renders its own svg, so the second
      // chart's svg is the third one in the container.
      expect(subplots.map(s => s.svgIndex)).toEqual([0, 2]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('advances the svg ordinal for every Victory component but not plain elements', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const VictoryLegend = stub('VictoryLegend');
      const children = [
        createElement('div', { key: 'd' }), // renders no Victory svg
        createElement(VictoryLegend, { key: 'l' }), // renders its own svg, no data
        chart({ key: 'a' }, createElement(VictoryBar, { data: barData })),
        chart({ key: 'b' }, createElement(VictoryLine, { data: lineData })),
      ];

      const subplots = extractVictorySubplots(children);

      expect(subplots.map(s => s.svgIndex)).toEqual([1, 2]);
      // A legend carries no data layers, so no standalone-data warning fires.
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('computeSubplotGrid', () => {
  const panels = ['a', 'b', 'c', 'd', 'e'];

  it('defaults to a single row in panel order', () => {
    expect(computeSubplotGrid(panels)).toEqual([['a', 'b', 'c', 'd', 'e']]);
  });

  it('chunks row-major by columns', () => {
    expect(computeSubplotGrid(['a', 'b', 'c', 'd'], { columns: 2 }))
      .toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('allows a ragged last row and never emits empty rows', () => {
    expect(computeSubplotGrid(panels, { columns: 2 }))
      .toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('derives columns from rows when columns is omitted', () => {
    expect(computeSubplotGrid(panels, { rows: 2 }))
      .toEqual([['a', 'b', 'c'], ['d', 'e']]);
  });

  it('prefers columns over rows when both are given', () => {
    expect(computeSubplotGrid(['a', 'b', 'c', 'd'], { rows: 4, columns: 4 }))
      .toEqual([['a', 'b', 'c', 'd']]);
  });

  it('ignores non-positive layout values', () => {
    expect(computeSubplotGrid(['a', 'b'], { rows: 0, columns: -1 }))
      .toEqual([['a', 'b']]);
  });

  it('returns an empty grid for no panels', () => {
    expect(computeSubplotGrid([], { columns: 2 })).toEqual([]);
  });
});

describe('toMaidrLayer', () => {
  it('converts a bar layer preserving its id and axes', () => {
    const info: VictoryLayerInfo = {
      id: '1_0',
      victoryType: 'VictoryBar',
      data: { kind: 'bar', points: barData as BarPoint[] },
      xAxisLabel: 'X',
      yAxisLabel: 'Y',
      dataCount: 2,
    };

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-1-0]');

    expect(layer.id).toBe('1_0');
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.selectors).toBe('#mv [data-maidr-victory-1-0]');
    expect(layer.axes?.x).toEqual({ label: 'X' });
  });

  it.each([
    ['step', 'mid'],
    ['stepBefore', 'vh'],
    ['stepAfter', 'hv'],
  ])('converts an interpolation %s line into a step layer jumping %s', (interpolation, direction) => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryLine, { data: lineData, interpolation })),
    );

    const layer = toMaidrLayer(info, '#mv path');

    expect(layer.type).toBe(TraceType.STEP);
    expect(layer.stepDirection).toBe(direction);
    expect(layer.data).toEqual([[{ x: 1, y: 10 }, { x: 2, y: 20 }]]);
  });

  it.each([undefined, 'linear', 'monotoneX'])(
    'keeps an interpolated line a line (%s)',
    (interpolation) => {
      const [info] = extractVictoryLayers(
        chart({}, createElement(VictoryLine, { data: lineData, interpolation })),
      );

      const layer = toMaidrLayer(info, '#mv path');

      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.stepDirection).toBeUndefined();
    },
  );

  it('keeps a line a line when interpolation is a custom curve function', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryLine, { data: lineData, interpolation: () => null })),
    );

    expect(toMaidrLayer(info, '#mv path').type).toBe(TraceType.LINE);
  });

  it('converts a pie layer to a flat PiePoint[] with named axes', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryPie, { data: pieData }),
    );

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.selectors).toBe('#mv [data-maidr-victory-0]');
    // A standalone VictoryPie has no VictoryAxis, so the adapter names what the
    // two positions mean rather than leaving the core to announce "X"/"Y".
    expect(layer.axes?.x).toEqual({ label: 'Category' });
    expect(layer.axes?.y).toEqual({ label: 'Value' });
    // Flat, never nested, and with no producer-authored percentage.
    expect(layer.data).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
    expect(layer.orientation).toBeUndefined();
  });

  it('prefers an enclosing chart axis label over the pie fallback', () => {
    const [info] = extractVictoryLayers(
      chart(
        {},
        createElement(VictoryAxis, { label: 'Fruit' }),
        createElement(VictoryPie, { data: pieData }),
      ),
    );

    const layer = toMaidrLayer(info);

    expect(layer.axes?.x).toEqual({ label: 'Fruit' });
    expect(layer.axes?.y).toEqual({ label: 'Value' });
  });

  it('coerces a pie slice magnitude to a number', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryPie, { data: [{ x: 'Apples', y: '30' }] }),
    );

    expect(toMaidrLayer(info).data).toEqual([{ x: 'Apples', y: 30 }]);
  });

  it('reads pie accessors declared as prop keys', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryPie, {
        data: [{ fruit: 'Apples', units: 30 }],
        x: 'fruit',
        y: 'units',
      }),
    );

    expect(toMaidrLayer(info).data).toEqual([{ x: 'Apples', y: 30 }]);
  });

  it('converts a segmented layer to stacked type', () => {
    const points: SegmentedPoint[][] = [[{ x: 'A', y: 1, z: 'S1' }]];
    const info: VictoryLayerInfo = {
      id: '0_0',
      victoryType: 'VictoryStack',
      data: { kind: 'segmented', points },
      dataCount: 1,
      legend: ['S1'],
    };

    const layer = toMaidrLayer(info);

    expect(layer.type).toBe(TraceType.STACKED);
    expect(layer.selectors).toBeUndefined();
  });
});

describe('area', () => {
  it('converts a VictoryArea to an area layer of line points', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryArea, { data: lineData })),
    );

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(info.victoryType).toBe('VictoryArea');
    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.data).toEqual([[{ x: 1, y: 10 }, { x: 2, y: 20 }]]);
    // A line-shaped trace counts its selectors against its series, so a single
    // series has to arrive as a one-entry array rather than as a bare string.
    expect(layer.selectors).toEqual(['#mv [data-maidr-victory-0]']);
  });

  it('reads area accessors declared as prop keys', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryArea, {
        data: [{ year: 2020, sales: '5' }],
        x: 'year',
        y: 'sales',
      }),
    );

    expect(toMaidrLayer(info).data).toEqual([[{ x: 2020, y: 5 }]]);
  });

  it('ignores interpolation, which names the curve rather than the chart', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryArea, { data: lineData, interpolation: 'stepAfter' })),
    );

    const layer = toMaidrLayer(info);

    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.stepDirection).toBeUndefined();
  });
});

describe('stacked area', () => {
  const bands = [
    { name: 'Solar', data: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] },
    { name: 'Wind', data: [{ x: 2020, y: 3 }, { x: 2021, y: 4 }] },
  ];

  function areaStack(children: { name: string; data: unknown[] }[]): ReactNode {
    return chart(
      {},
      createElement(
        VictoryStack,
        {},
        ...children.map(({ name, data }) => createElement(VictoryArea, { key: name, name, data })),
      ),
    );
  }

  it('converts a stack of areas to bands carrying their own values', () => {
    const [info] = extractVictoryLayers(areaStack(bands));

    const layer = toMaidrLayer(info, ['#mv [band-0]', '#mv [band-1]']);

    expect(info.victoryType).toBe('VictoryStack');
    expect(info.legend).toEqual(['Solar', 'Wind']);
    expect(layer.type).toBe(TraceType.STACKED_AREA);
    // Each band keeps its own magnitude: the running total is the trace's to
    // compute, and pre-accumulating here would double it.
    expect(layer.data).toEqual([
      [{ x: 2020, y: 1, z: 'Solar' }, { x: 2021, y: 2, z: 'Solar' }],
      [{ x: 2020, y: 3, z: 'Wind' }, { x: 2021, y: 4, z: 'Wind' }],
    ]);
    expect(layer.selectors).toEqual(['#mv [band-0]', '#mv [band-1]']);
  });

  it('names unnamed bands by position', () => {
    const [info] = extractVictoryLayers(
      chart(
        {},
        createElement(
          VictoryStack,
          {},
          createElement(VictoryArea, { key: 'a', data: bands[0].data }),
          createElement(VictoryArea, { key: 'b', data: bands[1].data }),
        ),
      ),
    );

    expect(info.legend).toEqual(['Series 1', 'Series 2']);
  });

  it('keeps a stack of bars a stacked bar', () => {
    const [info] = extractVictoryLayers(
      chart(
        {},
        createElement(
          VictoryStack,
          {},
          createElement(VictoryBar, { name: 'S1', data: barData }),
          createElement(VictoryBar, { name: 'S2', data: barData }),
        ),
      ),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED);
  });

  it('reads a stack whose every column sums to 100 as normalized', () => {
    const [info] = extractVictoryLayers(areaStack([
      { name: 'A', data: [{ x: 2020, y: 60 }, { x: 2021, y: 30 }] },
      { name: 'B', data: [{ x: 2020, y: 40 }, { x: 2021, y: 70 }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.NORMALIZED_AREA);
  });

  it('reads a stack whose every column sums to 1 as normalized', () => {
    const [info] = extractVictoryLayers(areaStack([
      { name: 'A', data: [{ x: 2020, y: 0.25 }, { x: 2021, y: 0.5 }] },
      { name: 'B', data: [{ x: 2020, y: 0.75 }, { x: 2021, y: 0.5 }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.NORMALIZED_AREA);
  });

  it('leaves a stack whose columns differ unnormalized', () => {
    const [info] = extractVictoryLayers(areaStack([
      { name: 'A', data: [{ x: 2020, y: 60 }, { x: 2021, y: 30 }] },
      { name: 'B', data: [{ x: 2020, y: 40 }, { x: 2021, y: 50 }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED_AREA);
  });

  it('does not call a single column normalized on one total alone', () => {
    const [info] = extractVictoryLayers(areaStack([
      { name: 'A', data: [{ x: 2020, y: 60 }] },
      { name: 'B', data: [{ x: 2020, y: 40 }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED_AREA);
  });
});

describe('error bar', () => {
  it('converts a symmetric errorY delta into absolute bounds', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryErrorBar, {
        data: [{ x: 1, y: 10, errorY: 2 }, { x: 2, y: 20, errorY: 0.5 }],
      })),
    );

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(info.victoryType).toBe('VictoryErrorBar');
    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(layer.data).toEqual([
      { x: 1, y: 10, yMin: 8, yMax: 12 },
      { x: 2, y: 20, yMin: 19.5, yMax: 20.5 },
    ]);
    expect(layer.selectors).toBe('#mv [data-maidr-victory-0]');
  });

  it('reads an asymmetric [plus, minus] error', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryErrorBar, { data: [{ x: 1, y: 10, errorY: [3, 1] }] }),
    );

    expect(toMaidrLayer(info).data).toEqual([{ x: 1, y: 10, yMin: 9, yMax: 13 }]);
  });

  it('leaves a one-sided interval one-sided rather than mirroring it', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryErrorBar, { data: [{ x: 1, y: 10, errorY: [3, 0] }] }),
    );

    // Victory draws no whisker for a zero error, so neither does MAIDR: the
    // trace drops the lower row instead of announcing a bound at the estimate.
    expect(toMaidrLayer(info).data).toEqual([{ x: 1, y: 10, yMax: 13 }]);
  });

  it('keeps a sample whose own error is missing', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryErrorBar, {
        data: [{ x: 1, y: 10, errorY: 2 }, { x: 2, y: 20 }],
      }),
    );

    expect(toMaidrLayer(info).data).toEqual([
      { x: 1, y: 10, yMin: 8, yMax: 12 },
      { x: 2, y: 20 },
    ]);
  });

  it('reads an errorY accessor declared as a prop key', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryErrorBar, {
        data: [{ x: 1, y: 10, sd: 2 }],
        errorY: 'sd',
      }),
    );

    expect(toMaidrLayer(info).data).toEqual([{ x: 1, y: 10, yMin: 8, yMax: 12 }]);
  });

  it('drops a layer that draws no interval at all', () => {
    const layers = extractVictoryLayers(
      createElement(VictoryErrorBar, { data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }),
    );

    expect(layers).toHaveLength(0);
  });
});

describe('waterfall', () => {
  const steps = [
    { x: 'Open', y: 100, y0: 0 },
    { x: 'Sales', y: 160, y0: 100 },
    { x: 'Costs', y: 130, y0: 160 },
    { x: 'Close', y: 130, y0: 0 },
  ];

  it('converts chaining floating bars into waterfall steps', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryBar, { data: steps })),
    );

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.data).toEqual([
      { x: 'Open', start: 0, end: 100, delta: 100, kind: 'total' },
      { x: 'Sales', start: 100, end: 160, delta: 60, kind: 'increase' },
      { x: 'Costs', start: 160, end: 130, delta: -30, kind: 'decrease' },
      { x: 'Close', start: 0, end: 130, delta: 130, kind: 'total' },
    ]);
    // Bars are one <path> per datum either way, so the discrete tagging path
    // is reused unchanged.
    expect(layer.selectors).toBe('#mv [data-maidr-victory-0]');
  });

  it('keeps an ordinary bar chart a bar chart', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryBar, { data: barData })),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.BAR);
  });

  it('reads a chain the caller accumulated in floating point', () => {
    // A chart that knows its deltas and its running totals derives each bar's
    // foot as `end - delta`, which misses the previous bar's end by a ULP or
    // so. Requiring the two to be bit-identical would demote a real waterfall
    // to a bar chart over a difference no reader could perceive.
    const deltas = [0.1, 0.2, 0.3];
    let total = 0;
    const running = deltas.map((delta, i) => {
      total += delta;
      return { x: `Step ${i}`, y: total, y0: total - delta };
    });
    // The premise of the test: the chain does not survive an exact comparison.
    expect(running[1].y0).not.toBe(running[0].y);

    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryBar, { data: running })),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.WATERFALL);
  });

  it('keeps unchained floating bars a bar chart', () => {
    // A range bar and a gantt row float the same way a waterfall step does;
    // without the chain there is nothing to tell them apart, so the adapter
    // does not guess.
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryBar, {
        data: [{ x: 'A', y: 5, y0: 1 }, { x: 'B', y: 9, y0: 6 }],
      })),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.BAR);
  });

  it('reads a y0 accessor declared as a prop key', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryBar, {
        data: [{ x: 'A', end: 10, begin: 0 }, { x: 'B', end: 4, begin: 10 }],
        y: 'end',
        y0: 'begin',
      }),
    );

    expect(toMaidrLayer(info).data).toEqual([
      { x: 'A', start: 0, end: 10, delta: 10, kind: 'total' },
      { x: 'B', start: 10, end: 4, delta: -6, kind: 'decrease' },
    ]);
  });
});

describe('polar area', () => {
  const wedges = [{ x: 'N', y: 3 }, { x: 'E', y: 5 }, { x: 'S', y: 2 }];

  it('reads a polar VictoryBar inside a polar chart as a polar area', () => {
    const [info] = extractVictoryLayers(
      chart({ polar: true }, createElement(VictoryBar, { data: wedges })),
    );

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(layer.type).toBe(TraceType.POLAR_AREA);
    expect(layer.data).toEqual([[{ x: 'N', y: 3 }, { x: 'E', y: 5 }, { x: 'S', y: 2 }]]);
    expect(layer.selectors).toEqual(['#mv [data-maidr-victory-0]']);
  });

  it('reads a polar prop on the bar itself', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryBar, { data: wedges, polar: true }),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.POLAR_AREA);
  });

  it('lets a child opt back out of an enclosing polar chart', () => {
    const [info] = extractVictoryLayers(
      chart({ polar: true }, createElement(VictoryBar, { data: wedges, polar: false })),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.BAR);
  });

  it('carries the chart polar flag into each panel of a multi-panel figure', () => {
    const subplots = extractVictorySubplots([
      chart({ key: 'a', polar: true }, createElement(VictoryBar, { data: wedges })),
      chart({ key: 'b' }, createElement(VictoryBar, { data: barData })),
    ]);

    expect(toMaidrLayer(subplots[0].layers[0]).type).toBe(TraceType.POLAR_AREA);
    expect(toMaidrLayer(subplots[1].layers[0]).type).toBe(TraceType.BAR);
  });
});

describe('dot plot', () => {
  const dotData = [
    { x: 'Denmark', y: 7.6 },
    { x: 'Finland', y: 7.8 },
    { x: 'Iceland', y: 7.5 },
  ];

  it('reads a scatter over categories as a dot plot of bar points', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryScatter, { data: dotData })),
    );

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(info.victoryType).toBe('VictoryScatter');
    expect(layer.type).toBe(TraceType.DOT);
    // Read as a bivariate scatter every one of these x values coerces to NaN,
    // which is what the category branch exists to prevent.
    expect(layer.data).toEqual(dotData);
    expect(layer.selectors).toBe('#mv [data-maidr-victory-0]');
  });

  it('keeps a numeric scatter a scatter', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryScatter, { data: scatterData })),
    );

    const layer = toMaidrLayer(info);

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });

  it('keeps a scatter whose x values are only partly categorical a scatter', () => {
    const [info] = extractVictoryLayers(
      chart({}, createElement(VictoryScatter, { data: [{ x: 'A', y: 1 }, { x: 2, y: 3 }] })),
    );

    expect(toMaidrLayer(info).type).toBe(TraceType.SCATTER);
  });

  it('treats a numeric-looking string as the category Victory draws it as', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryScatter, { data: [{ x: '2023', y: 4 }, { x: '2024', y: 6 }] }),
    );

    const layer = toMaidrLayer(info);

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.data).toEqual([{ x: '2023', y: 4 }, { x: '2024', y: 6 }]);
  });

  it('reads dot accessors declared as prop keys', () => {
    const [info] = extractVictoryLayers(
      createElement(VictoryScatter, {
        data: [{ country: 'Denmark', score: 7.6 }],
        x: 'country',
        y: 'score',
      }),
    );

    const layer = toMaidrLayer(info);

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.data).toEqual([{ x: 'Denmark', y: 7.6 }]);
  });
});

describe('diverging bar', () => {
  const men = [{ x: '0-14', y: -1200 }, { x: '15-29', y: -1150 }];
  const women = [{ x: '0-14', y: 1140 }, { x: '15-29', y: 1100 }];

  function barStack(children: { name: string; data: unknown[] }[]): ReactNode {
    return chart(
      {},
      createElement(
        VictoryStack,
        {},
        ...children.map(({ name, data }) => createElement(VictoryBar, { key: name, name, data })),
      ),
    );
  }

  it('reads two oppositely signed bar series as a diverging chart', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: men },
      { name: 'Women', data: women },
    ]));

    const layer = toMaidrLayer(info, '#mv [data-maidr-victory-0]');

    expect(info.victoryType).toBe('VictoryStack');
    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.selectors).toBe('#mv [data-maidr-victory-0]');
  });

  it('keeps the values signed as the chart draws them', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: men },
      { name: 'Women', data: women },
    ]));

    // The sign is the side a bar points to, and the trace reads it as one.
    expect(toMaidrLayer(info).data).toEqual([
      [{ x: '0-14', y: 1140, z: 'Women' }, { x: '15-29', y: 1100, z: 'Women' }],
      [{ x: '0-14', y: -1200, z: 'Men' }, { x: '15-29', y: -1150, z: 'Men' }],
    ]);
  });

  it('lists the sides in the order VictoryStack paints them', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: men },
      { name: 'Women', data: women },
    ]));

    // `VictoryStack` reverses its children, and the highlight resolves one
    // flat selector in document order, so the last-declared side is the first
    // one the payload lists.
    expect(info.legend).toEqual(['Women', 'Men']);
  });

  it('reads the sign of a value Victory was handed as a string', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: [{ x: '0-14', y: '-1200' }] },
      { name: 'Women', data: [{ x: '0-14', y: '1140' }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.DIVERGING);
  });

  it('keeps a stack whose series both grow upwards a stacked bar', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'S1', data: barData },
      { name: 'S2', data: barData },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED);
  });

  it('keeps a three-series stack a stacked bar', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: men },
      { name: 'Women', data: women },
      { name: 'Unstated', data: [{ x: '0-14', y: 10 }, { x: '15-29', y: 12 }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED);
  });

  it('does not call a side that never leaves the baseline a side', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: men },
      { name: 'Women', data: [{ x: '0-14', y: 0 }, { x: '15-29', y: 0 }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED);
  });

  it('keeps a stack whose values are not numbers a stacked bar', () => {
    const [info] = extractVictoryLayers(barStack([
      { name: 'Men', data: men },
      { name: 'Women', data: [{ x: '0-14', y: 'high' }, { x: '15-29', y: 'low' }] },
    ]));

    expect(toMaidrLayer(info).type).toBe(TraceType.STACKED);
  });
});

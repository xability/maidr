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
const VictoryBar = stub('VictoryBar');
const VictoryLine = stub('VictoryLine');
const VictoryScatter = stub('VictoryScatter');
const VictoryStack = stub('VictoryStack');

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
      expect(warnSpy).toHaveBeenCalledTimes(1);
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

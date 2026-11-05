/**
 * @jest-environment jsdom
 *
 * A Recharts sankey read in the columns it draws.
 *
 * MAIDR places a flow's nodes in columns the layer declares
 * (`flowOptions.columns`), or, with none declared, a node one column past the
 * furthest node feeding it, each column in the order the flows first name its
 * nodes. `<Sankey>` places a node by the same depth, except that under its
 * default `align="justify"` every node nothing flows out of is drawn in the
 * last column; and it draws each column in the order of `nodes` under
 * `sort={false}`, and in the order its layout settles them otherwise.
 *
 * Real charts are drawn, because where `<Sankey>` puts each node is a fact
 * about what it renders: its nodes are drawn in the order of `nodes`, each at
 * the `x` and `y` of its rectangle.
 */

import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { MaidrRecharts } from '@adapters/recharts/MaidrRecharts';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { Sankey } from 'recharts';

const seen: MaidrData[] = [];

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    const react = jest.requireActual<typeof import('react')>('react');
    return react.createElement('article', { id: `maidr-article-${data.id}` }, children);
  },
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  // Recharts 3 observes its wrapper for size changes, which jsdom cannot do;
  // the charts below are given their size outright.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  cleanup();
  seen.length = 0;
});

/**
 * Mermaid's energy example: Heating takes gas straight from its source, so it
 * is one step from a source, as Electricity is, and nothing flows out of it.
 */
const nodes = [
  { name: 'Gas' },
  { name: 'Solar' },
  { name: 'Wind' },
  { name: 'Electricity' },
  { name: 'Heating' },
  { name: 'Homes' },
  { name: 'Industry' },
];

const links = [
  { source: 0, target: 3, value: 30 },
  { source: 1, target: 3, value: 20 },
  { source: 2, target: 3, value: 25 },
  { source: 0, target: 4, value: 15 },
  { source: 3, target: 5, value: 40 },
  { source: 3, target: 6, value: 35 },
];

/**
 * Draws the sankey through `<MaidrRecharts>`.
 *
 * @param sankey - Props for `<Sankey>`, beyond its size and data
 * @returns The layer handed to `<Maidr>`
 */
function mount(sankey: Record<string, unknown>): MaidrLayer {
  const chart: ReactElement = createElement(Sankey, {
    width: 600,
    height: 350,
    data: { nodes, links },
    nodePadding: 30,
    ...sankey,
  });
  render(createElement(MaidrRecharts, {
    id: 'energy',
    data: links,
    chartType: 'sankey',
    xKey: 'source',
    yKeys: ['value'],
    flowConfig: { targetKey: 'target', nodes },
    children: chart,
  }));
  const data = seen.at(-1);
  if (data === undefined) {
    throw new Error('MaidrRecharts handed <Maidr> no data');
  }
  return data.subplots[0][0].layers[0];
}

/**
 * The columns `<Sankey>` drew, left to right, each top to bottom.
 *
 * @returns Node names per column
 */
function drawnColumns(): string[][] {
  const rectangles = [...document.querySelectorAll('.recharts-sankey-nodes .recharts-sankey-node')];
  expect(rectangles).toHaveLength(nodes.length);
  const placed = rectangles.map((rectangle, index) => ({
    name: nodes[index].name,
    x: Math.round(Number(rectangle.getAttribute('x'))),
    y: Number(rectangle.getAttribute('y')),
  }));
  const columns = [...new Set(placed.map(node => node.x))].sort((a, b) => a - b);
  return columns.map(x => placed
    .filter(node => node.x === x)
    .sort((a, b) => a.y - b.y)
    .map(node => node.name));
}

/**
 * The columns MAIDR reads, left to right, each in the order Down walks it.
 *
 * @param layer - The layer
 * @returns Node names per column
 */
function readColumns(layer: MaidrLayer): string[][] {
  const trace = TraceFactory.create(layer);
  const columns: string[][] = [];
  for (let col = 0; col < nodes.length; col++) {
    const column: string[] = [];
    for (let row = 0; row < nodes.length; row++) {
      const state = trace.getStateAt(row, col);
      const name = state.empty ? '' : String(state.text.main.value);
      if (name !== '') {
        column.push(name);
      }
    }
    if (column.length === 0) {
      break;
    }
    columns.push(column);
  }
  trace.dispose();
  return columns;
}

describe('a Recharts sankey', () => {
  it('reads a node nothing flows out of in the last column, where align="justify" draws it', () => {
    const layer = mount({ sort: false });

    expect(drawnColumns()).toEqual([['Gas', 'Solar', 'Wind'], ['Electricity'], ['Heating', 'Homes', 'Industry']]);
    expect(readColumns(layer)).toEqual(drawnColumns());
  });

  it('reads such a node one column past its source under align="left", as drawn', () => {
    const layer = mount({ sort: false, align: 'left' });

    expect(drawnColumns()).toEqual([['Gas', 'Solar', 'Wind'], ['Electricity', 'Heating'], ['Homes', 'Industry']]);
    expect(readColumns(layer)).toEqual(drawnColumns());
  });

  it('reads each node in the column a sankey drawn with its default sort draws it in', () => {
    // Under `sort` the layout reorders each column to shorten the ribbons --
    // here Wind above Solar -- which nothing knows before it is drawn, so
    // only the columns themselves are held to the drawing.
    const layer = mount({});
    const sorted = (columns: string[][]): string[][] => columns.map(column => [...column].sort());

    expect(sorted(readColumns(layer))).toEqual(sorted(drawnColumns()));
  });
});

describe('the columns a Recharts sankey declares', () => {
  /**
   * The columns the converter declares for the energy chart's links.
   *
   * @param flowConfig - What the chart declares of its flows
   * @param data - The links
   * @returns The declared columns, if any
   */
  function declared(
    flowConfig: Record<string, unknown>,
    data: Record<string, unknown>[] = links,
  ): unknown {
    const maidr = convertRechartsToMaidr({
      id: 'energy',
      data,
      chartType: 'sankey',
      xKey: 'source',
      yKeys: ['value'],
      flowConfig: { targetKey: 'target', ...flowConfig },
    });
    return maidr.subplots[0][0].layers[0].flowOptions?.columns;
  }

  it('puts a node nothing flows out of in the last column, as Recharts does by default', () => {
    expect(declared({ nodes })).toEqual([['Gas', 'Solar', 'Wind'], ['Electricity'], ['Heating', 'Homes', 'Industry']]);
  });

  it('puts it one column past its source under align "left"', () => {
    expect(declared({ nodes, align: 'left' })).toEqual([['Gas', 'Solar', 'Wind'], ['Electricity', 'Heating'], ['Homes', 'Industry']]);
  });

  it('leaves out a node no link names, which MAIDR does not know', () => {
    const withUnused = [...nodes, { name: 'Storage' }];

    expect(declared({ nodes: withUnused })).toEqual([['Gas', 'Solar', 'Wind'], ['Electricity'], ['Heating', 'Homes', 'Industry']]);
  });

  it('declares nothing for links that name their nodes, which MAIDR places itself', () => {
    const named = links.map(link => ({ ...link, source: nodes[link.source].name, target: nodes[link.target].name }));

    expect(declared({}, named)).toBeUndefined();
  });

  it('declares nothing for a graph that cycles, which a sankey cannot lay out', () => {
    expect(declared({ nodes }, [...links, { source: 5, target: 0, value: 5 }])).toBeUndefined();
  });
});

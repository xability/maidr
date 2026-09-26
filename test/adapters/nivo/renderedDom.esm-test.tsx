/**
 * @jest-environment jsdom
 */

/**
 * Selectors checked against the markup Nivo really renders.
 *
 * Every selector strategy in `src/adapters/nivo/selectors.ts` is a claim
 * about somebody else's markup — that a bar is stamped
 * `data-testid="bar.item.<key>.<index>"`, that a box's lower whisker cap is
 * its third `<line>`, that a scatter chart draws one `<circle>` per datum in
 * series order — and a hand-built fixture cannot falsify any of them. So this
 * suite mounts the real `@nivo/*` components (fixed size, `animate={false}`)
 * inside the real hook, lets the layout effect tag them, and resolves every
 * emitted selector against the result. It is the file that fails when a Nivo
 * upgrade changes the markup — the failure that would otherwise reach a
 * reader as a chart that announces correctly and highlights nothing.
 *
 * It lives in the `esm` project because Nivo's CommonJS builds `require` the
 * ESM-only d3 packages, which only an ESM test can load.
 */

import type { NivoAdapterConfig, NivoChartType } from '@adapters/nivo/types';
import type { BoxPoint, BoxSelector, Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { ComponentType, ReactElement } from 'react';
import { MaidrNivo } from '@adapters/nivo/MaidrNivo';
import { useNivoAdapter } from '@adapters/nivo/useNivoAdapter';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Bar } from '@nivo/bar';
import { BoxPlot } from '@nivo/boxplot';
import { HeatMap } from '@nivo/heatmap';
import { Line } from '@nivo/line';
import { Pie } from '@nivo/pie';
import { ScatterPlot } from '@nivo/scatterplot';
import { Orientation, TraceType } from '@type/grammar';
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// React only runs effects synchronously inside `act` when told it is in a
// test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SIZE = { width: 400, height: 300, animate: false };

let unmount: (() => void) | null = null;

afterEach(() => {
  act(() => unmount?.());
  unmount = null;
  document.body.innerHTML = '';
});

/**
 * Mounts a Nivo chart inside `useNivoAdapter`, the way `<MaidrNivo>` does,
 * and returns the data the hook settled on.
 *
 * @param type - The chart kind
 * @param Chart - The Nivo component
 * @param props - Its props
 * @returns The hook's data and the container the chart rendered into
 */
function mount(
  type: NivoChartType,
  Chart: ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
): { data: MaidrData; container: HTMLElement } {
  const chartProps = { ...SIZE, ...props };
  let data: MaidrData | null = null;

  function Harness(): ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    const config: NivoAdapterConfig = { id: `nivo-${type}`, type, props: chartProps };
    data = useNivoAdapter(config, ref);
    return <div ref={ref}><Chart {...chartProps} /></div>;
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Harness />));
  unmount = () => root.unmount();

  const container = host.firstElementChild as HTMLElement;
  if (data === null)
    throw new Error('the hook never rendered');
  return { data, container };
}

/**
 * The first subplot's layers, each checked to highlight in the real trace:
 * the trace the core builds from it resolves at least one element. A layer
 * whose selectors the core declines — a grid that does not fit, a pie count
 * that does not match — fails here even when every selector resolves alone.
 *
 * @param data - The hook's data
 * @param traced - Whether to build the trace; jsdom has no `SVGPathElement`,
 *   which the line trace needs to read a stroke's vertices
 * @returns The layers
 */
function layersOf(data: MaidrData, traced = true): MaidrLayer[] {
  const { layers } = data.subplots[0][0];
  for (const layer of layers) {
    if (layer.selectors === undefined || !traced)
      continue;
    const trace = TraceFactory.create(layer);
    expect(trace.getAllHighlightElements().length).toBeGreaterThan(0);
    trace.dispose();
  }
  return layers;
}

/** How many elements a selector matches in the document. */
function count(selector: string): number {
  return document.querySelectorAll(selector).length;
}

/**
 * Checks that a grid names exactly one element per non-null cell.
 * @param grid - The selector grid
 */
function expectGridResolves(grid: (string | null)[][]): void {
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null)
        expect(count(cell)).toBe(1);
    }
  }
}

const FOOD: Record<string, string | number>[] = [
  { country: 'AD', hotdog: 10, burger: 20 },
  { country: 'AE', hotdog: 5, burger: 7 },
  { country: 'AF', hotdog: 3 },
];

describe('nivo bar', () => {
  it('names one rect per bar of a single series, in payload order', () => {
    const { data } = mount('bar', Bar as never, { data: FOOD, keys: ['hotdog'], indexBy: 'country' });
    const [layer] = layersOf(data);

    expect(layer.type).toBe(TraceType.BAR);
    const selectors = layer.selectors as string[];
    expect(selectors).toHaveLength(3);
    selectors.forEach(selector => expect(count(selector)).toBe(1));
    // Heights follow the payload: the first bar is the tallest.
    const heights = selectors.map(selector => Number(document.querySelector(selector)?.getAttribute('height')));
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });

  it.each(['stacked', 'grouped'])('names every drawn cell of a %s chart, null where Nivo drew none', (groupMode) => {
    const { data } = mount('bar', Bar as never, { data: FOOD, keys: ['hotdog', 'burger'], indexBy: 'country', groupMode });
    const [layer] = layersOf(data);

    expect(layer.type).toBe(groupMode === 'grouped' ? TraceType.DODGED : TraceType.STACKED);
    const grid = layer.selectors as (string | null)[][];
    expect(grid.map(row => row.length)).toEqual([3, 3]);
    expect(grid[1][2]).toBeNull();
    expectGridResolves(grid);
    // Nivo draws exactly the non-null cells.
    expect(count(`#${layerContainerId()} rect[data-testid^="bar.item."]`)).toBe(5);
  });

  it('draws index 0 of a horizontal chart at the bottom, where the payload starts', () => {
    const { data } = mount('bar', Bar as never, { data: FOOD, keys: ['hotdog'], indexBy: 'country', layout: 'horizontal' });
    const [layer] = layersOf(data);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    const ys = (layer.selectors as string[]).map(selector => translateY(document.querySelector(selector)?.parentElement));
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
  });

  it('lists a grouped horizontal chart\'s series bottom-up within each band, the way Up walks them', () => {
    const { data } = mount('bar', Bar as never, {
      data: FOOD,
      keys: ['hotdog', 'burger'],
      indexBy: 'country',
      groupMode: 'grouped',
      layout: 'horizontal',
    });
    const [layer] = layersOf(data);
    const grid = layer.selectors as (string | null)[][];

    expectGridResolves(grid);
    // Row 0 is drawn lower on the page than row 1 in the same category.
    const row0 = translateY(document.querySelector(grid[0][0] as string)?.parentElement);
    const row1 = translateY(document.querySelector(grid[1][0] as string)?.parentElement);
    expect(row0).toBeGreaterThan(row1);
    expect(data.subplots[0][0].legend).toEqual(['burger', 'hotdog']);
  });
});

describe('nivo line', () => {
  const SERIES = [
    { id: 'japan', data: [{ x: 'plane', y: 1 }, { x: 'boat', y: null }, { x: 'car', y: 3 }] },
    { id: 'france', data: [{ x: 'plane', y: 4 }, { x: 'boat', y: 5 }, { x: 'car', y: 6 }] },
  ];

  it('tags one point marker per payload point, series by series', () => {
    const { data } = mount('line', Line as never, { data: SERIES });
    const [layer] = layersOf(data);
    const selectors = layer.selectors as string[];

    expect(selectors).toHaveLength(2);
    expect(count(selectors[0])).toBe(2);
    expect(count(selectors[1])).toBe(3);
    // Series 0 is japan's markers, whatever order Nivo paints them in.
    for (const marker of document.querySelectorAll(selectors[0]))
      expect(marker.getAttribute('data-testid')).toMatch(/^line\.point\.japan\./);
  });

  it('tags each series\' stroke when Nivo draws no points', () => {
    const { data } = mount('line', Line as never, { data: SERIES, enablePoints: false });
    const [layer] = layersOf(data, false);
    const selectors = layer.selectors as string[];

    const strokes = selectors.map(selector => Array.from(document.querySelectorAll(selector)));
    expect(strokes.map(matches => matches.map(el => el.tagName.toLowerCase()))).toEqual([['path'], ['path']]);
    // Nivo paints the series back to front; france's path has three vertices.
    expect(strokes[1][0].getAttribute('d')?.match(/[ML]/g)).toHaveLength(3);
  });

  it('leaves out a series Nivo does not draw for its falsy id, and still highlights the rest', () => {
    const { data } = mount('line', Line as never, {
      data: [{ id: 0, data: [{ x: 'a', y: 1 }] }, { id: 'kept', data: [{ x: 'a', y: 2 }, { x: 'b', y: 3 }] }],
    });
    const [layer] = layersOf(data);
    const selectors = layer.selectors as string[];

    expect(selectors).toHaveLength(1);
    expect(count(selectors[0])).toBe(2);
  });
});

describe('nivo scatterplot', () => {
  it('tags every node of each series for its own layer', () => {
    const { data } = mount('scatterplot', ScatterPlot as never, {
      data: [
        { id: 'A', data: [{ x: 1, y: 2 }, { x: 3, y: 1 }] },
        { id: 'B', data: [{ x: 2, y: 2 }, { x: 4, y: 4 }, { x: 5, y: 1 }] },
      ],
    });
    const layers = layersOf(data);

    expect(layers).toHaveLength(2);
    expect(count(layers[0].selectors as string)).toBe(2);
    expect(count(layers[1].selectors as string)).toBe(3);
  });

  it('keeps its nodes apart from a legend drawn with circle symbols', () => {
    const { data } = mount('scatterplot', ScatterPlot as never, {
      data: [
        { id: 'A', data: [{ x: 1, y: 2 }, { x: 3, y: 1 }] },
        { id: 'B', data: [{ x: 2, y: 2 }, { x: 4, y: 4 }, { x: 5, y: 1 }] },
      ],
      legends: [{ anchor: 'right', direction: 'column', itemWidth: 60, itemHeight: 20, symbolShape: 'circle' }],
    });
    // The legend really is drawn with one circle per series.
    expect(count('svg circle')).toBe(5 + 2);
    const layers = layersOf(data);

    expect(count(layers[0].selectors as string)).toBe(2);
    expect(count(layers[1].selectors as string)).toBe(3);
    for (const node of document.querySelectorAll(`${layers[0].selectors as string}, ${layers[1].selectors as string}`))
      expect(node.parentElement?.parentElement?.tagName.toLowerCase()).toBe('svg');
  });

  it('places string dates on a time scale and tags their nodes', () => {
    const { data } = mount('scatterplot', ScatterPlot as never, {
      xScale: { type: 'time', format: '%Y-%m-%d' },
      axisBottom: { format: '%b %d' },
      data: [{ id: 'A', data: [{ x: '2024-01-01', y: 2 }, { x: '2024-02-01', y: 4 }] }],
    });
    const [layer] = layersOf(data);

    expect(layer.data).toEqual([{ x: Date.UTC(2024, 0, 1), y: 2 }, { x: Date.UTC(2024, 1, 1), y: 4 }]);
    expect(count(layer.selectors as string)).toBe(2);
  });
});

describe('nivo pie', () => {
  const SLICES = [{ id: 'go', value: 1 }, { id: 'rust', value: 5 }, { id: 'c', value: 2 }];

  it('names one arc per slice, in data order', () => {
    const { data } = mount('pie', Pie as never, { data: SLICES });
    const [layer] = layersOf(data);
    const arcs = Array.from(document.querySelectorAll(layer.selectors as string));
    expect(arcs.map(arc => arc.getAttribute('data-testid'))).toEqual(['arc.go', 'arc.rust', 'arc.c']);
  });

  it('names the arcs of a doughnut the same way', () => {
    const { data } = mount('pie', Pie as never, { data: SLICES, innerRadius: 0.5 });
    expect(count(layersOf(data)[0].selectors as string)).toBe(3);
  });

  it('emits no selector when sortByValue reorders the ring', () => {
    const { data } = mount('pie', Pie as never, { data: SLICES, sortByValue: true });
    expect(layersOf(data)[0].selectors).toBeUndefined();
  });
});

describe('nivo heatmap', () => {
  it('names one cell per value, bottom row first', () => {
    const { data } = mount('heatmap', HeatMap as never, {
      data: [
        { id: 'Japan', data: [{ x: 'Train', y: 10 }, { x: 'Bus', y: null }] },
        { id: 'France', data: [{ x: 'Train', y: 3 }, { x: 'Bus', y: 4 }] },
      ],
    });
    const [layer] = layersOf(data);
    const grid = layer.selectors as (string | null)[][];

    expectGridResolves(grid);
    // The grid runs bottom-first: its first row is France, drawn lower down.
    const bottom = document.querySelector(grid[0][0] as string);
    const top = document.querySelector(grid[1][0] as string);
    expect(bottom?.getAttribute('data-testid')).toBe('cell.France.Train');
    expect(translateY(bottom)).toBeGreaterThan(translateY(top));
  });

  it('names the cells of Date columns the way Nivo stamps them', () => {
    const day = (d: number): Date => new Date(Date.UTC(2024, 0, d));
    const { data } = mount('heatmap', HeatMap as never, {
      data: [
        { id: 'a', data: [{ x: day(1), y: 1 }, { x: day(2), y: 2 }] },
        { id: 'b', data: [{ x: day(1), y: 3 }, { x: day(2), y: 4 }] },
      ],
    });
    const [layer] = layersOf(data);

    expect(layer.selectors).toBeDefined();
    expectGridResolves(layer.selectors as (string | null)[][]);
  });
});

describe('nivo boxplot', () => {
  // jsdom lays nothing out and implements no `getBBox`, which the box trace
  // measures its parts with; a zero box is enough for it to take them.
  const proto = SVGElement.prototype as unknown as { getBBox?: () => DOMRect };
  const hadBBox = 'getBBox' in proto;
  beforeAll(() => {
    if (!hadBBox)
      proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  });
  afterAll(() => {
    if (!hadBBox)
      delete proto.getBBox;
  });

  const OBSERVATIONS = ['A', 'B', 'C'].flatMap((group, g) =>
    Array.from({ length: 20 }, (_, i) => ({ group, value: (i * 7) % 20 + g * 3 })));

  /** Every part of every box resolves to exactly one element. */
  function expectBoxesResolve(selectors: BoxSelector[]): void {
    for (const box of selectors) {
      for (const part of [box.min, box.iq, box.q2, box.max])
        expect(count(part)).toBe(1);
    }
  }

  it('names each part of each box, and matches Nivo\'s own quantiles', () => {
    let computed: { data: { values: number[] } }[] = [];
    const captureLayer = (layerProps: { boxPlots: { data: { values: number[] } }[] }): null => {
      computed = layerProps.boxPlots;
      return null;
    };
    const { data } = mount('boxplot', BoxPlot as never, {
      data: OBSERVATIONS,
      layers: ['grid', 'axes', 'boxPlots', captureLayer],
    });
    const [layer] = layersOf(data);

    expectBoxesResolve(layer.selectors as BoxSelector[]);
    // What Nivo computed for its own drawing, read back through a custom layer.
    expect(computed).toHaveLength(3);
    (layer.data as BoxPoint[]).forEach((box, index) => {
      expect([box.min, box.q1, box.q2, box.q3, box.max]).toEqual(computed[index].data.values);
    });
  });

  it('puts the whisker ends where Nivo draws them, caps or not', () => {
    for (const whiskerEndSize of [0.6, 0]) {
      const { data } = mount('boxplot', BoxPlot as never, { data: OBSERVATIONS, whiskerEndSize });
      const [box] = layersOf(data)[0].selectors as BoxSelector[];
      const min = document.querySelector(box.min);
      const max = document.querySelector(box.max);
      // The far end of each whisker is below (min) and above (max) the box.
      expect(Number(min?.getAttribute('y2'))).toBeGreaterThan(0);
      expect(Number(max?.getAttribute('y2'))).toBeLessThan(0);
      // A cap runs across the whisker; with no caps the stem is the end.
      const across = (line: Element | null): boolean => line?.getAttribute('x1') !== line?.getAttribute('x2');
      expect(across(min)).toBe(whiskerEndSize > 0);
      expect(across(max)).toBe(whiskerEndSize > 0);
      act(() => unmount?.());
      unmount = null;
      document.body.innerHTML = '';
    }
  });

  it('lists a horizontal chart top-first', () => {
    const { data } = mount('boxplot', BoxPlot as never, { data: OBSERVATIONS, layout: 'horizontal' });
    const [layer] = layersOf(data);
    const selectors = layer.selectors as BoxSelector[];

    expectBoxesResolve(selectors);
    // Drawn rotated, so Q1 and Q3 name the body rather than leave the core to
    // derive them from its unrotated edges.
    for (const box of selectors)
      expect([box.q1, box.q3]).toEqual([box.iq, box.iq]);
    expect(document.querySelector(selectors[0].iq)?.parentElement?.getAttribute('transform')).toContain('rotate(-90)');
    expect((layer.data as BoxPoint[]).map(box => box.z)).toEqual(['C', 'B', 'A']);
    const ys = selectors.map(box => translateY(document.querySelector(box.iq)?.parentElement));
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
});

describe('a chart that draws after mount', () => {
  it('gains its selectors once its marks appear', async () => {
    const props = { ...SIZE, data: FOOD, keys: ['hotdog'], indexBy: 'country' };
    let show: () => void = () => {};
    let data: MaidrData | null = null;

    // What a `Responsive*` chart does: render nothing until it has measured
    // its parent, then draw.
    function Harness(): ReactElement {
      const ref = useRef<HTMLDivElement>(null);
      const [drawn, setDrawn] = useState(false);
      show = () => setDrawn(true);
      data = useNivoAdapter({ id: 'late', type: 'bar', props }, ref);
      return <div ref={ref}>{drawn && <Bar {...props} />}</div>;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Harness />));
    unmount = () => root.unmount();

    const before = data as MaidrData | null;
    expect(before?.subplots[0][0].layers[0].data).toHaveLength(3);
    expect(before?.subplots[0][0].layers[0].selectors).toBeUndefined();

    // The chart draws; the observer sees it and resolves on the next frame.
    act(() => show());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const after = data as MaidrData | null;
    expect(after?.subplots[0][0].layers[0].selectors).toHaveLength(3);
  });
});

describe('a chart that never fully resolves', () => {
  /**
   * Counts the full passes the hook runs from here on: each one starts by
   * clearing this adapter's tags, with a query no other code makes.
   * @returns A function answering how many passes have run
   */
  function countPasses(): { passes: () => number; restore: () => void } {
    const spy = jest.spyOn(Element.prototype, 'querySelectorAll');
    return {
      passes: () => spy.mock.calls.filter(([selector]) => String(selector).includes('data-maidr-nivo-line')).length,
      restore: () => spy.mockRestore(),
    };
  }

  /** Mounts and unmounts a tooltip-like node in the container, as Nivo does on hover. */
  async function hover(container: HTMLElement): Promise<void> {
    await act(async () => {
      const tooltip = document.createElement('div');
      tooltip.innerHTML = '<span>tooltip</span>';
      container.firstElementChild?.appendChild(tooltip);
      await new Promise(resolve => setTimeout(resolve, 30));
      tooltip.remove();
      await new Promise(resolve => setTimeout(resolve, 30));
    });
  }

  it('stops re-reading a pie laid out by value once it has drawn', async () => {
    const { data, container } = mount('pie', Pie as never, {
      data: [{ id: 'go', value: 1 }, { id: 'rust', value: 5 }],
      sortByValue: true,
    });
    expect(layersOf(data)[0].selectors).toBeUndefined();

    const { passes, restore } = countPasses();
    await hover(container);
    restore();

    expect(passes()).toBe(0);
  });

  it('stops re-reading a canvas chart', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const props = { data: FOOD, keys: ['hotdog'], indexBy: 'country' };
    function Harness(): ReactElement {
      const ref = useRef<HTMLDivElement>(null);
      useNivoAdapter({ id: 'canvas', type: 'bar', props }, ref);
      return <div ref={ref}><div><canvas /></div></div>;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Harness />));
    unmount = () => root.unmount();

    const { passes, restore } = countPasses();
    await hover(host.firstElementChild as HTMLElement);
    restore();
    warn.mockRestore();

    expect(passes()).toBe(0);
  });
});

describe('a mark Nivo moves in place', () => {
  it('carries the move over to MAIDR\'s copies of it', async () => {
    const { data, container } = mount('bar', Bar as never, { data: FOOD, keys: ['hotdog'], indexBy: 'country' });
    const [selector] = layersOf(data)[0].selectors as string[];
    const mark = document.querySelector(selector) as SVGElement;

    // What the core does when the plot takes focus: a hidden copy after the mark.
    const copy = mark.cloneNode(true) as SVGElement;
    copy.setAttribute('data-maidr-owned', 'true');
    copy.setAttribute('visibility', 'hidden');
    mark.insertAdjacentElement('afterend', copy);

    // What react-spring does on a resize: rewrite the mark's geometry.
    await act(async () => {
      mark.setAttribute('height', '123');
      mark.setAttribute('width', '45');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect([copy.getAttribute('height'), copy.getAttribute('width')]).toEqual(['123', '45']);
    expect(copy.getAttribute('visibility')).toBe('hidden');
    expect(container.contains(copy)).toBe(true);
  });
});

describe('MaidrNivo', () => {
  it('renders the chart and scopes its selectors to its own container', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const chart = <Bar {...SIZE} data={FOOD} keys={['hotdog']} indexBy="country" />;
    act(() => root.render(
      <>
        <MaidrNivo id="first" type="bar">{chart}</MaidrNivo>
        <MaidrNivo id="second" type="bar">{chart}</MaidrNivo>
      </>,
    ));
    unmount = () => root.unmount();

    const svgs = host.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    // Each wrapper stamped its own container id, which is what keeps two
    // identical charts from highlighting each other's bars.
    const scopes = Array.from(svgs, svg => svg.closest('[id^="mn-"]')?.id);
    expect(new Set(scopes).size).toBe(2);
  });
});

/** The container id the last mount stamped. */
function layerContainerId(): string {
  const scoped = document.querySelector('[id^="mn-"]');
  return scoped?.id ?? '';
}

/** The y of an element's `translate(x, y)` transform. */
function translateY(el: Element | null | undefined): number {
  const match = /translate\(\s*[-\d.e]+[\s,]+([-\d.e]+)/.exec(el?.getAttribute('transform') ?? '');
  return match ? Number(match[1]) : Number.NaN;
}

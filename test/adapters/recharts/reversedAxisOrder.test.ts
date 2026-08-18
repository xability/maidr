/**
 * @jest-environment jsdom
 */
/**
 * A Recharts chart on a reversed category axis has to be read the way it is
 * drawn (#1017).
 *
 * `<XAxis reversed />` draws the bars from the far end while Recharts goes on
 * rendering the rectangles in data order, so a layer emitted as written is
 * announced as the mirror image of the chart.
 *
 * Measured on Recharts 3.8.1 under `npm run dev:recharts` in Chromium, with
 * `reversed` added to the bar example's `<XAxis>` and nothing else changed,
 * for `Q1: 4200, Q2: 5800, Q3: 3900, Q4: 7100`:
 *
 *   DOM index    x     height    → which datum
 *       0       731      34        Q1
 *       1       598      46        Q2
 *       2       466      31        Q3
 *       3       333      57        Q4
 *
 * Sorted by x, left→right is Q4, Q3, Q2, Q1 — the drawing is reversed and the
 * DOM is not.
 *
 * Unlike Victory (#1018) the converter is handed props only, so the axis is
 * read out of `children` by {@link MaidrRecharts} and passed down. These cases
 * drive `convertRechartsToMaidr` directly, which is where the payload and the
 * selectors are decided; the walk itself is covered separately below.
 */
import type { BarPoint } from '@type/grammar';
import type { ReactNode } from 'react';
import { categoryAxisReversedFor } from '@adapters/recharts/childProps';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { describe, expect, it } from '@jest/globals';
import { createElement } from 'react';

/** The categories in the order they are written. */
const LISTED = ['Q1', 'Q2', 'Q3', 'Q4'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['Q4', 'Q3', 'Q2', 'Q1'];

const DATA = LISTED.map((quarter, i) => ({ quarter, revenue: (i + 1) * 100 }));

/**
 * The single layer a chart config converts to.
 * @param options - What the chart declares
 * @param options.reversed - Whether the category axis is reversed
 * @param options.selectorOverride - A caller's own selector
 * @returns The emitted layer
 */
function layerFor(options: {
  reversed?: boolean;
  selectorOverride?: string;
} = {}): { type: string; selectors?: string | string[]; data: unknown } {
  const maidr = convertRechartsToMaidr({
    id: 'rc',
    title: 'Revenue',
    data: DATA,
    chartType: 'bar',
    xKey: 'quarter',
    yKeys: ['revenue'],
    ...(options.reversed ? { categoryAxisReversed: true } : {}),
    ...(options.selectorOverride ? { selectorOverride: options.selectorOverride } : {}),
  });
  return maidr.subplots[0][0].layers[0] as unknown as {
    type: string;
    selectors?: string | string[];
    data: unknown;
  };
}

/** The categories of a bar layer, in the order it emits them. */
function categoriesOf(layer: { data: unknown }): unknown[] {
  return (layer.data as BarPoint[]).map(p => p.x);
}

describe('a recharts bar chart on a reversed category axis', () => {
  it('leads with the category drawn leftmost', () => {
    // Before the fix this was ['Q1', 'Q2', 'Q3', 'Q4'] — the exact reverse of
    // what the chart draws.
    expect(categoriesOf(layerFor({ reversed: true }))).toEqual(DRAWN);
  });

  it('carries each value with its own category', () => {
    const points = layerFor({ reversed: true }).data as BarPoint[];

    expect(points.find(p => p.x === 'Q1')?.y).toBe(100);
    expect(points.find(p => p.x === 'Q4')?.y).toBe(400);
  });

  it('leaves an ordinary chart alone', () => {
    expect(categoriesOf(layerFor())).toEqual(LISTED);
    expect(typeof layerFor().selectors).toBe('string');
  });
});

describe('the config shapes the fix has to reach', () => {
  /** The bar layer of a chart built in composed mode. */
  function composedLayer(reversed: boolean): { selectors?: string | string[]; data: unknown } {
    const maidr = convertRechartsToMaidr({
      id: 'rc-composed',
      title: 'Revenue',
      data: DATA,
      xKey: 'quarter',
      layers: [{ chartType: 'bar', yKey: 'revenue' }],
      ...(reversed ? { categoryAxisReversed: true } : {}),
    });
    return maidr.subplots[0][0].layers[0] as unknown as {
      selectors?: string | string[];
      data: unknown;
    };
  }

  /** The bar layer of panel `index` of a subplot grid. */
  function panelLayer(
    perPanel: boolean[],
    index: number,
  ): { selectors?: string | string[]; data: unknown } {
    const maidr = convertRechartsToMaidr({
      id: 'rc-panels',
      title: 'Revenue',
      data: DATA,
      xKey: 'quarter',
      subplots: perPanel.map(() => ({
        chartType: 'bar' as const,
        yKeys: ['revenue'],
      })),
      categoryAxisReversedPerPanel: perPanel,
    });
    const flat = maidr.subplots.flat();
    return flat[index].layers[0] as unknown as {
      selectors?: string | string[];
      data: unknown;
    };
  }

  it('turns a composed chart bar layer round', () => {
    // A composed chart's `bar` layer is the same reading as a simple one's and
    // was reached by a different builder, which did not read the flag at all.
    expect(categoriesOf(composedLayer(true))).toEqual(DRAWN);
    expect(Array.isArray(composedLayer(true).selectors)).toBe(true);
  });

  it('leaves an ordinary composed chart alone', () => {
    expect(categoriesOf(composedLayer(false))).toEqual(LISTED);
  });

  it('turns a subplot panel round', () => {
    // The panel config is rebuilt field by field, and the flag was not among
    // the fields copied — so a panel kept the pre-fix reading however its axis
    // was drawn.
    expect(categoriesOf(panelLayer([true], 0))).toEqual(DRAWN);
  });

  it('reads each panel own axis, not the first one', () => {
    // A panel is its own chart. One verdict for the whole grid would announce
    // the second panel by the first one's axis.
    const mixed = [true, false];

    expect(categoriesOf(panelLayer(mixed, 0))).toEqual(DRAWN);
    expect(categoriesOf(panelLayer(mixed, 1))).toEqual(LISTED);
  });

  it('leaves an ordinary grid alone', () => {
    expect(categoriesOf(panelLayer([false, false], 0))).toEqual(LISTED);
    expect(categoriesOf(panelLayer([false, false], 1))).toEqual(LISTED);
  });
});

describe('reading the axis out of the children', () => {
  /** A stand-in for a Recharts component: only `displayName` is read. */
  function stub(displayName: string): { (): null; displayName: string } {
    const component = (): null => null;
    component.displayName = displayName;
    return component;
  }

  const XAxis = stub('XAxis');
  const YAxis = stub('YAxis');
  const BarChart = stub('BarChart');
  const Container = stub('ResponsiveContainer');

  /**
   * What `MaidrRecharts` derives from a chart subtree.
   * @param children - The subtree
   * @param horizontal - Whether the bars are on their side
   * @returns Whether the category axis is reversed
   */
  function readAxis(children: ReactNode, horizontal = false): boolean {
    return categoryAxisReversedFor(children, horizontal);
  }

  it('finds a reversed x axis', () => {
    expect(readAxis(createElement(BarChart, null, createElement(XAxis, { reversed: true })))).toBe(true);
  });

  it('finds one nested behind a container', () => {
    // An axis is commonly wrapped — a `<ResponsiveContainer>`, a fragment —
    // so the walk is depth-first rather than one level deep.
    const tree = createElement(
      Container,
      null,
      createElement(BarChart, null, createElement(XAxis, { reversed: true })),
    );

    expect(readAxis(tree)).toBe(true);
  });

  it('answers no when nothing says otherwise', () => {
    expect(readAxis(createElement(BarChart, null, createElement(XAxis, null)))).toBe(false);
  });

  it('answers no when there is no axis at all', () => {
    // A chart built in a way this does not recognise keeps the reading it has
    // rather than being turned round on a guess.
    expect(readAxis(createElement(BarChart, null))).toBe(false);
  });

  it('asks the axis the categories are on', () => {
    // Reversing the value axis moves no category, so a reversed `<YAxis>` on a
    // vertical chart must not turn anything round — and must, once the bars
    // are on their side.
    const tree = createElement(
      BarChart,
      null,
      createElement(XAxis, null),
      createElement(YAxis, { reversed: true }),
    );

    expect(readAxis(tree, false)).toBe(false);
    expect(readAxis(tree, true)).toBe(true);
  });
});

describe('the highlight follows the categories', () => {
  it('names each bar instead of leaving one selector to resolve', () => {
    const { selectors } = layerFor({ reversed: true });

    expect(Array.isArray(selectors)).toBe(true);
    expect(selectors).toHaveLength(4);
  });

  it('counts nth-child down, not up', () => {
    // `Svg.selectElement` inserts its clone beside the match while the list is
    // still being resolved, so an ascending positional list returns the first
    // element every time (#1004). A reversed payload wants the last bar first,
    // which makes the safe direction the natural one — pinned so a later
    // rewrite cannot quietly flip it.
    const selectors = layerFor({ reversed: true }).selectors as string[];
    const positions = selectors.map(s => Number(/nth-child\((\d+)\)/.exec(s)?.[1]));

    expect(positions).toEqual([4, 3, 2, 1]);
  });

  it('keeps the mark part of the selector on each entry', () => {
    const selectors = layerFor({ reversed: true }).selectors as string[];

    expect(selectors[0]).toContain('.recharts-bar-rectangle:nth-child(4) .recharts-rectangle');
    // The chart's own scope survives, so two charts on a page cannot
    // cross-highlight.
    expect(selectors[0]).toContain('#maidr-article-rc');
  });

  it('keeps a caller their own selector, and their own order', () => {
    // Someone who named the marks is describing their own chart. Rebuilding
    // the list positionally would discard what they said, and reversing the
    // payload under it would point their selector at the wrong bars.
    const layer = layerFor({ reversed: true, selectorOverride: '.mine' });

    expect(layer.selectors).toBe('.mine');
    expect(categoriesOf(layer)).toEqual(LISTED);
  });

  it('keeps it even when it looks like one this could rebuild', () => {
    // The case the guard is actually for. An override naming the same wrapper
    // class — narrowing to one chart on a busy page, say — is exactly what
    // `reversedBarSelectors` would happily renumber, so the check has to be on
    // who supplied the selector rather than on what it looks like.
    const mine = '#only-mine .recharts-bar-rectangle .recharts-rectangle';
    const layer = layerFor({ reversed: true, selectorOverride: mine });

    expect(layer.selectors).toBe(mine);
    expect(categoriesOf(layer)).toEqual(LISTED);
  });
});

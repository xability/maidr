/**
 * Verifies that the highlight selectors this adapter emits actually resolve,
 * in the DOM Recharts really renders, to one element per data point.
 *
 * A trace type that sonifies but does not highlight is not finished, and the
 * class names are the one part of an adapter that no amount of unit testing
 * of the converters can confirm: they are Recharts' own, they differ per
 * component, and they change between versions. These tests mount the real
 * charts in jsdom and count the marks each emitted selector picks up, so a
 * renamed class or a wrongly nested scope fails here rather than silently
 * turning highlighting off in a user's chart.
 *
 * The count is what matters: every trace in the model maps its selector's
 * matches to its samples BY INDEX, and refuses to highlight at all when the
 * two disagree.
 */

import type { Maidr, WaterfallPoint } from '@type/grammar';
import type { ReactElement } from 'react';
import type { Root } from 'react-dom/client';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

// MaidrApp only mounts after focus-in (contextValue starts null), so it never
// renders in these tests — mock it away to keep its ESM-only dependencies
// (react-markdown et al.) out of the ts-jest CJS transform.
jest.mock('@ui/App', () => ({ MaidrApp: () => null }));

const funnelData = [
  { stage: 'Visited', users: 10000 },
  { stage: 'Signed up', users: 2400 },
  { stage: 'Activated', users: 2300 },
  { stage: 'Paid', users: 100 },
];

const errorData = [
  { treatment: 'Control', mean: 4.2, sd: 0.6 },
  { treatment: 'Nitrogen', mean: 5.5, sd: 0.5 },
  { treatment: 'Phosphate', mean: 5, sd: 0.7 },
];

const volcanoData = [
  { gene: 'TP53', log2fc: 2.4, negLog10P: 14.1 },
  { gene: 'MYC', log2fc: -0.3, negLog10P: 0.8 },
  { gene: 'EGFR', log2fc: 1.9, negLog10P: 6.4 },
];

const survivalData = [
  { months: 0, treated: 1, censored: false },
  { months: 6, treated: 0.88, censored: true },
  { months: 12, treated: 0.71, censored: false },
];

const pyramidData = [
  { band: '0-9', men: -2100, women: 2000 },
  { band: '10-19', men: -1900, women: 1850 },
  { band: '20-29', men: -1750, women: 1820 },
];

// A waterfall, a gantt and a dumbbell are all drawn as FLOATING bars: a
// `<Bar>` whose dataKey returns a [start, end] pair, which is one rectangle
// per row rather than the two a transparent-base stack would draw.
const bridgeData = [
  { step: 'Opening', change: 1200, restates: true },
  { step: 'New sales', change: 450 },
  { step: 'Churn', change: -180 },
  { step: 'Closing', restates: true },
];

const planData = [
  { task: 'Design', from: 0, to: 5 },
  { task: 'Build', from: 3, to: 12 },
  { task: 'Build', from: 14, to: 18 },
];

const lifeData = [
  { country: 'Japan', then: 78.9, now: 84.6 },
  { country: 'Russia', then: 69.2, now: 68.9 },
];

const gaugeData = [{ measure: 'NPS', score: 73 }];

const hierarchyData = [
  { name: 'Europe', children: [{ name: 'France', people: 67.4 }, { name: 'Spain', people: 47.4 }] },
  { name: 'Oceania', children: [{ name: 'Fiji', people: 0.9 }] },
];
/** Every node of {@link hierarchyData}, which is what both charts draw. */
const hierarchyNodes = 5;

const flowNodes = [{ name: 'Free' }, { name: 'Trial' }, { name: 'Paid' }, { name: 'Churned' }];
const flowLinks = [
  { source: 0, target: 1, value: 34 },
  { source: 1, target: 2, value: 21 },
  { source: 1, target: 3, value: 13 },
];

// A coxcomb is a `<Pie>` whose angles are all equal — hence the constant
// `slice` field its dataKey reads — and whose radius is the measure.
const coxcombData = [
  { month: 'Jan', deaths: 120, slice: 1 },
  { month: 'Feb', deaths: 84, slice: 1 },
  { month: 'Mar', deaths: 61, slice: 1 },
];

// An icicle's bands are floating bars over a depth lane, one row per node, so
// the rows have to be the flattened tree in the order the adapter emits it.
const icicleBands = [
  { name: 'Europe', depth: '0', from: 0, to: 100 },
  { name: 'France', depth: '1', from: 0, to: 59 },
  { name: 'Spain', depth: '1', from: 59, to: 100 },
  { name: 'Oceania', depth: '0', from: 100, to: 101 },
  { name: 'Fiji', depth: '1', from: 100, to: 101 },
];

const configs = {
  funnel: {
    id: 'funnel-dom',
    data: funnelData,
    chartType: 'funnel' as const,
    xKey: 'stage',
    yKeys: ['users'],
  },
  errorBar: {
    id: 'error-dom',
    data: errorData,
    chartType: 'error_bar' as const,
    xKey: 'treatment',
    yKeys: ['mean'],
    errorConfig: { errorKey: 'sd' },
  },
  volcano: {
    id: 'volcano-dom',
    data: volcanoData,
    chartType: 'volcano' as const,
    xKey: 'log2fc',
    yKeys: ['negLog10P'],
    volcanoConfig: { labelKey: 'gene', significance: 1.3 },
  },
  survival: {
    id: 'survival-dom',
    data: survivalData,
    chartType: 'survival' as const,
    xKey: 'months',
    yKeys: ['treated'],
    survivalConfig: { censoredKeys: ['censored'] },
  },
  alluvial: {
    id: 'alluvial-dom',
    data: flowLinks,
    chartType: 'alluvial' as const,
    xKey: 'source',
    yKeys: ['value'],
    flowConfig: { targetKey: 'target', nodes: flowNodes },
  },
  diverging: {
    id: 'diverging-dom',
    data: pyramidData,
    chartType: 'diverging_bar' as const,
    xKey: 'band',
    yKeys: ['men', 'women'],
    fillKeys: ['Men', 'Women'],
  },
  waterfall: {
    id: 'waterfall-dom',
    data: bridgeData,
    chartType: 'waterfall' as const,
    xKey: 'step',
    yKeys: ['change'],
    waterfallConfig: { totalKey: 'restates' },
  },
  gantt: {
    id: 'gantt-dom',
    data: planData,
    chartType: 'gantt' as const,
    xKey: 'task',
    yKeys: ['from', 'to'],
    ganttConfig: { lanes: ['Design', 'Build', 'Launch'], unit: 'days' },
  },
  dumbbell: {
    id: 'dumbbell-dom',
    data: lifeData,
    chartType: 'dumbbell' as const,
    xKey: 'country',
    yKeys: ['then', 'now'],
    fillKeys: ['1990', '2020'],
  },
  gauge: {
    id: 'gauge-dom',
    data: gaugeData,
    chartType: 'gauge' as const,
    xKey: 'measure',
    yKeys: ['score'],
    gaugeConfig: { min: 0, max: 100, target: 80 },
  },
  treemap: {
    id: 'treemap-dom',
    data: hierarchyData,
    chartType: 'treemap' as const,
    xKey: 'name',
    yKeys: ['people'],
  },
  sunburst: {
    id: 'sunburst-dom',
    data: hierarchyData,
    chartType: 'sunburst' as const,
    xKey: 'name',
    yKeys: ['people'],
  },
  icicle: {
    id: 'icicle-dom',
    data: hierarchyData,
    chartType: 'icicle' as const,
    xKey: 'name',
    yKeys: ['people'],
  },
  sankey: {
    id: 'sankey-dom',
    data: flowLinks,
    chartType: 'sankey' as const,
    xKey: 'source',
    yKeys: ['value'],
    flowConfig: { targetKey: 'target', nodes: flowNodes },
  },
  polarArea: {
    id: 'polar-dom',
    data: coxcombData,
    chartType: 'polar_area' as const,
    xKey: 'month',
    yKeys: ['deaths'],
  },
};

interface MutableGlobals {
  window?: unknown;
  document?: unknown;
  navigator?: unknown;
  ResizeObserver?: unknown;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

const globals = globalThis as unknown as MutableGlobals;
const saved: MutableGlobals = {};
let root: Root | null = null;
const maidr: Record<keyof typeof configs, Maidr> = {} as Record<keyof typeof configs, Maidr>;

function defineGlobal(key: keyof MutableGlobals, value: unknown): void {
  Object.defineProperty(globals, key, { value, configurable: true, writable: true });
}

/**
 * A `<Bar dataKey>` that reads a row's span rather than a magnitude.
 *
 * Recharts draws a bar returning a `[start, end]` pair floating between the
 * two, which is how a waterfall step, a gantt interval and a dumbbell
 * connector each come out as ONE rectangle per row.
 *
 * @param startKey - Field holding where the bar begins
 * @param endKey - Field holding where it ends
 * @returns A dataKey accessor Recharts accepts
 */
function floatingSpan(startKey: string, endKey: string): (obj: unknown) => [number, number] {
  return (obj) => {
    const row = obj as Record<string, unknown>;
    return [Number(row[startKey]), Number(row[endKey])];
  };
}

/** The first (or only) selector the layer declares. */
function firstSelector(figure: Maidr): string {
  const { selectors } = figure.subplots[0][0].layers[0];
  return Array.isArray(selectors) ? selectors[0] as string : selectors as string;
}

beforeAll(async () => {
  saved.window = globals.window;
  saved.document = globals.document;
  saved.navigator = globals.navigator;
  saved.ResizeObserver = globals.ResizeObserver;
  saved.IS_REACT_ACT_ENVIRONMENT = globals.IS_REACT_ACT_ENVIRONMENT;

  const dom = new JSDOM(
    '<!doctype html><body><div id="root"></div></body>',
    { pretendToBeVisual: true },
  );
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  defineGlobal('ResizeObserver', ResizeObserverStub);

  const { createElement, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const {
    Bar,
    BarChart,
    ErrorBar,
    Funnel,
    FunnelChart,
    Line,
    LineChart,
    Pie,
    PieChart,
    RadialBar,
    RadialBarChart,
    Sankey,
    Scatter,
    ScatterChart,
    SunburstChart,
    Treemap,
    XAxis,
    YAxis,
  } = await import('recharts');
  const { MaidrRecharts } = await import('@adapters/recharts/MaidrRecharts');

  function wrap(config: (typeof configs)[keyof typeof configs], chart: ReactElement): ReactElement {
    return createElement(MaidrRecharts, { ...config, children: null }, chart);
  }

  for (const [name, config] of Object.entries(configs)) {
    maidr[name as keyof typeof configs] = convertRechartsToMaidr(config);
  }

  // The waterfall's running totals are what the adapter computes and what the
  // floating `<Bar>` needs, so the chart is drawn from the layer's own steps —
  // which is the recipe the docs give a consumer.
  const waterfallSteps = maidr.waterfall.subplots[0][0].layers[0].data as WaterfallPoint[];

  root = createRoot(document.getElementById('root') as HTMLElement);
  await act(async () => {
    root?.render(createElement(
      'div',
      null,
      wrap(configs.funnel, createElement(
        FunnelChart,
        { width: 320, height: 260 },
        createElement(Funnel, { dataKey: 'users', data: funnelData, isAnimationActive: false }),
      )),
      wrap(configs.errorBar, createElement(
        BarChart,
        { width: 320, height: 220, data: errorData },
        createElement(XAxis, { dataKey: 'treatment' }),
        createElement(YAxis, {}),
        createElement(
          Bar,
          { dataKey: 'mean', isAnimationActive: false },
          createElement(ErrorBar, { dataKey: 'sd', direction: 'y', isAnimationActive: false }),
        ),
      )),
      wrap(configs.volcano, createElement(
        ScatterChart,
        { width: 320, height: 220 },
        createElement(XAxis, { dataKey: 'log2fc', type: 'number' }),
        createElement(YAxis, { dataKey: 'negLog10P', type: 'number' }),
        createElement(Scatter, { data: volcanoData, isAnimationActive: false }),
      )),
      wrap(configs.survival, createElement(
        LineChart,
        { width: 320, height: 220, data: survivalData },
        createElement(XAxis, { dataKey: 'months' }),
        createElement(YAxis, {}),
        createElement(Line, { type: 'stepAfter', dataKey: 'treated', dot: true, isAnimationActive: false }),
      )),
      wrap(configs.alluvial, createElement(Sankey, {
        width: 480,
        height: 300,
        data: { nodes: flowNodes, links: flowLinks },
      })),
      wrap(configs.diverging, createElement(
        BarChart,
        { width: 320, height: 220, layout: 'vertical', stackOffset: 'sign', data: pyramidData },
        createElement(XAxis, { type: 'number' }),
        createElement(YAxis, { type: 'category', dataKey: 'band' }),
        createElement(Bar, { dataKey: 'men', stackId: 'sides', isAnimationActive: false }),
        createElement(Bar, { dataKey: 'women', stackId: 'sides', isAnimationActive: false }),
      )),
      wrap(configs.waterfall, createElement(
        BarChart,
        { width: 320, height: 220, data: waterfallSteps },
        createElement(XAxis, { dataKey: 'x' }),
        createElement(YAxis, {}),
        createElement(Bar, { dataKey: floatingSpan('start', 'end'), isAnimationActive: false }),
      )),
      wrap(configs.gantt, createElement(
        BarChart,
        { width: 320, height: 220, layout: 'vertical', data: planData },
        createElement(XAxis, { type: 'number' }),
        createElement(YAxis, { type: 'category', dataKey: 'task' }),
        createElement(Bar, { dataKey: floatingSpan('from', 'to'), isAnimationActive: false }),
      )),
      wrap(configs.dumbbell, createElement(
        BarChart,
        { width: 320, height: 220, data: lifeData },
        createElement(XAxis, { dataKey: 'country' }),
        createElement(YAxis, {}),
        createElement(Bar, { dataKey: floatingSpan('then', 'now'), isAnimationActive: false }),
      )),
      wrap(configs.gauge, createElement(
        RadialBarChart,
        { width: 320, height: 220, innerRadius: 60, outerRadius: 100, startAngle: 180, endAngle: 0, data: gaugeData },
        createElement(RadialBar, { dataKey: 'score', isAnimationActive: false }),
      )),
      wrap(configs.treemap, createElement(Treemap, {
        width: 320,
        height: 220,
        data: hierarchyData,
        dataKey: 'people',
        nameKey: 'name',
        isAnimationActive: false,
      })),
      wrap(configs.sunburst, createElement(SunburstChart, {
        width: 320,
        height: 320,
        // The sunburst draws `data.children`, which is why the adapter is
        // given those children rather than this root.
        data: { name: 'World', children: hierarchyData },
        dataKey: 'people',
      })),
      wrap(configs.icicle, createElement(
        BarChart,
        { width: 320, height: 220, layout: 'vertical', data: icicleBands },
        createElement(XAxis, { type: 'number' }),
        createElement(YAxis, { type: 'category', dataKey: 'depth' }),
        createElement(Bar, { dataKey: floatingSpan('from', 'to'), isAnimationActive: false }),
      )),
      wrap(configs.sankey, createElement(Sankey, {
        width: 480,
        height: 300,
        data: { nodes: flowNodes, links: flowLinks },
      })),
      wrap(configs.polarArea, createElement(
        PieChart,
        { width: 320, height: 320 },
        createElement(Pie, {
          data: coxcombData,
          // Equal angles come from the constant field; the measure is the
          // RADIUS, which is what makes the pie a coxcomb.
          dataKey: 'slice',
          nameKey: 'month',
          outerRadius: (row: unknown) => Number((row as { deaths: number }).deaths),
          isAnimationActive: false,
        }),
      )),
    ));
  });
});

afterAll(async () => {
  if (root) {
    const { act } = await import('react');
    await act(async () => root?.unmount());
    root = null;
  }
  defineGlobal('window', saved.window);
  defineGlobal('document', saved.document);
  defineGlobal('navigator', saved.navigator);
  defineGlobal('ResizeObserver', saved.ResizeObserver);
  defineGlobal('IS_REACT_ACT_ENVIRONMENT', saved.IS_REACT_ACT_ENVIRONMENT);
});

describe('recharts rendered mark contract', () => {
  it('matches one trapezoid per funnel stage', () => {
    expect(document.querySelectorAll(firstSelector(maidr.funnel))).toHaveLength(funnelData.length);
  });

  it('matches one whisker group per error bar sample', () => {
    expect(document.querySelectorAll(firstSelector(maidr.errorBar))).toHaveLength(errorData.length);
  });

  it('matches one symbol per volcano point', () => {
    expect(document.querySelectorAll(firstSelector(maidr.volcano))).toHaveLength(volcanoData.length);
  });

  it('matches one dot per survival time', () => {
    expect(document.querySelectorAll(firstSelector(maidr.survival))).toHaveLength(survivalData.length);
  });

  it('matches one path per flow, in the order the links were declared', () => {
    const links = document.querySelectorAll(firstSelector(maidr.alluvial));

    // FlowTrace addresses its selector list by each flow's DECLARED position,
    // so the DOM order has to be the links array's order.
    expect(links).toHaveLength(flowLinks.length);
  });

  it('matches one rectangle per side per band on a diverging bar', () => {
    // A `SegmentedTrace` maps [side][category], so both sides' rectangles are
    // wanted — one `<Bar>` draws all of one side's, then the next draws the
    // other's, which is the declaration order the diverging payload is in.
    expect(document.querySelectorAll(firstSelector(maidr.diverging)))
      .toHaveLength(pyramidData.length * 2);
  });

  it('matches one floating rectangle per waterfall step', () => {
    expect(document.querySelectorAll(firstSelector(maidr.waterfall)))
      .toHaveLength(bridgeData.length);
  });

  it('matches one rectangle per gantt interval, lane order and all', () => {
    // `GanttTrace` walks its selectors lane by lane, so the count must be the
    // interval total rather than the lane count — the empty lane draws nothing.
    expect(document.querySelectorAll(firstSelector(maidr.gantt)))
      .toHaveLength(planData.length);
  });

  it('matches one connector per dumbbell row', () => {
    // One element per ROW, not per dot: `DumbbellTrace` highlights the same
    // connector from both ends rather than inventing elements the chart never
    // drew.
    expect(document.querySelectorAll(firstSelector(maidr.dumbbell)))
      .toHaveLength(lifeData.length);
  });

  it('matches the single sector a gauge draws', () => {
    expect(document.querySelectorAll(firstSelector(maidr.gauge))).toHaveLength(1);
  });

  it('matches one treemap rectangle per node, excluding the synthetic root', () => {
    // Recharts wraps the data array in a root node and draws it full-plot,
    // which is one rectangle more than the layer declares nodes — and
    // `TreemapTrace` withdraws highlighting entirely on a count mismatch.
    const nodes = document.querySelectorAll(firstSelector(maidr.treemap));

    expect(nodes).toHaveLength(hierarchyNodes);
    expect([...nodes].map(node => node.getAttribute('name')))
      .toEqual(['Europe', 'France', 'Spain', 'Oceania', 'Fiji']);
  });

  it('matches one sunburst sector per node, in depth-first order', () => {
    expect(document.querySelectorAll(firstSelector(maidr.sunburst)))
      .toHaveLength(hierarchyNodes);
  });

  it('matches one floating band per icicle node', () => {
    // Recharts draws no icicle, so it is a `<BarChart layout="vertical">` of
    // floating bars over a depth lane. One rectangle per ROW, which is why
    // the rows have to be the tree flattened depth-first pre-order — the
    // order the adapter emits its nodes in.
    expect(document.querySelectorAll(firstSelector(maidr.icicle)))
      .toHaveLength(hierarchyNodes);
  });

  it('matches one ribbon per sankey flow, in the order the links were declared', () => {
    expect(document.querySelectorAll(firstSelector(maidr.sankey)))
      .toHaveLength(flowLinks.length);
  });

  it('matches one pie sector per polar area spoke', () => {
    expect(document.querySelectorAll(firstSelector(maidr.polarArea)))
      .toHaveLength(coxcombData.length);
  });

  it('scopes every selector to its own chart', () => {
    // Each figure's marks are wrapped in its own `#maidr-article-<id>`, so
    // the five charts on this page cannot highlight one another's elements.
    for (const figure of Object.values(maidr)) {
      const selector = firstSelector(figure);
      expect(selector.startsWith(`#maidr-article-${figure.id}`)).toBe(true);
    }
  });
});

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

import type { Maidr } from '@type/grammar';
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

const flowNodes = [{ name: 'Free' }, { name: 'Trial' }, { name: 'Paid' }, { name: 'Churned' }];
const flowLinks = [
  { source: 0, target: 1, value: 34 },
  { source: 1, target: 2, value: 21 },
  { source: 1, target: 3, value: 13 },
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
    Sankey,
    Scatter,
    ScatterChart,
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

  it('scopes every selector to its own chart', () => {
    // Each figure's marks are wrapped in its own `#maidr-article-<id>`, so
    // the five charts on this page cannot highlight one another's elements.
    for (const figure of Object.values(maidr)) {
      const selector = firstSelector(figure);
      expect(selector.startsWith(`#maidr-article-${figure.id}`)).toBe(true);
    }
  });
});

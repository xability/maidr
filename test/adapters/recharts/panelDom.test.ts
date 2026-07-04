/**
 * Verifies the multi-panel DOM contract between the recharts adapter's emitted
 * MAIDR schema and the DOM that `<MaidrRecharts>` actually renders.
 *
 * Since commit 1c14563 the core layout pass (`resolveSubplotLayout`) fixes
 * vertical arrow-key inversion for multi-row grids WITHOUT matplotlib-style
 * `g[id^="axes_"]` groups — but only when every subplot's `selector` (or its
 * first layer's first selector) resolves to a real per-panel element whose
 * geometry can be measured. These tests mount the real component (recharts
 * charts included) in jsdom and assert that contract holds for every panel,
 * so a regression in either the emitted selectors or the generated wrapper
 * DOM re-introduces the inversion and fails here.
 */

import type { Maidr } from '@type/grammar';
import type { ReactElement } from 'react';
import type { Root } from 'react-dom/client';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { getPanelClassName } from '@adapters/recharts/selectors';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses the public JSDOM/Document surface.
import { JSDOM } from 'jsdom';

// MaidrApp only mounts after focus-in (contextValue starts null), so it never
// renders in these tests — mock it away to keep its ESM-only dependencies
// (react-markdown et al.) out of the ts-jest CJS transform.
jest.mock('@ui/App', () => ({ MaidrApp: () => null }));

const eastData = [
  { quarter: 'Q1', revenue: 100 },
  { quarter: 'Q2', revenue: 200 },
];
const westData = [
  { quarter: 'Q1', revenue: 80 },
  { quarter: 'Q2', revenue: 140 },
];
const northData = [
  { quarter: 'Q1', revenue: 60 },
  { quarter: 'Q2', revenue: 90 },
];
const southData = [
  { quarter: 'Q1', revenue: 70 },
  { quarter: 'Q2', revenue: 110 },
];

/** 2x2 grid matching examples/recharts/examples/FacetExample.tsx. */
const facetConfig = {
  id: 'facet-dom',
  title: 'Sales by Region',
  xKey: 'quarter',
  yKeys: ['revenue'],
  subplots: [
    [
      { title: 'East', chartType: 'bar' as const, data: eastData },
      { title: 'West', chartType: 'bar' as const, data: westData },
    ],
    [
      { title: 'North', chartType: 'bar' as const, data: northData },
      { title: 'South', chartType: 'bar' as const, data: southData },
    ],
  ],
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
let maidr: Maidr;

function defineGlobal(key: keyof MutableGlobals, value: unknown): void {
  Object.defineProperty(globals, key, { value, configurable: true, writable: true });
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
  // Recharts v3 observes its wrapper for size changes; jsdom has no
  // ResizeObserver, and explicit width/height props make a stub sufficient.
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  defineGlobal('ResizeObserver', ResizeObserverStub);

  // Import after the DOM globals exist so module-level environment checks in
  // React/recharts/component code see a browser-like environment.
  const { createElement } = await import('react');
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Bar, BarChart, XAxis, YAxis } = await import('recharts');
  const { MaidrRecharts } = await import('@adapters/recharts/MaidrRecharts');

  function barChart(data: Record<string, number | string>[]): ReactElement {
    return createElement(
      BarChart,
      { width: 320, height: 220, data },
      createElement(XAxis, { dataKey: 'quarter' }),
      createElement(YAxis, {}),
      createElement(Bar, { dataKey: 'revenue', isAnimationActive: false }),
    );
  }

  maidr = convertRechartsToMaidr(facetConfig);
  root = createRoot(document.getElementById('root') as HTMLElement);
  await act(async () => {
    // createElement's typing requires `children` in the props object even
    // when children are passed as rest arguments (which take precedence).
    root?.render(createElement(
      MaidrRecharts,
      { ...facetConfig, children: null },
      barChart(eastData),
      barChart(westData),
      barChart(northData),
      barChart(southData),
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

describe('recharts multi-panel rendered DOM contract', () => {
  it('resolves every emitted subplot selector to exactly one per-panel element', () => {
    for (const [rowIndex, row] of maidr.subplots.entries()) {
      for (const [colIndex, subplot] of row.entries()) {
        expect(subplot.selector).toBeDefined();
        const matches = document.querySelectorAll(subplot.selector as string);

        // Exactly one match: the layout pass measures this element's
        // geometry, and an ambiguous or empty match would silently push the
        // figure back onto the uninverted data-order fallback.
        expect(matches).toHaveLength(1);

        const panel = document.querySelector(`.${getPanelClassName(rowIndex, colIndex)}`);
        expect(panel).not.toBeNull();
        expect(matches[0].matches('svg.recharts-surface')).toBe(true);
        expect(panel?.contains(matches[0])).toBe(true);
      }
    }
  });

  it('resolves each subplot selector to a DISTINCT panel element', () => {
    const resolved = maidr.subplots.flat().map(subplot =>
      document.querySelector(subplot.selector as string),
    );

    expect(new Set(resolved).size).toBe(resolved.length);
  });

  it('places row 0 panels before row 1 panels in document order (top-first grid)', () => {
    // `<MaidrRecharts>` renders grid rows top-to-bottom, so data row 0 is the
    // visually TOP row. The core detects this from panel geometry and inverts
    // vertical arrow keys; this test pins the emitted-grid/rendered-DOM
    // agreement that the detection relies on.
    const topPanel = document.querySelector(maidr.subplots[0][0].selector as string) as Element;
    const bottomPanel = document.querySelector(maidr.subplots[1][0].selector as string) as Element;

    expect(
      topPanel.compareDocumentPosition(bottomPanel) & topPanel.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('scopes every layer selector to marks inside its own panel only', () => {
    for (const [rowIndex, row] of maidr.subplots.entries()) {
      for (const [colIndex, subplot] of row.entries()) {
        const selector = subplot.layers[0].selectors;
        expect(typeof selector).toBe('string');
        const marks = document.querySelectorAll(selector as string);
        const panel = document.querySelector(`.${getPanelClassName(rowIndex, colIndex)}`);

        // One rectangle per data point, all inside this panel's wrapper.
        expect(marks).toHaveLength(2);
        for (const mark of marks) {
          expect(panel?.contains(mark)).toBe(true);
        }
      }
    }
  });
});

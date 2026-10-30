/**
 * A Recharts treemap's regions outlined where they can be seen.
 *
 * `<Treemap>` draws a branch's own rectangle first and its children's over
 * it, edge to edge. The adapter declared every node and named each node's own
 * rectangle, so on the top level, where the reader enters, the outline of
 * Europe, Asia or the Americas was drawn under the countries that cover it,
 * and nothing was seen to move. The layer now declares the leaves alone: each
 * region is derived from its countries' paths and outlined through them.
 *
 * The real chart is mounted in jsdom, as `markDom.test.ts` does, because the
 * selector has to tell a leaf's rectangle from a branch's in the DOM Recharts
 * really draws.
 */

import type { Trace } from '@model/plot';
import type { Maidr, MaidrLayer } from '@type/grammar';
import type { Root } from 'react-dom/client';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { JSDOM } from 'jsdom';

// MaidrApp only mounts after focus-in, so it never renders here; mocked away
// to keep its ESM-only dependencies out of the CJS transform.
jest.mock('@ui/App', () => ({ MaidrApp: () => null }));

/** The example page's regions, each covered edge to edge by its countries. */
const regions = [
  {
    name: 'Europe',
    children: [
      { name: 'Germany', people: 83.2 },
      { name: 'France', people: 67.4 },
      { name: 'Spain', people: 47.4 },
    ],
  },
  {
    name: 'Asia',
    children: [
      { name: 'Japan', people: 125.1 },
      { name: 'Vietnam', people: 97.5 },
      { name: 'Nepal', people: 30.0 },
    ],
  },
  {
    name: 'Americas',
    children: [
      { name: 'Canada', people: 38.2 },
      { name: 'Peru', people: 33.7 },
    ],
  },
];

const config = {
  id: 'treemap-branches',
  title: 'Population by Region',
  data: regions,
  chartType: 'treemap' as const,
  xKey: 'name',
  yKeys: ['people'],
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
let trace: Trace | null = null;

function defineGlobal(key: keyof MutableGlobals, value: unknown): void {
  Object.defineProperty(globals, key, { value, configurable: true, writable: true });
}

/** The treemap's one layer. */
function layer(): MaidrLayer {
  return maidr.subplots[0][0].layers[0];
}

/**
 * The names of the rectangles the core outlines while a node is read.
 * @param depth - The node's depth: 0 for a region, 1 for a country
 * @param index - Its place among the nodes at that depth
 * @returns The `name` each outlined rectangle carries
 */
function outlinedAt(depth: number, index: number): (string | null)[] {
  trace = TraceFactory.create(layer());
  const state = trace.getStateAt(depth, index);
  if (state.empty || state.highlight.empty) {
    return [];
  }
  const { elements } = state.highlight;
  return (Array.isArray(elements) ? elements : [elements]).map(element => element.getAttribute('name'));
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
  const { Treemap } = await import('recharts');
  const { MaidrRecharts } = await import('@adapters/recharts/MaidrRecharts');

  maidr = convertRechartsToMaidr(config);
  root = createRoot(document.getElementById('root') as HTMLElement);
  await act(async () => {
    root?.render(createElement(
      MaidrRecharts,
      { ...config, children: null },
      // Filled, as the example page draws it, so each country covers its
      // region's rectangle entirely.
      createElement(Treemap, {
        width: 600,
        height: 350,
        data: regions,
        dataKey: 'people',
        nameKey: 'name',
        stroke: '#fff',
        fill: '#8884d8',
        isAnimationActive: false,
      }),
    ));
  });
});

afterEach(() => {
  // The trace copies the rectangles it outlines into the chart; disposing it
  // takes the copies out again, so the next case counts the chart as drawn.
  trace?.dispose();
  trace = null;
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

describe('a Recharts treemap drawn with filled leaves', () => {
  it('names the countries\' rectangles, in the order they are declared', () => {
    const names = [...document.querySelectorAll(layer().selectors as string)]
      .map(element => element.getAttribute('name'));

    expect(names).toEqual(['Germany', 'France', 'Spain', 'Japan', 'Vietnam', 'Nepal', 'Canada', 'Peru']);
  });

  it('outlines a region through the countries drawn over it', () => {
    expect(outlinedAt(0, 1)).toEqual(['Japan', 'Vietnam', 'Nepal']);
  });

  it('outlines a country by its own rectangle', () => {
    expect(outlinedAt(1, 3)).toEqual(['Japan']);
  });

  it('still reads each region\'s total and its share', () => {
    trace = TraceFactory.create(layer());

    const state = trace.getStateAt(0, 1);

    expect(state.empty).toBe(false);
    if (state.empty) {
      return;
    }
    expect(state.text.main.value).toBe('Asia');
    expect(state.text.cross?.value).toBeCloseTo(252.6);
  });
});

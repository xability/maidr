/**
 * @jest-environment jsdom
 */

import type { PowerBIBinding, PowerBIBindOptions } from '@adapters/powerbi/binder';
import type { PowerBIDataPointRef, PowerBIDataView } from '@adapters/powerbi/types';
import type { Maidr } from '@type/grammar';
import type { ReactNode } from 'react';
import { bindPowerBI } from '@adapters/powerbi/binder';
import { liveDataManager } from '@service/liveData';
import { act } from 'react';

/**
 * Every set of props the stand-in `<Maidr>` was rendered with, in order.
 *
 * Named `mock…` so Jest lets the hoisted factory below close over it.
 */
const mockRenders: { data: Maidr }[] = [];

/**
 * `<Maidr>` stands in for itself here, for the same reason as in the Tableau
 * binder's tests: it reaches `react-markdown` and `rehype-sanitize` through the
 * chat panel, both of which are ESM-only, and this project compiles to
 * CommonJS. Everything this file asserts — where the wrapper lands, what is
 * rendered when, what dispose hands back, how a position is resolved — is the
 * binder's own work rather than the component's, which `test/ui/` covers. The
 * stub records the props it was given, so a test can see whether an update
 * re-rendered and with what data, and renders its children so the anchor or
 * the visual's drawing still ends up inside the wrapper.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
    mockRenders.push({ data: props.data });
    return props.children;
  },
}));

/**
 * The Power BI binder: what it does to the visual's element, and when it
 * re-renders.
 *
 * 1. **One wrapper, appended.** Power BI owns the element it hands the visual;
 *    the binder adds a single wrapper to it and takes it out again on dispose.
 * 2. **MAIDR is not mounted when there is nothing to navigate.** `Figure`
 *    cannot be built from an empty subplot; a focusable empty state stands in
 *    for it, and the visual's own drawing stays visible.
 * 3. **An update that changes nothing re-renders nothing.** Power BI calls
 *    `update()` on every resize and format-pane change; re-rendering then
 *    would disturb a reader inside the chart.
 * 4. **A position resolves against the data the reader is navigating.** Each
 *    conversion gets its own `onNavigate` closure.
 */

// React only flushes `act()` scopes synchronously when told it is in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The converter warns about data it cannot read; none of these fixtures should
// trip it, and a test that expects a warning can read this spy.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

const navigateSpies: jest.SpiedFunction<typeof liveDataManager.navigateTo>[] = [];

/**
 * Stand in for the registry's `navigateTo`. Nothing registers a chart here —
 * the stub `<Maidr>` mounts no controller — so what the binder asks the
 * registry for is observed at the call rather than by where a cursor lands.
 */
function spyNavigate(accepted = true): jest.SpiedFunction<typeof liveDataManager.navigateTo> {
  const spy = jest.spyOn(liveDataManager, 'navigateTo').mockReturnValue(accepted);
  navigateSpies.push(spy);
  return spy;
}

/** A column chart's data view: one category, one measure. */
function salesView(east = 10, west = 20): PowerBIDataView {
  return {
    categorical: {
      categories: [{
        source: { displayName: 'Region', roles: { category: true } },
        values: ['East', 'West'],
      }],
      values: [{
        source: { displayName: 'Sales', roles: { measure: true }, isMeasure: true },
        values: [east, west],
      }],
    },
  };
}

/** A scatter's data view: one detail field, x and y measures. */
function scatterView(): PowerBIDataView {
  return {
    categorical: {
      categories: [{
        source: { displayName: 'Store', roles: { category: true } },
        values: ['A', 'B', 'C'],
      }],
      values: [
        { source: { displayName: 'Cost', roles: { x: true }, isMeasure: true }, values: [1, 2, 3] },
        { source: { displayName: 'Profit', roles: { y: true }, isMeasure: true }, values: [4, 5, 6] },
      ],
    },
  };
}

function categorical(categoryIndex: number | null, valueColumnIndex: number | null): PowerBIDataPointRef {
  return { kind: 'categorical', categoryIndex, valueColumnIndex };
}

let host: HTMLElement;
const bindings: PowerBIBinding[] = [];

/** Bind to a fresh host, inside `act()` so nothing is left pending. */
function bind(options: PowerBIBindOptions): PowerBIBinding {
  let binding: PowerBIBinding | undefined;
  act(() => {
    binding = bindPowerBI(host, options);
  });
  if (binding === undefined) {
    throw new Error('expected a binding');
  }
  bindings.push(binding);
  return binding;
}

function update(
  binding: PowerBIBinding,
  ...args: Parameters<PowerBIBinding['update']>
): ReturnType<PowerBIBinding['update']> {
  let result: ReturnType<PowerBIBinding['update']> = null;
  act(() => {
    result = binding.update(...args);
  });
  return result;
}

function dispose(binding: PowerBIBinding): void {
  act(() => {
    binding.dispose();
  });
}

function wrapper(): HTMLElement {
  const found = host.querySelector<HTMLElement>('[data-maidr-powerbi]');
  if (found === null) {
    throw new Error('expected a mounted wrapper');
  }
  return found;
}

/** The data `<Maidr>` was last rendered with. */
function lastData(): Maidr {
  const last = mockRenders.at(-1);
  if (last === undefined) {
    throw new Error('expected <Maidr> to have rendered');
  }
  return last.data;
}

describe('powerbi binder', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    mockRenders.length = 0;
    warn.mockClear();
  });

  afterEach(() => {
    for (const binding of bindings.splice(0)) {
      dispose(binding);
    }
    document.body.innerHTML = '';
    for (const spy of navigateSpies.splice(0)) {
      spy.mockRestore();
    }
  });

  afterAll(() => {
    warn.mockRestore();
  });

  describe('mounting', () => {
    it('should append one wrapper, tagged with the figure id, to the element', () => {
      const existing = document.createElement('span');
      host.append(existing);

      bind({ chartType: 'column', id: 'sales' });

      expect(host.children).toHaveLength(2);
      expect(host.firstElementChild).toBe(existing);
      expect(wrapper().getAttribute('data-maidr-powerbi')).toBe('sales');
    });

    it('should mount a focusable empty state, not MAIDR, for an undefined or empty data view', () => {
      const binding = bind({ chartType: 'column' });

      expect(update(binding, undefined)).toBeNull();
      expect(update(binding, { categorical: { categories: [], values: [] } })).toBeNull();

      expect(binding.conversion).toBeNull();
      expect(mockRenders).toHaveLength(0);
      const empty = wrapper().querySelector<HTMLElement>('[data-maidr-powerbi-empty]');
      expect(empty?.textContent).toBe('No data to read');
      expect(empty?.tabIndex).toBe(0);
      expect(empty?.getAttribute('role')).toBe('status');
    });

    it('should say what emptyLabel says in the empty state', () => {
      const binding = bind({ chartType: 'column', emptyLabel: 'Pick a region' });

      update(binding, undefined);

      expect(wrapper().querySelector('[data-maidr-powerbi-empty]')?.textContent).toBe('Pick a region');
    });

    it('should still host the chart in chart mode while there is nothing to navigate', () => {
      const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.append(chart);
      const binding = bind({ chartType: 'column', chart });

      update(binding, undefined);

      expect(mockRenders).toHaveLength(0);
      expect(wrapper().contains(chart)).toBe(true);
      // The drawing shows its own empty state; the status is for a screen
      // reader only.
      const empty = wrapper().querySelector<HTMLElement>('[data-maidr-powerbi-empty]');
      expect(empty?.style.position).toBe('absolute');
    });

    it('should unmount MAIDR again when the data goes away', () => {
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());
      expect(wrapper().querySelector('[data-maidr-powerbi-anchor]')).not.toBeNull();

      expect(update(binding, undefined)).toBeNull();

      expect(wrapper().querySelector('[data-maidr-powerbi-anchor]')).toBeNull();
      expect(wrapper().querySelector('[data-maidr-powerbi-empty]')).not.toBeNull();
    });

    it('should hand focus to the empty state when the figure the reader was in goes away', () => {
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());
      const anchor = wrapper().querySelector<HTMLElement>('[data-maidr-powerbi-anchor]');
      if (anchor === null) {
        throw new Error('expected the anchor');
      }
      anchor.tabIndex = 0;
      anchor.focus();

      update(binding, undefined);

      expect(document.activeElement?.hasAttribute('data-maidr-powerbi-empty')).toBe(true);
    });

    it('should leave focus alone when the reader is elsewhere', () => {
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());

      update(binding, undefined);

      expect(document.activeElement).toBe(outside);
    });
  });

  describe('companion mode', () => {
    function anchorText(): string | null {
      return wrapper().querySelector('[data-maidr-powerbi-anchor]')?.textContent ?? null;
    }

    it('should label the anchor with the label option', () => {
      const binding = bind({ chartType: 'column', title: 'Sales', label: 'Read sales by region' });
      update(binding, salesView());

      expect(anchorText()).toBe('Read sales by region');
    });

    it('should fall back to the title', () => {
      const binding = bind({ chartType: 'column', title: 'Sales' });
      update(binding, salesView());

      expect(anchorText()).toBe('Sales');
    });

    it('should default to "Accessible chart"', () => {
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());

      expect(anchorText()).toBe('Accessible chart');
    });
  });

  describe('chart mode', () => {
    it('should move the chart inside the wrapper and hand it back on dispose', () => {
      const chart = document.createElement('canvas');
      host.append(chart);
      const binding = bind({ chartType: 'column', chart });

      update(binding, salesView());

      expect(wrapper().contains(chart)).toBe(true);
      expect(wrapper().querySelector('[data-maidr-powerbi-anchor]')).toBeNull();

      dispose(binding);

      expect(host.querySelector('[data-maidr-powerbi]')).toBeNull();
      expect(chart.parentNode).toBe(host);
    });

    it('should keep the same chart node across a re-render', () => {
      const chart = document.createElement('canvas');
      const binding = bind({ chartType: 'column', chart });

      update(binding, salesView());
      update(binding, salesView(30, 40));

      expect(wrapper().querySelectorAll('canvas')).toHaveLength(1);
      expect(wrapper().contains(chart)).toBe(true);
    });
  });

  describe('updating', () => {
    it('should not re-render when the data has not changed', () => {
      const binding = bind({ chartType: 'column' });
      const first = update(binding, salesView());
      expect(mockRenders).toHaveLength(1);

      const second = update(binding, salesView());

      expect(second).toBe(first);
      expect(binding.conversion).toBe(first);
      expect(mockRenders).toHaveLength(1);
    });

    it('should re-render with new data when the data changed', () => {
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());
      const before = lastData();

      const next = update(binding, salesView(10, 25));

      expect(mockRenders).toHaveLength(2);
      expect(lastData()).not.toBe(before);
      expect(lastData().subplots[0][0].layers[0].data).toEqual([
        { x: 'East', y: 10 },
        { x: 'West', y: 25 },
      ]);
      expect(binding.conversion).toBe(next);
    });

    it('should keep overrides for later updates', () => {
      const binding = bind({ chartType: 'column', title: 'Before' });
      update(binding, salesView(), { chartType: 'bar', title: 'After' });

      update(binding, salesView(1, 2));

      const data = lastData();
      expect(data.title).toBe('After');
      expect(data.subplots[0][0].layers[0].orientation).toBe('horz');
      expect(wrapper().querySelector('[data-maidr-powerbi-anchor]')?.textContent).toBe('After');
    });

    it('should keep the figure id stable across updates', () => {
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());
      const id = lastData().id;

      update(binding, salesView(5, 6));
      update(binding, salesView(7, 8), { title: 'Renamed' });

      expect(mockRenders).toHaveLength(3);
      expect(mockRenders.map(render => render.data.id)).toEqual([id, id, id]);
      expect(wrapper().getAttribute('data-maidr-powerbi')).toBe(id);
    });

    it('should use options.id as the figure id', () => {
      const binding = bind({ chartType: 'column', id: 'my-visual' });
      update(binding, salesView());

      expect(lastData().id).toBe('my-visual');
      expect(binding.conversion?.maidr.id).toBe('my-visual');
    });

    it('should be live unless told otherwise', () => {
      const byDefault = bind({ chartType: 'column' });
      update(byDefault, salesView());
      expect(lastData().live).toBe(true);
      dispose(byDefault);

      const off = bind({ chartType: 'column', live: false });
      update(off, salesView());
      expect(lastData().live).toBeUndefined();
    });

    it('should return null and do nothing after dispose', () => {
      const binding = bind({ chartType: 'column' });
      dispose(binding);

      expect(update(binding, salesView())).toBeNull();
      expect(binding.conversion).toBeNull();
      expect(mockRenders).toHaveLength(0);
      expect(host.childNodes).toHaveLength(0);
    });
  });

  describe('onNavigate', () => {
    it('should resolve positions to refs, and report null when the reader leaves', () => {
      const onNavigate = jest.fn();
      const binding = bind({ chartType: 'column', onNavigate });
      update(binding, salesView());

      lastData().onNavigate?.({ layerId: '0', row: 0, col: 1 });
      lastData().onNavigate?.(null);

      expect(onNavigate.mock.calls).toEqual([
        [[categorical(1, 0)]],
        [null],
      ]);
    });

    it('should resolve scatter points by index', () => {
      const onNavigate = jest.fn();
      const binding = bind({ chartType: 'scatter', onNavigate });
      update(binding, scatterView());

      lastData().onNavigate?.({ layerId: '0', row: 0, col: 0, pointIndices: [2] });

      expect(onNavigate).toHaveBeenCalledWith([categorical(2, 0)]);
    });

    it('should resolve an older closure against the conversion it was built from', () => {
      const onNavigate = jest.fn();
      const binding = bind({ chartType: 'column', onNavigate });
      update(binding, salesView());
      const older = lastData().onNavigate;

      // The second view drops the blank first region, so position 0 now
      // stands for a different category row.
      update(binding, salesView(Number.NaN, 20));
      lastData().onNavigate?.({ layerId: '0', row: 0, col: 0 });
      older?.({ layerId: '0', row: 0, col: 0 });

      expect(onNavigate.mock.calls).toEqual([
        [[categorical(1, 0)]],
        [[categorical(0, 0)]],
      ]);
    });

    it('should report null once when focus leaves after a position was reported', async () => {
      const onNavigate = jest.fn();
      const binding = bind({ chartType: 'column', onNavigate });
      update(binding, salesView());
      const figure = wrapper();
      figure.tabIndex = -1;
      figure.focus();
      lastData().onNavigate?.({ layerId: '0', row: 0, col: 1 });

      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      await new Promise(resolve => setTimeout(resolve, 0));
      figure.focus();
      outside.focus();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(onNavigate.mock.calls).toEqual([
        [[categorical(1, 0)]],
        [null],
      ]);
    });

    it('should report null when the visual\'s frame loses focus with the reader inside', async () => {
      const onNavigate = jest.fn();
      const binding = bind({ chartType: 'column', onNavigate });
      update(binding, salesView());
      const figure = wrapper();
      figure.tabIndex = -1;
      figure.focus();
      lastData().onNavigate?.({ layerId: '0', row: 0, col: 1 });

      // The reader moved to a slicer: the frame's focused element stays put,
      // and only `focusout` and `document.hasFocus()` say they went.
      const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
      figure.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
      hasFocus.mockRestore();

      expect(onNavigate).toHaveBeenLastCalledWith(null);
    });

    it('should not report null on leaving when nothing was reported', async () => {
      const onNavigate = jest.fn();
      const binding = bind({ chartType: 'column', onNavigate });
      update(binding, salesView());
      const figure = wrapper();
      figure.tabIndex = -1;
      figure.focus();

      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('should tolerate no onNavigate option', () => {
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());

      expect(() => lastData().onNavigate?.({ layerId: '0', row: 0, col: 0 })).not.toThrow();
    });
  });

  describe('navigateTo', () => {
    it('should move to a grid layer\'s cell', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column', id: 'grid' });
      update(binding, salesView());

      expect(binding.navigateTo(categorical(1, 0))).toBe(true);

      expect(navigate).toHaveBeenCalledWith({ layerId: '0', row: 0, col: 1 }, { id: 'grid' });
    });

    it('should move to a scatter point', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'scatter', id: 'points' });
      update(binding, scatterView());

      expect(binding.navigateTo(categorical(2, 0))).toBe(true);

      expect(navigate).toHaveBeenCalledWith({ layerId: '0', pointIndex: 2 }, { id: 'points' });
    });

    it('should pass a withdrawal through as null', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column', id: 'grid' });
      update(binding, salesView());

      expect(binding.navigateTo(null)).toBe(true);

      expect(navigate).toHaveBeenCalledWith(null, { id: 'grid' });
    });

    it('should report what the chart answered', () => {
      spyNavigate(false);
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());

      expect(binding.navigateTo(categorical(0, 0))).toBe(false);
    });

    it('should return false for an unknown ref without asking the chart', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());

      expect(binding.navigateTo(categorical(5, 0))).toBe(false);
      expect(binding.navigateTo({ kind: 'table', rowIndex: 0 })).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('should return false with no conversion mounted', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column' });

      expect(binding.navigateTo(categorical(0, 0))).toBe(false);
      expect(binding.navigateTo(null)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('should return false after dispose', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column' });
      update(binding, salesView());
      dispose(binding);

      expect(binding.navigateTo(categorical(0, 0))).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('navigateTo while the reader is inside, with live off', () => {
    /** Put the reader's focus inside the figure. */
    function enter(): void {
      const figure = wrapper();
      figure.tabIndex = -1;
      figure.focus();
    }

    /** Move focus out of the figure and let the deferred check run. */
    async function leave(): Promise<void> {
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Position 1 of the first view is West; the second drops the blank East,
    // so West moves to position 0.
    const WEST = categorical(1, 0);

    it('should address the data MAIDR is navigating until the reader leaves', async () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column', id: 'staged', live: false });
      update(binding, salesView());
      enter();

      update(binding, salesView(Number.NaN, 20));
      binding.navigateTo(WEST);
      await leave();
      binding.navigateTo(WEST);

      expect(navigate.mock.calls).toEqual([
        [{ layerId: '0', row: 0, col: 1 }, { id: 'staged' }],
        [{ layerId: '0', row: 0, col: 0 }, { id: 'staged' }],
      ]);
    });

    it('should keep the staged data while focus moves within the figure', async () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column', id: 'staged', live: false });
      update(binding, salesView());
      enter();
      update(binding, salesView(Number.NaN, 20));

      const anchor = wrapper().querySelector<HTMLElement>('[data-maidr-powerbi-anchor]');
      if (anchor === null) {
        throw new Error('expected the anchor');
      }
      anchor.tabIndex = -1;
      anchor.focus();
      await new Promise(resolve => setTimeout(resolve, 0));
      binding.navigateTo(WEST);

      expect(navigate).toHaveBeenCalledWith({ layerId: '0', row: 0, col: 1 }, { id: 'staged' });
    });

    it('should address the new data at once when live, the default', () => {
      const navigate = spyNavigate();
      const binding = bind({ chartType: 'column', id: 'live' });
      update(binding, salesView());
      enter();

      update(binding, salesView(Number.NaN, 20));
      binding.navigateTo(WEST);

      expect(navigate).toHaveBeenCalledWith({ layerId: '0', row: 0, col: 0 }, { id: 'live' });
    });
  });

  describe('dispose', () => {
    it('should remove the wrapper and be safe to call twice', () => {
      const chart = document.createElement('canvas');
      const binding = bind({ chartType: 'column', chart });
      update(binding, salesView());

      dispose(binding);
      expect(() => dispose(binding)).not.toThrow();

      expect(host.querySelector('[data-maidr-powerbi]')).toBeNull();
      expect(host.childNodes).toHaveLength(1);
      expect(chart.parentNode).toBe(host);
    });
  });
});

/**
 * @jest-environment jsdom
 */

import type { TableauSheet, TableauViz } from '@adapters/tableau/types';
import type { ReactNode } from 'react';
import type { FakeCell, FakeWorksheet } from './helpers';
import { bindTableau } from '@adapters/tableau/binder';
import {
  fakeColumn,
  fakeDashboard,
  fakeDashboardViz,
  fakeViz,
  fakeWorksheet,
} from './helpers';

/**
 * `<Maidr>` stands in for itself here, for a reason that is about module
 * systems rather than about scope: it reaches `react-markdown` and
 * `rehype-sanitize` through the chat panel, both of which are ESM-only, and
 * this project compiles to CommonJS. Everything this file asserts — where the
 * wrapper lands, when a read happens, what dispose takes back out — is the
 * binder's own DOM and scheduling work rather than React's, and the component's
 * behaviour is covered by `test/ui/`. The stub renders its children so the
 * keyboard anchor still ends up inside the wrapper.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { children: ReactNode }): ReactNode => props.children,
}));

/**
 * The Tableau binder: what it does to the host page, and when it re-reads.
 *
 * These behaviours are contracts rather than conveniences, and each has a
 * failure mode that is invisible until someone is using a screen reader:
 *
 * 1. **The `<tableau-viz>` element is never moved.** It is a custom element, so
 *    re-parenting re-runs `connectedCallback` and may reload the iframe. The
 *    accessible layer is inserted immediately *before* it, which also puts the
 *    keyboard entry point ahead of the iframe in DOM order.
 * 2. **Nothing is mounted when there is nothing to navigate.** `Figure` crashes
 *    on a subplot with no layers, so a figure that would be empty is not
 *    rendered at all and the page is left byte-identical.
 * 3. **One re-read per burst.** A single dashboard filter fires several change
 *    events; reading once at the end of the burst is both cheaper and more
 *    truthful, and the pre-read clear has to land before the read it exists to
 *    unbias.
 * 4. **A failed refresh keeps the previous figure.** A stale-but-correct figure
 *    is still fully navigable; an unmounted one is nothing at all.
 * 5. **The wait for the viz always ends.** A viz that fails to load, or never
 *    says anything at all, resolves to `null` — the one outcome a page can act
 *    on. A promise that never settles leaves the page with no chart and no
 *    error.
 * 6. **A tab switch re-discovers the worksheets.** The sheet the reader left
 *    describes a view that is no longer on screen, and the selection it holds
 *    has to be cleared before it stops being reachable.
 * 7. **The selection bridge never runs ahead of the mounted figure.** Without
 *    `live`, MAIDR keeps navigating the previous read until focus leaves, so a
 *    bridge built from a newer read is staged until then — otherwise MAIDR
 *    announces one mark while Tableau highlights another. Leaving the figure
 *    also clears the selection.
 *
 * The debounce is driven with fake timers so the burst is expressed as the
 * milliseconds between two events rather than as a sleep. `queueMicrotask` is
 * left real: the selection guard lowers its flag through it, and faking it
 * would park that behind a timer that a test never advances.
 */

const REGION = fakeColumn('Region', 'string', 0);
const SALES = fakeColumn('SUM(Sales)', 'float', 1);

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

/** The debounce window, plus enough to cross it. */
const AFTER_DEBOUNCE_MS = 300;

/**
 * Drain the microtask queue.
 *
 * Once the debounce has fired, a refresh is a chain of `await`s over promises
 * that resolve immediately — no timer is involved — so yielding repeatedly lets
 * it run to completion without the test having to know how many `await`s deep
 * the implementation happens to be.
 *
 * @returns A promise that settles once the queue has been drained.
 */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 50; turn++) {
    await Promise.resolve();
  }
}

/**
 * Let a burst of change events settle and the refresh they triggered finish.
 *
 * @returns A promise that settles once the debounced refresh has run.
 */
async function settle(): Promise<void> {
  await jest.advanceTimersByTimeAsync(AFTER_DEBOUNCE_MS);
  await flush();
}

/**
 * Build a worksheet holding two rows of one dimension and one measure.
 *
 * @param name - The worksheet name.
 * @param log - A shared call log, so several worksheets record into one order.
 * @returns The worksheet.
 */
function salesWorksheet(name: string, log?: string[]): FakeWorksheet {
  return fakeWorksheet({
    name,
    columns: [REGION, SALES],
    rows: [['East', 10], ['West', 20]],
    ...(log === undefined ? {} : { log }),
  });
}

/**
 * Put a viz on the page, preceded by a sibling so its position is observable.
 *
 * @param worksheets - The dashboard's worksheets, in add-order.
 * @returns The host, the marker sibling and the viz.
 */
function mountViz(worksheets: readonly FakeWorksheet[]): {
  host: HTMLElement;
  marker: HTMLElement;
  viz: TableauViz;
} {
  const host = document.createElement('div');
  const marker = document.createElement('span');
  const viz = fakeDashboardViz(worksheets);
  host.append(marker, viz);
  document.body.append(host);

  return { host, marker, viz };
}

/**
 * Put a viz on the page whose active sheet the test decides, and can change.
 *
 * Starting with no sheet models a viz that has not become interactive: reading
 * `workbook` throws, exactly as the real element does before `firstinteractive`.
 *
 * @param active - The sheet to start active, or `null` for a loading viz.
 * @returns The viz and the setter that switches its active sheet.
 */
function mountControlledViz(active: TableauSheet | null = null): {
  viz: TableauViz;
  setActiveSheet: (sheet: TableauSheet | null) => void;
} {
  const host = document.createElement('div');
  const { viz, setActiveSheet } = fakeViz(active);
  host.append(viz);
  document.body.append(host);

  return { viz, setActiveSheet };
}

/** Every element on the page the binder claims as its own. */
function wrappers(): NodeListOf<Element> {
  return document.querySelectorAll('[data-maidr-tableau]');
}

/** How many summary-data readers a worksheet has been asked for. */
function reads(worksheet: FakeWorksheet): number {
  return worksheet.calls.log.filter(entry => entry.startsWith('open:')).length;
}

/**
 * The wrapper the binder mounted, as an element a test can focus.
 *
 * Focus is asked about with `wrapper.contains(document.activeElement)`, and a
 * node contains itself, so making the wrapper itself focusable puts the test
 * inside the figure without depending on anything React rendered into it.
 *
 * @returns The wrapper.
 * @throws When nothing is mounted.
 */
function mountedWrapper(): HTMLElement {
  const wrapper = document.querySelector<HTMLElement>('[data-maidr-tableau]');
  if (wrapper === null) {
    throw new Error('expected a mounted wrapper');
  }
  wrapper.tabIndex = -1;
  return wrapper;
}

/** Every field/value pair the worksheet was last asked to select. */
function lastSelection(worksheet: FakeWorksheet): unknown {
  const call = worksheet.calls.selections.at(-1);
  return call === undefined ? null : call.criteria;
}

describe('tableau binder', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    warn.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  afterAll(() => {
    warn.mockRestore();
  });

  describe('waiting for the viz', () => {
    it('should read nothing until the viz becomes interactive', async () => {
      const sales = salesWorksheet('Sales');
      const { viz, setActiveSheet } = mountControlledViz();

      const pending = bindTableau(viz);
      await flush();

      // `workbook` is an accessor that throws before the viz is interactive, so
      // a binder that took the property's existence for readiness would already
      // have read — or crashed — by now.
      expect(sales.calls.log).toEqual([]);
      expect(wrappers()).toHaveLength(0);

      setActiveSheet(fakeDashboard([sales]));
      viz.dispatchEvent(new Event('firstinteractive'));
      const binding = await pending;

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure once interactive');
      }
      expect(reads(sales)).toBe(1);

      binding.dispose();
    });

    it('should resolve null, not hang, when the viz reports a load error', async () => {
      const { viz } = mountControlledViz();

      const pending = bindTableau(viz);
      await flush();
      viz.dispatchEvent(new CustomEvent('vizloaderror', {
        detail: { errorCode: 'unknown-auth-error', message: 'not authorised' },
      }));

      // A caller can act on `null`; it cannot act on a promise that never
      // settles, which is what a page gets if the wait only listens for
      // `firstinteractive`.
      await expect(pending).resolves.toBeNull();
      expect(wrappers()).toHaveLength(0);
      expect(warn.mock.calls.map(call => String(call[0])).join('\n'))
        .toContain('unknown-auth-error');
    });

    it('should resolve null after a timeout when the viz says nothing at all', async () => {
      const { viz } = mountControlledViz();

      let settled = false;
      const pending = bindTableau(viz).then((binding) => {
        settled = true;
        return binding;
      });

      // A viz too old to fire `vizloaderror`, or pointed at an unreachable
      // host, never speaks at all — so the wait needs a floor of its own. It is
      // a floor and not a poll: nothing has given up a moment before it.
      await jest.advanceTimersByTimeAsync(29_000);

      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toBeNull();
      expect(wrappers()).toHaveLength(0);
    });
  });

  describe('mounting', () => {
    it('should insert its wrapper immediately before the viz without moving it', async () => {
      const sales = salesWorksheet('Sales');
      const { host, marker, viz } = mountViz([sales]);

      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      // The viz keeps its parent and its position: the wrapper is a new sibling
      // in front of it, not a new home for it.
      expect(viz.parentElement).toBe(host);
      expect([...host.children]).toEqual([marker, viz.previousElementSibling, viz]);
      expect(viz.previousElementSibling?.getAttribute('data-maidr-tableau'))
        .toBe(binding.maidr.id);

      binding.dispose();
    });

    it('should mount nothing and return null when every worksheet is skipped', async () => {
      const sales = salesWorksheet('Sales');
      const { host, marker, viz } = mountViz([sales]);

      const binding = await bindTableau(viz, {
        overrides: { Sales: { skip: true } },
      });

      expect(binding).toBeNull();
      expect(wrappers()).toHaveLength(0);
      expect([...host.children]).toEqual([marker, viz]);
      // Nothing was read either: a skipped worksheet is skipped before it costs
      // a reader, not after.
      expect(sales.calls.log).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshing', () => {
    it('should re-read once for a burst of change events, after clearing the selection', async () => {
      const sales = salesWorksheet('Sales');
      const { viz } = mountViz([sales]);
      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      sales.calls.log.length = 0;

      viz.dispatchEvent(new Event('filterchanged'));
      await jest.advanceTimersByTimeAsync(50);
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();

      expect(reads(sales)).toBe(1);
      // `ignoreSelection` is documented backwards on both Tableau surfaces, so
      // the adapter removes the selection instead of guessing — which is only
      // true if the clear actually lands before the read. Its presence is
      // asserted first on purpose: comparing indices alone passes when the
      // clear never happens at all, since `indexOf` then returns -1.
      expect(sales.calls.log).toContain('clear:Sales');
      expect(sales.calls.log.indexOf('clear:Sales'))
        .toBeLessThan(sales.calls.log.indexOf('open:Sales'));

      binding.dispose();
    });

    it('should still re-read for a second burst after the first has settled', async () => {
      const sales = salesWorksheet('Sales');
      const { viz } = mountViz([sales]);
      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      sales.calls.log.length = 0;

      // The debounce collapses a burst; it is not a one-shot latch, and a
      // dashboard the reader keeps filtering has to keep being re-read.
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();
      viz.dispatchEvent(new Event('parameterchanged'));
      await settle();

      expect(reads(sales)).toBe(2);

      binding.dispose();
    });

    it('should keep the previously mounted figure when a refresh fails', async () => {
      const sales = salesWorksheet('Sales');
      const { viz } = mountViz([sales]);
      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      const mounted = binding.maidr;
      const wrapper = wrappers()[0];
      warn.mockClear();

      sales.getSummaryColumnsInfoAsync = async (): Promise<never> => {
        throw new Error('the view went away');
      };
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();

      expect([...wrappers()]).toEqual([wrapper]);
      expect(binding.maidr).toBe(mounted);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('a refresh failed');

      binding.dispose();
    });

    it('should re-discover the worksheets when the reader switches tabs', async () => {
      const log: string[] = [];
      const sales = salesWorksheet('Sales', log);
      const profit = salesWorksheet('Profit', log);
      const { viz, setActiveSheet } = mountControlledViz(fakeDashboard([sales]));
      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      log.length = 0;

      setActiveSheet(fakeDashboard([profit], 'Dashboard 2'));
      viz.dispatchEvent(new Event('tabswitched'));
      await settle();

      // The figure describes the tab that is now on screen, not the one the
      // reader left — the worksheets are re-discovered, not reused.
      expect(binding.maidr.subplots[0][0].layers[0].title).toBe('Profit');
      expect(log).toContain('open:Profit');
      // The sheet left behind is cleared and never read again: a selection
      // stranded in a tab nobody is looking at can no longer be taken back.
      expect(log.filter(entry => entry.includes('Sales'))).toEqual(['clear:Sales']);
      expect(log.indexOf('clear:Sales')).toBeLessThan(log.indexOf('open:Profit'));

      binding.dispose();
    });

    it('should keep the previous figure when the new tab has nothing to read', async () => {
      const sales = salesWorksheet('Sales');
      const { viz, setActiveSheet } = mountControlledViz(fakeDashboard([sales]));
      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      const mounted = binding.maidr;
      const wrapper = wrappers()[0];
      warn.mockClear();

      // Reading a worksheet inside a story is a documented Tableau limitation,
      // so switching to one leaves nothing to discover.
      setActiveSheet({ name: 'Story 1', sheetType: 'story' });
      viz.dispatchEvent(new Event('tabswitched'));
      await settle();

      expect([...wrappers()]).toEqual([wrapper]);
      expect(binding.maidr).toBe(mounted);
      expect(warn.mock.calls.map(call => String(call[0])).join('\n'))
        .toContain('keeping whatever was already mounted');

      binding.dispose();
    });
  });

  describe('keeping the bridge in step with the mounted figure', () => {
    /**
     * Mount a figure over rows the test can change under it.
     *
     * @param live - Whether to opt into in-place refresh.
     * @returns The worksheet, its mutable rows, the viz to fire change events
     * at, the focusable wrapper, and the binding.
     */
    async function mountOverMutableRows(live = false): Promise<{
      sales: FakeWorksheet;
      rows: FakeCell[][];
      viz: TableauViz;
      wrapper: HTMLElement;
      binding: NonNullable<Awaited<ReturnType<typeof bindTableau>>>;
    }> {
      const rows: FakeCell[][] = [['East', 10], ['West', 20]];
      const sales = fakeWorksheet({ name: 'Sales', columns: [REGION, SALES], rows });
      const { viz } = mountViz([sales]);
      const binding = await bindTableau(viz, live ? { live: true } : {});

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      return { sales, rows, viz, wrapper: mountedWrapper(), binding };
    }

    /**
     * Navigate to the first cell and wait for the selection it fires.
     *
     * @param binding - The mounted binding.
     * @param sales - The worksheet the selection lands in.
     * @returns The criteria Tableau was last asked to select by.
     */
    async function navigateToFirstCell(
      binding: NonNullable<Awaited<ReturnType<typeof bindTableau>>>,
      sales: FakeWorksheet,
    ): Promise<unknown> {
      sales.calls.selections.length = 0;
      binding.maidr.onNavigate?.({ layerId: '0', row: 0, col: 0 });
      await flush();
      return lastSelection(sales);
    }

    it('should keep serving the mounted read while the reader is inside the figure', async () => {
      const { sales, rows, viz, wrapper, binding } = await mountOverMutableRows();

      wrapper.focus();
      rows[0] = ['North', 30];
      rows[1] = ['South', 40];
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();

      expect(reads(sales)).toBe(2);
      // Without `live`, `useMaidrController` keeps the reader on the figure it
      // is already navigating. A `{layerId, row, col}` only addresses the read
      // it was built from, so adopting the new index here would highlight
      // `North` while MAIDR announced `East`.
      await expect(navigateToFirstCell(binding, sales)).resolves.toEqual([
        { fieldName: 'Region', value: 'East' },
      ]);

      binding.dispose();
    });

    it('should adopt the newest read, and clear the selection, once focus leaves', async () => {
      const { sales, rows, viz, wrapper, binding } = await mountOverMutableRows();

      wrapper.focus();
      rows[0] = ['North', 30];
      rows[1] = ['South', 40];
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();
      const clearsBeforeLeaving = sales.calls.clears;

      // A real blur, not a synthesised event: `focusout` is what the browser
      // fires as focus leaves, and it has to arrive on its own for the adapter
      // to hear the reader go.
      wrapper.blur();
      await settle();

      // Nothing downstream of the controller's disposal emits a final
      // `onNavigate(null)`, so the mark MAIDR selected would stay highlighted
      // in the workbook with nothing explaining why.
      expect(sales.calls.clears).toBe(clearsBeforeLeaving + 1);
      // The controller that could not see the staged index is gone, so the
      // newest read takes over — and the next visit addresses it.
      await expect(navigateToFirstCell(binding, sales)).resolves.toEqual([
        { fieldName: 'Region', value: 'North' },
      ]);

      binding.dispose();
    });

    it('should adopt the newest read immediately when the page asked for live', async () => {
      const { sales, rows, viz, wrapper, binding } = await mountOverMutableRows(true);

      wrapper.focus();
      rows[0] = ['North', 30];
      rows[1] = ['South', 40];
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();

      // `live` means the model is rebuilt in place, so the index the reader is
      // navigating is the new one and staging it would strand the bridge a
      // refresh behind.
      await expect(navigateToFirstCell(binding, sales)).resolves.toEqual([
        { fieldName: 'Region', value: 'North' },
      ]);

      binding.dispose();
    });
  });

  describe('disposing', () => {
    it('should remove the wrapper, clear every worksheet, and stop re-reading', async () => {
      const log: string[] = [];
      const sales = salesWorksheet('Sales', log);
      const profit = salesWorksheet('Profit', log);
      const { host, marker, viz } = mountViz([sales, profit]);
      const binding = await bindTableau(viz);

      if (binding === null) {
        throw new Error('expected bindTableau to mount a figure');
      }
      // Pinned rather than captured as a baseline: a delta of one is satisfied
      // by 0 → 1 as happily as by 1 → 2, so a binder that stopped clearing
      // before its reads would slip through here too.
      expect([sales.calls.clears, profit.calls.clears]).toEqual([1, 1]);

      binding.dispose();
      await flush();

      expect(wrappers()).toHaveLength(0);
      // The viz itself is left exactly as it was found.
      expect([...host.children]).toEqual([marker, viz]);
      expect([sales.calls.clears, profit.calls.clears]).toEqual([2, 2]);

      const readsAtDispose = [reads(sales), reads(profit)];
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();

      expect([reads(sales), reads(profit)]).toEqual(readsAtDispose);
    });
  });
});

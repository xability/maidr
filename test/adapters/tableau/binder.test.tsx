/**
 * @jest-environment jsdom
 */

import type { TableauViz } from '@adapters/tableau/types';
import type { ReactNode } from 'react';
import type { FakeWorksheet } from './helpers';
import { bindTableau } from '@adapters/tableau/binder';
import { fakeColumn, fakeDashboardViz, fakeWorksheet } from './helpers';

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
 * Four of its behaviours are contracts rather than conveniences, and each has a
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

/** Every element on the page the binder claims as its own. */
function wrappers(): NodeListOf<Element> {
  return document.querySelectorAll('[data-maidr-tableau]');
}

/** How many summary-data readers a worksheet has been asked for. */
function reads(worksheet: FakeWorksheet): number {
  return worksheet.calls.log.filter(entry => entry.startsWith('open:')).length;
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
      // true if the clear actually lands before the read.
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
      const clearedByBind = [sales.calls.clears, profit.calls.clears];

      binding.dispose();
      await flush();

      expect(wrappers()).toHaveLength(0);
      // The viz itself is left exactly as it was found.
      expect([...host.children]).toEqual([marker, viz]);
      expect([sales.calls.clears, profit.calls.clears]).toEqual([
        clearedByBind[0] + 1,
        clearedByBind[1] + 1,
      ]);

      const readsAtDispose = [reads(sales), reads(profit)];
      viz.dispatchEvent(new Event('filterchanged'));
      await settle();

      expect([reads(sales), reads(profit)]).toEqual(readsAtDispose);
    });
  });
});

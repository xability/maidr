/**
 * Mounts MAIDR beside an embedded Tableau view.
 *
 * Every other module in this adapter is either pure or a thin wrapper over one
 * Tableau call. This file is the only one that owns *state*: the React root,
 * the DOM listeners, the debounce, and the selection bridge whose contents are
 * replaced wholesale on every re-read.
 *
 * Three decisions here are load-bearing and are not free to change:
 *
 * 1. **The `<tableau-viz>` element is never re-parented.** It is a custom
 *    element, and moving it re-runs `connectedCallback`; whether that reloads
 *    the iframe is undocumented. The accessible layer is inserted *immediately
 *    before* the viz instead, which also puts the keyboard entry point ahead of
 *    the iframe in DOM order — a keyboard user reaches MAIDR before focus is
 *    swallowed by Tableau's own UI. There is nothing to overlay anyway: the
 *    marks live inside the iframe and the only visual feedback channel is
 *    Tableau's own selection, which {@link applySelection} drives.
 * 2. **One re-read per burst.** A single dashboard filter fires several change
 *    events across several worksheets, so all three funnel into one trailing
 *    debounce; and because Tableau supports only one active summary-data reader,
 *    the reads themselves are serialized by the queue in `reader.ts`.
 * 3. **A failed refresh keeps the previous figure mounted.** A stale-but-correct
 *    figure is still fully navigable; an unmounted one is nothing at all.
 *
 * @example
 * ```html
 * <tableau-viz id="viz" src="https://public.tableau.com/views/..."></tableau-viz>
 * <script type="module">
 *   import { bindTableau } from 'maidr/tableau';
 *
 *   const binding = await bindTableau(document.getElementById('viz'));
 *   // later: binding?.dispose();
 * </script>
 * ```
 */

import type { Root as ReactRoot } from 'react-dom/client';
import type { Maidr as MaidrData, NavigateCallback } from '../../type/grammar';
import type { SelectionIndex } from './extractor';
import type { SelectionBridge } from './selection';
import type {
  TableauAdapterOptions,
  TableauViz,
  TableauWorksheet,
} from './types';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { extractTableau } from './extractor';
import { enqueueTableauRead, readWorksheet } from './reader';
import { applySelection, clearAllSelections, createSelectionGuard } from './selection';

const ADAPTER_PREFIX = '[MAIDR tableau]';

/**
 * The gate. Nothing may be read before Tableau fires this: `viz.workbook` is
 * only guaranteed to exist afterwards.
 */
const FIRST_INTERACTIVE_EVENT = 'firstinteractive';

/**
 * The three events that mean the numbers on screen may have changed.
 *
 * They are ordinary DOM events on the `<tableau-viz>` element — the Tableau
 * payload rides in `event.detail`, which this adapter never needs to read
 * because a change of any kind is answered the same way: re-read everything.
 */
const CHANGE_EVENTS: readonly string[] = [
  'filterchanged',
  'parameterchanged',
  'summarydatachanged',
];

/**
 * Trailing debounce window for a burst of change events.
 *
 * One dashboard filter can fire `filterchanged` once per affected worksheet,
 * plus a `summarydatachanged`, in the space of a few milliseconds. Reading once
 * at the end of the burst is both cheaper and more truthful than reading each
 * intermediate state.
 */
const REFRESH_DEBOUNCE_MS = 250;

/** Label on the keyboard entry point when the page supplies none. */
const DEFAULT_ANCHOR_LABEL
  = 'Accessible chart view — press Enter, then use arrow keys';

/** Figure ids when the caller supplies none. One id per binding, for its life. */
let nextBindingId = 0;

/**
 * Log an adapter-prefixed warning.
 *
 * @param message - What happened, and what the adapter did about it.
 * @param error - The underlying error, when there is one.
 */
function warn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`${ADAPTER_PREFIX} ${message}`);
  } else {
    console.warn(`${ADAPTER_PREFIX} ${message}`, error);
  }
}

/**
 * Handle returned by {@link bindTableau}.
 */
export interface TableauBinding {
  /**
   * The MAIDR data currently mounted, including the `onNavigate` callback.
   *
   * A getter rather than a snapshot: every successful refresh replaces the
   * object wholesale, and a caller holding the one from bind time would be
   * inspecting a figure that is no longer on the page.
   */
  readonly maidr: MaidrData;
  /**
   * Re-read every bound worksheet and re-render.
   *
   * Never rejects: a read failure is logged and the previously mounted figure
   * is left in place. Calls are serialized, so invoking it while a refresh is
   * already running queues behind that one rather than opening a second reader.
   */
  refresh: () => Promise<void>;
  /**
   * Unregister every listener, clear the marks MAIDR selected in every bound
   * worksheet, unmount the React tree, and remove the wrapper.
   *
   * Disposing the MAIDR controller and its services is **not** done here —
   * `<Maidr>` owns that through `useMaidrController`, and unmounting is what
   * triggers it. The `<tableau-viz>` element is left exactly as it was found.
   */
  dispose: () => void;
}

/**
 * Resolve once the viz is interactive enough to have a workbook.
 *
 * Resolves immediately when `viz.workbook` is already populated, which is the
 * normal case for a page that calls `bindTableau` from its own
 * `firstinteractive` handler.
 *
 * @param viz - The `<tableau-viz>` element.
 * @returns A promise that settles when the workbook is readable.
 */
function waitForFirstInteractive(viz: TableauViz): Promise<void> {
  if (viz.workbook !== undefined) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const handle = (): void => {
      viz.removeEventListener(FIRST_INTERACTIVE_EVENT, handle);
      resolve();
    };
    viz.addEventListener(FIRST_INTERACTIVE_EVENT, handle);
  });
}

/**
 * Find every worksheet the active sheet exposes.
 *
 * A dashboard's `worksheets` is in the order the author added them, which is
 * also the order Tableau documents a screen reader as narrating them in — so
 * paging through MAIDR's subplots follows the order the reader already knows.
 *
 * A story yields nothing: reading a worksheet inside one is a documented known
 * issue ("operation not allowed on non-active sheet").
 *
 * @param viz - The `<tableau-viz>` element, already interactive.
 * @returns The worksheets, or an empty list when there is nothing to read.
 */
function discoverWorksheets(viz: TableauViz): readonly TableauWorksheet[] {
  const workbook = viz.workbook;
  if (workbook === undefined) {
    warn('the viz reported no workbook; nothing to read.');
    return [];
  }

  const sheet = workbook.activeSheet;
  if (sheet.sheetType === 'worksheet') {
    return [sheet];
  }
  if (sheet.sheetType === 'dashboard') {
    return sheet.worksheets;
  }

  warn(
    `the active sheet "${sheet.name}" is a story, and reading a worksheet `
    + `inside a story is a documented Tableau limitation; skipping it.`,
  );
  return [];
}

/**
 * Apply the page's include-list and per-worksheet `skip` flags.
 *
 * `options.worksheets` is honoured **in the order the page wrote it**, so a
 * dashboard can be re-ordered for a reader without touching the workbook.
 * The extractor applies the same filters again — it must, because it is also
 * callable on its own — and doing so twice changes nothing.
 *
 * @param all - Every worksheet on the active sheet.
 * @param options - The page's adapter options.
 * @returns The worksheets to bind, in figure order.
 */
function selectWorksheets(
  all: readonly TableauWorksheet[],
  options: TableauAdapterOptions,
): readonly TableauWorksheet[] {
  const overrides = options.overrides ?? {};
  let chosen: readonly TableauWorksheet[] = all;

  if (options.worksheets !== undefined) {
    const byName = new Map(all.map(worksheet => [worksheet.name, worksheet]));
    const picked: TableauWorksheet[] = [];
    for (const name of options.worksheets) {
      const worksheet = byName.get(name);
      if (worksheet === undefined) {
        warn(
          `no worksheet named "${name}" on the active sheet. Available: `
          + `${all.map(sheet => `"${sheet.name}"`).join(', ')}.`,
        );
        continue;
      }
      picked.push(worksheet);
    }
    chosen = picked;
  }

  return chosen.filter(worksheet => overrides[worksheet.name]?.skip !== true);
}

/**
 * Turn the extractor's layer-id → worksheet *name* map into a layer-id →
 * worksheet map the selection bridge can call.
 *
 * The indirection is deliberate: the extractor is pure and holds no Tableau
 * objects, and a layer id is an index among the worksheets that *survived*
 * extraction, which only the extractor knows.
 *
 * @param index - The selection index from the extractor.
 * @param worksheets - The bound worksheets.
 * @returns Layer id → the worksheet that layer was built from.
 */
function resolveBridgeWorksheets(
  index: SelectionIndex,
  worksheets: readonly TableauWorksheet[],
): Map<string, TableauWorksheet> {
  const byName = new Map(worksheets.map(worksheet => [worksheet.name, worksheet]));
  const resolved = new Map<string, TableauWorksheet>();
  for (const [layerId, name] of index.worksheets) {
    const worksheet = byName.get(name);
    if (worksheet !== undefined) {
      resolved.set(layerId, worksheet);
    }
  }
  return resolved;
}

/**
 * Mount MAIDR beside an embedded Tableau view and keep it in step with it.
 *
 * Waits for the viz to become interactive, reads every worksheet on the active
 * sheet, builds one MAIDR subplot per worksheet, and renders the accessible
 * figure into a wrapper inserted immediately before the `<tableau-viz>`
 * element. Filter, parameter and data changes re-read the worksheets and
 * re-render; MAIDR's cursor is mirrored back into the viz as a Tableau mark
 * selection.
 *
 * Asynchronous because the first read is: whether *any* worksheet yields a
 * navigable layer is a property of the data, not of the DOM, and a binder that
 * returned before finding out could only report failure by mounting an empty
 * figure.
 *
 * @param viz - The `<tableau-viz>` element. It must already be in the document,
 * and it is never moved, restyled or otherwise modified.
 * @param options - Figure id and title, the include-list, per-worksheet
 * overrides, and the live-update opt-in.
 * @returns A binding, or `null` when there was nothing to mount — a detached
 * element, a story sheet, an empty include-list, or worksheets that yielded no
 * navigable layer. In every `null` case the page is left exactly as it was
 * found, with one warning explaining why.
 */
export async function bindTableau(
  viz: TableauViz,
  options: TableauAdapterOptions = {},
): Promise<TableauBinding | null> {
  if (viz.parentElement === null) {
    warn('the <tableau-viz> element must be in the document before binding.');
    return null;
  }

  await waitForFirstInteractive(viz);

  const worksheets = selectWorksheets(discoverWorksheets(viz), options);
  if (worksheets.length === 0) {
    warn('no worksheet to read on the active sheet; the page is unchanged.');
    return null;
  }

  const parent = viz.parentElement;
  if (parent === null) {
    warn('the <tableau-viz> element left the document while it was loading.');
    return null;
  }

  // Captured once and reused by every refresh, so the live registry and the
  // DOM ids keep pointing at the same figure instance across a re-render.
  const figureId = options.id ?? `maidr-tableau-${nextBindingId++}`;
  const anchorLabel = options.anchorLabel ?? DEFAULT_ANCHOR_LABEL;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-maidr-tableau', figureId);
  parent.insertBefore(wrapper, viz);
  const root: ReactRoot = createRoot(wrapper, { identifierPrefix: figureId });

  // The guard and the disable latch outlive every refresh: a worksheet whose
  // `selectMarksByValueAsync` rejects will reject again on the next read of the
  // same fields, and re-enabling it on refresh would restore the warning storm
  // the latch exists to stop.
  const guard = createSelectionGuard();
  const disabled = new Set<string>();

  const state: { data: MaidrData | null } = { data: null };
  let bridge: SelectionBridge | null = null;
  let disposed = false;
  let warnedEmpty = false;

  const onNavigate: NavigateCallback = (info) => {
    if (disposed || bridge === null) {
      return;
    }
    // Fire-and-forget: `applySelection` never rejects, and MAIDR's own
    // announcement must not wait on a round trip into the iframe.
    void applySelection(bridge, info);
  };

  const refresh = async (): Promise<void> => {
    if (disposed) {
      return;
    }

    // The clear is enqueued as its own task rather than wrapped around the
    // reads: the queue is a strict serial chain and is not re-entrant, so
    // nesting `readWorksheet` inside a held slot would deadlock. Awaiting the
    // clear here is enough to guarantee it lands first, which is what matters —
    // `ignoreSelection` is documented backwards on both Tableau API surfaces,
    // so the adapter removes the selection instead of guessing what the flag
    // would have done to the read.
    await enqueueTableauRead(() => clearAllSelections(worksheets, guard));

    // Each `readWorksheet` enqueues its own pagination, so these resolve in
    // whatever order Tableau answers while still opening exactly one reader at
    // a time. `Promise.all` keeps the snapshots in figure order regardless.
    const snapshots = await Promise.all(
      worksheets.map(async worksheet => readWorksheet(worksheet)),
    );
    if (disposed) {
      return;
    }

    const { maidr, selection } = extractTableau(snapshots, options);
    if (maidr.subplots.length === 0) {
      if (!warnedEmpty) {
        warnedEmpty = true;
        warn(
          'no worksheet yielded a navigable layer; keeping whatever was '
          + 'already mounted.',
        );
      }
      return;
    }

    bridge = {
      index: selection,
      worksheets: resolveBridgeWorksheets(selection, worksheets),
      guard,
      disabled,
    };

    // A brand-new object every time. `LiveDataManager.setData` stores the
    // reference without cloning and the model may mutate the arrays it is
    // handed, so a refresh must never hand back anything the previous figure
    // still holds.
    const next: MaidrData = {
      ...maidr,
      id: figureId,
      ...(options.live === true ? { live: true } : {}),
      onNavigate,
    };
    state.data = next;

    root.render(
      <MaidrComponent data={next}>
        <div data-maidr-tableau-anchor="">{anchorLabel}</div>
      </MaidrComponent>,
    );
  };

  // Refreshes run one at a time and absorb their own failures, so a rejected
  // read never becomes an unhandled rejection and never stalls the next one.
  let pending: Promise<void> = Promise.resolve();
  const runRefresh = (): Promise<void> => {
    pending = pending.then(refresh).catch((error: unknown) => {
      warn('a refresh failed; the previously mounted figure is unchanged.', error);
    });
    return pending;
  };

  await runRefresh();
  if (state.data === null) {
    // Nothing was ever rendered: take the wrapper back out so the page is left
    // exactly as it was found.
    root.unmount();
    wrapper.remove();
    return null;
  }
  const initial = state.data;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const handleChange = (): void => {
    if (disposed) {
      return;
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runRefresh();
    }, REFRESH_DEBOUNCE_MS);
  };

  for (const type of CHANGE_EVENTS) {
    viz.addEventListener(type, handleChange);
  }

  return {
    get maidr(): MaidrData {
      // Replaced by every successful refresh; the fallback is unreachable,
      // since a binding is only returned once the first render succeeded.
      return state.data ?? initial;
    },
    refresh: runRefresh,
    dispose: (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const type of CHANGE_EVENTS) {
        viz.removeEventListener(type, handleChange);
      }
      // Never leave a selection behind in a workbook this adapter no longer
      // drives; the marks would stay highlighted with nothing explaining why.
      void clearAllSelections(worksheets, guard);
      root.unmount();
      wrapper.remove();
    },
  };
}

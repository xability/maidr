/**
 * Mounts MAIDR beside an embedded Tableau view.
 *
 * Every other module in this adapter is either pure or a thin wrapper over one
 * Tableau call. This file is the only one that owns *state*: the React root,
 * the DOM listeners, the debounce, the bound worksheets, and the selection
 * bridge that is rebuilt on every re-read.
 *
 * Four decisions here are load-bearing and are not free to change:
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
 *    events across several worksheets, so they all funnel into one trailing
 *    debounce; and because Tableau supports only one active summary-data reader,
 *    the reads themselves are serialized by the queue in `reader.ts`. Every
 *    re-read also re-discovers the worksheets, because `tabswitched` arrives on
 *    the same path and changes which sheet they come from.
 * 3. **A failed refresh keeps the previous figure mounted.** A stale-but-correct
 *    figure is still fully navigable; an unmounted one is nothing at all.
 * 4. **The selection bridge never runs ahead of the mounted figure.** Unless
 *    `live` is set, MAIDR adopts new data only once the reader has left and
 *    come back, so a bridge built from a newer read is staged until then —
 *    otherwise MAIDR would announce one mark while Tableau highlighted another.
 *    Leaving the figure also clears the selection, so no highlight outlives the
 *    cursor that put it there.
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
  TableauSheet,
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
 * The gate. Nothing may be read before Tableau fires this: the workbook behind
 * the viz is only readable afterwards.
 */
const FIRST_INTERACTIVE_EVENT = 'firstinteractive';

/**
 * Tableau's "this viz will not load" signal — a bad `src`, an expired token, a
 * site that does not allowlist the host domain.
 *
 * It is not a terminal state: a page that answers an `unknown-auth-error` by
 * switching to `iframeAuth` gets a `firstinteractive` afterwards. The adapter
 * therefore treats it only as "stop waiting", never as "fail".
 */
const VIZ_LOAD_ERROR_EVENT = 'vizloaderror';

/**
 * How long to wait for a viz to become interactive before giving up on it.
 *
 * A viz can fail to load without ever firing {@link VIZ_LOAD_ERROR_EVENT} —
 * an unreachable host, or an embedding library older than the release that
 * added the event — so the wait needs a floor of its own. Reaching it is
 * reported as "nothing to read" and the caller gets its documented `null`,
 * which is what a caller can act on; hanging forever is not.
 */
const FIRST_INTERACTIVE_TIMEOUT_MS = 30_000;

/**
 * The four events that mean what MAIDR read may no longer be what is on screen.
 *
 * The first three are data changes. `tabswitched` is a *sheet* change: the
 * worksheets are re-discovered from the newly active sheet, because the ones
 * captured on the previous tab describe a view the reader can no longer see.
 *
 * They are ordinary DOM events on the `<tableau-viz>` element — the Tableau
 * payload rides in `event.detail`, which this adapter never needs to read
 * because a change of any kind is answered the same way: re-read everything.
 */
const CHANGE_EVENTS: readonly string[] = [
  'filterchanged',
  'parameterchanged',
  'summarydatachanged',
  'tabswitched',
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
 * Read the active sheet, or `null` when the viz is not interactive yet.
 *
 * `viz.workbook` is **not** a readiness signal: the custom element builds a
 * fresh wrapper object on every read, so it is defined from the moment the
 * element starts loading, and both it and `activeSheet` throw while the
 * machinery behind them is still unset. A successful read of the active sheet
 * is the only readiness signal that can actually be verified from here, and it
 * is exactly what the adapter needs next.
 *
 * @param viz - The `<tableau-viz>` element.
 * @returns The active sheet, or `null` when it cannot be read.
 */
function readActiveSheet(viz: TableauViz): TableauSheet | null {
  try {
    return viz.workbook?.activeSheet ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve once the viz is interactive enough to have a readable active sheet.
 *
 * Resolves immediately when the active sheet already reads, which is the normal
 * case for a page that calls `bindTableau` from its own `firstinteractive`
 * handler.
 *
 * Otherwise it waits — but it **always settles**, on whichever of three things
 * happens first: the viz becomes interactive, it reports a load error, or
 * {@link FIRST_INTERACTIVE_TIMEOUT_MS} passes. The two failure paths resolve
 * rather than reject so that the caller reaches the adapter's ordinary
 * "nothing to read" path (one warning, then `null`) instead of an unhandled
 * rejection or a promise that never settles. Every listener and the timer are
 * removed on the way out, whichever path settles it.
 *
 * @param viz - The `<tableau-viz>` element.
 * @returns A promise that settles when the workbook is readable, or when it has
 * become clear that it will not be.
 */
function waitForFirstInteractive(viz: TableauViz): Promise<void> {
  if (readActiveSheet(viz) !== null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (event?: Event): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      viz.removeEventListener(FIRST_INTERACTIVE_EVENT, settle);
      viz.removeEventListener(VIZ_LOAD_ERROR_EVENT, settle);
      if (event?.type === VIZ_LOAD_ERROR_EVENT) {
        const detail = (event as CustomEvent<{
          errorCode?: string;
          message?: string;
        } | null>).detail;
        warn(
          `the viz reported a load error (${detail?.errorCode ?? 'unknown'}); `
          + `there is nothing to bind. If the page recovers the load, bind `
          + `again from its own 'firstinteractive' handler.`,
          detail?.message,
        );
      }
      resolve();
    };

    timer = setTimeout(settle, FIRST_INTERACTIVE_TIMEOUT_MS);
    viz.addEventListener(FIRST_INTERACTIVE_EVENT, settle);
    viz.addEventListener(VIZ_LOAD_ERROR_EVENT, settle);
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
 * issue ("operation not allowed on non-active sheet"). A viz that is not
 * interactive yields nothing either, rather than throwing.
 *
 * Called again on every refresh, not only at bind time: `tabswitched` changes
 * which sheet is active, and the worksheets of the sheet the reader has left
 * describe a view that is no longer on screen.
 *
 * @param viz - The `<tableau-viz>` element.
 * @returns The worksheets, or an empty list when there is nothing to read.
 */
function discoverWorksheets(viz: TableauViz): readonly TableauWorksheet[] {
  const sheet = readActiveSheet(viz);
  if (sheet === null) {
    warn(
      'the viz has no readable active sheet — it never became interactive, or '
      + 'its load failed; nothing to read.',
    );
    return [];
  }

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
 * element. Filter, parameter, data and tab changes re-discover and re-read the
 * worksheets and re-render; MAIDR's cursor is mirrored back into the viz as a
 * Tableau mark selection, which is cleared again when focus leaves the figure.
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
 * element, a viz that failed to load or never became interactive, a story
 * sheet, an empty include-list, or worksheets that yielded no navigable layer.
 * In every `null` case the page is left exactly as it was found, with one
 * warning explaining why. It always settles: a viz that never loads resolves to
 * `null` rather than leaving the caller waiting.
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

  // Reassigned by every refresh: `tabswitched` makes a different sheet active,
  // and the worksheets discovered here belong to the sheet that was active at
  // bind time.
  let worksheets = selectWorksheets(discoverWorksheets(viz), options);
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
  // the latch exists to stop. The latch is keyed by worksheet *name* for the
  // same reason it survives — a layer id is only meaningful within one
  // extraction — and is dropped wholesale when a tab switch replaces the set of
  // worksheets it was earned on.
  const guard = createSelectionGuard();
  const disabled = new Set<string>();

  const state: { data: MaidrData | null } = { data: null };
  let bridge: SelectionBridge | null = null;
  let pendingBridge: SelectionBridge | null = null;
  let disposed = false;
  let warnedEmpty = false;

  /**
   * Put a freshly built bridge into service.
   *
   * @param next - The bridge built from the read that is now on screen.
   */
  const adopt = (next: SelectionBridge): void => {
    bridge = next;
    pendingBridge = null;
  };

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

    // Re-discovered rather than reused: `tabswitched` is one of the events that
    // brings us here, and the worksheets captured on the previous tab describe
    // a view that is no longer on screen. The clear above deliberately ran on
    // the *old* list first, so a selection is never stranded in the sheet the
    // reader has just left.
    const current = selectWorksheets(discoverWorksheets(viz), options);
    if (current.length === 0) {
      warn(
        state.data === null
          ? 'no worksheet to read on the active sheet; the page is unchanged.'
          : 'no worksheet to read on the active sheet; keeping whatever was '
            + 'already mounted.',
      );
      return;
    }
    const sameWorksheets = current.length === worksheets.length
      && current.every((sheet, index) => sheet.name === worksheets[index].name);
    if (!sameWorksheets) {
      // Layer ids are indices among the worksheets that survived extraction, so
      // a latch earned on the previous set would silence a different worksheet
      // here. The names it holds belong to a sheet we are no longer reading.
      disabled.clear();
    }
    // Always take the fresh handles, even when the names are unchanged: the
    // sheet may have handed out new worksheet objects.
    worksheets = current;

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

    const nextBridge: SelectionBridge = {
      index: selection,
      worksheets: resolveBridgeWorksheets(selection, worksheets),
      guard,
      disabled,
    };
    // A `{layerId, row, col}` address only means anything against the read it
    // was built from. `useMaidrController` rebuilds the model from new data
    // immediately only when `live` is set; otherwise the running controller
    // keeps navigating the previous figure until the reader leaves and comes
    // back. Swapping the index underneath it would make MAIDR announce one mark
    // while Tableau highlighted another — so the new index is staged and only
    // takes over once the controller that cannot see it is gone.
    if (options.live === true || !wrapper.contains(document.activeElement)) {
      adopt(nextBridge);
    } else {
      pendingBridge = nextBridge;
    }

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

  // `focusout` bubbles out of the mounted figure, which is what tells this
  // adapter that the reader's session ended: `useMaidrController` disposes the
  // controller on the same signal, and nothing downstream of that disposal
  // emits a final `onNavigate(null)`, so the mark MAIDR selected would stay
  // highlighted in the workbook with nothing explaining why.
  //
  // Deferred by a task and re-checked against `document.activeElement`, exactly
  // as `useMaidrController.onFocusOut` does, rather than reading
  // `event.relatedTarget`: `relatedTarget` is null both when focus moves into
  // the cross-origin viz iframe *and* when it goes to browser chrome, and only
  // the former ends the session.
  const handleFocusOut = (): void => {
    if (disposed) {
      return;
    }
    setTimeout(() => {
      if (disposed || wrapper.contains(document.activeElement)) {
        return;
      }
      // The controller that could not see a staged index is gone now, so the
      // newest read can take over without the two disagreeing.
      if (pendingBridge !== null) {
        adopt(pendingBridge);
      }
      void clearAllSelections(worksheets, guard);
    }, 0);
  };
  wrapper.addEventListener('focusout', handleFocusOut);

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
      wrapper.removeEventListener('focusout', handleFocusOut);
      // A staged index has nothing left to be adopted into, and dropping it
      // releases the read it holds.
      pendingBridge = null;
      // Never leave a selection behind in a workbook this adapter no longer
      // drives; the marks would stay highlighted with nothing explaining why.
      void clearAllSelections(worksheets, guard);
      root.unmount();
      wrapper.remove();
    },
  };
}

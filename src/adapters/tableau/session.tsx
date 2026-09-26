/**
 * The part of binding MAIDR to Tableau that does not depend on where MAIDR
 * runs.
 *
 * Tableau has two public surfaces a page can reach a worksheet through: the
 * Embedding API, where the page hosts a `<tableau-viz>` and MAIDR sits beside
 * it, and the Extensions API, where MAIDR is itself a zone of the dashboard.
 * They differ in how the worksheets are found, where the figure goes, how
 * events arrive and what "focus went back into the view" looks like — and in
 * nothing else. Those four things are a {@link TableauHost}; everything else
 * lives here, once, and both binders drive it.
 *
 * This is the only module in the adapter that owns *state*: the React root, the
 * debounce, the bound worksheets, and the selection bridge that is rebuilt on
 * every re-read. The decisions below are load-bearing and are not free to
 * change:
 *
 * 1. **One re-read per burst.** A single dashboard filter fires several change
 *    events across several worksheets, so they all funnel into one trailing
 *    debounce; and because Tableau supports only one active summary-data reader,
 *    the reads themselves are serialized by the queue in `reader.ts`. Every
 *    re-read also re-discovers the worksheets, because a tab switch arrives on
 *    the same path and changes which sheet they come from.
 * 2. **A failed refresh keeps the previous figure mounted.** A stale-but-correct
 *    figure is still fully navigable; an unmounted one is nothing at all.
 * 3. **The selection bridge never runs ahead of the mounted figure.** Unless
 *    `live` is set, MAIDR adopts new data only once the reader has left and
 *    come back, so a bridge built from a newer read is staged until then —
 *    otherwise MAIDR would announce one mark while Tableau highlighted another.
 *    Leaving the figure also clears the selection, so no highlight outlives the
 *    cursor that put it there.
 * 4. **A click in the view is followed, and never undone.** Tableau's mark
 *    selection event is resolved back to the position the marks were read from
 *    and MAIDR's cursor is sent there — at once when the reader is inside the
 *    figure, and on their next focus-in otherwise, which is the usual case,
 *    because the click that selected the mark also took the focus and disposed
 *    the controller with it. That same click is why focus leaving into the view
 *    clears nothing straight away: the selection MAIDR held has just been
 *    replaced by the one the reader is about to follow, and the event saying so
 *    is still on its way. The clear waits {@link SELECTION_HANDOFF_MS} and then
 *    removes only what MAIDR still holds.
 */

import type { Root as ReactRoot } from 'react-dom/client';
import type { Maidr as MaidrData, NavigateCallback } from '../../type/grammar';
import type { SelectionIndex } from './extractor';
import type { SelectionBridge } from './selection';
import type {
  TableauAdapterOptions,
  TableauDashboardObject,
  TableauSheet,
  TableauWorksheet,
  TableauWorksheetGeometry,
} from './types';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { liveDataManager } from '../../service/liveData';
import { extractTableau } from './extractor';
import { enqueueTableauRead, readWorksheet } from './reader';
import {
  applySelection,
  clearAllSelections,
  clearOwnedSelections,
  createSelectionGuard,
  handleMarkSelection,
  isMarksSelectedEvent,
} from './selection';

const ADAPTER_PREFIX = '[MAIDR tableau]';

/**
 * How long a clear waits after focus leaves the figure *into the view*.
 *
 * A click on a mark takes the focus with it, and Tableau reports the new
 * selection a moment later, through the iframe's message channel. Clearing on
 * the focus change alone would remove the mark the user just selected — the
 * one the reader is about to be taken to — so the clear waits long enough for
 * that report to arrive and release the worksheet, and then removes only what
 * MAIDR still holds. A click on a filter control, which changes no marks,
 * leaves MAIDR's highlight in place for this long and no longer.
 */
const SELECTION_HANDOFF_MS = 1000;

/**
 * Trailing debounce window for a burst of change events.
 *
 * One dashboard filter can fire a filter change once per affected worksheet,
 * plus a summary-data change, in the space of a few milliseconds. Reading once
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
export function warn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`${ADAPTER_PREFIX} ${message}`);
  } else {
    console.warn(`${ADAPTER_PREFIX} ${message}`, error);
  }
}

/**
 * Handle returned by `bindTableau`, and held by `bindTableauExtension`.
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
   * triggers it. The Tableau view is left exactly as it was found.
   */
  dispose: () => void;
}

/** What the active sheet contributes: its worksheets, and where they sit. */
export interface DiscoveredSheet {
  /** The worksheets, in the order the author added them. */
  readonly worksheets: readonly TableauWorksheet[];
  /** Worksheet name → geometry. Empty whenever geometry is unavailable. */
  readonly geometry: ReadonlyMap<string, TableauWorksheetGeometry>;
}

/** The two things a host tells the session about as they happen. */
export interface TableauHostListeners {
  /** Anything that may mean what MAIDR read is no longer what is on screen. */
  readonly change: () => void;
  /**
   * The selected marks changed, whoever changed them.
   *
   * @param event - The `MarksSelectedEvent`, unvalidated: the session checks
   * its shape before reading it.
   */
  readonly markSelection: (event: unknown) => void;
}

/**
 * What differs between the Embedding and the Extensions surface.
 *
 * Deliberately four members and no more: every one of them is something the
 * two surfaces genuinely do differently, and anything they do alike belongs in
 * the session rather than behind this seam.
 */
export interface TableauHost {
  /**
   * The worksheets MAIDR should describe, and where each one sits.
   *
   * Called once before anything is mounted and again on every refresh, since a
   * tab switch can change the answer. Must not throw; an empty list is "nothing
   * to read", and the host is expected to have said why.
   */
  readonly discover: () => DiscoveredSheet;
  /**
   * Put the figure's wrapper on the page.
   *
   * @param wrapper - The element the figure renders into.
   * @returns `false` when there is nowhere to put it, after warning why; the
   * session then leaves the page exactly as it was.
   */
  readonly mount: (wrapper: HTMLElement) => boolean;
  /**
   * Start delivering change and mark-selection notifications.
   *
   * @param listeners - What to call.
   * @returns A function that stops them, which `dispose()` calls exactly once.
   */
  readonly listen: (listeners: TableauHostListeners) => () => void;
  /**
   * Whether focus, having left the figure, went into the Tableau view — where a
   * click may be selecting a mark the reader is about to follow — rather than
   * somewhere that ends the session outright.
   */
  readonly focusIsInView: () => boolean;
}

/**
 * Read each worksheet's place on the dashboard, keyed by worksheet name.
 *
 * `Dashboard.objects` and every member of a `DashboardObject` are **required**
 * in Tableau's shipped declarations and none of them carries an `@since` tag,
 * so the contract sets no version floor — which is exactly why none of it is
 * trusted here. The host page loads whichever build of the Embedding library it
 * likes, and the real case this covers is an older one: a library that predates
 * the dashboard-object surface simply has no `objects`, and a partial one could
 * hand back an object with no `position`. Every access below is therefore
 * guarded, and any failure to read a worksheet's geometry leaves that worksheet
 * out of the map rather than inventing a place for it. The extractor requires
 * geometry for *every* surviving worksheet before it will build a grid, so a
 * gap here is a whole-figure fall back to the N×1 column — never a half-grid.
 *
 * Only worksheet objects are considered. Legends, titles, filters, blanks and
 * extensions — MAIDR's own zone among them — are furniture: they hold no data,
 * contribute no subplot, and their positions would only distort the banding.
 *
 * Matching is by `object.worksheet.name`, never by `object.name` — the latter
 * is the *object's* authoring name, which an author can change without
 * renaming the sheet inside it. Tableau documents `dashboard.worksheets` as
 * exactly the worksheets of the objects whose type is `worksheet`, so the names
 * line up by construction.
 *
 * @param sheet - The sheet to read. Anything but a dashboard yields nothing.
 * @returns Worksheet name → geometry, empty when the sheet reported none.
 */
export function readDashboardGeometry(
  sheet: TableauSheet,
): Map<string, TableauWorksheetGeometry> {
  const geometry = new Map<string, TableauWorksheetGeometry>();
  if (sheet.sheetType !== 'dashboard') {
    return geometry;
  }

  let objects: readonly TableauDashboardObject[] | undefined;
  try {
    objects = sheet.objects;
  } catch {
    // A property that throws is a property this library does not really have.
    return geometry;
  }
  if (!Array.isArray(objects)) {
    return geometry;
  }

  for (const object of objects) {
    if (object === null || typeof object !== 'object') {
      continue;
    }
    if (object.type !== 'worksheet' || object.worksheet === undefined) {
      continue;
    }
    const position = object.position;
    const size = object.size;
    if (position === undefined || size === undefined) {
      continue;
    }
    const { x, y } = position;
    const { width, height } = size;
    if (![x, y, width, height].every(Number.isFinite)) {
      continue;
    }
    // Keyed by worksheet name, which `Dashboard.worksheets` is documented to
    // correspond to one-for-one with the `worksheet`-typed objects — so a name
    // collision cannot arise from authoring, and a later object overwriting an
    // earlier one's entry is a case the API's own contract rules out. Note this
    // is `object.worksheet.name`, never `object.name`: the latter is the zone's
    // authoring name and can differ from the sheet it holds.
    geometry.set(object.worksheet.name, {
      x,
      y,
      width,
      height,
      // Both flags default to the shape a tiled, on-screen dashboard has, so a
      // library that reports geometry but not these two is still usable. Each
      // of them, when true and false respectively, disqualifies the grid
      // outright in the extractor — see `layOutByGeometry`.
      isFloating: object.isFloating === true,
      isVisible: object.isVisible !== false,
    });
  }
  return geometry;
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
 * Read the host's worksheets, mount MAIDR for them, and keep it in step.
 *
 * The host must already be readable: waiting for `firstinteractive`, or for
 * `initializeAsync`, is the binder's job, since only it knows which one applies.
 *
 * @param host - The surface-specific half of the binding.
 * @param options - Figure id and title, the include-list, per-worksheet
 * overrides, and the live-update opt-in.
 * @returns A binding, or `null` when there was nothing to mount — no worksheet
 * to read, nowhere to mount, or worksheets that yielded no navigable layer. In
 * every `null` case the page is left exactly as it was found, with one warning
 * explaining why.
 */
export async function startTableauSession(
  host: TableauHost,
  options: TableauAdapterOptions,
): Promise<TableauBinding | null> {
  // Reassigned by every refresh: a tab switch makes a different sheet active,
  // and the worksheets discovered here belong to the sheet that was active at
  // bind time.
  //
  // `refresh()` discovers again rather than reusing this, so discovery runs
  // twice on a bind. That is deliberate, not a leftover: this call exists so an
  // empty sheet returns `null` *before* a wrapper is mounted, leaving the page
  // untouched, while the call inside `refresh()` has to re-read because a
  // tab-switch refresh describes a different sheet entirely. Both are a
  // synchronous property walk over `dashboard.objects`, so the second read
  // costs nothing worth restructuring for.
  let worksheets = selectWorksheets(host.discover().worksheets, options);
  if (worksheets.length === 0) {
    warn('no worksheet to read on the active sheet; the page is unchanged.');
    return null;
  }

  // Captured once and reused by every refresh, so the live registry and the
  // DOM ids keep pointing at the same figure instance across a re-render.
  const figureId = options.id ?? `maidr-tableau-${nextBindingId++}`;
  const anchorLabel = options.anchorLabel ?? DEFAULT_ANCHOR_LABEL;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-maidr-tableau', figureId);
  if (!host.mount(wrapper)) {
    return null;
  }
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
  // Which worksheets MAIDR currently holds a selection in. Shared for the same
  // reason `disabled` is: a selection made against one read is still on screen
  // after the next.
  const owned = new Set<string>();

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
    owned.clear();

    // Re-discovered rather than reused: a tab switch is one of the events that
    // brings us here, and the worksheets captured on the previous tab describe
    // a view that is no longer on screen. The clear above deliberately ran on
    // the *old* list first, so a selection is never stranded in the sheet the
    // reader has just left.
    const discovered = host.discover();
    const current = selectWorksheets(discovered.worksheets, options);
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
    //
    // Geometry is attached here rather than inside `readWorksheet`, because it
    // is a *sheet*-level fact: it lives on `dashboard.objects`, and the reader
    // is handed one worksheet at a time and never sees the sheet those objects
    // belong to. A worksheet the dashboard reported no usable geometry for gets
    // no `geometry` at all, which is what the extractor reads as "lay this
    // figure out as a column".
    const snapshots = await Promise.all(
      worksheets.map(async (worksheet) => {
        const snapshot = await readWorksheet(worksheet);
        const geometry = discovered.geometry.get(worksheet.name);
        return geometry === undefined ? snapshot : { ...snapshot, geometry };
      }),
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
      owned,
      issued: [],
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

  // A change of selection in the view, whoever made it. The marks are resolved
  // against the *mounted* bridge, since that is the figure the controller is
  // navigating; the staged one, if any, describes a read MAIDR has not adopted.
  const handleMarkSelectionEvent = (event: unknown): void => {
    if (disposed || bridge === null) {
      return;
    }
    if (!isMarksSelectedEvent(event)) {
      return;
    }
    void handleMarkSelection(bridge, event, target =>
      liveDataManager.navigateTo(target, { id: figureId }));
  };

  const unlisten = host.listen({
    change: handleChange,
    markSelection: handleMarkSelectionEvent,
  });

  let handoffTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHandoff = (): void => {
    if (handoffTimer !== null) {
      clearTimeout(handoffTimer);
      handoffTimer = null;
    }
  };
  const clearOwned = (): void => {
    if (bridge !== null) {
      void clearOwnedSelections(bridge);
    }
  };

  // `focusout` bubbles out of the mounted figure, which is what tells this
  // adapter that the reader's session ended: `useMaidrController` disposes the
  // controller on the same signal, and nothing downstream of that disposal
  // emits a final `onNavigate(null)`, so the mark MAIDR selected would stay
  // highlighted in the workbook with nothing explaining why.
  //
  // Deferred by a task and re-checked against `document.activeElement`, exactly
  // as `useMaidrController.onFocusOut` does, rather than reading
  // `event.relatedTarget`: `relatedTarget` is null both when focus moves into
  // a cross-origin iframe *and* when it goes to browser chrome, and only the
  // former ends the session.
  //
  // Only what MAIDR holds is cleared, and when focus went into the view the
  // clear waits: the click that took it there may have selected a mark, and
  // the report of that arrives after the focus does. See
  // {@link SELECTION_HANDOFF_MS}.
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
      if (!host.focusIsInView()) {
        clearOwned();
        return;
      }
      cancelHandoff();
      handoffTimer = setTimeout(() => {
        handoffTimer = null;
        if (!disposed) {
          clearOwned();
        }
      }, SELECTION_HANDOFF_MS);
    }, 0);
  };
  wrapper.addEventListener('focusout', handleFocusOut);
  // Back inside before the handoff ran: the selection is the reader's again.
  wrapper.addEventListener('focusin', cancelHandoff);

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
      unlisten();
      wrapper.removeEventListener('focusout', handleFocusOut);
      wrapper.removeEventListener('focusin', cancelHandoff);
      cancelHandoff();
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

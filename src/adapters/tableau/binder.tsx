/**
 * Mounts MAIDR beside an embedded Tableau view.
 *
 * This is the Embedding API half of the binding: finding the worksheets behind
 * a `<tableau-viz>`, putting the figure next to it, and turning the element's
 * DOM events into the session's two notifications. Everything that does not
 * depend on the surface — the reads, the debounce, the selection bridge, the
 * focus handoff — is in `session.tsx`, shared with the Extensions binder.
 *
 * Two decisions here are load-bearing and are not free to change:
 *
 * 1. **The `<tableau-viz>` element is never re-parented.** It is a custom
 *    element, and moving it re-runs `connectedCallback`; whether that reloads
 *    the iframe is undocumented. The accessible layer is inserted *immediately
 *    before* the viz instead, which also puts the keyboard entry point ahead of
 *    the iframe in DOM order — a keyboard user reaches MAIDR before focus is
 *    swallowed by Tableau's own UI. There is nothing to overlay anyway: the
 *    marks live inside the iframe and the only visual feedback channel is
 *    Tableau's own selection, which `applySelection` drives.
 * 2. **The wait for the viz always ends.** A viz that fails to load, or never
 *    says anything at all, resolves the bind to `null` — the one outcome a page
 *    can act on.
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

import type { DiscoveredSheet, TableauBinding, TableauHost } from './session';
import type {
  TableauAdapterOptions,
  TableauSheet,
  TableauViz,
  TableauWorksheetGeometry,
} from './types';
import { readDashboardGeometry, startTableauSession, warn } from './session';

export type { TableauBinding } from './session';

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
 * Tableau's "the selected marks changed" event, for a user's click as much as
 * for the adapter's own `selectMarksByValueAsync`; `handleMarkSelection` tells
 * the two apart.
 */
const MARK_SELECTION_EVENT = 'markselectionchanged';

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
 * Find every worksheet the viz's active sheet exposes, and where each one sits.
 *
 * A dashboard's `worksheets` is in the order the author added them, which is
 * also the order Tableau documents a screen reader as narrating them in — so
 * paging through MAIDR's subplots follows the order the reader already knows,
 * unless the dashboard's own geometry says something more truthful (see
 * `readDashboardGeometry`).
 *
 * A story yields nothing: reading a worksheet inside one is a documented known
 * issue ("operation not allowed on non-active sheet"). A viz that is not
 * interactive yields nothing either, rather than throwing.
 *
 * Called again on every refresh, not only at bind time: `tabswitched` changes
 * which sheet is active, and the worksheets of the sheet the reader has left
 * describe a view that is no longer on screen. The geometry is re-read on the
 * same path, because a different sheet is laid out differently.
 *
 * @param viz - The `<tableau-viz>` element.
 * @returns The worksheets and their geometry; the worksheets are empty when
 * there is nothing to read.
 */
function discoverWorksheets(viz: TableauViz): DiscoveredSheet {
  const empty = new Map<string, TableauWorksheetGeometry>();
  const sheet = readActiveSheet(viz);
  if (sheet === null) {
    warn(
      'the viz has no readable active sheet — it never became interactive, or '
      + 'its load failed; nothing to read.',
    );
    return { worksheets: [], geometry: empty };
  }

  if (sheet.sheetType === 'worksheet') {
    // A single worksheet is the whole sheet; it has no place *on* anything.
    return { worksheets: [sheet], geometry: empty };
  }
  if (sheet.sheetType === 'dashboard') {
    return {
      worksheets: sheet.worksheets,
      geometry: readDashboardGeometry(sheet),
    };
  }

  warn(
    `the active sheet "${sheet.name}" is a story, and reading a worksheet `
    + `inside a story is a documented Tableau limitation; skipping it.`,
  );
  return { worksheets: [], geometry: empty };
}

/**
 * The Embedding API as a {@link TableauHost}.
 *
 * @param viz - The `<tableau-viz>` element.
 * @returns The host.
 */
function embeddingHost(viz: TableauViz): TableauHost {
  return {
    discover: () => discoverWorksheets(viz),
    mount: (wrapper) => {
      const parent = viz.parentElement;
      if (parent === null) {
        warn('the <tableau-viz> element left the document while it was loading.');
        return false;
      }
      parent.insertBefore(wrapper, viz);
      return true;
    },
    listen: ({ change, markSelection }) => {
      const onMarks = (event: Event): void => {
        markSelection((event as CustomEvent<unknown>).detail);
      };
      for (const type of CHANGE_EVENTS) {
        viz.addEventListener(type, change);
      }
      viz.addEventListener(MARK_SELECTION_EVENT, onMarks);
      return () => {
        for (const type of CHANGE_EVENTS) {
          viz.removeEventListener(type, change);
        }
        viz.removeEventListener(MARK_SELECTION_EVENT, onMarks);
      };
    },
    focusIsInView: () => {
      const active = document.activeElement;
      return active !== null && (active === viz || viz.contains(active));
    },
  };
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
  return startTableauSession(embeddingHost(viz), options);
}

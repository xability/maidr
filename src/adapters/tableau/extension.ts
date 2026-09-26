/**
 * Runs MAIDR inside a Tableau dashboard, as a dashboard extension.
 *
 * The Extensions API half of the binding. The dashboard the extension is a zone
 * of supplies the worksheets; the extension's own page is where the figure
 * goes; worksheet and parameter listeners stand in for the `<tableau-viz>`
 * element's DOM events; and the workbook's saved settings carry the adapter
 * options, so an author configures MAIDR once and every viewer gets it.
 * Everything else — reading, extraction, the selection bridge, the focus
 * handoff — is the session `bindTableau` uses too.
 *
 * What the extension cannot establish from code is recorded, not assumed: no
 * Tableau documentation says whether the extension's iframe is in the
 * dashboard's tab order, whether a screen reader reading the dashboard
 * announces a live region inside it, or whether Tableau keeps arrow keys the
 * extension needs. The figure is built so that none of those can make it any
 * worse than the embedding binder's — the entry point is an ordinary
 * focusable element in the extension's own document, and every key MAIDR
 * handles is handled inside that document — but whether a reader can reach it
 * at all is a question for testing with screen readers on Tableau itself (see
 * `docs/tableau.md`).
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/gh/tableau/extensions-api@1.17.0/lib/tableau.extensions.1.latest.min.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/tableau.js"></script>
 * <main id="maidr-extension"></main>
 * <script>
 *   maidrTableau.bindTableauExtension({
 *     container: document.getElementById('maidr-extension'),
 *     configureUrl: './configure.html',
 *   });
 * </script>
 * ```
 */

import type { TableauBinding, TableauHost } from './session';
import type {
  TableauAdapterOptions,
  TableauEventListenerManager,
  TableauEventUnregisterFn,
  TableauExtensionDashboard,
  TableauExtensions,
} from './types';
import { readDashboardGeometry, startTableauSession, warn } from './session';
import { parseTableauSettings } from './settings';

/** The settings key MAIDR's options are stored under, unless the page picks another. */
const DEFAULT_SETTINGS_KEY = 'maidr';

/** How big the configuration dialog opens. Room for the editor and its help text. */
const DIALOG_SIZE = { width: 640, height: 600 } as const;

/**
 * The error code Tableau rejects `displayDialogAsync` with when the author
 * closes the dialog with its own close button. Not a failure.
 */
const DIALOG_CLOSED_BY_USER = 'dialog-closed-by-user';

/**
 * Worksheet events that mean what MAIDR read may no longer be what is on screen.
 *
 * The Extensions API's own spelling (`TableauEventType` in
 * `ExternalContract/Extensions/Namespaces/Tableau.d.ts`), which differs from the
 * Embedding element's DOM event names. There is no tab switch: an extension is
 * a zone of one dashboard and never outlives it.
 */
const WORKSHEET_CHANGE_EVENTS: readonly string[] = [
  'filter-changed',
  'summary-data-changed',
];

/** A parameter's change event. Parameters are workbook-wide and not worksheet events. */
const PARAMETER_CHANGED = 'parameter-changed';

/**
 * The dashboard's layout changed — a zone moved, resized, or was shown or
 * hidden. The geometry the grid was built from is stale.
 */
const DASHBOARD_LAYOUT_CHANGED = 'dashboard-layout-changed';

/** A worksheet's selected marks changed, whoever changed them. */
const MARK_SELECTION_CHANGED = 'mark-selection-changed';

/** The saved settings changed — most often because the dialog saved them. */
const SETTINGS_CHANGED = 'settings-changed';

/** Where the extension finds the Extensions library, and how to lay itself out. */
export interface TableauExtensionOptions {
  /**
   * The element the figure is appended to. Defaults to `document.body`; a page
   * that wants a landmark around it passes its own `<main>`.
   */
  container?: HTMLElement;
  /**
   * URL of the configuration dialog, relative to the extension's page. When it
   * is set, the extension's *Configure* menu opens it; see
   * `configureTableauExtension`. Leave it off and the options come from
   * `defaults` and whatever was saved already.
   */
  configureUrl?: string;
  /** The settings key the options are saved under. Defaults to `'maidr'`. */
  settingsKey?: string;
  /**
   * Options that apply when the saved settings leave them out. The saved
   * settings win key by key, so a page can ship sensible defaults and let an
   * author override any of them.
   */
  defaults?: TableauAdapterOptions;
  /**
   * The Extensions API. Defaults to `window.tableau.extensions`, which the
   * Extensions library defines; passed in by tests and by pages that load the
   * library under another name.
   */
  extensions?: TableauExtensions;
}

/** Handle returned by {@link bindTableauExtension}. */
export interface TableauExtensionBinding {
  /**
   * The figure currently mounted, or `null` when the current options leave
   * nothing to mount. Replaced whenever the saved settings change.
   */
  readonly binding: TableauBinding | null;
  /** The options the current figure was built from: `defaults`, then settings. */
  readonly options: TableauAdapterOptions;
  /** Open the configuration dialog, as the extension's *Configure* menu does. */
  configure: () => Promise<void>;
  /** Stop listening and take the figure down; the dashboard is left as it was. */
  dispose: () => void;
}

declare global {
  interface Window {
    tableau?: { extensions?: TableauExtensions };
  }
}

/**
 * The Extensions API the page loaded, or `null` when it loaded none.
 *
 * @param given - What the caller passed, if anything.
 * @returns The API, or `null`.
 */
function resolveExtensions(given: TableauExtensions | undefined): TableauExtensions | null {
  if (given !== undefined) {
    return given;
  }
  return typeof window === 'undefined' ? null : window.tableau?.extensions ?? null;
}

/**
 * Attach a listener, tolerating a library that does not know the event.
 *
 * An Extensions library older than an event type throws when asked for it.
 * That costs the extension one kind of refresh, not the whole binding, so it
 * is reported and the rest carries on.
 *
 * @param target - What to listen on.
 * @param type - The event type.
 * @param handler - The listener.
 * @param unregister - Where the unregister function is collected.
 */
function listenTo(
  target: TableauEventListenerManager,
  type: string,
  handler: (event: unknown) => void,
  unregister: TableauEventUnregisterFn[],
): void {
  try {
    unregister.push(target.addEventListener(type, handler));
  } catch (error: unknown) {
    warn(
      `this Extensions library does not support the "${type}" event; MAIDR `
      + `will not re-read on it.`,
      error,
    );
  }
}

/**
 * The Extensions API as a session host.
 *
 * @param dashboard - The dashboard the extension is a zone of.
 * @param container - Where the figure goes.
 * @returns The host.
 */
function extensionHost(
  dashboard: TableauExtensionDashboard,
  container: HTMLElement,
): TableauHost {
  return {
    discover: () => ({
      worksheets: dashboard.worksheets,
      geometry: readDashboardGeometry(dashboard),
    }),
    mount: (wrapper) => {
      container.append(wrapper);
      return true;
    },
    listen: ({ change, markSelection }) => {
      const unregister: TableauEventUnregisterFn[] = [];
      let stopped = false;

      for (const worksheet of dashboard.worksheets) {
        for (const type of WORKSHEET_CHANGE_EVENTS) {
          listenTo(worksheet, type, change, unregister);
        }
        listenTo(worksheet, MARK_SELECTION_CHANGED, markSelection, unregister);
      }
      if (typeof dashboard.addEventListener === 'function') {
        listenTo(
          { addEventListener: dashboard.addEventListener.bind(dashboard) },
          DASHBOARD_LAYOUT_CHANGED,
          change,
          unregister,
        );
      }
      // Parameters are only reachable asynchronously. A dispose that lands
      // before they arrive must still leave nothing registered, so the late
      // registrations check `stopped` and undo themselves.
      if (typeof dashboard.getParametersAsync === 'function') {
        dashboard.getParametersAsync().then((parameters) => {
          if (stopped) {
            return;
          }
          for (const parameter of parameters) {
            listenTo(parameter, PARAMETER_CHANGED, change, unregister);
          }
        }).catch((error: unknown) => {
          warn('could not read the dashboard\'s parameters; a parameter change will not re-read.', error);
        });
      }

      return () => {
        stopped = true;
        for (const off of unregister.splice(0)) {
          off();
        }
      };
    },
    // Focus leaving the figure for the dashboard leaves the extension's
    // document altogether: the dashboard is the parent frame. Leaving for the
    // browser's own chrome looks the same from in here, and costs only a
    // delayed clear of MAIDR's own selection.
    focusIsInView: () => !document.hasFocus(),
  };
}

/**
 * Run MAIDR as a Tableau dashboard extension.
 *
 * Initializes the Extensions API, reads the options saved with the workbook,
 * and mounts MAIDR for the dashboard's worksheets into the extension's page.
 * Filter, data, parameter and layout changes re-read the worksheets; a change
 * to the saved settings rebuilds the figure from the new options.
 *
 * @param options - Where to mount, where the dialog is, and the defaults.
 * @returns A handle, or `null` when there is no Extensions API to talk to,
 * initialization failed, or the extension is not running in a dashboard. A
 * handle whose current options leave nothing to mount still comes back, with
 * `binding` set to `null`, since the next settings change may fix that.
 */
export async function bindTableauExtension(
  options: TableauExtensionOptions = {},
): Promise<TableauExtensionBinding | null> {
  const extensions = resolveExtensions(options.extensions);
  if (extensions === null) {
    warn(
      'no Tableau Extensions API on the page; load tableau.extensions.1.latest.min.js '
      + 'before binding.',
    );
    return null;
  }

  const settingsKey = options.settingsKey ?? DEFAULT_SETTINGS_KEY;
  const container = options.container ?? document.body;
  const defaults = options.defaults ?? {};

  let disposed = false;
  let binding: TableauBinding | null = null;
  let current: TableauAdapterOptions = defaults;
  // The raw setting the current figure was built from, so the dialog closing
  // and the settings event it causes rebuild once between them, not twice.
  // `null` until the first build; `undefined` is a real value, "nothing saved".
  let appliedRaw: string | undefined | null = null;
  let rebuilding: Promise<void> = Promise.resolve();

  // Set once initialization has found the dashboard; nothing rebuilds before.
  let host: TableauExtensionDashboard | null = null;

  /**
   * Build the figure again if the saved settings differ from the ones it was
   * built from. Serialized, so two quick saves cannot mount two figures.
   *
   * @returns A promise that settles once any rebuild has finished.
   */
  const rebuild = async (): Promise<void> => {
    rebuilding = rebuilding.then(async () => {
      if (disposed) {
        return;
      }
      const raw = extensions.settings.get(settingsKey);
      if (host === null || raw === appliedRaw) {
        return;
      }
      appliedRaw = raw;
      const parsed = parseTableauSettings(raw);
      if (parsed.error !== undefined) {
        warn(
          `the saved "${settingsKey}" setting is not usable, so the defaults `
          + `apply instead: ${parsed.error}`,
        );
      }
      current = { ...defaults, ...parsed.options };
      binding?.dispose();
      binding = null;
      binding = await startTableauSession(
        extensionHost(host, container),
        current,
      );
      if (disposed) {
        binding?.dispose();
        binding = null;
      }
    }).catch((error: unknown) => {
      warn('building the figure failed; nothing is mounted.', error);
    });
    return rebuilding;
  };

  const configure = async (): Promise<void> => {
    if (options.configureUrl === undefined) {
      warn('no configureUrl was given, so there is no dialog to open.');
      return;
    }
    try {
      await extensions.ui.displayDialogAsync(
        options.configureUrl,
        extensions.settings.get(settingsKey) ?? '',
        DIALOG_SIZE,
      );
    } catch (error: unknown) {
      const code = (error as { errorCode?: unknown } | null)?.errorCode;
      if (code !== DIALOG_CLOSED_BY_USER) {
        warn('the configuration dialog failed to open or closed with an error.', error);
      }
    }
    // The dialog saved through the same settings object, which also fires the
    // settings event; whichever arrives first rebuilds, and the other finds
    // nothing new.
    await rebuild();
  };

  try {
    await extensions.initializeAsync(
      options.configureUrl === undefined
        ? undefined
        : {
            configure: () => {
              void configure();
              return {};
            },
          },
    );
  } catch (error: unknown) {
    warn('the Tableau Extensions API failed to initialize; nothing to bind.', error);
    return null;
  }

  const dashboard = extensions.dashboardContent?.dashboard;
  if (dashboard === undefined) {
    warn(
      'this extension is not running in a dashboard. MAIDR runs as a dashboard '
      + 'extension; add it to a dashboard as an extension object.',
    );
    return null;
  }
  host = dashboard;

  let unregisterSettings: TableauEventUnregisterFn | null = null;
  try {
    unregisterSettings = extensions.settings.addEventListener(SETTINGS_CHANGED, () => {
      void rebuild();
    });
  } catch (error: unknown) {
    warn('could not listen for settings changes; reload the dashboard after configuring.', error);
  }

  await rebuild();

  return {
    get binding(): TableauBinding | null {
      return binding;
    },
    get options(): TableauAdapterOptions {
      return current;
    },
    configure,
    dispose: (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      unregisterSettings?.();
      binding?.dispose();
      binding = null;
    },
  };
}

/** Where the dialog page renders, and which API and key it talks to. */
export interface TableauExtensionDialogOptions {
  /** The element the form is appended to. Defaults to `document.body`. */
  container?: HTMLElement;
  /** The settings key. Must match the extension's. Defaults to `'maidr'`. */
  settingsKey?: string;
  /** The Extensions API. Defaults to `window.tableau.extensions`. */
  extensions?: TableauExtensions;
}

/**
 * Create an element with attributes and text.
 *
 * @param tag - The tag name.
 * @param attributes - Attributes to set.
 * @param text - Text content, if any.
 * @returns The element.
 */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * Run the configuration dialog the extension's *Configure* menu opens.
 *
 * Call it from the page at `configureUrl`. It renders one labelled editor for
 * the options JSON, checks what the author typed with the same parser the
 * extension uses, saves it with the workbook, and closes. A setting that does
 * not parse is never saved: the message goes to an alert beside the editor,
 * the editor is marked invalid, and focus goes back to it.
 *
 * @param options - Where to render, and the API and key to use.
 * @returns A promise that settles once the dialog is on screen, or `false`
 * when there is no Extensions API or it would not initialize.
 */
export async function configureTableauExtension(
  options: TableauExtensionDialogOptions = {},
): Promise<boolean> {
  const extensions = resolveExtensions(options.extensions);
  if (extensions === null) {
    warn('no Tableau Extensions API on the dialog page; load it before configuring.');
    return false;
  }
  let payload: string;
  try {
    payload = await extensions.initializeDialogAsync();
  } catch (error: unknown) {
    warn('the configuration dialog failed to initialize.', error);
    return false;
  }
  const settingsKey = options.settingsKey ?? DEFAULT_SETTINGS_KEY;
  const container = options.container ?? document.body;
  const saved = payload !== '' ? payload : extensions.settings.get(settingsKey) ?? '';

  const form = element('form', { 'aria-labelledby': 'maidr-config-title', 'novalidate': '' });
  const heading = element('h1', { id: 'maidr-config-title' }, 'MAIDR options for this dashboard');
  const help = element(
    'p',
    { id: 'maidr-config-help' },
    'Write the options as JSON — for example {"title": "Sales", "overrides": '
    + '{"Sales by Region": {"traceType": "stacked_bar"}}}. Leave it empty to use '
    + 'the defaults. Every option is described in the MAIDR Tableau guide.',
  );
  const label = element('label', { for: 'maidr-config-json' }, 'Options (JSON)');
  const editor = element('textarea', {
    'id': 'maidr-config-json',
    'rows': '14',
    'cols': '60',
    'spellcheck': 'false',
    'aria-describedby': 'maidr-config-help maidr-config-error',
  });
  editor.value = saved;
  const error = element('p', { id: 'maidr-config-error', role: 'alert' });
  const save = element('button', { type: 'submit' }, 'Save');
  const cancel = element('button', { type: 'button' }, 'Cancel');
  form.append(heading, help, label, editor, error, save, cancel);
  container.append(form);

  cancel.addEventListener('click', () => {
    extensions.ui.closeDialog();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = parseTableauSettings(editor.value);
    if (parsed.error !== undefined) {
      error.textContent = parsed.error;
      editor.setAttribute('aria-invalid', 'true');
      editor.focus();
      return;
    }
    error.textContent = '';
    editor.removeAttribute('aria-invalid');
    const value = editor.value.trim() === '' ? '' : JSON.stringify(parsed.options, null, 2);
    extensions.settings.set(settingsKey, value);
    save.disabled = true;
    extensions.settings.saveAsync().then(() => {
      extensions.ui.closeDialog(value);
    }).catch((failure: unknown) => {
      save.disabled = false;
      error.textContent = 'The options could not be saved to the workbook. Try again, '
        + 'or check that you are editing the dashboard.';
      warn('saving the settings failed.', failure);
    });
  });

  editor.focus();
  return true;
}

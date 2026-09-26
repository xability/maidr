/**
 * @jest-environment jsdom
 */

import type {
  TableauExtensionDashboard,
  TableauExtensionParameter,
  TableauExtensions,
  TableauExtensionWorksheet,
} from '@adapters/tableau/types';
import type { Maidr, NavigationTarget } from '@type/grammar';
import type { ReactNode } from 'react';
import type { FakeWorksheet } from './helpers';
import {
  bindTableauExtension,
  configureTableauExtension,
} from '@adapters/tableau/extension';
import { liveDataManager } from '@service/liveData';
import {
  fakeColumn,
  fakeDashboardObject,
  fakeMarks,
  fakeMarkSelection,
  fakeWorksheet,
} from './helpers';

/** The same stand-in `binder.test.tsx` uses, for the same reason given there. */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { children: ReactNode }): ReactNode => props.children,
}));

/**
 * The Dashboard Extensions binder: what it asks of the Extensions API and what
 * it gives back.
 *
 * The session it drives is covered by `binder.test.tsx`; what is pinned here is
 * the half only this surface has:
 *
 * 1. **Listeners are attached per worksheet and undone with the closures the
 *    API returns.** The Extensions API has no `removeEventListener` a caller can
 *    rely on having kept the handler for, so a leaked closure is a leaked
 *    listener, re-reading into a figure that no longer exists.
 * 2. **The saved settings are the options.** A change to them rebuilds the
 *    figure, once, however many ways the change is reported; a setting that
 *    does not parse falls back to the defaults and says why.
 * 3. **A library that predates an event still binds.** It costs one kind of
 *    refresh, not the figure.
 * 4. **The dialog never saves what the extension could not read.**
 */

const REGION = fakeColumn('Region', 'string', 0);
const SALES = fakeColumn('SUM(Sales)', 'float', 1);
const FIGURE_ID = 'maidr-extension-test';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

/**
 * Drain the microtask queue; see the same helper in `binder.test.tsx`.
 *
 * @returns A promise that settles once the queue has been drained.
 */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 50; turn++) {
    await Promise.resolve();
  }
}

/** Listeners a fake has been given, by event type, and how many were removed. */
interface Listeners {
  readonly byType: Map<string, ((event: unknown) => void)[]>;
  removed: number;
}

/**
 * Make an object take Extensions-style listeners and record them.
 *
 * @param unsupported - Event types to throw for, as an older library does.
 * @returns The `addEventListener` and its record.
 */
function listenerManager(unsupported: readonly string[] = []): {
  addEventListener: TableauExtensionWorksheet['addEventListener'];
  listeners: Listeners;
} {
  const listeners: Listeners = { byType: new Map(), removed: 0 };
  return {
    listeners,
    addEventListener: (type, handler) => {
      if (unsupported.includes(type)) {
        throw new Error(`Unsupported event type: ${type}`);
      }
      const list = listeners.byType.get(type) ?? [];
      list.push(handler);
      listeners.byType.set(type, list);
      return () => {
        const index = list.indexOf(handler);
        if (index === -1) {
          return false;
        }
        list.splice(index, 1);
        listeners.removed++;
        return true;
      };
    },
  };
}

/**
 * Fire an event at every listener registered for it.
 *
 * @param listeners - The record.
 * @param type - The event type.
 * @param event - The payload.
 */
function fire(listeners: Listeners, type: string, event: unknown = { type }): void {
  for (const handler of [...(listeners.byType.get(type) ?? [])]) {
    handler(event);
  }
}

/** How many listeners are still attached, across every type. */
function attached(listeners: Listeners): number {
  let count = 0;
  for (const list of listeners.byType.values()) {
    count += list.length;
  }
  return count;
}

/** An Extensions worksheet: the shared fake, plus listeners. */
interface ExtensionWorksheet extends TableauExtensionWorksheet {
  readonly calls: FakeWorksheet['calls'];
  readonly listeners: Listeners;
}

/**
 * Build a worksheet holding two rows of one dimension and one measure.
 *
 * @param name - The worksheet name.
 * @param unsupported - Event types its library does not know.
 * @returns The worksheet.
 */
function salesWorksheet(name: string, unsupported: readonly string[] = []): ExtensionWorksheet {
  const base = fakeWorksheet({
    name,
    columns: [REGION, SALES],
    rows: [['East', 10], ['West', 20]],
  });
  const { addEventListener, listeners } = listenerManager(unsupported);
  return Object.assign(base, { addEventListener, listeners });
}

/** Everything a test needs to drive a fake `tableau.extensions`. */
interface FakeExtensions {
  readonly api: TableauExtensions;
  readonly store: Map<string, string>;
  readonly settingsListeners: Listeners;
  readonly dashboardListeners: Listeners;
  readonly parameterListeners: Listeners;
  readonly initializeAsync: jest.Mock;
  readonly displayDialogAsync: jest.Mock;
  readonly closeDialog: jest.Mock;
  readonly saveAsync: jest.Mock;
  /** Resolves the parameters `getParametersAsync` is waiting on. */
  releaseParameters: () => void;
}

/**
 * Build a `tableau.extensions` over a dashboard of the given worksheets.
 *
 * @param worksheets - The dashboard's worksheets, in add-order.
 * @param config - Saved settings, whether the extension is in a dashboard at
 * all, and whether parameters arrive at once or only when released.
 * @param config.saved - The raw saved `maidr` setting.
 * @param config.inDashboard - False for a viz extension.
 * @param config.holdParameters - Keep `getParametersAsync` pending until released.
 * @returns The fake and its records.
 */
function fakeExtensions(
  worksheets: readonly ExtensionWorksheet[],
  config: { saved?: string; inDashboard?: boolean; holdParameters?: boolean } = {},
): FakeExtensions {
  const store = new Map<string, string>();
  if (config.saved !== undefined) {
    store.set('maidr', config.saved);
  }
  const settings = listenerManager();
  const dashboardEvents = listenerManager();
  const parameterEvents = listenerManager();
  const parameter: TableauExtensionParameter = {
    name: 'Top N',
    addEventListener: parameterEvents.addEventListener,
  };
  let releaseParameters = (): void => {};
  const parametersReady = config.holdParameters === true
    ? new Promise<void>((resolve) => {
        releaseParameters = resolve;
      })
    : Promise.resolve();

  const dashboard: TableauExtensionDashboard = {
    name: 'Dashboard 1',
    sheetType: 'dashboard',
    worksheets,
    addEventListener: dashboardEvents.addEventListener,
    getParametersAsync: async () => {
      await parametersReady;
      return [parameter];
    },
  };
  const initializeAsync = jest.fn(async () => {});
  const displayDialogAsync = jest.fn(async () => '');
  const closeDialog = jest.fn();
  const saveAsync = jest.fn(async () => {
    const snapshot = Object.fromEntries(store);
    fire(settings.listeners, 'settings-changed', { newSettings: snapshot });
    return snapshot;
  });

  const api: TableauExtensions = {
    initializeAsync,
    initializeDialogAsync: async () => store.get('maidr') ?? '',
    ...(config.inDashboard === false ? {} : { dashboardContent: { dashboard } }),
    settings: {
      get: key => store.get(key),
      set: (key, value) => {
        store.set(key, value);
      },
      saveAsync,
      addEventListener: settings.addEventListener,
    },
    ui: { displayDialogAsync, closeDialog },
  };
  return {
    api,
    store,
    settingsListeners: settings.listeners,
    dashboardListeners: dashboardEvents.listeners,
    parameterListeners: parameterEvents.listeners,
    initializeAsync,
    displayDialogAsync,
    closeDialog,
    saveAsync,
    get releaseParameters() {
      return releaseParameters;
    },
  };
}

/** A container on the page for the extension's figure. */
function container(): HTMLElement {
  const main = document.createElement('main');
  document.body.append(main);
  return main;
}

/** How many summary-data readers a worksheet has been asked for. */
function reads(worksheet: ExtensionWorksheet): number {
  return worksheet.calls.log.filter(entry => entry.startsWith('open:')).length;
}

describe('bindTableauExtension', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    warn.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
    delete window.tableau;
  });

  it('returns null, and says what to load, when the page has no Extensions API', async () => {
    await expect(bindTableauExtension()).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no Tableau Extensions API on the page'),
    );
  });

  it('finds the API on window.tableau.extensions, where the library puts it', async () => {
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    window.tableau = { extensions: fake.api };

    const handle = await bindTableauExtension({ container: container() });

    expect(handle?.binding).not.toBeNull();
    handle?.dispose();
  });

  it('mounts the figure into its container and reads every worksheet', async () => {
    const east = salesWorksheet('East');
    const west = salesWorksheet('West');
    const fake = fakeExtensions([east, west]);
    const main = container();

    const handle = await bindTableauExtension({
      container: main,
      extensions: fake.api,
      defaults: { id: FIGURE_ID },
    });

    expect(main.querySelector(`[data-maidr-tableau="${FIGURE_ID}"]`)).not.toBeNull();
    expect(handle?.binding?.maidr.subplots.flat()).toHaveLength(2);
    expect(reads(east)).toBe(1);
    expect(reads(west)).toBe(1);
    handle?.dispose();
  });

  it('offers a Configure menu only when there is a dialog to open', async () => {
    const withDialog = fakeExtensions([salesWorksheet('Sales')]);
    const without = fakeExtensions([salesWorksheet('Sales')]);

    const a = await bindTableauExtension({
      container: container(),
      extensions: withDialog.api,
      configureUrl: './configure.html',
    });
    const b = await bindTableauExtension({ container: container(), extensions: without.api });

    expect(withDialog.initializeAsync).toHaveBeenCalledWith({ configure: expect.any(Function) });
    expect(without.initializeAsync).toHaveBeenCalledWith(undefined);
    a?.dispose();
    b?.dispose();
  });

  it('returns null when initialization fails, with the page unchanged', async () => {
    const fake = fakeExtensions([salesWorksheet('Sales')]);
    fake.initializeAsync.mockRejectedValueOnce(new Error('not in Tableau'));
    const main = container();

    await expect(bindTableauExtension({ container: main, extensions: fake.api })).resolves.toBeNull();

    expect(main.childElementCount).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to initialize'),
      expect.any(Error),
    );
  });

  it('refuses to run as a viz extension, which has no dashboard', async () => {
    const fake = fakeExtensions([salesWorksheet('Sales')], { inDashboard: false });

    await expect(bindTableauExtension({ container: container(), extensions: fake.api }))
      .resolves
      .toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not running in a dashboard'));
  });

  it('lays the dashboard out by its geometry, leaving its own zone out', async () => {
    const left = salesWorksheet('Left');
    const right = salesWorksheet('Right');
    const fake = fakeExtensions([left, right]);
    const dashboard = fake.api.dashboardContent?.dashboard;
    if (dashboard === undefined) {
      throw new Error('expected a dashboard');
    }
    Object.assign(dashboard, {
      objects: [
        fakeDashboardObject({ id: 1, worksheet: left, x: 0, y: 0, width: 400, height: 300 }),
        fakeDashboardObject({ id: 2, worksheet: right, x: 400, y: 0, width: 400, height: 300 }),
        // MAIDR's own zone: furniture, like a legend.
        fakeDashboardObject({ id: 3, type: 'extension', x: 0, y: 300, width: 800, height: 200 }),
      ],
    });

    const handle = await bindTableauExtension({ container: container(), extensions: fake.api });

    // One row of two, not a column of two.
    expect(handle?.binding?.maidr.subplots).toHaveLength(1);
    expect(handle?.binding?.maidr.subplots[0]).toHaveLength(2);
    handle?.dispose();
  });

  it('re-reads once after a burst of worksheet changes', async () => {
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    const handle = await bindTableauExtension({ container: container(), extensions: fake.api });
    expect(reads(sales)).toBe(1);

    fire(sales.listeners, 'filter-changed');
    fire(sales.listeners, 'summary-data-changed');
    fire(sales.listeners, 'filter-changed');
    await jest.advanceTimersByTimeAsync(300);
    await flush();

    expect(reads(sales)).toBe(2);
    handle?.dispose();
  });

  it('re-reads when a parameter or the dashboard layout changes', async () => {
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    const handle = await bindTableauExtension({ container: container(), extensions: fake.api });
    await flush();

    fire(fake.parameterListeners, 'parameter-changed');
    await jest.advanceTimersByTimeAsync(300);
    await flush();
    expect(reads(sales)).toBe(2);

    fire(fake.dashboardListeners, 'dashboard-layout-changed');
    await jest.advanceTimersByTimeAsync(300);
    await flush();
    expect(reads(sales)).toBe(3);
    handle?.dispose();
  });

  it('follows a mark a user selects, from the event itself rather than a DOM detail', async () => {
    const targets: (NavigationTarget | null)[] = [];
    const stub: Maidr = { id: FIGURE_ID, subplots: [] };
    const chart = liveDataManager.register(stub, () => {}, (target) => {
      targets.push(target);
      return true;
    });
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    const handle = await bindTableauExtension({
      container: container(),
      extensions: fake.api,
      defaults: { id: FIGURE_ID },
    });

    fire(
      sales.listeners,
      'mark-selection-changed',
      fakeMarkSelection(sales, fakeMarks([REGION, SALES], [['West', 20]])),
    );
    await flush();

    expect(targets).toEqual([{ layerId: '0', row: 0, col: 1 }]);
    chart.dispose();
    handle?.dispose();
  });

  it.each([
    ['the dashboard, where a click may be selecting a mark', false, 0],
    ['somewhere else in the extension', true, 1],
  ])('when focus leaves the figure for %s, clears after the handoff or at once', async (
    _where,
    documentHasFocus,
    clearsAtOnce,
  ) => {
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    const main = container();
    const outside = document.createElement('button');
    main.after(outside);
    const handle = await bindTableauExtension({ container: main, extensions: fake.api });
    const wrapper = main.querySelector<HTMLElement>('[data-maidr-tableau]');
    if (handle?.binding == null || wrapper === null) {
      throw new Error('expected a mounted figure');
    }
    wrapper.tabIndex = -1;
    wrapper.focus();
    handle.binding.maidr.onNavigate?.({ layerId: '0', row: 0, col: 0 });
    await flush();
    const before = sales.calls.clears;
    const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(documentHasFocus);

    // Leaving the extension's document entirely moves focus to its body; the
    // other case is an ordinary move to a sibling control.
    if (documentHasFocus) {
      outside.focus();
    } else {
      wrapper.blur();
    }
    await jest.advanceTimersByTimeAsync(0);
    await flush();
    expect(sales.calls.clears - before).toBe(clearsAtOnce);

    await jest.advanceTimersByTimeAsync(1000);
    await flush();
    expect(sales.calls.clears - before).toBe(1);

    hasFocus.mockRestore();
    handle.dispose();
  });

  it('still binds when the library predates an event, and says which', async () => {
    const sales = salesWorksheet('Sales', ['summary-data-changed']);
    const fake = fakeExtensions([sales]);

    const handle = await bindTableauExtension({ container: container(), extensions: fake.api });

    expect(handle?.binding).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('does not support the "summary-data-changed" event'),
      expect.any(Error),
    );
    handle?.dispose();
  });

  it('builds from the saved settings, over the page defaults', async () => {
    const fake = fakeExtensions([salesWorksheet('Sales')], {
      saved: JSON.stringify({ title: 'Saved title' }),
    });

    const handle = await bindTableauExtension({
      container: container(),
      extensions: fake.api,
      defaults: { title: 'Default title', id: FIGURE_ID },
    });

    expect(handle?.options).toEqual({ title: 'Saved title', id: FIGURE_ID });
    expect(handle?.binding?.maidr.title).toBe('Saved title');
    handle?.dispose();
  });

  it('falls back to the defaults when the saved setting is unusable, and says why', async () => {
    const fake = fakeExtensions([salesWorksheet('Sales')], { saved: '{"titel": "Oops"}' });

    const handle = await bindTableauExtension({
      container: container(),
      extensions: fake.api,
      defaults: { title: 'Default title' },
    });

    expect(handle?.options).toEqual({ title: 'Default title' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('has no option "titel"'));
    handle?.dispose();
  });

  it('rebuilds once when the settings change, however many ways that is reported', async () => {
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    const main = container();
    const handle = await bindTableauExtension({
      container: main,
      extensions: fake.api,
      configureUrl: './configure.html',
    });
    const first = handle?.binding;

    // The dialog saves (which fires settings-changed) and then closes (which
    // resolves displayDialogAsync): two reports of one change.
    fake.displayDialogAsync.mockImplementationOnce(async () => {
      fake.api.settings.set('maidr', JSON.stringify({ title: 'Renamed' }));
      await fake.api.settings.saveAsync();
      return '';
    });
    await handle?.configure();
    await flush();

    expect(handle?.binding).not.toBe(first);
    expect(handle?.binding?.maidr.title).toBe('Renamed');
    expect(reads(sales)).toBe(2);
    expect(main.querySelectorAll('[data-maidr-tableau]')).toHaveLength(1);
    handle?.dispose();
  });

  it('treats the author closing the dialog as nothing to report', async () => {
    const fake = fakeExtensions([salesWorksheet('Sales')]);
    const handle = await bindTableauExtension({
      container: container(),
      extensions: fake.api,
      configureUrl: './configure.html',
    });
    fake.displayDialogAsync.mockRejectedValueOnce({ errorCode: 'dialog-closed-by-user' });
    warn.mockClear();

    await handle?.configure();

    expect(fake.displayDialogAsync).toHaveBeenCalledWith(
      './configure.html',
      '',
      { width: 640, height: 600 },
    );
    expect(warn).not.toHaveBeenCalled();
    handle?.dispose();
  });

  it('leaves nothing registered and nothing mounted after dispose', async () => {
    const sales = salesWorksheet('Sales');
    const fake = fakeExtensions([sales]);
    const main = container();
    const handle = await bindTableauExtension({ container: main, extensions: fake.api });
    await flush();
    expect(attached(sales.listeners)).toBe(3);
    expect(attached(fake.parameterListeners)).toBe(1);

    handle?.dispose();

    expect(attached(sales.listeners)).toBe(0);
    expect(attached(fake.parameterListeners)).toBe(0);
    expect(attached(fake.dashboardListeners)).toBe(0);
    expect(attached(fake.settingsListeners)).toBe(0);
    expect(main.childElementCount).toBe(0);
    expect(sales.calls.clears).toBeGreaterThan(0);
  });

  it('registers no parameter listener that arrives after dispose', async () => {
    const fake = fakeExtensions([salesWorksheet('Sales')], { holdParameters: true });
    const handle = await bindTableauExtension({ container: container(), extensions: fake.api });

    handle?.dispose();
    fake.releaseParameters();
    await flush();

    expect(attached(fake.parameterListeners)).toBe(0);
  });
});

describe('configureTableauExtension', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * Open the dialog over a fake API.
   *
   * @param saved - The raw setting already saved.
   * @returns The fake, and the dialog's editor, alert and buttons.
   */
  async function openDialog(saved?: string): Promise<{
    fake: FakeExtensions;
    editor: HTMLTextAreaElement;
    alert: HTMLElement;
    save: HTMLButtonElement;
    cancel: HTMLButtonElement;
  }> {
    const fake = fakeExtensions([], saved === undefined ? {} : { saved });
    await expect(configureTableauExtension({ extensions: fake.api })).resolves.toBe(true);
    const editor = document.querySelector('textarea');
    const alert = document.querySelector<HTMLElement>('[role="alert"]');
    const [save, cancel] = document.querySelectorAll('button');
    if (editor === null || alert === null || save === undefined || cancel === undefined) {
      throw new Error('expected the dialog to render its form');
    }
    return { fake, editor, alert, save, cancel };
  }

  it('opens on a labelled editor holding what was saved, with focus in it', async () => {
    const saved = '{"title":"Sales"}';
    const { editor } = await openDialog(saved);

    expect(editor.value).toBe(saved);
    expect(document.querySelector(`label[for="${editor.id}"]`)?.textContent).toBe('Options (JSON)');
    expect(editor.getAttribute('aria-describedby')).toContain('maidr-config-error');
    expect(document.activeElement).toBe(editor);
  });

  it('saves what parses, with the workbook, then closes', async () => {
    const { fake, editor, save } = await openDialog();
    editor.value = '{"title": "Sales"}';

    save.click();
    await flush();

    expect(fake.store.get('maidr')).toBe(JSON.stringify({ title: 'Sales' }, null, 2));
    expect(fake.saveAsync).toHaveBeenCalledTimes(1);
    expect(fake.closeDialog).toHaveBeenCalledWith(fake.store.get('maidr'));
  });

  it('never saves what the extension could not read, and says why where the author is', async () => {
    const { fake, editor, alert, save } = await openDialog();
    editor.value = '{"overrides": {"Sales": {"traceType": "stacked"}}}';
    save.blur();

    save.click();
    await flush();

    expect(fake.saveAsync).not.toHaveBeenCalled();
    expect(fake.closeDialog).not.toHaveBeenCalled();
    expect(alert.textContent).toMatch(/traceType must be one of/);
    expect(editor.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(editor);
  });

  it('clears the error once the options are fixed', async () => {
    const { editor, alert, save } = await openDialog();
    editor.value = 'not json';
    save.click();
    expect(alert.textContent).not.toBe('');

    editor.value = '{}';
    save.click();
    await flush();

    expect(alert.textContent).toBe('');
    expect(editor.hasAttribute('aria-invalid')).toBe(false);
  });

  it('saves an emptied editor as nothing, which is the defaults', async () => {
    const { fake, editor, save } = await openDialog('{"title":"Sales"}');
    editor.value = '  ';

    save.click();
    await flush();

    expect(fake.store.get('maidr')).toBe('');
  });

  it('closes without saving on Cancel', async () => {
    const { fake, cancel } = await openDialog('{"title":"Sales"}');

    cancel.click();

    expect(fake.saveAsync).not.toHaveBeenCalled();
    expect(fake.closeDialog).toHaveBeenCalledWith();
  });

  it('returns false when the page has no Extensions API', async () => {
    await expect(configureTableauExtension()).resolves.toBe(false);
  });
});

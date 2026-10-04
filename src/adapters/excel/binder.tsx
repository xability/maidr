/**
 * Mounts MAIDR in an Excel add-in's task pane, for the charts in the workbook.
 *
 * An add-in's task pane is a web page beside the grid. It cannot reach into
 * the grid's own drawing of a chart, so {@link bindExcel} reads the chart
 * through Office.js instead and gives the pane a reading of it: a labelled
 * picker of every chart in the workbook, and MAIDR's figure for the chosen
 * one, with the chart's picture as Excel draws it.
 *
 * What it keeps in step, and how:
 *
 * - **The chart the user activates in the grid** is shown, through each
 *   worksheet's `charts.onActivated` (ExcelApi 1.8). A chart losing activation
 *   changes nothing: moving from the grid into the pane (F6) can deactivate
 *   the chart, and the reader came to the pane to read it.
 * - **The workbook's data** is re-read a moment after a cell changes or the
 *   workbook recalculates (`worksheets.onChanged`, ExcelApi 1.9, and
 *   `worksheets.onCalculated`, ExcelApi 1.8), once per burst of them, and the
 *   figure is replaced only when what it reads has changed.
 * - **The chart list** is re-read when a chart or worksheet is added or
 *   deleted.
 *
 * The figure is live: new data is applied in place even while the reader's
 * focus is in it. The pane keeps its focused element while the reader is in
 * the grid, so MAIDR cannot tell that they left, and data held back "until
 * they leave" would be held until they happened to leave the figure itself --
 * the reasoning, and the default, of the Power BI binder.
 *
 * @example
 * ```html
 * <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/excel.js"></script>
 * <main id="maidr"></main>
 * <script>
 *   Office.onReady(() => {
 *     maidrExcel.bindExcel(document.getElementById('maidr'));
 *   });
 * </script>
 * ```
 */

import type { JSX } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import type { Maidr as MaidrData } from '../../type/grammar';
import type { ExcelOmittedSeries } from './converter';
import type { FoundChart } from './reader';
import type {
  ExcelChartActivatedEvent,
  ExcelChartCollection,
  ExcelChartInfo,
  ExcelChartSnapshot,
  ExcelEventHandlerResult,
  ExcelEventHandlers,
  ExcelHost,
  ExcelWorksheetAddedEvent,
  OfficeHost,
} from './types';
import { useId } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { convertExcelChartOutcome, excelChartTypeName, nextFigureId } from './converter';
import { findExcelCharts, readExcelChart } from './reader';

const ADAPTER_PREFIX = '[MAIDR excel]';

/** The requirement set every read needs: `ChartSeries.getDimensionValues`. */
const REQUIRED_VERSION = '1.12';

/** The one that adds `getDimensionDataSourceString`, for the category cells. */
const CELLS_VERSION = '1.15';

/** How long a burst of cell changes has to settle before the chart is re-read. */
const DEFAULT_REFRESH_DELAY_MS = 300;

/**
 * What the pane says. Every string can be replaced, for a pane in another
 * language or with other wording.
 */
export interface ExcelPaneLabels {
  /** The picker's label. */
  readonly picker: string;
  /** The picker's empty choice, when the chart it showed is gone. */
  readonly choose: string;
  /** While the first read is under way. */
  readonly loading: string;
  /** When the workbook has no chart on a visible worksheet. */
  readonly noCharts: string;
  /** When the chart has nothing MAIDR can navigate: every value blank. */
  readonly noData: string;
  /** When MAIDR has no reading of the chart's type; `{type}` names it. */
  readonly unsupported: string;
  /**
   * Above the figure, when a combo chart is read without some of its series;
   * `{series}` names them.
   */
  readonly partial: string;
  /** When Excel is older than ExcelApi 1.12 and cannot hand charts to add-ins. */
  readonly unsupportedExcel: string;
  /** When the page is not running in Excel at all. */
  readonly noExcel: string;
  /** When reading the chart failed. */
  readonly readFailed: string;
  /** When the chart that was shown is no longer in the workbook. */
  readonly chartGone: string;
}

/** The pane's English wording. */
export const DEFAULT_EXCEL_LABELS: ExcelPaneLabels = {
  picker: 'Chart',
  choose: 'Choose a chart',
  loading: 'Reading the workbook…',
  noCharts: 'This workbook has no charts to read. Insert a chart, and it will be read here.',
  noData: 'This chart has no data to read.',
  unsupported: 'MAIDR cannot read {type} charts yet. Choose another chart.',
  partial: 'MAIDR reads this chart without {series}, which it cannot read yet.',
  unsupportedExcel:
    'This version of Excel cannot share its charts with add-ins. MAIDR needs Excel on the web, '
    + 'Excel for Microsoft 365, or Excel 2021 or later.',
  noExcel: 'MAIDR could not find Excel. Open this page as an Excel add-in.',
  readFailed: 'MAIDR could not read this chart.',
  chartGone: 'That chart is no longer in the workbook. Choose another chart.',
};

/**
 * Options for {@link bindExcel}.
 */
export interface ExcelBindOptions {
  /** The `Excel` namespace Office.js defines. Default `window.Excel`. */
  readonly excel?: ExcelHost;
  /** The `Office` namespace Office.js defines. Default `window.Office`. */
  readonly office?: OfficeHost;
  /**
   * Show the chart the user activates in the workbook. Default `true`; with
   * `false`, the picker alone chooses the chart.
   */
  readonly followActiveChart?: boolean;
  /**
   * How long to wait after a cell changes before re-reading the chart, in
   * milliseconds, so a burst of edits is read once. Default 300.
   */
  readonly refreshDelay?: number;
  /**
   * The width, in pixels, to request the chart's picture at. Default: the
   * container's width at the screen's pixel density.
   */
  readonly imageWidth?: number;
  /** The figure id; must be unique on the page. Default `maidr-excel-<n>`. */
  readonly id?: string;
  /** Replacements for any of the pane's wording. */
  readonly labels?: Partial<ExcelPaneLabels>;
}

/**
 * A mounted pane, returned by {@link bindExcel}.
 */
export interface ExcelBinding {
  /** The figure on show, or `null` while the pane shows a message instead. */
  readonly maidr: MaidrData | null;
  /** The chart on show, or `null` when none is. */
  readonly chart: ExcelChartInfo | null;
  /** Every chart the picker offers. */
  readonly charts: readonly ExcelChartInfo[];
  /**
   * Show a chart, by its id from {@link ExcelBinding.charts}; with no id, the
   * chart shown already, or else the active chart, or else the first.
   * Never rejects: a failure is shown in the pane and warned in the console.
   */
  show: (chartId?: string) => Promise<void>;
  /** Re-read the chart list and the chart on show. */
  refresh: () => Promise<void>;
  /**
   * Unregister every Office.js event handler, unmount MAIDR and remove the
   * pane. The returned promise settles once Excel has the handlers removed.
   */
  dispose: () => Promise<void>;
}

/** What the pane's figure area shows. */
type View
  = | { readonly kind: 'status'; readonly message: string }
    | {
      readonly kind: 'figure';
      readonly maidr: MaidrData;
      readonly image?: string;
      readonly label: string;
      /** What a combo chart's reading leaves out, said above the figure. */
      readonly note?: string;
    };

/** Everything the pane renders from. */
interface PaneState {
  readonly charts: readonly ExcelChartInfo[];
  /** The chart on show, by id; `null` when none is. */
  readonly selected: string | null;
  readonly view: View;
}

interface PaneProps {
  readonly state: PaneState;
  readonly labels: ExcelPaneLabels;
  readonly onPick: (chartId: string) => void;
}

/** Fills the pane's width, keeping the chart's proportions. */
const IMAGE_STYLE = { display: 'block', maxWidth: '100%', height: 'auto' } as const;

/**
 * The pane: a labelled native `<select>` of every chart, so a keyboard or
 * screen-reader user can choose one without leaving the pane, and the figure
 * area -- MAIDR around the chart's picture, or a focusable status message.
 *
 * The picture is decorative (`alt=""`): it sits inside MAIDR's figure, whose
 * own label describes the chart, and repeating it would be heard twice.
 */
function ExcelPane({ state, labels, onPick }: PaneProps): JSX.Element {
  const pickerId = useId();
  const { charts, selected, view } = state;
  const known = charts.some(chart => chart.id === selected);
  return (
    <>
      {charts.length > 0 && (
        <div data-maidr-excel-picker="">
          <label htmlFor={pickerId}>{labels.picker}</label>
          {' '}
          <select id={pickerId} value={known ? selected ?? '' : ''} onChange={event => onPick(event.target.value)}>
            {!known && <option value="" disabled>{labels.choose}</option>}
            {charts.map(chart => <option key={chart.id} value={chart.id}>{chart.label}</option>)}
          </select>
        </div>
      )}
      <div data-maidr-excel-view="">
        {view.kind === 'figure'
          ? (
              <>
                {view.note !== undefined && <p data-maidr-excel-note="" role="status">{view.note}</p>}
                <MaidrComponent data={view.maidr}>
                  {view.image === undefined
                    ? <div data-maidr-excel-anchor="">{view.label}</div>
                    : <img data-maidr-excel-image="" alt="" src={`data:image/png;base64,${view.image}`} style={IMAGE_STYLE} />}
                </MaidrComponent>
              </>
            )
          : <div data-maidr-excel-status="" role="status" tabIndex={0}>{view.message}</div>}
      </div>
    </>
  );
}

function warn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`${ADAPTER_PREFIX} ${message}`);
  } else {
    console.warn(`${ADAPTER_PREFIX} ${message}`, error);
  }
}

/** The Office.js globals, when the page has loaded Office.js. */
function officeGlobals(): { excel?: ExcelHost; office?: OfficeHost } {
  if (typeof window === 'undefined') {
    return {};
  }
  const scope = window as Window & { Excel?: ExcelHost; Office?: OfficeHost };
  return { excel: scope.Excel, office: scope.Office };
}

/** What one read of the workbook found. */
interface Reading {
  readonly charts: readonly FoundChart[];
  /** The chart read, when one was found. */
  readonly found: FoundChart | null;
  readonly snapshot: ExcelChartSnapshot | null;
}

/**
 * Mount MAIDR in an Excel add-in's task pane.
 *
 * Call it once Office.js is ready, from `Office.onReady`. It appends one
 * wrapper to `container`, reads the workbook's charts, shows the active chart
 * (or the first), and keeps the pane in step with the workbook until
 * {@link ExcelBinding.dispose}.
 *
 * Every chart is read through `ChartSeries.getDimensionValues`, which needs
 * ExcelApi 1.12: Excel on the web, Excel for Microsoft 365 (version 2008 or
 * later), Excel 2021 or later. An older Excel gets a message in the pane
 * saying so, and nothing is read. With ExcelApi 1.15, category labels are
 * read from their cells as Excel displays them.
 *
 * @param container - The element the pane goes in. A wrapper is appended to
 * it; nothing else is touched.
 * @param options - Where Office.js is, and how the pane behaves and reads.
 * @returns The binding, once the first chart has been read. It never
 * rejects: a pane that cannot read says so in the pane.
 */
export async function bindExcel(container: HTMLElement, options: ExcelBindOptions = {}): Promise<ExcelBinding> {
  const figureId = options.id ?? nextFigureId();
  const labels: ExcelPaneLabels = { ...DEFAULT_EXCEL_LABELS, ...options.labels };
  const office = options.office ?? officeGlobals().office;
  // Found once Office.js is ready: it loads the Excel API for the host it is
  // running in only then, and not at all outside Excel.
  let excel: ExcelHost | undefined;
  const follow = options.followActiveChart !== false;
  const refreshDelay = options.refreshDelay ?? DEFAULT_REFRESH_DELAY_MS;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-maidr-excel', figureId);
  container.appendChild(wrapper);
  const root: ReactRoot = createRoot(wrapper, { identifierPrefix: figureId });

  let state: PaneState = { charts: [], selected: null, view: { kind: 'status', message: labels.loading } };
  let rendered = '';
  let disposed = false;
  // Set once Office.js is ready and this Excel can hand charts over; nothing
  // is read before.
  let ready = false;
  let categoryCells = false;
  // The chart the reader last chose, or Excel last activated: what a refresh
  // re-reads. `null` until there is one, when the active chart is shown.
  let target: string | null = null;
  // Each read takes a number, and only the newest one is shown: a reader
  // arrowing through the picker starts a read per chart, and an answer that
  // arrives late must not replace the chart they stopped on.
  let latest = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const registrations: ExcelEventHandlerResult[] = [];

  const viewArea = (): HTMLElement | null => wrapper.querySelector<HTMLElement>('[data-maidr-excel-view]');

  // The picker's choice. Every change reads the chart chosen -- arrowing
  // through a closed `<select>` changes it once per option -- and the newest
  // read is the one shown.
  const pick = (chartId: string): void => {
    void show(chartId);
  };

  const render = (): void => {
    if (disposed) {
      return;
    }
    const key = JSON.stringify(state);
    if (key === rendered) {
      return;
    }
    rendered = key;
    const hadFocus = viewArea()?.contains(document.activeElement) === true;
    // Committed synchronously, so the focus check below sees the new DOM.
    flushSync(() => {
      root.render(<ExcelPane state={state} labels={labels} onPick={pick} />);
    });
    // Swapping the figure for a message (or back) removes the element that
    // had focus; hand it to whatever took its place, as the Power BI binder
    // does, so the reader hears why the chart went, or that it is back.
    const view = viewArea();
    if (hadFocus && view !== null && !view.contains(document.activeElement)) {
      view.querySelector<HTMLElement>('[tabindex]')?.focus();
    }
  };

  const showStatus = (message: string, charts: readonly ExcelChartInfo[] = state.charts, selected: string | null = null): void => {
    state = { charts, selected, view: { kind: 'status', message } };
    render();
  };

  const imageWidth = (): number | undefined => {
    if (options.imageWidth !== undefined) {
      return options.imageWidth;
    }
    const width = container.clientWidth * (window.devicePixelRatio || 1);
    return width > 0 ? Math.round(width) : undefined;
  };

  const apply = ({ charts, found, snapshot }: Reading): void => {
    const infos = charts.map(chart => chart.info);
    if (found === null || snapshot === null) {
      showStatus(infos.length === 0 ? labels.noCharts : labels.chartGone, infos);
      return;
    }
    const { info } = found;
    target = info.id;
    const outcome = convertExcelChartOutcome(snapshot, { id: figureId });
    if (outcome.kind !== 'figure') {
      const message = outcome.kind === 'unsupported'
        ? labels.unsupported.replace('{type}', excelChartTypeName(outcome.chartType))
        : labels.noData;
      showStatus(message, infos, info.id);
      return;
    }
    // The same object while the reading is unchanged, so MAIDR does not reset
    // the reader's position for a picture or a list that changed around it.
    const previous = state.view.kind === 'figure' ? state.view.maidr : null;
    const next: MaidrData = { ...outcome.maidr, live: true };
    const maidr = previous !== null && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    state = {
      charts: infos,
      selected: info.id,
      view: {
        kind: 'figure',
        maidr,
        label: info.label,
        ...(snapshot.image === undefined ? {} : { image: snapshot.image }),
        ...(outcome.omitted.length === 0 ? {} : { note: labels.partial.replace('{series}', omittedText(outcome.omitted)) }),
      },
    };
    render();
  };

  async function show(chartId?: string): Promise<void> {
    if (disposed || !ready || excel === undefined) {
      return;
    }
    if (chartId !== undefined) {
      target = chartId;
    }
    const ticket = ++latest;
    const wanted = chartId ?? target;
    try {
      const reading = await excel.run(async (context): Promise<Reading> => {
        const { charts, activeId } = await findExcelCharts(context);
        const id = wanted ?? activeId ?? charts[0]?.info.id ?? null;
        const found = charts.find(chart => chart.info.id === id) ?? null;
        const snapshot = found === null
          ? null
          : await readExcelChart(context, found.chart, { categoryCells, image: { width: imageWidth() } });
        return { charts, found, snapshot };
      });
      if (!disposed && ticket === latest) {
        apply(reading);
      }
    } catch (error: unknown) {
      if (!disposed && ticket === latest) {
        warn('could not read the chart.', error);
        showStatus(labels.readFailed, state.charts, state.selected);
      }
    }
  }

  const refresh = (): Promise<void> => show();

  const scheduleRefresh = (): void => {
    if (disposed) {
      return;
    }
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, refreshDelay);
  };

  /**
   * Register a handler, tolerating an Office.js that does not know the
   * event: that costs one kind of update, not the pane.
   */
  const listenTo = <T,>(
    into: ExcelEventHandlerResult[],
    handlers: ExcelEventHandlers<T>,
    handler: (event: T) => Promise<unknown>,
    name: string,
  ): void => {
    try {
      into.push(handlers.add(handler));
    } catch (error: unknown) {
      warn(`this Excel does not support the ${name} event; the pane will not follow it.`, error);
    }
  };

  const onActivated = async (event: ExcelChartActivatedEvent): Promise<void> => {
    await show(event.chartId);
  };
  const onChange = async (): Promise<void> => {
    scheduleRefresh();
  };
  const listenToCharts = (into: ExcelEventHandlerResult[], charts: ExcelChartCollection): void => {
    if (follow) {
      listenTo(into, charts.onActivated, onActivated, 'chart activated');
    }
    listenTo(into, charts.onAdded, onChange, 'chart added');
    listenTo(into, charts.onDeleted, onChange, 'chart deleted');
  };

  // A worksheet added later has charts of its own to follow.
  const onSheetAdded = async (event: ExcelWorksheetAddedEvent): Promise<void> => {
    if (disposed || excel === undefined) {
      return;
    }
    const added: ExcelEventHandlerResult[] = [];
    try {
      await excel.run(async (context) => {
        listenToCharts(added, context.workbook.worksheets.getItemOrNullObject(event.worksheetId).charts);
        await context.sync();
      });
    } catch (error: unknown) {
      warn('could not follow the charts of a new worksheet.', error);
    }
    // Disposed while they were being added: they have nothing left to update.
    if (disposed) {
      await removeHandlers(added);
      return;
    }
    registrations.push(...added);
    scheduleRefresh();
  };

  const listen = async (host: ExcelHost): Promise<void> => {
    try {
      await host.run(async (context) => {
        const sheets = context.workbook.worksheets;
        listenTo(registrations, sheets.onChanged, onChange, 'worksheet changed');
        listenTo(registrations, sheets.onCalculated, onChange, 'worksheet calculated');
        listenTo(registrations, sheets.onAdded, onSheetAdded, 'worksheet added');
        listenTo(registrations, sheets.onDeleted, onChange, 'worksheet deleted');
        sheets.load('items/id');
        await context.sync();
        for (const sheet of sheets.items) {
          listenToCharts(registrations, sheet.charts);
        }
        await context.sync();
      });
    } catch (error: unknown) {
      warn('could not follow the workbook\'s changes; use the picker, or refresh(), to read it again.', error);
    }
  };

  const binding: ExcelBinding = {
    get maidr(): MaidrData | null {
      return state.view.kind === 'figure' ? state.view.maidr : null;
    },
    get chart(): ExcelChartInfo | null {
      return state.charts.find(chart => chart.id === state.selected) ?? null;
    },
    get charts(): readonly ExcelChartInfo[] {
      return state.charts;
    },
    show,
    refresh,
    dispose: async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      root.unmount();
      wrapper.remove();
      await removeHandlers(registrations.splice(0));
    },
  };

  render();
  if (office === undefined) {
    warn('Office.js is not loaded on this page: load office.js, and bind from Office.onReady.');
    showStatus(labels.noExcel);
    return binding;
  }
  try {
    await office.onReady?.();
  } catch (error: unknown) {
    warn('Office.js did not become ready.', error);
  }
  excel = options.excel ?? officeGlobals().excel;
  if (excel === undefined) {
    warn('Office.js found no Excel here: open this page as an Excel add-in.');
    showStatus(labels.noExcel);
    return binding;
  }
  const requirements = office.context?.requirements;
  if (requirements === undefined) {
    warn('Office.js has not initialized: bind from Office.onReady.');
    showStatus(labels.noExcel);
    return binding;
  }
  if (!requirements.isSetSupported('ExcelApi', REQUIRED_VERSION)) {
    warn(`this Excel does not support ExcelApi ${REQUIRED_VERSION}, which reading a chart's data needs.`);
    showStatus(labels.unsupportedExcel);
    return binding;
  }
  categoryCells = requirements.isSetSupported('ExcelApi', CELLS_VERSION);
  ready = true;

  // Listening starts first, so a chart activated during the first read is
  // followed: its read is newer, and the first one's answer is set aside.
  await listen(excel);
  await show();
  return binding;
}

/**
 * The series a reading left out, as a note names them: `"Forecast" (Something New)`.
 *
 * @param omitted - The series.
 * @returns Their names and types, joined.
 */
function omittedText(omitted: readonly ExcelOmittedSeries[]): string {
  return omitted.map(one => `"${one.name}" (${excelChartTypeName(one.chartType)})`).join(', ');
}

/**
 * Remove event handlers through the request context each was added in, as
 * Office.js requires: `remove` queues the removal on that context, and its
 * `sync` sends it -- what `Excel.run(result.context, …)` does once its batch
 * has run.
 *
 * @param results - The registrations to remove.
 */
async function removeHandlers(results: readonly ExcelEventHandlerResult[]): Promise<void> {
  const byContext = new Map<ExcelEventHandlerResult['context'], ExcelEventHandlerResult[]>();
  for (const result of results) {
    byContext.set(result.context, [...(byContext.get(result.context) ?? []), result]);
  }
  for (const [context, list] of byContext) {
    try {
      for (const result of list) {
        result.remove();
      }
      await context.sync();
    } catch (error: unknown) {
      warn('could not remove an event handler from Excel.', error);
    }
  }
}

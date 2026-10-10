/**
 * Mounts MAIDR in a PowerPoint or Word add-in's task pane, for the charts in
 * the open presentation or document.
 *
 * Office.js reads no chart in PowerPoint or Word, so the pane reads the file
 * itself (`./reader`): every chart, from the values Office cached in it, as
 * the Excel adapter's converter reads a chart. The pane offers a labelled
 * picker of the charts -- by slide in a presentation, in reading order in a
 * document -- MAIDR's figure for the chosen one, and a button that reads the
 * file again.
 *
 * What it keeps in step, and how:
 *
 * - **The chart the user selects** is shown, through the document's
 *   `documentSelectionChanged` event. In PowerPoint the selected shape is
 *   matched against the charts read (PowerPointApi 1.5); a chart added since
 *   makes the pane read the file again. In Word the selected chart is read
 *   from the selection itself, so it is read as it is now.
 * - **The file** is read again on the button, and when the pane opens.
 *   PowerPoint and Word say nothing when a chart's data is edited, so a chart
 *   edited in place is read again when the user asks, or selects it in Word.
 *
 * The chart's picture is not shown: neither application hands one to an
 * add-in, and the chart itself is on the slide or the page beside the pane.
 *
 * @example
 * ```html
 * <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/office.js"></script>
 * <main id="maidr"></main>
 * <script>
 *   Office.onReady(() => maidrOffice.bindOffice(document.getElementById('maidr')));
 * </script>
 * ```
 */

import type { JSX } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import type { Maidr as MaidrData } from '../../type/grammar';
import type { ExcelOmittedSeries } from '../excel/converter';
import type { OfficeChart } from './package';
import type { OfficeAppHost, OfficeReadyInfo, PowerPointHost, WordHost } from './types';
import { useId } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../../maidr-component';
import { convertExcelChartOutcome, excelChartTypeName } from '../excel/converter';
import { readPowerPointCharts, readWordCharts, selectedPowerPointChart, selectedWordChart } from './reader';

const ADAPTER_PREFIX = '[MAIDR office]';

/** `Office.EventType.DocumentSelectionChanged`. */
const SELECTION_CHANGED = 'documentSelectionChanged';

/** How long the selection has to settle before the pane follows it. */
const DEFAULT_SELECTION_DELAY_MS = 250;

/** The Office applications this pane reads. */
export type OfficeDocumentHostName = 'PowerPoint' | 'Word';

/**
 * What the pane says. Every string can be replaced, for a pane in another
 * language or with other wording.
 */
export interface OfficePaneLabels {
  /** The picker's label. */
  readonly picker: string;
  /** The picker's empty choice, when the chart it showed is gone. */
  readonly choose: string;
  /** The button that reads the file again. */
  readonly refresh: string;
  /** While the file is being read, said politely. */
  readonly reading: string;
  /** Once it has been read; `{count}` is how many charts it has. */
  readonly read: string;
  /** In the figure area, while the first read is under way. */
  readonly loading: string;
  /** When the file has no charts. */
  readonly noCharts: string;
  /** When the chart has nothing MAIDR can navigate: every value blank. */
  readonly noData: string;
  /** When MAIDR has no reading of the chart's type; `{type}` names it. */
  readonly unsupported: string;
  /** When the chart's part is missing or damaged. */
  readonly unreadable: string;
  /** Above the figure, when a combo chart is read without some of its series; `{series}` names them. */
  readonly partial: string;
  /** When the page is not running in PowerPoint or Word. */
  readonly noOffice: string;
  /** When this PowerPoint or Word cannot hand its file to add-ins; `{host}` names it. */
  readonly unsupportedHost: string;
  /** When reading the file failed. */
  readonly readFailed: string;
  /** When the chart that was shown is no longer in the file. */
  readonly chartGone: string;
  /** A chart in the picker, in a presentation: `{n}` is its slide, `{title}` the chart. */
  readonly slide: string;
  /** ... on a slide hidden from the slide show. */
  readonly hiddenSlide: string;
  /** A chart in the picker, in a document: `{n}` is its number, `{title}` the chart. */
  readonly documentChart: string;
}

/** The pane's English wording. */
export const DEFAULT_OFFICE_LABELS: OfficePaneLabels = {
  picker: 'Chart',
  choose: 'Choose a chart',
  refresh: 'Read again',
  reading: 'Reading the charts…',
  read: 'Charts read: {count}.',
  loading: 'Reading the charts…',
  noCharts: 'This file has no charts to read. Insert a chart, then choose Read again.',
  noData: 'This chart has no data to read.',
  unsupported: 'MAIDR cannot read {type} charts yet. Choose another chart.',
  unreadable: 'MAIDR could not read this chart\'s data.',
  partial: 'MAIDR reads this chart without {series}, which it cannot read yet.',
  noOffice: 'MAIDR could not find PowerPoint or Word. Open this page as an Office add-in.',
  unsupportedHost: 'This version of {host} cannot share its charts with add-ins. MAIDR needs {host} on the web, '
    + '{host} for Microsoft 365, or {host} 2016 or later.',
  readFailed: 'MAIDR could not read the charts.',
  chartGone: 'That chart is no longer in the file. Choose another chart.',
  slide: 'Slide {n}: {title}',
  hiddenSlide: 'Slide {n} (hidden): {title}',
  documentChart: 'Chart {n}: {title}',
};

/** One chart the picker offers. */
export interface OfficeChartInfo {
  /** Unique in the file; see {@link OfficeChart.id}. */
  readonly id: string;
  /** Its slide's number, or its number in the document, from 1. */
  readonly position: number;
  /** The frame's name, such as `Chart 3`. */
  readonly name: string;
  /** The title the chart shows, when it shows one. */
  readonly title?: string;
  /** The alternative text the author gave it. */
  readonly description?: string;
  /** What the picker says. */
  readonly label: string;
}

/** Options for {@link bindPowerPoint} and {@link bindWord}. */
export interface OfficeBindOptions {
  /** The `Office` namespace Office.js defines. Default `window.Office`. */
  readonly office?: OfficeAppHost;
  /** The `PowerPoint` namespace. Default `window.PowerPoint`. */
  readonly powerpoint?: PowerPointHost;
  /** The `Word` namespace. Default `window.Word`. */
  readonly word?: WordHost;
  /**
   * Show the chart the user selects in the file. Default `true`; with `false`,
   * the picker alone chooses the chart.
   */
  readonly followSelection?: boolean;
  /** How long the selection has to settle before it is followed, in milliseconds. Default 250. */
  readonly selectionDelay?: number;
  /** The figure id; must be unique on the page. Default `maidr-office-<n>`. */
  readonly id?: string;
  /** Replacements for any of the pane's wording. */
  readonly labels?: Partial<OfficePaneLabels>;
}

/** A mounted pane, returned by {@link bindPowerPoint} and {@link bindWord}. */
export interface OfficeBinding {
  /** Which application the pane reads. */
  readonly host: OfficeDocumentHostName;
  /** The figure on show, or `null` while the pane shows a message instead. */
  readonly maidr: MaidrData | null;
  /** The chart on show, or `null` when none is. */
  readonly chart: OfficeChartInfo | null;
  /** Every chart the picker offers. */
  readonly charts: readonly OfficeChartInfo[];
  /**
   * Show a chart, by its id from {@link OfficeBinding.charts}; with no id,
   * the chart shown already, or else the first. Never rejects.
   */
  show: (chartId?: string) => Promise<void>;
  /** Read the file again, and show the chart on show again, or the first. Never rejects. */
  refresh: () => Promise<void>;
  /** Stop following the selection, unmount MAIDR and remove the pane. */
  dispose: () => Promise<void>;
}

/** What a figure area shows: MAIDR's figure, or a message. Shared with the slide's add-in (`./slide`). */
export type FigureView
  = | { readonly kind: 'status'; readonly message: string }
    | { readonly kind: 'figure'; readonly maidr: MaidrData; readonly label: string; readonly note?: string };

/** The wording a figure area uses for a chart it cannot show in full. */
export type FigureLabels = Pick<OfficePaneLabels, 'noData' | 'unsupported' | 'unreadable' | 'partial'>;

/** Everything the pane renders from. */
interface PaneState {
  readonly charts: readonly OfficeChartInfo[];
  /** The chart on show, by id; `null` when none is. */
  readonly selected: string | null;
  readonly view: FigureView;
  /** What the polite status line says: a read under way, or done. */
  readonly progress: string;
}

interface PaneProps {
  readonly state: PaneState;
  readonly labels: OfficePaneLabels;
  readonly onPick: (chartId: string) => void;
  readonly onRefresh: () => void;
}

interface ChartPickerProps {
  readonly charts: readonly OfficeChartInfo[];
  /** The chart chosen, by id; `null` when none is. */
  readonly selected: string | null;
  readonly labels: Pick<OfficePaneLabels, 'picker' | 'choose'>;
  readonly onPick: (chartId: string) => void;
}

/**
 * A labelled native `<select>` of the charts. While the chart chosen is not
 * among them, an empty choice says to choose one. Shared with the slide's
 * add-in.
 */
export function ChartPicker({ charts, selected, labels, onPick }: ChartPickerProps): JSX.Element {
  const pickerId = useId();
  const known = charts.some(chart => chart.id === selected);
  return (
    <div data-maidr-office-picker="">
      <label htmlFor={pickerId}>{labels.picker}</label>
      {' '}
      <select id={pickerId} value={known ? selected ?? '' : ''} onChange={event => onPick(event.target.value)}>
        {!known && <option value="" disabled>{labels.choose}</option>}
        {charts.map(chart => <option key={chart.id} value={chart.id}>{chart.label}</option>)}
      </select>
    </div>
  );
}

/**
 * The figure area: MAIDR's figure, under a note when the chart is read in
 * part, or a focusable status message. Shared with the slide's add-in.
 *
 * MAIDR's plot is named by its instructions, and its visible label is inside
 * it, where a screen reader does not read it. So the figure area is a group
 * named by the label, and described by the note: a reader moving into the
 * figure hears which chart it is, and what it leaves out, before MAIDR's
 * instructions.
 */
export function FigureArea({ view }: { readonly view: FigureView }): JSX.Element {
  const labelId = useId();
  const noteId = useId();
  const group = view.kind === 'figure'
    ? { 'role': 'group', 'aria-labelledby': labelId, ...(view.note === undefined ? {} : { 'aria-describedby': noteId }) }
    : {};
  return (
    <div data-maidr-office-view="" {...group}>
      {view.kind === 'figure'
        ? (
            <>
              {view.note !== undefined && <p data-maidr-office-note="" id={noteId} role="status">{view.note}</p>}
              <MaidrComponent data={view.maidr}>
                <div data-maidr-office-anchor="" id={labelId}>{view.label}</div>
              </MaidrComponent>
            </>
          )
        : <div data-maidr-office-status="" role="status" tabIndex={0}>{view.message}</div>}
    </div>
  );
}

interface ReadAgainProps {
  /** The button's text. */
  readonly label: string;
  /** What the polite status line says. */
  readonly progress: string;
  readonly onRefresh: () => void;
}

/** The button that reads the file again, and a polite status line for the reads. Shared with the slide's add-in. */
export function ReadAgain({ label, progress, onRefresh }: ReadAgainProps): JSX.Element {
  return (
    <div data-maidr-office-actions="">
      <button type="button" data-maidr-office-refresh="" onClick={onRefresh}>{label}</button>
      <p data-maidr-office-progress="" role="status">{progress}</p>
    </div>
  );
}

/**
 * The pane: a labelled native `<select>` of the charts, the figure area --
 * MAIDR's figure, or a focusable status message -- and, after it, the button
 * that reads the file again with a polite status line for the reads. The
 * figure comes straight after the picker, so <kbd>Tab</kbd> from a chart's
 * name reaches the chart, as in the Excel pane.
 */
function OfficePane({ state, labels, onPick, onRefresh }: PaneProps): JSX.Element {
  return (
    <>
      {state.charts.length > 0 && <ChartPicker charts={state.charts} selected={state.selected} labels={labels} onPick={onPick} />}
      <FigureArea view={state.view} />
      <ReadAgain label={labels.refresh} progress={state.progress} onRefresh={onRefresh} />
    </>
  );
}

/** Say something on the console, under the adapter's prefix. */
export function warn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`${ADAPTER_PREFIX} ${message}`);
  } else {
    console.warn(`${ADAPTER_PREFIX} ${message}`, error);
  }
}

/** The Office.js globals the page has loaded. */
export function officeGlobals(): { office?: OfficeAppHost; powerpoint?: PowerPointHost; word?: WordHost } {
  if (typeof window === 'undefined') {
    return {};
  }
  const scope = window as Window & { Office?: OfficeAppHost; PowerPoint?: PowerPointHost; Word?: WordHost };
  return { office: scope.Office, powerpoint: scope.PowerPoint, word: scope.Word };
}

let figureCount = 0;

/** A figure id unique on the page. */
function nextOfficeFigureId(): string {
  figureCount += 1;
  return `maidr-office-${figureCount}`;
}

/** The title a chart shows, when it shows one. */
export function shownTitle(chart: OfficeChart): string | undefined {
  const title = chart.snapshot?.title;
  const text = title?.visible === true ? title.text.trim() : '';
  return text === '' ? undefined : text;
}

/**
 * What the picker says for a chart: `template` is the wording, `{n}` its
 * place and `{title}` the chart.
 */
export function chartInfo(chart: OfficeChart, template: string): OfficeChartInfo {
  const title = shownTitle(chart);
  const label = template
    .replace('{n}', String(chart.position))
    .replace('{title}', title ?? chart.description ?? chart.name);
  return {
    id: chart.id,
    position: chart.position,
    name: chart.name,
    ...(title === undefined ? {} : { title }),
    ...(chart.description === undefined ? {} : { description: chart.description }),
    label,
  };
}

/**
 * The series a reading left out, as a note names them: `"Forecast" (Something New)`.
 */
function omittedText(omitted: readonly ExcelOmittedSeries[]): string {
  return omitted.map(one => `"${one.name}" (${excelChartTypeName(one.chartType)})`).join(', ');
}

/**
 * What a figure area shows for a chart: MAIDR's figure, labelled `label`, or
 * why it cannot. The figure on show is kept when the chart reads the same, so
 * MAIDR does not reset the reader's place for a read that found the same
 * chart.
 *
 * @param chart - The chart, as read.
 * @param label - The figure's visible label.
 * @param figureId - The figure's id.
 * @param labels - The wording for a chart that cannot be shown in full.
 * @param shown - What the figure area shows now.
 * @returns What it shows for this chart.
 */
export function chartView(chart: OfficeChart, label: string, figureId: string, labels: FigureLabels, shown: FigureView): FigureView {
  if (chart.snapshot === null) {
    return { kind: 'status', message: labels.unreadable };
  }
  const outcome = convertExcelChartOutcome(chart.snapshot, { id: figureId });
  if (outcome.kind !== 'figure') {
    const message = outcome.kind === 'unsupported'
      ? labels.unsupported.replace('{type}', excelChartTypeName(outcome.chartType))
      : labels.noData;
    return { kind: 'status', message };
  }
  const previous = shown.kind === 'figure' ? shown.maidr : null;
  const maidr = previous !== null && JSON.stringify(previous) === JSON.stringify(outcome.maidr) ? previous : outcome.maidr;
  return {
    kind: 'figure',
    maidr,
    label,
    ...(outcome.omitted.length === 0 ? {} : { note: labels.partial.replace('{series}', omittedText(outcome.omitted)) }),
  };
}

/**
 * Render a pane into its root, at once, keeping focus in its figure area:
 * swapping the figure for a message (or back) removes the element that had
 * focus, so it is handed to whatever took its place. Focus anywhere else is
 * left alone.
 */
export function renderKeepingFocus(root: ReactRoot, wrapper: HTMLElement, pane: JSX.Element): void {
  const viewArea = (): HTMLElement | null => wrapper.querySelector<HTMLElement>('[data-maidr-office-view]');
  const hadFocus = viewArea()?.contains(document.activeElement) === true;
  flushSync(() => {
    root.render(pane);
  });
  const view = viewArea();
  if (hadFocus && view !== null && !view.contains(document.activeElement)) {
    view.querySelector<HTMLElement>('[tabindex]')?.focus();
  }
}

/**
 * Wait for Office.js, and say which application the page runs in.
 *
 * @param office - The `Office` namespace.
 * @returns `PowerPoint`, `Word`, ...; `null` or `undefined` when Office.js does
 * not say.
 */
export async function readyHost(office: OfficeAppHost): Promise<string | null | undefined> {
  let info: OfficeReadyInfo | undefined;
  try {
    info = (await office.onReady?.()) as OfficeReadyInfo | undefined;
  } catch (error: unknown) {
    warn('Office.js did not become ready.', error);
  }
  return info?.host ?? office.context?.host;
}

/**
 * Why this PowerPoint cannot hand its presentation over to be read, or `null`
 * when it can: it needs `Document.getFileAsync`, and the browser
 * `DecompressionStream`.
 */
export function presentationUnreadable(office: OfficeAppHost): string | null {
  if (office.context?.document?.getFileAsync === undefined) {
    return 'this PowerPoint cannot hand its file to add-ins (no Document.getFileAsync).';
  }
  if (typeof DecompressionStream === 'undefined') {
    return 'this browser cannot unzip a presentation (no DecompressionStream).';
  }
  return null;
}

/** How one application's charts are read and its selection found. */
interface Source {
  readonly host: OfficeDocumentHostName;
  /** Read every chart of the file. */
  readAll: () => Promise<OfficeChart[]>;
  /**
   * The chart selected: its id among `charts`, or `null` for none, or
   * `undefined` for a chart `charts` does not have; and, where the
   * application gives it, the selected chart read afresh.
   */
  selected: (charts: readonly OfficeChart[]) => Promise<{ id: string | null | undefined; fresh?: OfficeChart }>;
}

/** Find a chart Word read from the selection among the document's. */
function matchWordChart(fresh: OfficeChart, charts: readonly OfficeChart[]): OfficeChart | undefined {
  const content = JSON.stringify(fresh.snapshot);
  return charts.find(chart => chart.id === fresh.id)
    ?? charts.find(chart => chart.name === fresh.name)
    ?? charts.find(chart => JSON.stringify(chart.snapshot) === content);
}

async function bindDocument(
  container: HTMLElement,
  options: OfficeBindOptions,
  host: OfficeDocumentHostName,
  connect: (office: OfficeAppHost) => { source: Source; follow: boolean } | string,
): Promise<OfficeBinding> {
  const figureId = options.id ?? nextOfficeFigureId();
  const labels: OfficePaneLabels = { ...DEFAULT_OFFICE_LABELS, ...options.labels };
  const office = options.office ?? officeGlobals().office;
  const delay = options.selectionDelay ?? DEFAULT_SELECTION_DELAY_MS;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-maidr-office', figureId);
  container.appendChild(wrapper);
  const root: ReactRoot = createRoot(wrapper, { identifierPrefix: figureId });

  let state: PaneState = { charts: [], selected: null, view: { kind: 'status', message: labels.loading }, progress: '' };
  let rendered = '';
  let disposed = false;
  let source: Source | null = null;
  // The charts as last read, each with its reading.
  let charts: OfficeChart[] = [];
  // Each show takes a number, and only the newest is applied.
  let latest = 0;
  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  let removeSelectionHandler: (() => Promise<void>) | null = null;

  // The picker's choice. Arrowing through a closed `<select>` changes it once
  // per option, and each change shows the chart chosen.
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
    renderKeepingFocus(root, wrapper, <OfficePane state={state} labels={labels} onPick={pick} onRefresh={() => void refresh()} />);
  };

  // What the picker says: by slide in a presentation, by number in a document.
  const info = (chart: OfficeChart): OfficeChartInfo =>
    chartInfo(chart, host === 'Word' ? labels.documentChart : chart.hidden === true ? labels.hiddenSlide : labels.slide);

  const infos = (): OfficeChartInfo[] => charts.map(info);

  const showStatus = (message: string, selected: string | null = null): void => {
    state = { ...state, charts: infos(), selected, view: { kind: 'status', message } };
    render();
  };

  const apply = (chart: OfficeChart): void => {
    state = { ...state, charts: infos(), selected: chart.id, view: chartView(chart, info(chart).label, figureId, labels, state.view) };
    render();
  };

  async function show(chartId?: string): Promise<void> {
    if (disposed || source === null) {
      return;
    }
    latest += 1;
    const wanted = chartId ?? state.selected;
    const chart = wanted === null ? charts[0] : charts.find(one => one.id === wanted);
    if (chart === undefined) {
      showStatus(charts.length === 0 ? labels.noCharts : labels.chartGone);
      return;
    }
    apply(chart);
  }

  async function readAll(): Promise<boolean> {
    if (source === null) {
      return false;
    }
    state = { ...state, progress: labels.reading };
    render();
    try {
      const read = await source.readAll();
      if (disposed) {
        return false;
      }
      charts = read;
      state = { ...state, charts: infos(), progress: labels.read.replace('{count}', String(read.length)) };
      render();
      return true;
    } catch (error: unknown) {
      warn('could not read the file.', error);
      state = { ...state, progress: '' };
      showStatus(labels.readFailed, state.selected);
      return false;
    }
  }

  async function refresh(): Promise<void> {
    if (disposed || source === null) {
      return;
    }
    const shown = state.selected;
    if (await readAll()) {
      await show(shown !== null && charts.some(chart => chart.id === shown) ? shown : undefined);
    }
  }

  const follow = async (): Promise<void> => {
    if (disposed || source === null) {
      return;
    }
    const ticket = latest;
    try {
      let found = await source.selected(charts);
      if (found.id === undefined) {
        // A chart the last read does not have: read the file again first.
        if (!await readAll()) {
          return;
        }
        found = await source.selected(charts);
      }
      if (disposed || latest !== ticket) {
        return;
      }
      if (found.fresh !== undefined) {
        const fresh = found.fresh;
        charts = charts.map(chart => (chart.id === found.id ? { ...chart, snapshot: fresh.snapshot } : chart));
      }
      if (typeof found.id === 'string') {
        await show(found.id);
      }
    } catch (error: unknown) {
      warn('could not find the selected chart.', error);
    }
  };

  const onSelectionChanged = (): void => {
    if (selectionTimer !== null) {
      clearTimeout(selectionTimer);
    }
    selectionTimer = setTimeout(() => {
      selectionTimer = null;
      void follow();
    }, delay);
  };

  const listen = async (app: OfficeAppHost): Promise<void> => {
    const file = app.context?.document;
    const add = file?.addHandlerAsync;
    if (file === undefined || add === undefined) {
      warn('this Office cannot say when the selection changes; the pane will not follow it.');
      return;
    }
    await new Promise<void>((resolve) => {
      add.call(file, SELECTION_CHANGED, onSelectionChanged, (result) => {
        if (result.status !== 'succeeded') {
          warn('could not follow the selection.', result.error);
        } else {
          removeSelectionHandler = () => new Promise<void>((done) => {
            if (file.removeHandlerAsync === undefined) {
              done();
              return;
            }
            file.removeHandlerAsync(SELECTION_CHANGED, { handler: onSelectionChanged }, () => done());
          });
        }
        resolve();
      });
    });
  };

  const binding: OfficeBinding = {
    host,
    get maidr(): MaidrData | null {
      return state.view.kind === 'figure' ? state.view.maidr : null;
    },
    get chart(): OfficeChartInfo | null {
      return state.charts.find(chart => chart.id === state.selected) ?? null;
    },
    get charts(): readonly OfficeChartInfo[] {
      return state.charts;
    },
    show: async (chartId?: string): Promise<void> => show(chartId),
    refresh,
    dispose: async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (selectionTimer !== null) {
        clearTimeout(selectionTimer);
        selectionTimer = null;
      }
      root.unmount();
      wrapper.remove();
      await removeSelectionHandler?.();
    },
  };

  render();
  if (office === undefined) {
    warn('Office.js is not loaded on this page: load office.js, and bind from Office.onReady.');
    showStatus(labels.noOffice);
    return binding;
  }
  const running = await readyHost(office);
  if (running !== undefined && running !== null && running !== host) {
    warn(`this page is running in ${running}, not ${host}.`);
    showStatus(labels.noOffice);
    return binding;
  }
  const connected = connect(office);
  if (typeof connected === 'string') {
    warn(connected);
    showStatus(running === undefined || running === null ? labels.noOffice : labels.unsupportedHost.replace(/\{host\}/g, host));
    return binding;
  }
  source = connected.source;
  if (options.followSelection !== false && connected.follow) {
    await listen(office);
  }
  if (await readAll()) {
    let first: string | undefined;
    try {
      const found = await source.selected(charts);
      first = typeof found.id === 'string' ? found.id : undefined;
    } catch (error: unknown) {
      warn('could not find the selected chart.', error);
    }
    await show(first);
  }
  return binding;
}

/**
 * Mount MAIDR in a PowerPoint add-in's task pane.
 *
 * Call it once Office.js is ready, from `Office.onReady`. It appends one
 * wrapper to `container`, reads every chart of the presentation, shows the
 * selected chart (or the first), and follows the selection until
 * {@link OfficeBinding.dispose}.
 *
 * The presentation is read through `Document.getFileAsync`, which PowerPoint
 * offers on the web, on Windows, on Mac and on iPad, and unzipped with the
 * browser's `DecompressionStream`. Following the selection needs
 * PowerPointApi 1.5; without it, the picker alone chooses the chart.
 *
 * @param container - The element the pane goes in. A wrapper is appended to it.
 * @param options - Where Office.js is, and how the pane behaves.
 * @returns The binding, once the first chart has been read. It never rejects:
 * a pane that cannot read says so in the pane.
 */
export function bindPowerPoint(container: HTMLElement, options: OfficeBindOptions = {}): Promise<OfficeBinding> {
  return bindDocument(container, options, 'PowerPoint', (office) => {
    const problem = presentationUnreadable(office);
    if (problem !== null) {
      return problem;
    }
    const powerpoint = options.powerpoint ?? officeGlobals().powerpoint;
    const follow = powerpoint !== undefined && office.context?.requirements?.isSetSupported('PowerPointApi', '1.5') === true;
    return {
      follow,
      source: {
        host: 'PowerPoint',
        readAll: () => readPowerPointCharts(office),
        selected: async (charts) => {
          if (!follow || powerpoint === undefined) {
            return { id: null };
          }
          return { id: await selectedPowerPointChart(powerpoint, charts) };
        },
      },
    };
  });
}

/**
 * Mount MAIDR in a Word add-in's task pane.
 *
 * Call it once Office.js is ready, from `Office.onReady`. It appends one
 * wrapper to `container`, reads every chart of the document, shows the
 * selected chart (or the first), and follows the selection until
 * {@link OfficeBinding.dispose}.
 *
 * The document is read through `Body.getOoxml` and the selection through
 * `Range.getOoxml`, which need WordApi 1.1: Word on the web, Word 2016 or
 * later, Word on Mac and on iPad.
 *
 * @param container - The element the pane goes in. A wrapper is appended to it.
 * @param options - Where Office.js is, and how the pane behaves.
 * @returns The binding, once the first chart has been read. It never rejects.
 */
export function bindWord(container: HTMLElement, options: OfficeBindOptions = {}): Promise<OfficeBinding> {
  return bindDocument(container, options, 'Word', (office) => {
    const word = options.word ?? officeGlobals().word;
    if (word === undefined) {
      return 'Office.js found no Word here: open this page as a Word add-in.';
    }
    if (office.context?.requirements?.isSetSupported('WordApi', '1.1') !== true) {
      return 'this Word does not support WordApi 1.1, which reading a document needs.';
    }
    return {
      follow: true,
      source: {
        host: 'Word',
        readAll: () => readWordCharts(word),
        selected: async (charts) => {
          const fresh = await selectedWordChart(word);
          if (fresh === null) {
            return { id: null };
          }
          const found = matchWordChart(fresh, charts);
          return found === undefined ? { id: undefined } : { id: found.id, fresh };
        },
      },
    };
  });
}

/**
 * Mounts MAIDR for one of PowerPoint's own charts in a content add-in: an
 * add-in that sits on the slide as a shape, beside the chart or over it, so a
 * reader moves through the chart on the slide itself, in Normal view and in
 * the slide show.
 *
 * Office.js reads no chart in PowerPoint, so the add-in reads the presentation
 * file, as the task pane does (`./reader`), and shows MAIDR's figure for one
 * chart in it. Which chart is the link, one of the add-in's settings
 * (`Office.Settings`), which each instance of the add-in keeps in the
 * presentation: the chart's slide id and shape id, and its name.
 *
 * What it does, and when:
 *
 * - **Linking.** With no chart linked, the add-in opening in Normal view reads
 *   the slide selected, which is the one it was just inserted on. One chart
 *   there is linked, and the link saved. Otherwise it asks which chart, with a
 *   picker of every chart in the presentation, that slide's first. Opening in
 *   the slide show, it asks nothing: the slide selected there says nothing of
 *   where the add-in is.
 * - **Normal view** (`edit`) shows the figure, then the picker and a button
 *   that reads the file again. PowerPoint says nothing when a chart's data is
 *   edited, so a chart edited in place is read again when the author asks.
 * - **The slide show and Reading View** (`read`) show the figure alone, read
 *   again as the view opens, so the slide show has the chart as it was last
 *   edited. PowerPoint says so through `activeViewChanged`; on the web, which
 *   never does, the slide show opens the add-in anew.
 *
 * The figure comes first, so the first <kbd>Tab</kbd> into the add-in reaches
 * the chart. The add-in never moves focus itself, except to keep it in the
 * figure area when the figure gives way to a message: how focus reaches the
 * add-in on the slide, and leaves it, is PowerPoint's to decide.
 *
 * @example
 * ```html
 * <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/office.js"></script>
 * <main id="maidr" aria-label="Accessible chart"></main>
 * <script>
 *   Office.onReady(() => maidrOffice.bindSlideChart(document.getElementById('maidr')));
 * </script>
 * ```
 */

import type { JSX } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import type { Maidr as MaidrData } from '../../type/grammar';
import type { FigureView, OfficeChartInfo } from './binder';
import type { OfficeChart } from './package';
import type { OfficeAppHost, OfficeAsyncResult, OfficeDocument, OfficeEventArgs, OfficeSlideRange, OfficeSlideRangeSlide } from './types';
import { createRoot } from 'react-dom/client';
import {
  chartInfo,
  ChartPicker,
  chartView,
  FigureArea,
  officeGlobals,
  presentationUnreadable,
  ReadAgain,
  readyHost,
  renderKeepingFocus,
  shownTitle,
  warn,
} from './binder';
import { readPowerPointCharts } from './reader';

/** The setting the link is saved under. */
const LINK_SETTING = 'maidr.chart';

/** `Office.EventType.ActiveViewChanged`. */
const VIEW_CHANGED = 'activeViewChanged';

/** `Office.CoercionType.SlideRange`. */
const SLIDE_RANGE = 'slideRange';

/** The chart an add-in reads, as its settings keep it in the presentation. */
export interface SlideChartLink {
  /** The chart's slide, by the file's slide id (`p:sldId/@id`). */
  readonly slideId: string;
  /** The chart's frame, by its shape id on that slide (`p:cNvPr/@id`). */
  readonly shapeId: string;
  /** The frame's name, such as `Chart 3`, by which the chart is found on its slide when its shape id has changed. */
  readonly name: string;
}

/** What PowerPoint has open: the presentation to edit, or to present -- the slide show or Reading View. */
export type SlideChartView = 'edit' | 'read';

/**
 * What the add-in says. Every string can be replaced, for an add-in in
 * another language or with other wording.
 */
export interface SlideChartLabels {
  /** The picker's label. */
  readonly picker: string;
  /** The picker's empty choice, while no chart it offers is linked. */
  readonly choose: string;
  /** The button that reads the file again. */
  readonly refresh: string;
  /** While the file is being read, said politely. */
  readonly reading: string;
  /** Once it has been read; `{count}` is how many charts it has. */
  readonly read: string;
  /** In the figure area, while the first read is under way. */
  readonly loading: string;
  /** In Normal view, when no chart is linked: the picker follows. */
  readonly notLinked: string;
  /** In the slide show or Reading View, when no chart is linked. */
  readonly notLinkedShow: string;
  /** In Normal view, when the presentation has no charts. */
  readonly noCharts: string;
  /** In Normal view, when the chart linked is no longer in the presentation. */
  readonly chartGone: string;
  /** ... in the slide show or Reading View. */
  readonly chartGoneShow: string;
  /** When the chart has nothing MAIDR can navigate: every value blank. */
  readonly noData: string;
  /** When MAIDR has no reading of the chart's type; `{type}` names it. */
  readonly unsupported: string;
  /** When the chart's part is missing or damaged. */
  readonly unreadable: string;
  /** Above the figure, when a combo chart is read without some of its series; `{series}` names them. */
  readonly partial: string;
  /** When the page is not running in PowerPoint. */
  readonly noOffice: string;
  /** When this PowerPoint cannot hand its file to add-ins. */
  readonly unsupportedHost: string;
  /** When reading the file failed. */
  readonly readFailed: string;
  /** A chart in the picker: `{n}` is its slide, `{title}` the chart. */
  readonly slide: string;
  /** ... on a slide hidden from the slide show. */
  readonly hiddenSlide: string;
}

/** The add-in's English wording. */
export const DEFAULT_SLIDE_CHART_LABELS: SlideChartLabels = {
  picker: 'Chart',
  choose: 'Choose a chart',
  refresh: 'Read again',
  reading: 'Reading the charts…',
  read: 'Charts read: {count}.',
  loading: 'Reading the chart…',
  notLinked: 'Choose the chart this add-in reads.',
  notLinkedShow: 'No chart is linked to this add-in. Link one in Normal view.',
  noCharts: 'This presentation has no charts to read. Insert a chart, then choose Read again.',
  chartGone: 'The chart this add-in read is no longer in the presentation. Choose another chart.',
  chartGoneShow: 'The chart this add-in read is no longer in the presentation. Choose another in Normal view.',
  noData: 'This chart has no data to read.',
  unsupported: 'MAIDR cannot read {type} charts yet.',
  unreadable: 'MAIDR could not read this chart\'s data.',
  partial: 'MAIDR reads this chart without {series}, which it cannot read yet.',
  noOffice: 'MAIDR could not find PowerPoint. Insert this add-in on a slide in PowerPoint.',
  unsupportedHost: 'This version of PowerPoint cannot share its charts with add-ins. MAIDR needs PowerPoint on the web, '
    + 'PowerPoint for Microsoft 365, or PowerPoint 2016 or later.',
  readFailed: 'MAIDR could not read the chart.',
  slide: 'Slide {n}: {title}',
  hiddenSlide: 'Slide {n} (hidden): {title}',
};

/** Options for {@link bindSlideChart}. */
export interface SlideChartOptions {
  /** The `Office` namespace Office.js defines. Default `window.Office`. */
  readonly office?: OfficeAppHost;
  /** The figure id; must be unique on the page. Default `maidr-slide-<n>`. */
  readonly id?: string;
  /** Replacements for any of the add-in's wording. */
  readonly labels?: Partial<SlideChartLabels>;
}

/** A mounted add-in, returned by {@link bindSlideChart}. */
export interface SlideChartBinding {
  /** The figure on show, or `null` while the add-in shows a message instead. */
  readonly maidr: MaidrData | null;
  /** The chart linked, as the picker describes it, or `null` when none is or it is gone. */
  readonly chart: OfficeChartInfo | null;
  /** Every chart the picker offers, the add-in's own slide's first. */
  readonly charts: readonly OfficeChartInfo[];
  /** What PowerPoint has open; the picker and the button are there in `edit` alone. */
  readonly view: SlideChartView;
  /**
   * Link a chart, by its id from {@link SlideChartBinding.charts}, show it, and
   * save the link in the presentation -- in Normal view; one linked in the
   * slide show is saved once Normal view is back. Never rejects.
   */
  link: (chartId: string) => Promise<void>;
  /** Read the file again, and show the chart linked. Never rejects. */
  refresh: () => Promise<void>;
  /** Stop following the view, unmount MAIDR and remove the add-in's elements. */
  dispose: () => Promise<void>;
}

/** Everything the add-in renders from. */
interface SlideState {
  readonly view: SlideChartView;
  /** Whether the file can be read; until it can, there is nothing to choose or read again. */
  readonly readable: boolean;
  readonly charts: readonly OfficeChartInfo[];
  /** The chart linked, by id; `null` when none is. */
  readonly linked: string | null;
  readonly figure: FigureView;
  /** What the polite status line says: a read under way, or done. */
  readonly progress: string;
}

interface SlideProps {
  readonly state: SlideState;
  readonly labels: SlideChartLabels;
  readonly onPick: (chartId: string) => void;
  readonly onRefresh: () => void;
}

/**
 * The add-in: the figure area first -- MAIDR's figure, or a focusable status
 * message -- so the first <kbd>Tab</kbd> into the add-in reaches the chart.
 * In Normal view, after it, the picker that links another chart and the
 * button that reads the file again; in the slide show, nothing else.
 */
function SlideChart({ state, labels, onPick, onRefresh }: SlideProps): JSX.Element {
  return (
    <>
      <FigureArea view={state.figure} />
      {state.view === 'edit' && state.readable && (
        <>
          {state.charts.length > 0 && <ChartPicker charts={state.charts} selected={state.linked} labels={labels} onPick={onPick} />}
          <ReadAgain label={labels.refresh} progress={state.progress} onRefresh={onRefresh} />
        </>
      )}
    </>
  );
}

let figureCount = 0;

/** A figure id unique on the page. */
function nextSlideFigureId(): string {
  figureCount += 1;
  return `maidr-slide-${figureCount}`;
}

/** Whether a setting's value is a link. */
function isLink(value: unknown): value is SlideChartLink {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { slideId, shapeId, name } = value as Record<string, unknown>;
  return typeof slideId === 'string' && typeof shapeId === 'string' && typeof name === 'string';
}

/** The link to a chart. */
function linkTo(chart: OfficeChart): SlideChartLink {
  return { slideId: chart.slideId ?? '', shapeId: chart.shapeId ?? '', name: chart.name };
}

/** The chart a link names: by its slide and shape ids, or else by its name on its slide. */
function linkedChart(link: SlideChartLink, charts: readonly OfficeChart[]): OfficeChart | undefined {
  return charts.find(chart => chart.id === `${link.slideId}:${link.shapeId}`)
    ?? charts.find(chart => chart.slideId === link.slideId && chart.name === link.name);
}

/**
 * A callback-style Common API call, as a promise that never rejects: the
 * outcome, or `undefined` when the call failed, said on the console.
 */
function officeCall<T>(what: string, start: (callback: (result: OfficeAsyncResult<T>) => void) => void): Promise<{ readonly value: T } | undefined> {
  return new Promise((resolve) => {
    try {
      start((result) => {
        if (result.status === 'succeeded') {
          resolve({ value: result.value });
        } else {
          warn(`${what} failed.`, result.error);
          resolve(undefined);
        }
      });
    } catch (error: unknown) {
      warn(`${what} failed.`, error);
      resolve(undefined);
    }
  });
}

/**
 * Mount MAIDR in a PowerPoint content add-in, for the one chart it reads.
 *
 * Call it once Office.js is ready, from `Office.onReady`. It appends one
 * wrapper to `container`, reads the presentation, and shows the chart linked
 * -- linking one first, when none is -- and follows PowerPoint between Normal
 * view and the slide show until {@link SlideChartBinding.dispose}.
 *
 * The presentation is read through `Document.getFileAsync`, which PowerPoint
 * offers on the web, on Windows, on Mac and on iPad, and unzipped with the
 * browser's `DecompressionStream`. The link is kept in `Document.settings`;
 * the view is asked of `Document.getActiveViewAsync` and followed through
 * `activeViewChanged`, and, as it opens in Normal view, the slide the add-in
 * is on of `Document.getSelectedDataAsync`. Without any of those three, it
 * does without: no link kept, Normal view, or a picker to link a chart from.
 *
 * @param container - The element the add-in goes in. A wrapper is appended to it.
 * @param options - Where Office.js is, and what the add-in says.
 * @returns The binding, once the chart has been read. It never rejects: an
 * add-in that cannot read says so in its figure area.
 */
export async function bindSlideChart(container: HTMLElement, options: SlideChartOptions = {}): Promise<SlideChartBinding> {
  const figureId = options.id ?? nextSlideFigureId();
  const labels: SlideChartLabels = { ...DEFAULT_SLIDE_CHART_LABELS, ...options.labels };
  const office = options.office ?? officeGlobals().office;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-maidr-office-slide', figureId);
  container.appendChild(wrapper);
  const root: ReactRoot = createRoot(wrapper, { identifierPrefix: figureId });

  let state: SlideState = {
    view: 'edit',
    readable: false,
    charts: [],
    linked: null,
    figure: { kind: 'status', message: labels.loading },
    progress: '',
  };
  let rendered = '';
  let disposed = false;
  // The charts as last read, each with its reading.
  let charts: OfficeChart[] = [];
  // Whether the last read of the file succeeded: until one has, `charts` says
  // nothing of the presentation.
  let readOk = false;
  // The chart linked, and whether the presentation has it saved.
  let link: SlideChartLink | null = null;
  let saved = true;
  // The slide the add-in is on, as far as it is known: its chart's, or else
  // the one selected as it opened in Normal view. A chart alone there is
  // linked when none is, and the picker offers this slide's charts first.
  let home: string | null = null;
  // Saves run one at a time, each saving the link as it is then.
  let saving: Promise<void> = Promise.resolve();
  let removeViewHandler: (() => Promise<void>) | null = null;

  const officeDocument = (): OfficeDocument | undefined => office?.context?.document;

  const render = (): void => {
    if (disposed) {
      return;
    }
    const key = JSON.stringify(state);
    if (key === rendered) {
      return;
    }
    rendered = key;
    renderKeepingFocus(root, wrapper, <SlideChart state={state} labels={labels} onPick={chartId => void linkChart(chartId)} onRefresh={() => void refresh()} />);
  };

  const infos = (): OfficeChartInfo[] => [
    ...charts.filter(chart => chart.slideId === home),
    ...charts.filter(chart => chart.slideId !== home),
  ].map(chart => chartInfo(chart, chart.hidden === true ? labels.hiddenSlide : labels.slide));

  const linkedId = (): string | null => (link === null ? null : `${link.slideId}:${link.shapeId}`);

  const showStatus = (message: string): void => {
    state = { ...state, charts: infos(), linked: linkedId(), figure: { kind: 'status', message } };
    render();
  };

  const show = (chart: OfficeChart): void => {
    const label = shownTitle(chart) ?? chart.description ?? chart.name;
    state = { ...state, charts: infos(), linked: chart.id, figure: chartView(chart, label, figureId, labels, state.figure) };
    render();
  };

  // Link a chart, to be saved; a chart found by name has a new shape id.
  const relink = (chart: OfficeChart): SlideChartLink => {
    const next = linkTo(chart);
    if (link === null || link.slideId !== next.slideId || link.shapeId !== next.shapeId || link.name !== next.name) {
      link = next;
      saved = false;
    }
    return next;
  };

  // Save the link in the presentation. Not in the slide show: one linked there
  // is saved once Normal view is back.
  const write = async (): Promise<void> => {
    const settings = officeDocument()?.settings;
    const current = link;
    if (disposed || saved || current === null || state.view !== 'edit') {
      return;
    }
    if (settings === undefined) {
      warn('this PowerPoint keeps no settings for add-ins: the chart stays linked only until the add-in closes.');
      return;
    }
    try {
      settings.set(LINK_SETTING, current);
    } catch (error: unknown) {
      warn('could not keep the chart linked.', error);
      return;
    }
    const done = await officeCall<void>('Settings.saveAsync', callback => settings.saveAsync(callback));
    if (done !== undefined && link === current) {
      saved = true;
    }
  };

  const save = (): Promise<void> => {
    saving = saving.then(write);
    return saving;
  };

  // The link the presentation keeps; a value that is not one is left alone.
  const savedLink = (): SlideChartLink | null => {
    const settings = officeDocument()?.settings;
    let value: unknown;
    try {
      value = settings?.get(LINK_SETTING);
    } catch (error: unknown) {
      warn('could not read the chart linked.', error);
      return null;
    }
    if (value === null || value === undefined) {
      return null;
    }
    if (!isLink(value)) {
      warn(`the setting ${LINK_SETTING} is not a chart's link; it is ignored.`, value);
      return null;
    }
    return { slideId: value.slideId, shapeId: value.shapeId, name: value.name };
  };

  // The slide selected, by its id: as the add-in opens, the slide it is on.
  // Several selected, as in the slide sorter, say nothing of which.
  const selectedSlide = async (): Promise<string | null> => {
    const file = officeDocument();
    const select = file?.getSelectedDataAsync;
    if (file === undefined || select === undefined) {
      return null;
    }
    const range = await officeCall<OfficeSlideRange>('Document.getSelectedDataAsync', callback => select.call(file, SLIDE_RANGE, callback));
    const slides: unknown = range?.value.slides;
    const only = Array.isArray(slides) && slides.length === 1 ? (slides[0] as Partial<OfficeSlideRangeSlide>) : null;
    return only?.id === undefined ? null : String(only.id);
  };

  const activeView = async (): Promise<SlideChartView> => {
    const file = officeDocument();
    const ask = file?.getActiveViewAsync;
    if (file === undefined || ask === undefined) {
      return 'edit';
    }
    const view = await officeCall<string>('Document.getActiveViewAsync', callback => ask.call(file, callback));
    return view?.value === 'read' ? 'read' : 'edit';
  };

  // Show the chart linked. With none linked, link the one chart on the
  // add-in's slide, or ask which. Until a read has succeeded, the figure area
  // keeps saying the chart is being read, or could not be: the read under way,
  // or the next, places the chart.
  async function place(): Promise<void> {
    if (!readOk) {
      return;
    }
    let current = link;
    if (current === null) {
      const onSlide = charts.filter(chart => home !== null && chart.slideId === home);
      if (onSlide.length !== 1) {
        showStatus(state.view === 'read' ? labels.notLinkedShow : charts.length === 0 ? labels.noCharts : labels.notLinked);
        return;
      }
      current = relink(onSlide[0]);
    }
    const chart = linkedChart(current, charts);
    if (chart === undefined) {
      showStatus(state.view === 'read' ? labels.chartGoneShow : charts.length === 0 ? labels.noCharts : labels.chartGone);
      return;
    }
    relink(chart);
    show(chart);
    await save();
  }

  // Read the file. The polite status line says so only of a read the author
  // asked for: the add-in reads by itself as it opens, wherever PowerPoint
  // shows it, and as the slide show starts, and says nothing of those.
  async function readAll(announce: boolean): Promise<boolean> {
    if (office === undefined) {
      return false;
    }
    state = { ...state, progress: announce ? labels.reading : '' };
    render();
    try {
      const read = await readPowerPointCharts(office);
      if (disposed) {
        return false;
      }
      charts = read;
      readOk = true;
      state = { ...state, charts: infos(), progress: announce ? labels.read.replace('{count}', String(read.length)) : '' };
      render();
      return true;
    } catch (error: unknown) {
      warn('could not read the presentation.', error);
      readOk = false;
      state = { ...state, progress: '' };
      showStatus(labels.readFailed);
      return false;
    }
  }

  async function refresh(announce = true): Promise<void> {
    if (disposed || !state.readable) {
      return;
    }
    if (await readAll(announce)) {
      await place();
    }
  }

  async function linkChart(chartId: string): Promise<void> {
    if (disposed || !state.readable) {
      return;
    }
    const chart = charts.find(one => one.id === chartId);
    if (chart === undefined) {
      warn(`there is no chart ${chartId} to link.`);
      return;
    }
    relink(chart);
    show(chart);
    await save();
  }

  // PowerPoint changed views. The slide show reads the file again, as the
  // author may have edited the chart; Normal view brings the controls back.
  async function enter(view: SlideChartView): Promise<void> {
    if (disposed || view === state.view) {
      return;
    }
    state = { ...state, view };
    render();
    if (view === 'read') {
      await refresh(false);
    } else {
      await place();
    }
  }

  const onViewChanged = (event?: OfficeEventArgs): void => {
    const view = event?.activeView;
    if (view === 'edit' || view === 'read') {
      void enter(view);
    } else {
      void activeView().then(enter);
    }
  };

  const listen = async (): Promise<void> => {
    const file = officeDocument();
    const add = file?.addHandlerAsync;
    if (file === undefined || add === undefined) {
      warn('this PowerPoint cannot say when the slide show starts; the add-in reads the chart when it opens, and on Read again.');
      return;
    }
    const added = await officeCall<void>(`Document.addHandlerAsync(${VIEW_CHANGED})`, callback => add.call(file, VIEW_CHANGED, onViewChanged, callback));
    const remove = file.removeHandlerAsync;
    if (added === undefined || remove === undefined) {
      return;
    }
    const removeHandler = async (): Promise<void> => {
      await officeCall<void>('Document.removeHandlerAsync', callback => remove.call(file, VIEW_CHANGED, { handler: onViewChanged }, callback));
    };
    if (disposed) {
      // Disposed while the handler was being registered.
      await removeHandler();
    } else {
      removeViewHandler = removeHandler;
    }
  };

  const binding: SlideChartBinding = {
    get maidr(): MaidrData | null {
      return state.figure.kind === 'figure' ? state.figure.maidr : null;
    },
    get chart(): OfficeChartInfo | null {
      return state.charts.find(chart => chart.id === state.linked) ?? null;
    },
    get charts(): readonly OfficeChartInfo[] {
      return state.charts;
    },
    get view(): SlideChartView {
      return state.view;
    },
    link: linkChart,
    refresh: () => refresh(),
    dispose: async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;
      root.unmount();
      wrapper.remove();
      await removeViewHandler?.();
    },
  };

  render();
  if (office === undefined) {
    warn('Office.js is not loaded on this page: load office.js, and bind from Office.onReady.');
    showStatus(labels.noOffice);
    return binding;
  }
  const running = await readyHost(office);
  if (running !== undefined && running !== null && running !== 'PowerPoint') {
    warn(`this page is running in ${running}, not PowerPoint.`);
    showStatus(labels.noOffice);
    return binding;
  }
  const problem = presentationUnreadable(office);
  if (problem !== null) {
    warn(problem);
    showStatus(running === undefined || running === null ? labels.noOffice : labels.unsupportedHost);
    return binding;
  }
  link = savedLink();
  // Follow the view before asking which it is, so a change while the handler
  // is being registered is in the answer, and one after it reaches the handler.
  await listen();
  if (disposed) {
    return binding;
  }
  const view = await activeView();
  state = { ...state, view };
  // The slide selected is the add-in's own only as it opens in Normal view,
  // just after it is inserted; in the slide show it says nothing of where the
  // add-in is, so none is linked from it there.
  home = link?.slideId ?? (view === 'edit' ? await selectedSlide() : null);
  if (disposed) {
    return binding;
  }
  state = { ...state, readable: true };
  if (await readAll(false)) {
    await place();
  }
  return binding;
}

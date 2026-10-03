import type {
  ExcelChart,
  ExcelChartActivatedEvent,
  ExcelChartAxes,
  ExcelChartAxis,
  ExcelChartBinOptions,
  ExcelChartBoxwhiskerOptions,
  ExcelChartCollection,
  ExcelChartSeries,
  ExcelChartSeriesCollection,
  ExcelChartSeriesDimension,
  ExcelClientResult,
  ExcelEventHandlerResult,
  ExcelEventHandlers,
  ExcelHost,
  ExcelRange,
  ExcelRequestContext,
  ExcelTitle,
  ExcelWorkbook,
  ExcelWorksheet,
  ExcelWorksheetAddedEvent,
  ExcelWorksheetCollection,
  OfficeHost,
} from '@adapters/excel/types';

/**
 * A stand-in for Office.js, strict where Office.js is strict.
 *
 * Office.js hands out proxies: `load` queues a request, `context.sync()` runs
 * it, and reading a property that was not loaded and synced throws
 * `PropertyNotLoaded`; a method's `ClientResult` has no `value` until the sync
 * after the call. The fakes here do the same, so a reader that reads before it
 * syncs, or forgets to load, fails here the way it would in Excel.
 *
 * The workbook itself is plain data ({@link FakeBook}) that a test can change
 * between reads, as a user editing cells would.
 */

/** A title, as the book records it. */
export interface FakeTitleData {
  text: string;
  visible: boolean;
}

/** One series, as the book records it. */
export interface FakeSeriesData {
  name: string;
  chartType?: string;
  axisGroup?: 'Primary' | 'Secondary';
  filtered?: boolean;
  firstSliceAngle?: number;
  categories?: string[];
  values?: string[];
  xValues?: string[];
  yValues?: string[];
  bubbleSizes?: string[];
  /** What `getDimensionDataSourceType/String('Categories')` report. */
  categorySource?: { type: string; address: string };
  /** What `getDimensionDataSourceType/String('BubbleSizes')` report. */
  sizeSource?: { type: string; address: string };
  splitType?: string;
  splitValue?: number;
  binOptions?: Partial<FakeBinOptions>;
  quartileCalculation?: string;
  /**
   * Properties this series refuses to load: asking for one fails the sync,
   * as Office.js does for a property a chart type does not have.
   */
  rejects?: string[];
}

/** A histogram series' bin options, as the book records them. */
export interface FakeBinOptions {
  type: string;
  width: number;
  count: number;
  allowOverflow: boolean;
  overflowValue: number;
  allowUnderflow: boolean;
  underflowValue: number;
}

/** One chart, as the book records it. */
export interface FakeChartData {
  id: string;
  name: string;
  chartType: string;
  displayBlanksAs?: string;
  title?: FakeTitleData;
  /** `null` for a chart with no axes: asking for an axis title fails the sync. */
  axes?: {
    category?: FakeTitleData;
    value?: FakeTitleData;
    secondaryValue?: FakeTitleData;
    series?: FakeTitleData;
  } | null;
  /** Properties this chart refuses to load; see {@link FakeSeriesData.rejects}. */
  rejects?: string[];
  series: FakeSeriesData[];
  /** The base64 image `getImage` returns, or an error it fails the sync with. */
  image?: string | Error;
}

/** One worksheet, as the book records it. */
export interface FakeSheetData {
  id: string;
  name: string;
  visibility?: 'Visible' | 'Hidden' | 'VeryHidden';
  charts: FakeChartData[];
  /** Cell text by A1 address, such as `A2`, for `getRange(...).text`. */
  cells?: Record<string, string>;
}

/** The whole workbook. */
export interface FakeBook {
  sheets: FakeSheetData[];
  /** The chart the user has activated, by id. */
  activeChartId?: string | null;
}

type Handler = (event: never) => Promise<unknown>;

/** Columns' letters to a number: `A` is 1, `AB` is 28. */
function columnNumber(letters: string): number {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function columnLetters(column: number): string {
  let letters = '';
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

/** Expand `A2:B4` into rows of cell addresses. */
function cellsOf(address: string): string[][] {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(address.replace(/\$/g, ''));
  if (match === null) {
    throw new Error(`InvalidArgument: the fake cannot read the address "${address}"`);
  }
  const [, c1, r1, c2 = c1, r2 = r1] = match;
  const rows: string[][] = [];
  for (let row = Number(r1); row <= Number(r2); row++) {
    const cells: string[] = [];
    for (let column = columnNumber(c1); column <= columnNumber(c2); column++) {
      cells.push(`${columnLetters(column)}${row}`);
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * The host: `Excel.run`, the registered event handlers, and counters a test
 * can assert batching against.
 */
export class FakeExcelHost implements ExcelHost {
  /** Every `context.sync()` across every batch. */
  syncs = 0;
  /** Every `Excel.run`. */
  runs = 0;
  /** Registered handlers, by event key: `worksheets.onChanged`, `charts.<sheet id>.onActivated`. */
  readonly handlers = new Map<string, Set<Handler>>();
  /** Event keys whose `add` throws, as an older Office.js does for an event it lacks. */
  readonly missingEvents = new Set<string>();
  /** When set, every sync fails with it. */
  failSyncs: Error | null = null;

  constructor(public book: FakeBook) {}

  run = async <T>(batch: (context: ExcelRequestContext) => Promise<T>): Promise<T> => {
    this.runs++;
    const context = new FakeContext(this);
    const result = await batch(context);
    // Excel.run sends whatever the batch left queued.
    await context.sync();
    return result;
  };

  /** How many handlers are registered, for keys starting with `prefix`. */
  handlerCount(prefix = ''): number {
    let count = 0;
    for (const [key, handlers] of this.handlers) {
      if (key.startsWith(prefix)) {
        count += handlers.size;
      }
    }
    return count;
  }

  /** Run every handler registered for an event, as Excel does when it fires. */
  async fire(key: string, event: unknown): Promise<void> {
    await Promise.all([...(this.handlers.get(key) ?? [])].map(handler => (handler as (event: unknown) => Promise<unknown>)(event)));
  }

  /** The user activated a chart in the workbook. */
  async activate(chartId: string): Promise<void> {
    const sheet = this.book.sheets.find(one => one.charts.some(chart => chart.id === chartId));
    if (sheet === undefined) {
      throw new Error(`no chart ${chartId}`);
    }
    this.book.activeChartId = chartId;
    const event: ExcelChartActivatedEvent = { chartId, worksheetId: sheet.id };
    await this.fire(`charts.${sheet.id}.onActivated`, event);
  }

  /** The user moved away from a chart: nothing is active. */
  async deactivate(chartId: string): Promise<void> {
    const sheet = this.book.sheets.find(one => one.charts.some(chart => chart.id === chartId));
    this.book.activeChartId = null;
    await this.fire(`charts.${sheet?.id ?? ''}.onDeactivated`, { chartId, worksheetId: sheet?.id });
  }

  register(key: string, handler: Handler): void {
    const handlers = this.handlers.get(key) ?? new Set<Handler>();
    handlers.add(handler);
    this.handlers.set(key, handlers);
  }

  unregister(key: string, handler: Handler): void {
    this.handlers.get(key)?.delete(handler);
  }
}

/** A request context: queues work, runs it on sync. */
export class FakeContext implements ExcelRequestContext {
  readonly workbook: FakeWorkbook;
  private readonly queued: (() => void)[] = [];

  constructor(readonly host: FakeExcelHost) {
    this.workbook = new FakeWorkbook(this);
  }

  queue(action: () => void): void {
    this.queued.push(action);
  }

  async sync(): Promise<void> {
    this.host.syncs++;
    const actions = this.queued.splice(0);
    if (this.host.failSyncs !== null) {
      throw this.host.failSyncs;
    }
    let failure: unknown = null;
    for (const action of actions) {
      try {
        action();
      } catch (error: unknown) {
        failure ??= error;
      }
    }
    if (failure !== null) {
      throw failure;
    }
  }
}

/** A `ClientResult`: no value until the sync after the call. */
class FakeResult<T> implements ExcelClientResult<T> {
  private ready = false;
  private result: T | undefined;

  constructor(context: FakeContext, compute: () => T) {
    context.queue(() => {
      this.result = compute();
      this.ready = true;
    });
  }

  get value(): T {
    if (!this.ready) {
      throw new Error('ValueNotLoaded: read a ClientResult before syncing');
    }
    return this.result as T;
  }
}

/** A proxy whose scalar properties are readable only once loaded and synced. */
class FakeLoadable {
  private readonly loaded = new Set<string>();

  constructor(protected readonly context: FakeContext, private readonly rejects: readonly string[] = []) {}

  load = (names?: string | string[]): unknown => {
    const list = names === undefined ? ['*'] : (typeof names === 'string' ? names.split(',') : names).map(name => name.trim());
    this.context.queue(() => {
      const refused = list.filter(name => this.rejects.includes(name));
      if (refused.length > 0) {
        throw new Error(`PropertyNotSupported: ${this.constructor.name}.${refused.join(', ')}`);
      }
      this.markLoaded(list);
    });
    return this;
  };

  /** Mark properties loaded, as a sync does; a collection also loads its items'. */
  markLoaded(names: readonly string[]): void {
    for (const name of names) {
      this.loaded.add(name);
    }
  }

  protected read<T>(name: string, value: () => T): T {
    if (!this.loaded.has(name) && !this.loaded.has('*')) {
      throw new Error(`PropertyNotLoaded: ${this.constructor.name}.${name}`);
    }
    return value();
  }

  protected get anythingLoaded(): boolean {
    return this.loaded.size > 0;
  }
}

/** A collection: `items` once `items/...` is loaded, the same proxies every time. */
abstract class FakeCollection<T extends FakeLoadable> extends FakeLoadable {
  private cached: T[] | null = null;

  protected abstract create(): T[];

  override markLoaded(names: readonly string[]): void {
    super.markLoaded(['items']);
    this.cached ??= this.create();
    const own = names.map(name => name.replace(/^items\//, ''));
    for (const item of this.cached) {
      item.markLoaded(own);
    }
  }

  get items(): T[] {
    return this.read('items', () => this.cached ?? []);
  }
}

class FakeEvent<T> implements ExcelEventHandlers<T> {
  constructor(private readonly context: FakeContext, private readonly key: string) {}

  add = (handler: (event: T) => Promise<unknown>): ExcelEventHandlerResult => {
    const { context, key } = this;
    if (context.host.missingEvents.has(key)) {
      throw new Error(`ApiNotFound: ${key}`);
    }
    context.queue(() => context.host.register(key, handler as Handler));
    return {
      context,
      remove: () => context.queue(() => context.host.unregister(key, handler as Handler)),
    };
  };
}

class FakeWorkbook implements ExcelWorkbook {
  readonly worksheets: FakeWorksheetCollection;

  constructor(private readonly context: FakeContext) {
    this.worksheets = new FakeWorksheetCollection(context);
  }

  getActiveChartOrNullObject = (): ExcelChart => {
    const { book } = this.context.host;
    const sheet = book.sheets.find(one => one.charts.some(chart => chart.id === book.activeChartId));
    const chart = sheet?.charts.find(one => one.id === book.activeChartId) ?? null;
    return new FakeChart(this.context, chart, sheet ?? null);
  };
}

class FakeWorksheetCollection extends FakeCollection<FakeWorksheet> implements ExcelWorksheetCollection {
  readonly onChanged = new FakeEvent<unknown>(this.context, 'worksheets.onChanged');
  readonly onCalculated = new FakeEvent<unknown>(this.context, 'worksheets.onCalculated');
  readonly onAdded = new FakeEvent<ExcelWorksheetAddedEvent>(this.context, 'worksheets.onAdded');
  readonly onDeleted = new FakeEvent<unknown>(this.context, 'worksheets.onDeleted');

  protected create(): FakeWorksheet[] {
    return this.context.host.book.sheets.map(sheet => new FakeWorksheet(this.context, sheet));
  }

  getItemOrNullObject = (key: string): FakeWorksheet => {
    const sheet = this.context.host.book.sheets.find(one => one.id === key || one.name === key) ?? null;
    return new FakeWorksheet(this.context, sheet);
  };
}

class FakeWorksheet extends FakeLoadable implements ExcelWorksheet {
  readonly charts: FakeChartCollection;

  constructor(context: FakeContext, private readonly data: FakeSheetData | null) {
    super(context);
    this.charts = new FakeChartCollection(context, data);
  }

  private get sheet(): FakeSheetData {
    if (this.data === null) {
      throw new Error('ItemNotFound: the worksheet does not exist');
    }
    return this.data;
  }

  get isNullObject(): boolean {
    return this.data === null;
  }

  get id(): string {
    return this.read('id', () => this.sheet.id);
  }

  get name(): string {
    return this.read('name', () => this.sheet.name);
  }

  get visibility(): string {
    return this.read('visibility', () => this.sheet.visibility ?? 'Visible');
  }

  getRange = (address: string): ExcelRange => new FakeRange(this.context, () => {
    const cells = this.sheet.cells ?? {};
    return cellsOf(address).map(row => row.map(cell => cells[cell] ?? ''));
  });
}

class FakeRange extends FakeLoadable implements ExcelRange {
  private snapshot: string[][] = [];

  constructor(context: FakeContext, private readonly compute: () => string[][]) {
    super(context);
  }

  override markLoaded(names: readonly string[]): void {
    this.snapshot = this.compute();
    super.markLoaded(names);
  }

  get text(): string[][] {
    return this.read('text', () => this.snapshot);
  }
}

class FakeChartCollection extends FakeCollection<FakeChart> implements ExcelChartCollection {
  readonly onActivated: FakeEvent<ExcelChartActivatedEvent>;
  readonly onAdded: FakeEvent<unknown>;
  readonly onDeleted: FakeEvent<unknown>;

  constructor(context: FakeContext, private readonly sheet: FakeSheetData | null) {
    super(context);
    const key = `charts.${sheet?.id ?? 'missing'}`;
    this.onActivated = new FakeEvent(context, `${key}.onActivated`);
    this.onAdded = new FakeEvent(context, `${key}.onAdded`);
    this.onDeleted = new FakeEvent(context, `${key}.onDeleted`);
  }

  protected create(): FakeChart[] {
    const sheet = this.sheet;
    if (sheet === null) {
      throw new Error('ItemNotFound: the worksheet does not exist');
    }
    return sheet.charts.map(chart => new FakeChart(this.context, chart, sheet));
  }
}

class FakeTitle extends FakeLoadable implements ExcelTitle {
  constructor(context: FakeContext, private readonly data: () => FakeTitleData) {
    super(context);
  }

  get text(): string {
    return this.read('text', () => this.data().text);
  }

  get visible(): boolean {
    return this.read('visible', () => this.data().visible);
  }
}

/** An axis title that fails the sync, as asking a pie for its axes does. */
class FakeMissingTitle extends FakeTitle {
  override markLoaded(): void {
    throw new Error('GeneralException: this chart has no such axis');
  }
}

class FakeChart extends FakeLoadable implements ExcelChart {
  readonly title: FakeTitle;
  readonly axes: ExcelChartAxes;
  readonly series: FakeSeriesCollection;
  readonly worksheet: FakeWorksheet;

  constructor(context: FakeContext, private readonly data: FakeChartData | null, sheet: FakeSheetData | null) {
    super(context, data?.rejects);
    this.title = new FakeTitle(context, () => this.chart.title ?? { text: '', visible: false });
    const axis = (pick: (axes: NonNullable<FakeChartData['axes']>) => FakeTitleData | undefined): ExcelChartAxis => {
      const axes = this.data?.axes;
      return {
        title: axes === null
          ? new FakeMissingTitle(context, () => ({ text: '', visible: false }))
          : new FakeTitle(context, () => pick(axes ?? {}) ?? { text: '', visible: false }),
      };
    };
    this.axes = {
      categoryAxis: axis(axes => axes.category),
      valueAxis: axis(axes => axes.value),
      seriesAxis: axis(axes => axes.series),
      getItem: (type, group) => type === 'Value' && group === 'Secondary'
        ? axis(axes => axes.secondaryValue)
        : axis(axes => (type === 'Value' ? axes.value : axes.category)),
    };
    this.series = new FakeSeriesCollection(context, () => this.chart.series);
    this.worksheet = new FakeWorksheet(context, sheet);
  }

  private get chart(): FakeChartData {
    if (this.data === null) {
      throw new Error('ItemNotFound: the chart does not exist');
    }
    return this.data;
  }

  get isNullObject(): boolean {
    return this.read('isNullObject', () => this.data === null);
  }

  override markLoaded(names: readonly string[]): void {
    super.markLoaded([...names, 'isNullObject']);
  }

  get id(): string {
    return this.read('id', () => this.chart.id);
  }

  get name(): string {
    return this.read('name', () => this.chart.name);
  }

  get chartType(): string {
    return this.read('chartType', () => this.chart.chartType);
  }

  get displayBlanksAs(): string {
    return this.read('displayBlanksAs', () => this.chart.displayBlanksAs ?? 'NotPlotted');
  }

  getImage = (width?: number): ExcelClientResult<string> => new FakeResult(this.context, () => {
    const image = this.chart.image ?? 'iVBORw0KGgo=';
    if (image instanceof Error) {
      throw image;
    }
    return width === undefined ? image : `${image}#w=${width}`;
  });
}

class FakeSeriesCollection extends FakeCollection<FakeSeries> implements ExcelChartSeriesCollection {
  constructor(context: FakeContext, private readonly data: () => FakeSeriesData[]) {
    super(context);
  }

  protected create(): FakeSeries[] {
    return this.data().map(series => new FakeSeries(this.context, series));
  }
}

class FakeBinOptionsProxy extends FakeLoadable implements ExcelChartBinOptions {
  constructor(context: FakeContext, private readonly data: () => Partial<FakeBinOptions>) {
    super(context);
  }

  get type(): string {
    return this.read('type', () => this.data().type ?? 'Auto');
  }

  get width(): number {
    return this.read('width', () => this.data().width ?? 0);
  }

  get count(): number {
    return this.read('count', () => this.data().count ?? 0);
  }

  get allowOverflow(): boolean {
    return this.read('allowOverflow', () => this.data().allowOverflow ?? false);
  }

  get overflowValue(): number {
    return this.read('overflowValue', () => this.data().overflowValue ?? 0);
  }

  get allowUnderflow(): boolean {
    return this.read('allowUnderflow', () => this.data().allowUnderflow ?? false);
  }

  get underflowValue(): number {
    return this.read('underflowValue', () => this.data().underflowValue ?? 0);
  }
}

class FakeBoxwhiskerOptionsProxy extends FakeLoadable implements ExcelChartBoxwhiskerOptions {
  constructor(context: FakeContext, private readonly data: () => string | undefined) {
    super(context);
  }

  get quartileCalculation(): string {
    return this.read('quartileCalculation', () => this.data() ?? 'Exclusive');
  }
}

class FakeSeries extends FakeLoadable implements ExcelChartSeries {
  readonly binOptions: FakeBinOptionsProxy;
  readonly boxwhiskerOptions: FakeBoxwhiskerOptionsProxy;

  constructor(context: FakeContext, private readonly data: FakeSeriesData) {
    super(context, data.rejects);
    this.binOptions = new FakeBinOptionsProxy(context, () => this.data.binOptions ?? {});
    this.boxwhiskerOptions = new FakeBoxwhiskerOptionsProxy(context, () => this.data.quartileCalculation);
  }

  get name(): string {
    return this.read('name', () => this.data.name);
  }

  get chartType(): string {
    return this.read('chartType', () => this.data.chartType ?? '');
  }

  get axisGroup(): string {
    return this.read('axisGroup', () => this.data.axisGroup ?? 'Primary');
  }

  get filtered(): boolean {
    return this.read('filtered', () => this.data.filtered ?? false);
  }

  get firstSliceAngle(): number {
    return this.read('firstSliceAngle', () => this.data.firstSliceAngle ?? 0);
  }

  get splitType(): string {
    return this.read('splitType', () => this.data.splitType ?? 'SplitByPosition');
  }

  get splitValue(): number {
    return this.read('splitValue', () => this.data.splitValue ?? 3);
  }

  getDimensionValues = (dimension: ExcelChartSeriesDimension): ExcelClientResult<string[]> =>
    new FakeResult(this.context, () => {
      const values = {
        Categories: this.data.categories,
        Values: this.data.values,
        XValues: this.data.xValues,
        YValues: this.data.yValues,
        BubbleSizes: this.data.bubbleSizes,
      }[dimension];
      return [...(values ?? [])];
    });

  private sourceOf(dimension: ExcelChartSeriesDimension): { type: string; address: string } | undefined {
    return dimension === 'BubbleSizes' ? this.data.sizeSource : this.data.categorySource;
  }

  getDimensionDataSourceString = (dimension: ExcelChartSeriesDimension): ExcelClientResult<string> =>
    new FakeResult(this.context, () => this.sourceOf(dimension)?.address ?? '');

  getDimensionDataSourceType = (dimension: ExcelChartSeriesDimension): ExcelClientResult<string> =>
    new FakeResult(this.context, () => this.sourceOf(dimension)?.type ?? 'Unknown');
}

/**
 * `Office`, answering requirement-set checks up to `version` of ExcelApi.
 *
 * @param version - The highest ExcelApi version the host supports, such as `1.15`.
 * @returns The fake.
 */
export function fakeOffice(version: string): OfficeHost & { asked: string[] } {
  const asked: string[] = [];
  const minor = (text: string | undefined): number => Number((text ?? '1.1').split('.')[1] ?? 0);
  return {
    asked,
    context: {
      requirements: {
        isSetSupported: (name: string, minVersion?: string): boolean => {
          asked.push(`${name} ${minVersion}`);
          return name === 'ExcelApi' && minor(minVersion) <= minor(version);
        },
      },
    },
    onReady: async () => ({ host: 'Excel' }),
  };
}

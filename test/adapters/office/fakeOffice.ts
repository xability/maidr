/**
 * A stand-in for Office.js in PowerPoint and in Word, as much of it as the
 * Office adapter's panes and slide add-in use: the open document's file and
 * selection event, PowerPoint's selected slide and shape, and Word's body and
 * selection as flat packages; and, for a content add-in, its settings, the
 * view open and the slides selected.
 *
 * Like the real one, it answers asynchronous calls through callbacks with an
 * `AsyncResult`, hands a file over in slices, and lets only one file be open
 * at a time.
 */

import type {
  OfficeAppHost,
  OfficeAsyncResult,
  OfficeEventArgs,
  OfficeFile,
  OfficeSettings,
  OfficeSlice,
  OfficeSlideRange,
  OfficeSlideRangeSlide,
  PowerPointHost,
  PowerPointRequestContext,
  PowerPointShape,
  PowerPointSlide,
  WordHost,
  WordRequestContext,
} from '../../../src/adapters/office/types';

function succeeded<T>(value: T): OfficeAsyncResult<T> {
  return { status: 'succeeded', value };
}

function failed<T>(message: string): OfficeAsyncResult<T> {
  return { status: 'failed', value: undefined as T, error: { message } };
}

function collection<T>(items: readonly T[]): { items: readonly T[]; load: () => void } {
  return { items, load: () => {} };
}

/** Options for {@link FakeOffice}. */
export interface FakeOfficeOptions {
  /** What `onReady` says the host is. */
  readonly host?: string | null;
  readonly platform?: string;
  /** Requirement sets supported, as `name version`, such as `PowerPointApi 1.5`. */
  readonly sets?: readonly string[];
  /** The file `getFileAsync` hands over; omitted, the document has no `getFileAsync`. */
  readonly file?: () => Uint8Array;
  /** Make `getFileAsync` fail. */
  readonly fileFails?: boolean;
  /** The add-in's settings, as the file keeps them. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Leave out `Document.settings`. */
  readonly noSettings?: boolean;
  /** Make `Settings.saveAsync` fail. */
  readonly saveFails?: boolean;
  /** The view open, `edit` or `read`; `null` leaves out `getActiveViewAsync`. Default `edit`. */
  readonly activeView?: string | null;
  /** Leave out `getSelectedDataAsync`. */
  readonly noSelection?: boolean;
  /** Leave out `addHandlerAsync` and `removeHandlerAsync`. */
  readonly noEvents?: boolean;
}

/** The `Office` namespace, with handles a test drives it by. */
export class FakeOffice implements OfficeAppHost {
  readonly context: NonNullable<OfficeAppHost['context']>;
  /** The selection handlers registered, in order. */
  readonly selectionHandlers: ((event?: OfficeEventArgs) => void)[] = [];
  /** The view handlers registered, in order. */
  readonly viewHandlers: ((event?: OfficeEventArgs) => void)[] = [];
  /** The view open, `edit` or `read`. */
  activeView: string;
  /** Called once `getActiveViewAsync` has answered: a test's way to change the view just after. */
  viewAsked: (() => void) | null = null;
  /** The slides selected, as `getSelectedDataAsync('slideRange')` gives them. */
  selectedSlides: OfficeSlideRangeSlide[] = [];
  /** The add-in's settings, as `set` left them. */
  readonly settingValues = new Map<string, unknown>();
  /** The settings as last saved in the file; `null` before a save. */
  savedSettings: Record<string, unknown> | null = null;
  /** How many times the settings were saved, failed saves included. */
  saves = 0;
  /** How many times the file was asked for. */
  fileReads = 0;
  /** Whether a file is open now. */
  open = false;
  /** Every slice index fetched. */
  readonly slicesFetched: number[] = [];

  constructor(private readonly options: FakeOfficeOptions = {}) {
    const sets = new Set(options.sets ?? []);
    this.activeView = options.activeView ?? 'edit';
    for (const [name, value] of Object.entries(options.settings ?? {})) {
      this.settingValues.set(name, value);
    }
    const handlers = (eventType: string): ((event?: OfficeEventArgs) => void)[] =>
      eventType === 'activeViewChanged' ? this.viewHandlers : this.selectionHandlers;
    const document: NonNullable<OfficeAppHost['context']>['document'] = {
      ...(options.noEvents === true
        ? {}
        : {
            // Registered as the real one registers a handler: once the call
            // has gone to the host and come back.
            addHandlerAsync: (eventType: string, handler: (event?: OfficeEventArgs) => void, callback?: (result: OfficeAsyncResult<void>) => void) => {
              setTimeout(() => {
                if (eventType === 'documentSelectionChanged' || eventType === 'activeViewChanged') {
                  handlers(eventType).push(handler);
                }
                callback?.(succeeded(undefined));
              }, 0);
            },
            removeHandlerAsync: (
              eventType: string,
              { handler }: { readonly handler: (event?: OfficeEventArgs) => void },
              callback?: (result: OfficeAsyncResult<void>) => void,
            ) => {
              const registered = handlers(eventType);
              const at = registered.indexOf(handler);
              if (at >= 0) {
                registered.splice(at, 1);
              }
              callback?.(succeeded(undefined));
            },
          }),
      ...(options.noSettings === true ? {} : { settings: this.settings() }),
      ...(options.activeView === null
        ? {}
        : {
            getActiveViewAsync: (callback: (result: OfficeAsyncResult<string>) => void) => {
              setTimeout(() => {
                callback(succeeded(this.activeView));
                this.viewAsked?.();
              }, 0);
            },
          }),
      ...(options.noSelection === true
        ? {}
        : {
            getSelectedDataAsync: (coercionType: string, callback: (result: OfficeAsyncResult<OfficeSlideRange>) => void) => {
              const result = coercionType === 'slideRange'
                ? succeeded({ slides: this.selectedSlides.map(slide => ({ ...slide })) })
                : failed<OfficeSlideRange>('The specified data type is not supported.');
              setTimeout(() => callback(result), 0);
            },
          }),
      ...(options.file === undefined && options.fileFails !== true ? {} : { getFileAsync: this.getFileAsync.bind(this) }),
    };
    this.context = {
      ...(options.host === undefined || options.host === null ? {} : { host: options.host }),
      platform: options.platform ?? 'OfficeOnline',
      document,
      requirements: {
        isSetSupported: (name: string, version = '1.1') => sets.has(`${name} ${version}`)
          || [...sets].some(set => set.startsWith(`${name} `) && Number(set.split(' ')[1]) >= Number(version)),
      },
    };
  }

  async onReady(): Promise<{ host: string | null; platform: string }> {
    return { host: this.options.host ?? null, platform: this.context.platform ?? 'OfficeOnline' };
  }

  /** Fire the selection event, as the user selecting something would. */
  selectionChanged(): void {
    for (const handler of [...this.selectionHandlers]) {
      handler({ type: 'documentSelectionChanged' });
    }
  }

  /**
   * Switch views, as starting or ending the slide show would, and fire the
   * view event; with `say: false`, an event that does not say which view.
   */
  changeView(view: 'edit' | 'read', { say = true }: { readonly say?: boolean } = {}): void {
    this.activeView = view;
    for (const handler of [...this.viewHandlers]) {
      handler(say ? { type: 'activeViewChanged', activeView: view } : { type: 'activeViewChanged' });
    }
  }

  /** `Office.Settings`, kept until saved, as the real one keeps them. */
  private settings(): OfficeSettings {
    return {
      get: name => this.settingValues.get(name) ?? null,
      set: (name, value) => {
        this.settingValues.set(name, value);
      },
      remove: (name) => {
        this.settingValues.delete(name);
      },
      saveAsync: (callback) => {
        this.saves += 1;
        if (this.options.saveFails === true) {
          setTimeout(() => callback?.(failed('The settings could not be saved.')), 0);
          return;
        }
        this.savedSettings = Object.fromEntries(this.settingValues);
        setTimeout(() => callback?.(succeeded(undefined)), 0);
      },
    };
  }

  private getFileAsync(
    fileType: string,
    { sliceSize }: { readonly sliceSize: number },
    callback: (result: OfficeAsyncResult<OfficeFile>) => void,
  ): void {
    this.fileReads += 1;
    if (this.options.fileFails === true || fileType !== 'compressed' || this.options.file === undefined) {
      callback(failed('The operation failed.'));
      return;
    }
    if (this.open) {
      callback(failed('Too many files are open.'));
      return;
    }
    const bytes = this.options.file();
    this.open = true;
    const file: OfficeFile = {
      size: bytes.length,
      sliceCount: Math.ceil(bytes.length / sliceSize),
      getSliceAsync: (index: number, done: (result: OfficeAsyncResult<OfficeSlice>) => void) => {
        this.slicesFetched.push(index);
        const data = Array.from(bytes.subarray(index * sliceSize, (index + 1) * sliceSize));
        setTimeout(() => done(succeeded({ data, index, size: data.length })), 0);
      },
      closeAsync: (done?: (result: OfficeAsyncResult<void>) => void) => {
        this.open = false;
        done?.(succeeded(undefined));
      },
    };
    setTimeout(() => callback(succeeded(file)), 0);
  }
}

/** The `PowerPoint` namespace: its slides, and what is selected. */
export class FakePowerPoint implements PowerPointHost {
  /** The presentation's slides, by id, in order. */
  slides: PowerPointSlide[];
  selectedSlide: PowerPointSlide | null = null;
  selectedShapes: PowerPointShape[] = [];

  constructor(slideIds: readonly string[]) {
    this.slides = slideIds.map(id => ({ id }));
  }

  async run<T>(batch: (context: PowerPointRequestContext) => Promise<T>): Promise<T> {
    const context: PowerPointRequestContext = {
      presentation: {
        slides: collection(this.slides),
        getSelectedSlides: () => collection(this.selectedSlide === null ? [] : [this.selectedSlide]),
        getSelectedShapes: () => collection(this.selectedShapes),
      },
      sync: async () => undefined,
    };
    return batch(context);
  }
}

/** The `Word` namespace: its body, and its selection, as flat packages. */
export class FakeWord implements WordHost {
  constructor(public body: string, public selection: string = '') {}

  async run<T>(batch: (context: WordRequestContext) => Promise<T>): Promise<T> {
    const context: WordRequestContext = {
      document: {
        body: { getOoxml: () => ({ value: this.body }) },
        getSelection: () => ({ getOoxml: () => ({ value: this.selection }) }),
      },
      sync: async () => undefined,
    };
    return batch(context);
  }
}

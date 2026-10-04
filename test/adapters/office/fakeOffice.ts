/**
 * A stand-in for Office.js in PowerPoint and in Word, as much of it as the
 * Office adapter's panes use: the open document's file and selection event,
 * PowerPoint's selected slide and shape, and Word's body and selection as
 * flat packages.
 *
 * Like the real one, it answers asynchronous calls through callbacks with an
 * `AsyncResult`, hands a file over in slices, and lets only one file be open
 * at a time.
 */

import type {
  OfficeAppHost,
  OfficeAsyncResult,
  OfficeFile,
  OfficeSlice,
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
}

/** The `Office` namespace, with handles a test drives it by. */
export class FakeOffice implements OfficeAppHost {
  readonly context: NonNullable<OfficeAppHost['context']>;
  /** The selection handlers registered, in order. */
  readonly selectionHandlers: (() => void)[] = [];
  /** How many times the file was asked for. */
  fileReads = 0;
  /** Whether a file is open now. */
  open = false;
  /** Every slice index fetched. */
  readonly slicesFetched: number[] = [];

  constructor(private readonly options: FakeOfficeOptions = {}) {
    const sets = new Set(options.sets ?? []);
    const document: NonNullable<OfficeAppHost['context']>['document'] = {
      addHandlerAsync: (eventType, handler, callback) => {
        if (eventType === 'documentSelectionChanged') {
          this.selectionHandlers.push(handler);
        }
        callback?.(succeeded(undefined));
      },
      removeHandlerAsync: (eventType, { handler }, callback) => {
        const at = this.selectionHandlers.indexOf(handler);
        if (at >= 0) {
          this.selectionHandlers.splice(at, 1);
        }
        callback?.(succeeded(undefined));
      },
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
      handler();
    }
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

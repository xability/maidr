/**
 * The slice of the Office JavaScript API the PowerPoint and Word panes read.
 *
 * Declared structurally, as the Excel adapter's types are: Office.js is loaded
 * by the add-in's task pane from Microsoft's CDN, so the real `Office`,
 * `PowerPoint` and `Word` objects are accepted as they are, and a test can
 * hand over plain fakes. Each member is named after the Office.js member it
 * stands for, with the requirement set that added it.
 *
 * @see https://learn.microsoft.com/javascript/api/office
 */

/** The outcome of an asynchronous call of the Common API (`Office.AsyncResult`). */
export interface OfficeAsyncResult<T> {
  /** `succeeded` or `failed` (`Office.AsyncResultStatus`). */
  readonly status: string;
  readonly value: T;
  readonly error?: { readonly message?: string };
}

/** One slice of a file (`Office.Slice`). */
export interface OfficeSlice {
  /** The slice's bytes: a byte array, or a buffer on some platforms. */
  readonly data: ArrayLike<number> | ArrayBuffer;
  readonly index: number;
  readonly size: number;
}

/** A document's file, open for reading in slices (`Office.File`). */
export interface OfficeFile {
  /** The file's size, in bytes. */
  readonly size: number;
  readonly sliceCount: number;
  getSliceAsync: (index: number, callback: (result: OfficeAsyncResult<OfficeSlice>) => void) => void;
  /** Close the file; only so many can be open at once. */
  closeAsync: (callback?: (result: OfficeAsyncResult<void>) => void) => void;
}

/** The open document (`Office.Document`). */
export interface OfficeDocument {
  /**
   * The document's file (`File` requirement set): `compressed` is the Open XML
   * package, which PowerPoint gives on every platform.
   */
  getFileAsync?: (
    fileType: string,
    options: { readonly sliceSize: number },
    callback: (result: OfficeAsyncResult<OfficeFile>) => void,
  ) => void;
  /** Register a handler for a document event, such as `documentSelectionChanged`. */
  addHandlerAsync?: (eventType: string, handler: () => void, callback?: (result: OfficeAsyncResult<void>) => void) => void;
  /** Remove a handler registered by `addHandlerAsync`. */
  removeHandlerAsync?: (
    eventType: string,
    options: { readonly handler: () => void },
    callback?: (result: OfficeAsyncResult<void>) => void,
  ) => void;
}

/** What `Office.onReady` resolves with. */
export interface OfficeReadyInfo {
  /** `Excel`, `PowerPoint`, `Word`, ... (`Office.HostType`); `null` outside Office. */
  readonly host?: string | null;
  /** `PC`, `Mac`, `OfficeOnline`, `iOS`, ... (`Office.PlatformType`). */
  readonly platform?: string | null;
}

/**
 * The `Office` namespace object Office.js defines: the host and platform, the
 * open document, and the requirement-set check.
 */
export interface OfficeAppHost {
  /** Undefined until Office.js has initialized. */
  readonly context?: {
    readonly host?: string;
    readonly platform?: string;
    readonly document?: OfficeDocument;
    readonly requirements?: {
      isSetSupported: (name: string, minVersion?: string) => boolean;
    };
  };
  /** Resolves once Office.js has initialized, with the host it runs in. */
  onReady?: () => Promise<OfficeReadyInfo | unknown>;
}

/** A value filled in on the next `context.sync()` (`OfficeExtension.ClientResult<T>`). */
export interface OfficeClientResult<T> {
  readonly value: T;
}

/** A loaded collection (`OfficeExtension.ClientObject` with `items`). */
export interface OfficeCollection<T> {
  readonly items: readonly T[];
  load: (propertyNames?: string | string[]) => unknown;
}

/** A slide (`PowerPoint.Slide`; PowerPointApi 1.2). */
export interface PowerPointSlide {
  readonly id: string;
}

/** A shape (`PowerPoint.Shape`; PowerPointApi 1.3). */
export interface PowerPointShape {
  readonly id: string;
  readonly name: string;
  /** What the shape is: `Chart`, `Image`, `Group`, ... (`PowerPoint.ShapeType`). */
  readonly type?: string;
}

/** A PowerPoint batch's request context (`PowerPoint.RequestContext`). */
export interface PowerPointRequestContext {
  readonly presentation: {
    /** The presentation's slides, in order (PowerPointApi 1.2). */
    readonly slides: OfficeCollection<PowerPointSlide>;
    /** The slides selected (PowerPointApi 1.5). */
    getSelectedSlides: () => OfficeCollection<PowerPointSlide>;
    /** The shapes selected on the current slide (PowerPointApi 1.5). */
    getSelectedShapes: () => OfficeCollection<PowerPointShape>;
  };
  sync: () => Promise<unknown>;
}

/** The `PowerPoint` namespace object, of which only `run` is used. */
export interface PowerPointHost {
  run: <T>(batch: (context: PowerPointRequestContext) => Promise<T>) => Promise<T>;
}

/** A range of a Word document (`Word.Body`, `Word.Range`). */
export interface WordRange {
  /** The range as a flat Open XML package (WordApi 1.1). */
  getOoxml: () => OfficeClientResult<string>;
}

/** A Word batch's request context (`Word.RequestContext`). */
export interface WordRequestContext {
  readonly document: {
    /** The document's body (WordApi 1.1). */
    readonly body: WordRange;
    /** The current selection (WordApi 1.1). */
    getSelection: () => WordRange;
  };
  sync: () => Promise<unknown>;
}

/** The `Word` namespace object, of which only `run` is used. */
export interface WordHost {
  run: <T>(batch: (context: WordRequestContext) => Promise<T>) => Promise<T>;
}

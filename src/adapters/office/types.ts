/**
 * The slice of the Office JavaScript API the PowerPoint and Word panes, and
 * the slide's add-in, read.
 *
 * Declared structurally, as the Excel adapter's types are: Office.js is loaded
 * by the add-in's page from Microsoft's CDN, so the real `Office`,
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

/** What a document event's handler is given (`Office.ActiveViewChangedEventArgs`, ...). */
export interface OfficeEventArgs {
  /** The event, such as `activeViewChanged` (`Office.EventType`). */
  readonly type?: string;
  /** With `activeViewChanged`: the view now open, `edit` or `read` (`Office.ActiveView`). */
  readonly activeView?: string;
}

/**
 * An add-in's settings (`Office.Settings`; `Settings` requirement set): each
 * instance of the add-in has its own, saved in the document. A value is
 * anything JSON can hold.
 */
export interface OfficeSettings {
  /** A setting's value; `null` or `undefined` when it is not set. */
  get: (name: string) => unknown;
  /** Set a setting, until the add-in closes; `saveAsync` keeps it. */
  set: (name: string, value: unknown) => void;
  remove: (name: string) => void;
  /** Save the settings in the document, to be saved with it. */
  saveAsync: (callback?: (result: OfficeAsyncResult<void>) => void) => void;
}

/** One slide of a slide range (`getSelectedDataAsync` with `Office.CoercionType.SlideRange`). */
export interface OfficeSlideRangeSlide {
  /** The slide's id, which is the file's `p:sldId/@id`. */
  readonly id: number;
  readonly title: string;
  /** Its number in the presentation, from 1. */
  readonly index: number;
}

/** The slides selected in PowerPoint (`Office.CoercionType.SlideRange`). */
export interface OfficeSlideRange {
  readonly slides: readonly OfficeSlideRangeSlide[];
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
  /**
   * Register a handler for a document event, such as `documentSelectionChanged`.
   * Office.js hands the handler the event's arguments. They are optional
   * here, so a stand-in for Office.js may call the handler with none.
   */
  addHandlerAsync?: (
    eventType: string,
    handler: (event?: OfficeEventArgs) => void,
    callback?: (result: OfficeAsyncResult<void>) => void,
  ) => void;
  /** Remove a handler registered by `addHandlerAsync`. */
  removeHandlerAsync?: (
    eventType: string,
    options: { readonly handler: (event?: OfficeEventArgs) => void },
    callback?: (result: OfficeAsyncResult<void>) => void,
  ) => void;
  /**
   * Whether the document is being edited, `edit`, or presented, `read`
   * (`ActiveView` requirement set): PowerPoint's Slide Show and Reading View
   * are `read`. The event `activeViewChanged` says when it changes.
   */
  getActiveViewAsync?: (callback: (result: OfficeAsyncResult<string>) => void) => void;
  /**
   * The data selected (`Selection` requirement set); with `slideRange`, the
   * slides selected in PowerPoint.
   */
  getSelectedDataAsync?: (coercionType: string, callback: (result: OfficeAsyncResult<OfficeSlideRange>) => void) => void;
  /** This instance of the add-in's settings, saved in the document (`Settings` requirement set). */
  readonly settings?: OfficeSettings;
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

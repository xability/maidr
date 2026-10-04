/**
 * Reads the charts of the presentation or document an add-in is open in,
 * through Office.js, and finds the chart the user has selected.
 *
 * PowerPoint hands an add-in its presentation as the file it would save
 * (`Document.getFileAsync`, on every platform), read here a slice at a time
 * and only as far as the slides and charts need. Word hands over its body as
 * a flat Open XML package (`Body.getOoxml`), which holds every part inline.
 */

import type { OfficeChart } from './package';
import type {
  OfficeAppHost,
  OfficeAsyncResult,
  OfficeFile,
  OfficeSlice,
  PowerPointHost,
  WordHost,
} from './types';
import { readDocumentCharts, readPresentationCharts } from './package';
import { openZip, slicedSource } from './zip';

/** The largest slice `getFileAsync` gives on most platforms. */
const SLICE_SIZE = 4 * 1024 * 1024;

/** ... and on iPad. */
const IPAD_SLICE_SIZE = 64 * 1024;

/** `Office.FileType.Compressed`: the Open XML package. */
const COMPRESSED = 'compressed';

/** Why reading through Office.js failed. */
export class OfficeReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeReadError';
  }
}

/** A callback-style Common API call, as a promise. */
function call<T>(start: (callback: (result: OfficeAsyncResult<T>) => void) => void, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    start((result) => {
      if (result.status === 'succeeded') {
        resolve(result.value);
      } else {
        reject(new OfficeReadError(`${what} failed${result.error?.message === undefined ? '' : `: ${result.error.message}`}`));
      }
    });
  });
}

function sliceBytes(slice: OfficeSlice): Uint8Array {
  return slice.data instanceof ArrayBuffer ? new Uint8Array(slice.data) : Uint8Array.from(slice.data);
}

// Office.js lets an add-in have only so many files open, so the presentation
// is read one read at a time: a read waits for the one before it.
let queue: Promise<unknown> = Promise.resolve();

/**
 * The charts of the presentation PowerPoint has open.
 *
 * @param office - The `Office` namespace, initialized.
 * @returns The charts, slide by slide.
 * @throws {OfficeReadError} When PowerPoint cannot hand over the file.
 * @throws {import('./zip').ZipError} When the file cannot be read.
 */
export function readPowerPointCharts(office: OfficeAppHost): Promise<OfficeChart[]> {
  const read = async (): Promise<OfficeChart[]> => {
    const document = office.context?.document;
    const getFile = document?.getFileAsync;
    if (document === undefined || getFile === undefined) {
      throw new OfficeReadError('this PowerPoint cannot hand its file to add-ins (no Document.getFileAsync).');
    }
    const sliceSize = office.context?.platform === 'iOS' ? IPAD_SLICE_SIZE : SLICE_SIZE;
    const file = await call<OfficeFile>(callback => getFile.call(document, COMPRESSED, { sliceSize }, callback), 'Document.getFileAsync');
    try {
      const source = slicedSource(file.size, sliceSize, async index =>
        sliceBytes(await call<OfficeSlice>(callback => file.getSliceAsync(index, callback), 'File.getSliceAsync')));
      return await readPresentationCharts(await openZip(source));
    } finally {
      file.closeAsync();
    }
  };
  const result = queue.then(read, read);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * The chart selected in PowerPoint, among the charts read: on the selected
 * slide, the selected shape, by its id or else its name.
 *
 * @param powerpoint - The `PowerPoint` namespace (PowerPointApi 1.5).
 * @param charts - The presentation's charts, as read.
 * @returns The selected chart's id; `null` when no chart is selected, and
 * `undefined` when a chart is selected that the reading does not have -- one
 * added since.
 */
export async function selectedPowerPointChart(
  powerpoint: PowerPointHost,
  charts: readonly OfficeChart[],
): Promise<string | null | undefined> {
  return powerpoint.run(async (context) => {
    const slides = context.presentation.slides;
    const selectedSlides = context.presentation.getSelectedSlides();
    const shapes = context.presentation.getSelectedShapes();
    slides.load('items/id');
    selectedSlides.load('items/id');
    shapes.load('items/id,items/name,items/type');
    await context.sync();
    const slide = selectedSlides.items[0];
    if (slide === undefined || shapes.items.length !== 1) {
      return null;
    }
    // By position: the file and Office.js need not write a slide's id alike.
    const position = slides.items.findIndex(one => one.id === slide.id) + 1;
    const shape = shapes.items[0];
    const onSlide = charts.filter(chart => chart.position === position);
    const byId = onSlide.find(chart => chart.shapeId !== undefined && (shape.id === chart.shapeId || shape.id.endsWith(`#${chart.shapeId}`)));
    const found = byId ?? onSlide.find(chart => chart.name === shape.name);
    if (found !== undefined) {
      return found.id;
    }
    return shape.type === 'Chart' ? undefined : null;
  });
}

/**
 * The charts of the document Word has open.
 *
 * @param word - The `Word` namespace (WordApi 1.1).
 * @returns The charts, in reading order.
 */
export async function readWordCharts(word: WordHost): Promise<OfficeChart[]> {
  const text = await word.run(async (context) => {
    const ooxml = context.document.body.getOoxml();
    await context.sync();
    return ooxml.value;
  });
  return readDocumentCharts(text);
}

/**
 * The chart selected in Word, read from the selection itself, so it is read
 * as it is now, edits included.
 *
 * @param word - The `Word` namespace (WordApi 1.1).
 * @returns The first chart in the selection, or `null` when there is none.
 */
export async function selectedWordChart(word: WordHost): Promise<OfficeChart | null> {
  const text = await word.run(async (context) => {
    const ooxml = context.document.getSelection().getOoxml();
    await context.sync();
    return ooxml.value;
  });
  return (await readDocumentCharts(text))[0] ?? null;
}

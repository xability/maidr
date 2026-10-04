/**
 * Microsoft Office adapter for MAIDR: PowerPoint and Word.
 *
 * Reads the charts of a PowerPoint presentation or a Word document -- which
 * Office.js has no API for -- from the file itself, and mounts MAIDR's
 * accessible layer for them in an Office add-in's task pane: audio
 * sonification, text descriptions, braille output and keyboard navigation.
 * A chart is read from the values Office cached in it, into the snapshot the
 * Excel adapter converts, so every chart type the Excel adapter reads is read
 * here too.
 *
 * - {@link bindOffice} is what an add-in for all three applications calls,
 *   once, from `Office.onReady`: Excel's pane, or PowerPoint's, or Word's.
 * - {@link bindPowerPoint} and {@link bindWord} mount one application's pane.
 * - {@link readPowerPointCharts} and {@link readWordCharts} are the reads
 *   underneath, and {@link readChartPart} and {@link readChartExPart} read
 *   one chart part, for a pane that mounts MAIDR itself.
 *
 * @packageDocumentation
 */

export { bindPowerPoint, bindWord, DEFAULT_OFFICE_LABELS } from './binder';
export type {
  OfficeBinding,
  OfficeBindOptions,
  OfficeChartInfo,
  OfficeDocumentHostName,
  OfficePaneLabels,
} from './binder';
export { bindOffice } from './bindOffice';
export type { OfficeAddinBinding, OfficeAddinOptions } from './bindOffice';
export { readChartPart } from './chart';
export { readChartExPart } from './chartex';
export type { OfficeChart } from './package';
export { OfficeReadError, readPowerPointCharts, readWordCharts } from './reader';
export type {
  OfficeAppHost,
  OfficeAsyncResult,
  OfficeClientResult,
  OfficeCollection,
  OfficeDocument,
  OfficeFile,
  OfficeReadyInfo,
  OfficeSlice,
  PowerPointHost,
  PowerPointRequestContext,
  PowerPointShape,
  PowerPointSlide,
  WordHost,
  WordRange,
  WordRequestContext,
} from './types';
export { ZipError } from './zip';

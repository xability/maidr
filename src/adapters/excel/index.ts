/**
 * Microsoft Excel adapter for MAIDR.
 *
 * Reads a chart drawn natively in an Excel workbook through Office.js, and
 * mounts MAIDR's accessible layer for it -- audio sonification, text
 * descriptions, braille output and keyboard navigation -- in an Office
 * add-in's task pane.
 *
 * - {@link bindExcel} is what a task pane calls: once, from `Office.onReady`.
 * - {@link readExcelChart} and {@link convertExcelChart} are the read and the
 *   pure conversion underneath it, for a pane that mounts MAIDR itself.
 *
 * The adapter has no dependency on Office.js or its type declarations: the
 * `Excel` and `Office` objects the page loads are read structurally, so any
 * Office.js version is accepted as it is.
 *
 * @packageDocumentation
 */

export { bindExcel, DEFAULT_EXCEL_LABELS } from './binder';
export type { ExcelBinding, ExcelBindOptions, ExcelPaneLabels } from './binder';
export { convertExcelChart, excelChartTypeName, isSupportedExcelChartType } from './converter';
export { listExcelCharts, readExcelChart } from './reader';
export type { ExcelReadOptions } from './reader';
export type {
  ExcelAxisSnapshot,
  ExcelBinOptionsSnapshot,
  ExcelChart,
  ExcelChartActivatedEvent,
  ExcelChartAxes,
  ExcelChartAxis,
  ExcelChartBinOptions,
  ExcelChartBoxwhiskerOptions,
  ExcelChartCollection,
  ExcelChartInfo,
  ExcelChartSeries,
  ExcelChartSeriesCollection,
  ExcelChartSeriesDimension,
  ExcelChartSnapshot,
  ExcelClientResult,
  ExcelConvertOptions,
  ExcelEventHandlerResult,
  ExcelEventHandlers,
  ExcelHost,
  ExcelLoadable,
  ExcelRange,
  ExcelRequestContext,
  ExcelSeriesSnapshot,
  ExcelTitle,
  ExcelTitleSnapshot,
  ExcelWorkbook,
  ExcelWorksheet,
  ExcelWorksheetAddedEvent,
  ExcelWorksheetCollection,
  OfficeHost,
} from './types';

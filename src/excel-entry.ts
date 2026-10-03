/**
 * Microsoft Excel adapter entry point for MAIDR.
 *
 * Re-exports the adapter's API and exposes it as `window.maidrExcel` for
 * script-tag usage in an add-in's task pane. A task pane built with a bundler
 * imports `maidr/excel` instead; see {@link bindExcel}.
 *
 * @remarks
 * No Office.js dependency, at compile time or at runtime: the `Excel` and
 * `Office` objects the task pane loads from Microsoft's CDN are read
 * structurally.
 *
 * @example
 * ```html
 * <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/excel.js"></script>
 *
 * <main id="maidr"></main>
 *
 * <script>
 *   Office.onReady(() => {
 *     window.maidrExcel.bindExcel(document.getElementById('maidr'));
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

import {
  bindExcel,
  convertExcelChart,
  DEFAULT_EXCEL_LABELS,
  excelChartTypeName,
  isSupportedExcelChartType,
  listExcelCharts,
  readExcelChart,
} from './adapters/excel';

export {
  bindExcel,
  convertExcelChart,
  DEFAULT_EXCEL_LABELS,
  excelChartTypeName,
  isSupportedExcelChartType,
  listExcelCharts,
  readExcelChart,
} from './adapters/excel';
export type {
  ExcelAxisSnapshot,
  ExcelBinding,
  ExcelBindOptions,
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
  ExcelPaneLabels,
  ExcelRange,
  ExcelReadOptions,
  ExcelRequestContext,
  ExcelSeriesSnapshot,
  ExcelTitle,
  ExcelTitleSnapshot,
  ExcelWorkbook,
  ExcelWorksheet,
  ExcelWorksheetAddedEvent,
  ExcelWorksheetCollection,
  OfficeHost,
} from './adapters/excel';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

declare global {
  interface Window {
    maidrExcel?: {
      bindExcel: typeof bindExcel;
      convertExcelChart: typeof convertExcelChart;
      DEFAULT_EXCEL_LABELS: typeof DEFAULT_EXCEL_LABELS;
      excelChartTypeName: typeof excelChartTypeName;
      isSupportedExcelChartType: typeof isSupportedExcelChartType;
      listExcelCharts: typeof listExcelCharts;
      readExcelChart: typeof readExcelChart;
    };
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned: the UMD build has already put every export on this
  // global, and replacing it would drop the ones not named here.
  window.maidrExcel = Object.assign(window.maidrExcel ?? {}, {
    bindExcel,
    convertExcelChart,
    DEFAULT_EXCEL_LABELS,
    excelChartTypeName,
    isSupportedExcelChartType,
    listExcelCharts,
    readExcelChart,
  });
}

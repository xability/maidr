/**
 * Microsoft Office adapter entry point for MAIDR: one bundle for an add-in
 * that runs in Excel, PowerPoint and Word.
 *
 * Re-exports the adapter's API and exposes it as `window.maidrOffice` for
 * script-tag usage in an add-in's task pane. `bindOffice` mounts the pane for
 * whichever application the page is open in -- Excel's charts read live
 * through Office.js, PowerPoint's and Word's read from the file -- so this
 * bundle carries the Excel adapter too. `bindSlideChart` mounts MAIDR in a
 * PowerPoint content add-in instead, on the slide, for the one chart it is
 * linked to. An add-in built with a bundler imports `maidr/office` instead.
 *
 * @remarks
 * No Office.js dependency, at compile time or at runtime: the `Office`,
 * `Excel`, `PowerPoint` and `Word` objects the task pane loads from
 * Microsoft's CDN are read structurally.
 *
 * @example
 * ```html
 * <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/office.js"></script>
 *
 * <main id="maidr"></main>
 *
 * <script>
 *   Office.onReady(() => {
 *     window.maidrOffice.bindOffice(document.getElementById('maidr'));
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

import { bindExcel, convertExcelChart } from './adapters/excel';
import {
  bindOffice,
  bindPowerPoint,
  bindSlideChart,
  bindWord,
  DEFAULT_OFFICE_LABELS,
  DEFAULT_SLIDE_CHART_LABELS,
  readChartExPart,
  readChartPart,
  readPowerPointCharts,
  readWordCharts,
} from './adapters/office';

export { bindExcel, convertExcelChart } from './adapters/excel';
export type { ExcelBinding, ExcelBindOptions, ExcelChartSnapshot, ExcelPaneLabels } from './adapters/excel';
export {
  bindOffice,
  bindPowerPoint,
  bindSlideChart,
  bindWord,
  DEFAULT_OFFICE_LABELS,
  DEFAULT_SLIDE_CHART_LABELS,
  OfficeReadError,
  readChartExPart,
  readChartPart,
  readPowerPointCharts,
  readWordCharts,
  ZipError,
} from './adapters/office';
export type {
  OfficeAddinBinding,
  OfficeAddinOptions,
  OfficeAppHost,
  OfficeAsyncResult,
  OfficeBinding,
  OfficeBindOptions,
  OfficeChart,
  OfficeChartInfo,
  OfficeClientResult,
  OfficeCollection,
  OfficeDocument,
  OfficeDocumentHostName,
  OfficeEventArgs,
  OfficeFile,
  OfficePaneLabels,
  OfficeReadyInfo,
  OfficeSettings,
  OfficeSlice,
  OfficeSlideRange,
  OfficeSlideRangeSlide,
  PowerPointHost,
  PowerPointRequestContext,
  PowerPointShape,
  PowerPointSlide,
  SlideChartBinding,
  SlideChartLabels,
  SlideChartLink,
  SlideChartOptions,
  SlideChartView,
  WordHost,
  WordRange,
  WordRequestContext,
} from './adapters/office';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

declare global {
  interface Window {
    maidrOffice?: {
      bindExcel: typeof bindExcel;
      bindOffice: typeof bindOffice;
      bindPowerPoint: typeof bindPowerPoint;
      bindSlideChart: typeof bindSlideChart;
      bindWord: typeof bindWord;
      convertExcelChart: typeof convertExcelChart;
      DEFAULT_OFFICE_LABELS: typeof DEFAULT_OFFICE_LABELS;
      DEFAULT_SLIDE_CHART_LABELS: typeof DEFAULT_SLIDE_CHART_LABELS;
      readChartExPart: typeof readChartExPart;
      readChartPart: typeof readChartPart;
      readPowerPointCharts: typeof readPowerPointCharts;
      readWordCharts: typeof readWordCharts;
    };
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned: the UMD build has already put every export on this
  // global, and replacing it would drop the ones not named here.
  window.maidrOffice = Object.assign(window.maidrOffice ?? {}, {
    bindExcel,
    bindOffice,
    bindPowerPoint,
    bindSlideChart,
    bindWord,
    convertExcelChart,
    DEFAULT_OFFICE_LABELS,
    DEFAULT_SLIDE_CHART_LABELS,
    readChartExPart,
    readChartPart,
    readPowerPointCharts,
    readWordCharts,
  });
}

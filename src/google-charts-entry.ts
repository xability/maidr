/**
 * Google Charts adapter entry point for MAIDR.
 *
 * This module re-exports the Google Charts adapter API and exposes it globally
 * for script-tag usage. For detailed documentation and examples, see
 * {@link createMaidrFromGoogleChart} in the converters module.
 *
 * @packageDocumentation
 */
import {
  createMaidrFromGoogleChart,
  createMaidrFromGoogleCharts,
  whenGoogleChartsReady,
} from './adapters/google-charts/converters';

export {
  createMaidrFromGoogleChart,
  createMaidrFromGoogleCharts,
  type GoogleChartAdapterOptions,
  type GoogleChartPanel,
  type GoogleChartsGridOptions,
  whenGoogleChartsReady,
} from './adapters/google-charts/converters';

// Expose Google Charts adapter globally for script-tag usage (UMD build)
// Only runs in browser environments (not SSR/Node.js)
declare global {
  interface Window {
    maidrGoogleCharts?: {
      createMaidrFromGoogleChart: typeof createMaidrFromGoogleChart;
      createMaidrFromGoogleCharts: typeof createMaidrFromGoogleCharts;
      whenGoogleChartsReady: typeof whenGoogleChartsReady;
    };
  }
}

if (typeof window !== 'undefined') {
  window.maidrGoogleCharts = {
    createMaidrFromGoogleChart,
    createMaidrFromGoogleCharts,
    whenGoogleChartsReady,
  };
}

export type {
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
  GoogleEvents,
  GoogleSelectionItem,
} from './adapters/google-charts/types';

// Re-export core types that consumers may need alongside the adapter
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

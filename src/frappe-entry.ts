/**
 * Frappe Charts adapter entry point for MAIDR.
 *
 * This module re-exports the Frappe Charts adapter API and exposes it globally
 * for script-tag usage. For detailed documentation and examples, see
 * {@link createMaidrFromFrappeChart} in the converters module.
 *
 * @packageDocumentation
 */
import { createMaidrFromFrappeChart, createMaidrFromFrappeCharts } from './adapters/frappe/converters';

export {
  createMaidrFromFrappeChart,
  createMaidrFromFrappeCharts,
  type FrappeChartAdapterOptions,
  type FrappeChartsGridOptions,
} from './adapters/frappe/converters';

// Expose Frappe adapter globally for script-tag usage (UMD build).
// Only runs in browser environments (not SSR/Node.js).
declare global {
  interface Window {
    maidrFrappe?: {
      createMaidrFromFrappeChart: typeof createMaidrFromFrappeChart;
      createMaidrFromFrappeCharts: typeof createMaidrFromFrappeCharts;
    };
  }
}

if (typeof window !== 'undefined') {
  window.maidrFrappe = {
    createMaidrFromFrappeChart,
    createMaidrFromFrappeCharts,
  };
}

export type {
  FrappeChart,
  FrappeChartType,
  FrappeData,
  FrappeDataset,
  FrappePanel,
} from './adapters/frappe/types';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

/**
 * ApexCharts adapter entry point for MAIDR.
 *
 * This module re-exports the ApexCharts adapter API and exposes it globally
 * as `maidrApexCharts` for script-tag usage. For detailed documentation and
 * examples, see {@link bindApexCharts} and {@link apexchartsToMaidr}.
 *
 * @packageDocumentation
 */
import { apexchartsToMaidr, bindApexCharts, removeSplitParts } from './adapters/apexcharts';

export {
  type ApexChartsAdapterOptions,
  type ApexChartsBinding,
  type ApexChartsInstance,
  apexchartsToMaidr,
  bindApexCharts,
  removeSplitParts,
} from './adapters/apexcharts';

// Expose the ApexCharts adapter globally for script-tag usage. The UMD build
// sets the same global itself; this also covers the ESM build loaded with a
// plain <script type="module">. Only runs in browser environments.
declare global {
  interface Window {
    maidrApexCharts?: {
      apexchartsToMaidr: typeof apexchartsToMaidr;
      bindApexCharts: typeof bindApexCharts;
      removeSplitParts: typeof removeSplitParts;
    };
  }
}

if (typeof window !== 'undefined') {
  window.maidrApexCharts = {
    apexchartsToMaidr,
    bindApexCharts,
    removeSplitParts,
  };
}

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

/**
 * Power BI adapter entry point for MAIDR.
 *
 * Re-exports the adapter's API and exposes it as `window.maidrPowerBI` for
 * script-tag usage. A Power BI custom visual imports it as an ES module
 * instead; see {@link bindPowerBI}.
 *
 * @remarks
 * No `powerbi-visuals-api` dependency, at compile time or at runtime: the data
 * view a visual receives is read structurally.
 *
 * @example
 * ```ts
 * import { bindPowerBI } from 'maidr/powerbi';
 *
 * // In the visual's constructor:
 * this.maidr = bindPowerBI(options.element, { chartType: 'line', title: 'Sales' });
 * // In update():
 * this.maidr.update(options.dataViews?.[0]);
 * // In destroy():
 * this.maidr.dispose();
 * ```
 *
 * @packageDocumentation
 */

import { bindPowerBI, convertPowerBIDataView, resolvePowerBIDataPoints } from './adapters/powerbi';

export { bindPowerBI, convertPowerBIDataView, resolvePowerBIDataPoints } from './adapters/powerbi';
export type {
  PowerBIAdapterOptions,
  PowerBIBarMode,
  PowerBIBinding,
  PowerBIBindOptions,
  PowerBICategorical,
  PowerBICategoryColumn,
  PowerBIChartType,
  PowerBIConversion,
  PowerBIDataPointRef,
  PowerBIDataView,
  PowerBIMetadataColumn,
  PowerBINavigateInfo,
  PowerBIPrimitiveValue,
  PowerBIRoleNames,
  PowerBITable,
  PowerBIValueColumn,
  PowerBIValueColumns,
  PowerBIValueTypeDescriptor,
} from './adapters/powerbi';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

declare global {
  interface Window {
    maidrPowerBI?: {
      bindPowerBI: typeof bindPowerBI;
      convertPowerBIDataView: typeof convertPowerBIDataView;
      resolvePowerBIDataPoints: typeof resolvePowerBIDataPoints;
    };
  }
}

if (typeof window !== 'undefined') {
  // Merged, not assigned: the UMD build has already put every export on this
  // global, and replacing it would drop the ones not named here.
  window.maidrPowerBI = Object.assign(window.maidrPowerBI ?? {}, {
    bindPowerBI,
    convertPowerBIDataView,
    resolvePowerBIDataPoints,
  });
}

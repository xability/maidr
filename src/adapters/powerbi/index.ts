/**
 * Power BI adapter for MAIDR.
 *
 * Turns the `DataView` a Power BI custom visual receives into a MAIDR figure,
 * and mounts MAIDR's accessible layer — audio sonification, text descriptions,
 * braille output and keyboard navigation — inside the visual.
 *
 * - {@link bindPowerBI} is what a custom visual calls: bind once in the
 *   constructor, `update()` with each data view, `dispose()` on destroy.
 * - {@link convertPowerBIDataView} is the pure conversion underneath it, for a
 *   visual that mounts MAIDR itself.
 *
 * The adapter has no dependency on `powerbi-visuals-api`: the data view is
 * read structurally, so any SDK version's `DataView` is accepted as it is.
 *
 * @packageDocumentation
 */

export { bindPowerBI } from './binder';
export type { PowerBIBinding, PowerBIBindOptions } from './binder';
export { convertPowerBIDataView, resolvePowerBIDataPoints } from './converter';
export type { PowerBIConversion, PowerBINavigateInfo } from './converter';
export type {
  PowerBIAdapterOptions,
  PowerBIBarMode,
  PowerBICategorical,
  PowerBICategoryColumn,
  PowerBIChartType,
  PowerBIDataPointRef,
  PowerBIDataView,
  PowerBIMetadataColumn,
  PowerBIPrimitiveValue,
  PowerBIRoleNames,
  PowerBITable,
  PowerBIValueColumn,
  PowerBIValueColumns,
  PowerBIValueTypeDescriptor,
} from './types';

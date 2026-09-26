/**
 * Nivo adapter for MAIDR.
 *
 * Provides the `<MaidrNivo>` wrapper component, a `useNivoAdapter` hook and a
 * pure `nivoToMaidr` converter that turn `@nivo/*` chart props into MAIDR's
 * accessible format for audio sonification, text descriptions, braille
 * output, and keyboard navigation.
 *
 * @packageDocumentation
 */

export { extractNivoLayers, nivoToMaidr, toMaidrLayer } from './converters';
export { MaidrNivo } from './MaidrNivo';
export type {
  MaidrNivoProps,
  NivoAdapterConfig,
  NivoChartType,
  NivoLayerData,
  NivoLayerInfo,
  NivoMarks,
} from './types';
export { useNivoAdapter } from './useNivoAdapter';

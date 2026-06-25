/**
 * Victory adapter for MAIDR.
 *
 * Provides the `<MaidrVictory>` wrapper component and a `useVictoryAdapter`
 * hook that convert Victory chart components into MAIDR's accessible format
 * for audio sonification, text descriptions, braille output, and keyboard
 * navigation.
 *
 * @packageDocumentation
 */

export { extractVictoryLayers, toMaidrLayer } from './converters';
export { MaidrVictory } from './MaidrVictory';
export type {
  MaidrVictoryProps,
  VictoryAdapterConfig,
  VictoryComponentType,
  VictoryLayerData,
  VictoryLayerInfo,
} from './types';
export { useVictoryAdapter } from './useVictoryAdapter';

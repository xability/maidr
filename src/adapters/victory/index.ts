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

export { computeSubplotGrid, extractVictoryLayers, extractVictorySubplots, toMaidrLayer } from './converters';
export { MaidrVictory } from './MaidrVictory';
export type {
  MaidrVictoryProps,
  VictoryAdapterConfig,
  VictoryComponentType,
  VictoryLayerData,
  VictoryLayerInfo,
  VictoryPanelLayout,
  VictorySubplotInfo,
} from './types';
export { useVictoryAdapter } from './useVictoryAdapter';

/**
 * Public React API for MAIDR.
 *
 * Provides the `<Maidr>` component for adding accessible, non-visual access to
 * statistical visualizations in React applications. Supports audio sonification,
 * text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Requires React 18 or 19 as a peer dependency.
 *
 * @example
 * ```tsx
 * import { Maidr, type MaidrData } from 'maidr/react';
 *
 * const data: MaidrData = {
 *   id: 'my-chart',
 *   title: 'Sales by Quarter',
 *   subplots: [[{
 *     layers: [{
 *       id: '0',
 *       type: 'bar',
 *       axes: { x: 'Quarter', y: 'Revenue' },
 *       data: [
 *         { x: 'Q1', y: 120 },
 *         { x: 'Q2', y: 200 },
 *       ],
 *     }],
 *   }]],
 * };
 *
 * function MyChart() {
 *   return (
 *     <Maidr data={data}>
 *       <svg>{...}</svg>
 *     </Maidr>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */
export { Maidr, type MaidrProps } from './maidr-component';

/**
 * Re-exported types for constructing the MAIDR data prop.
 * `MaidrData` is the root type passed to `<Maidr data={...}>`.
 */
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';

/**
 * Re-exported enums for specifying plot trace types and orientations.
 */
export { Orientation, TraceType } from './type/grammar';

/**
 * Vega-Lite adapter for MAIDR.
 *
 * Provides utilities to convert a Vega-Lite specification (and optionally
 * its compiled Vega view) into MAIDR's accessible format for audio
 * sonification, text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Vega-Lite renders asynchronously via `vegaEmbed()`. The adapter must be
 * called **after** `vegaEmbed()` resolves, so that the SVG and the compiled
 * view are both available.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
 * <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
 * <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
 * <script src="maidr.js"></script>
 * <script src="maidr/dist/vegalite.js"></script>
 * <script>
 *   const spec = {
 *     data: { values: [{ a: 'A', b: 28 }, { a: 'B', b: 55 }] },
 *     mark: 'bar',
 *     encoding: {
 *       x: { field: 'a', type: 'nominal' },
 *       y: { field: 'b', type: 'quantitative' },
 *     },
 *   };
 *   vegaEmbed('#chart', spec).then((result) => {
 *     maidrVegaLite.bindVegaLite(result.view, spec);
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export {
  vegaLiteToMaidr,
} from './converters';

export type {
  VegaLiteChannelDef,
  VegaLiteEncoding,
  VegaLiteSpec,
  VegaLiteToMaidrOptions,
  VegaView,
} from './types';

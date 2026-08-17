/**
 * Tableau integration for MAIDR.
 *
 * Makes an embedded Tableau view — a single worksheet or a whole dashboard —
 * available non-visually through audio sonification, text descriptions, braille
 * output and keyboard navigation, and mirrors MAIDR's cursor back into the view
 * as a Tableau mark selection.
 *
 * @remarks
 * The Tableau Embedding API v3 library is loaded by the host page, exactly as
 * Tableau documents; this module takes **no dependency on any `@tableau/*`
 * package** and only duck-types the live `<tableau-viz>` element. `react` and
 * `react-dom` are bundled, since the accessible figure is a React tree mounted
 * beside the viz.
 *
 * One worksheet becomes one MAIDR subplot, in dashboard add-order — the order
 * Tableau documents a screen reader as narrating a dashboard in. Filter,
 * parameter and data-source changes re-read the worksheets automatically.
 *
 * @example
 * ```html
 * <script type="module"
 *   src="https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js"></script>
 * <tableau-viz id="viz" src="https://public.tableau.com/views/Book/Sheet"></tableau-viz>
 *
 * <script type="module">
 *   import { bindTableau } from 'maidr/tableau';
 *
 *   const viz = document.getElementById('viz');
 *   const binding = await bindTableau(viz, {
 *     title: 'Sales by region',
 *     overrides: { 'Sales by Region': { traceType: 'bar' } },
 *   });
 *
 *   // later, when the page tears the view down:
 *   binding?.dispose();
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export { bindTableau } from './binder';
export type { TableauBinding } from './binder';
export { extractTableau } from './extractor';
export type { SelectionIndex, TableauExtraction } from './extractor';
export type {
  TableauAdapterOptions,
  TableauColumn,
  TableauDataType,
  TableauSelectionCriteria,
  TableauViz,
  TableauWorksheet,
  TableauWorksheetOverride,
  WorksheetSnapshot,
} from './types';

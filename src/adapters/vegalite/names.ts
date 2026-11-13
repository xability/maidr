/**
 * The names Vega-Lite compiles a spec's views under.
 *
 * Every view of a compiled spec has a name, and that name names what the view
 * compiles to: its marks (`<name>_marks`), the group a concat child or a
 * repeated cell is drawn in (`<name>_group`), a facet's cells (`<name>_cell`),
 * the scales the view owns (`<name>_y`), and the views inside it. A view that
 * declares a `name` is named by it alone, wherever it sits. Any other view is
 * named by its parent: the top level has the empty name, a layer is
 * `layer_<i>` after its parent's name, a concat child `concat_<i>`, a facet's
 * child `child`, and a repeated cell is named by its fields (see
 * {@link repeatCellName}). Inside a repeated cell, a view that declares a
 * name has the cell's name put before its own. Every name passes through
 * `varName`.
 *
 * A declared name therefore changes every name below it. Altair 6.1 names the
 * view of a compound chart that carries its selection (`view_<hash>_<n>`), so
 * the points of `alt.layer(points.interactive(), line)` are drawn under
 * `view_<hash>_0_marks`, not `layer_0_marks`.
 *
 * Measured on vega-lite 5.23.0 and 6.5.0, which compile the same names: they
 * come from `Model.getName`, `buildModel` and the normalizers for repeats and
 * path overlays.
 */

import type { RepeatCellMapping } from './facets';
import type { VegaLiteSpec } from './types';

/**
 * Vega-Lite's `varName`: every non-word character as `_`, and a `_` before a
 * leading digit.
 *
 * @param name - A name
 * @returns It, as Vega-Lite writes it into a compiled spec
 */
export function varName(name: string): string {
  return (/^\d/.test(name) ? '_' : '') + name.replace(/\W/g, '_');
}

/**
 * The name a view gives a thing of its own, as Vega-Lite's `getName` does:
 * the view's name, then the thing's.
 *
 * @param view - The view's compiled name, `''` at the top level
 * @param part - What is named: `marks`, `group`, `cell`, `pathgroup`, a
 * scale's channel, or a composite mark's part (`layer_0_marks`)
 * @returns The compiled name
 */
export function compiledName(view: string, part: string): string {
  return varName(view ? `${view}_${part}` : part);
}

/**
 * A view's compiled name: the name it declares, else its parent's name and
 * the step to it, `layer_<i>`, `concat_<i>` or `child`.
 *
 * @param spec - The view
 * @param parent - Its parent's compiled name, `''` at the top level
 * @param step - The step from its parent to it, `''` for the top level itself
 * @param cell - The repeated cell it is drawn in, whose name a declared one
 * takes after it
 * @returns Its compiled name
 */
export function viewName(spec: Pick<VegaLiteSpec, 'name'>, parent: string, step: string, cell?: string): string {
  if (spec.name == null)
    return step ? compiledName(parent, step) : parent;
  return varName(cell && spec.name ? `${cell}_${spec.name}` : spec.name);
}

/**
 * The views a unit view's own marks are compiled as: the view itself, then the
 * path Vega-Lite draws one level down when it lays points or a line over a
 * line or an area (`normalize/pathoverlay`), whose marks are `<view>_marks`
 * and, split into series, inside `<view>_pathgroup`.
 *
 * The overlay makes the view a layer of its path and the overlay. The path
 * keeps the name the view declares, so a view with a name of its own draws
 * its path under that name either way; any other's path is the overlay's
 * first layer, `<view>_layer_0`.
 *
 * @param spec - The view
 * @param view - Its compiled name
 * @returns The views, the view itself first
 */
export function markViews(spec: Pick<VegaLiteSpec, 'name'>, view: string): string[] {
  return spec.name == null ? [view, compiledName(view, 'layer_0')] : [view];
}

/** The marks Vega-Lite can lay points or a line over. */
const OVERLAID_MARKS = new Set(['line', 'rule', 'trail', 'area']);

/**
 * Whether Vega-Lite lays points or a line over a unit view's mark, which
 * makes the view a layer of its path and the overlay, named as the view
 * would be had it declared no name (vega-lite `normalize/pathoverlay`,
 * `hasMatchingType`): points over a line, a rule, a trail or an area that
 * asks for them in its mark def, in the chart's config for its mark, or by
 * binding `shape`, and a line along an area that asks for one either way.
 *
 * Read from the spec alone: a config handed to `vegaEmbed` itself is not
 * seen.
 *
 * @param spec - The view
 * @param config - The chart's config
 * @returns True when the view is drawn with an overlay
 */
export function drawsPathOverlay(spec: VegaLiteSpec, config: VegaLiteSpec['config']): boolean {
  const def = typeof spec.mark === 'string' ? { type: spec.mark } : spec.mark;
  if (!def || !OVERLAID_MARKS.has(def.type))
    return false;
  const markConfig = config?.[def.type];
  const configured = (key: 'point' | 'line'): boolean =>
    typeof markConfig === 'object' && markConfig !== null && Boolean((markConfig as Record<string, unknown>)[key]);
  const points = def.point !== undefined ? Boolean(def.point) : configured('point') || spec.encoding?.shape !== undefined;
  if (points)
    return true;
  return def.type === 'area' && (def.line !== undefined ? Boolean(def.line) : configured('line'));
}

/**
 * The compiled name of one cell of a repeat: `child__` and the cell's fields,
 * after the repeated spec's own name where it declares one --
 * `child__row_<r>column_<c>`, `child__row_<r>`, `child__column_<c>` or
 * `child__<f>`.
 *
 * @param spec - The repeated spec
 * @param cell - The cell's fields
 * @returns The cell's compiled name
 */
export function repeatCellName(spec: Pick<VegaLiteSpec, 'name'>, cell: RepeatCellMapping): string {
  const fields = cell.row !== undefined || cell.column !== undefined
    ? `${cell.row !== undefined ? `row_${varName(cell.row)}` : ''}${cell.column !== undefined ? `column_${varName(cell.column)}` : ''}`
    : varName(cell.repeat ?? '');
  return varName(`${spec.name ? `${spec.name}_` : ''}child__${fields}`);
}

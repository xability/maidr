/**
 * D3 binder for hexbin density plots.
 *
 * The `d3-hexbin` plugin answers an overplotted scatter by binning the points
 * into hexagons: `hexbin(points)` returns one bin per **occupied** hexagon, and
 * each bin is an array of the points that fell in it carrying `.x` and `.y`
 * (the hexagon's centre) and `.length` (the count). So the default accessors
 * read exactly that, and a chart drawn any other way only has to say where its
 * three numbers live.
 *
 * Two things make this more than a scatter binder.
 *
 * **The centres come out in screen space.** `d3-hexbin` bins the projected
 * points, so `bin.x` is a pixel. `x`/`y` are where the inverse scales go
 * (`x: d => xScale.invert(d.x)`); passed through unchanged, every bin would
 * announce its position in pixels.
 *
 * **The lattice is the binder's own work.** `HexbinTrace` navigates rows of
 * bins, and the DOM is a flat list in generation order with the empty bins
 * simply absent from it. So the rows are assembled here — grouped by the bins'
 * `y`, ordered from the lowest upward, each row ordered left to right — and
 * the highlight selectors are stamped in that order rather than left to
 * resolve in the order the hexagons happen to be drawn.
 */

import type { HexbinPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3HexbinConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector, stampOrderedSelectors } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/** Attribute the binder stamps on each hexagon to key its highlight. */
const BIN_ATTRIBUTE = 'data-maidr-hexbin-index';

/**
 * How many significant digits a `y` centre is compared on when grouping bins
 * into lattice rows.
 *
 * Every bin in a hex row is placed by the same arithmetic on the same row
 * number, so their `y` centres come out bit-identical and an exact comparison
 * would do — until an inverse scale is applied, where the last digit or two of
 * a `double` can differ. Twelve digits is far beyond any real lattice's
 * spacing and well inside that noise.
 */
const ROW_PRECISION = 12;

/**
 * Reads one of a bin's three numbers, refusing anything non-finite.
 *
 * @param datum - The bin
 * @param accessor - The accessor for this number
 * @param field - Which number, for the error message
 * @param index - The bin's index within the selection
 * @returns The number
 * @throws Error when the bin carries no finite value for it
 */
function readNumber(
  datum: unknown,
  accessor: DataAccessor<number>,
  field: 'x' | 'y' | 'count',
  index: number,
): number {
  const raw = resolveAccessorOptional<number>(datum, accessor, index);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `The bin at index ${index} has no ${field}: the \`${field}\` accessor `
      + `resolved to ${String(raw)}. A \`d3-hexbin\` bin carries its centre as `
      + `\`.x\`/\`.y\` and its count as \`.length\`, in SCREEN space — pass the `
      + `inverse scales, e.g. \`x: d => xScale.invert(d.x)\`.`,
    );
  }
  return value;
}

/**
 * Binds a D3.js hexbin density plot to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the hexagons — one per bin — and give `x` and `y` the
 * inverse scales, so the bins announce their centres on the chart's own axes
 * rather than in pixels. `count` defaults to a bin's `length`, which is what
 * `d3-hexbin` gives it.
 *
 * The lattice rows are assembled from the emitted data rather than assumed:
 * an empty bin is not drawn, so the rows do not all hold the same number of
 * bins and no rectangular grid could be laid over them.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 hexbin plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Hexbin(svgElement, {
 *   selector: 'path.hexagon',
 *   title: 'Point Density',
 *   axes: { x: 'Carat', y: 'Price', fill: 'Count' },
 *   x: d => xScale.invert(d.x),
 *   y: d => yScale.invert(d.y),
 * });
 * ```
 */
export function bindD3Hexbin(svg: Element, config: D3HexbinConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildHexbinLayer(svg, config));
}

/**
 * Pure extraction core for hexbin plots. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildHexbinLayer(
  root: Element,
  config: D3HexbinConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector, row: rowAccessor } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'hexagon');
  }

  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<number>(config, 'x', 'x', ['x0', 'cx'], firstDatum);
  const yAccessor = inferAccessor<number>(config, 'y', 'y', ['y0', 'cy'], firstDatum);
  const countAccessor = inferAccessor<number>(
    config,
    'count',
    'count',
    ['length', 'value', 'n', 'total'],
    firstDatum,
  );

  // One entry per bin, keyed by the lattice row it belongs to. The row is kept
  // as a number wherever possible so the rows can be ordered from the bottom
  // up, which is the direction `HexbinTrace` steps its row index in.
  const bins: { key: string; order: number; point: HexbinPoint; element: Element }[] = [];

  for (const { element, datum, index } of elements) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const x = readNumber(datum, xAccessor, 'x', index);
    const y = readNumber(datum, yAccessor, 'y', index);
    const count = readNumber(datum, countAccessor, 'count', index);

    const declared = rowAccessor === undefined
      ? undefined
      : resolveAccessor<number | string>(datum, rowAccessor, index);
    const order = declared === undefined ? y : Number(declared);

    bins.push({
      key: declared === undefined ? y.toPrecision(ROW_PRECISION) : String(declared),
      // A row named by something that is not a number keeps its first-seen
      // position rather than sorting to the front as `NaN` would.
      order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
      point: { x, y, count },
      element,
    });
  }

  const rows = groupIntoRows(bins);

  const data: HexbinPoint[][] = rows.map(row => row.map(bin => bin.point));
  const ordered = rows.flat().map(bin => bin.element);

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.HEXBIN,
    title,
    // One selector per bin, in the payload's lattice order. `HexbinTrace`
    // resolves the selectors to a flat list and slices it row by row, and a
    // bare selector would resolve in the order the hexagons were drawn —
    // which is the order `d3-hexbin` generated the bins in, not the lattice's.
    // The count would still match, so nothing would detect it.
    selectors: ordered.length > 1
      ? stampOrderedSelectors(root, selector, BIN_ATTRIBUTE, ordered, panel)
      : scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}

/**
 * Assembles the lattice: bins grouped into rows, rows ordered from the lowest
 * upward, each row ordered left to right.
 *
 * `HexbinTrace` steps its row index up for `UPWARD`, so row 0 has to be the
 * bottom of the chart; within a row the column index *is* the position, so the
 * bins have to be in x order for a sideways move to walk the lattice rather
 * than the order the plugin happened to emit.
 *
 * @param bins - Every bin, with the row key and ordinal it was read with
 * @returns The lattice, rows outermost
 */
function groupIntoRows<T extends { key: string; order: number; point: HexbinPoint }>(
  bins: T[],
): T[][] {
  const rows = new Map<string, T[]>();
  const order = new Map<string, number>();

  for (const bin of bins) {
    const row = rows.get(bin.key);
    if (row === undefined) {
      rows.set(bin.key, [bin]);
      order.set(bin.key, bin.order);
    } else {
      row.push(bin);
    }
  }

  return Array.from(rows.entries())
    .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map(([, row]) => row.sort((a, b) => Number(a.point.x) - Number(b.point.x)));
}

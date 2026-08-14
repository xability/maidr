/**
 * D3 binder for contour plots.
 *
 * `d3.contours()` and `d3.contourDensity()` emit one GeoJSON `MultiPolygon`
 * per threshold, carrying the threshold as `.value` and the curves as
 * `.coordinates`, and a chart draws one `<path>` per one of those. So the
 * layer's rows are the levels, which is structurally the multi-line layer
 * `binders/line.ts` builds — with the level carried on every point of its
 * curve, because that is where the grammar has room for it and because
 * `ContourTrace` announces it as the field's own value rather than as a series
 * name.
 *
 * **The coordinates are not in data space.** `d3.contours()` walks a grid and
 * emits grid indices; `d3.contourDensity()` bins projected points and emits
 * pixels. Neither is a position on an axis, so `x` and `y` are the transforms
 * back — and left out, the chart announces its curves in grid cells or screen
 * pixels, which is wrong in a way that sounds entirely plausible.
 */

import type { ContourPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ContourConfig, D3GridTransform } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessorOptional } from '../util';
import { stampSeriesSelectors } from './line';

/** Passes a coordinate through unchanged, for a chart already in data space. */
const identity: D3GridTransform = coordinate => coordinate;

/**
 * Whether a value is a `[x, y]` coordinate pair.
 *
 * @param value - A candidate entry of a ring
 * @returns True when it is a position
 */
function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && typeof value[0] === 'number';
}

/**
 * Collects a level's rings, whatever nesting its geometry arrived in.
 *
 * A `MultiPolygon` nests polygon, then ring, then position; a `Polygon` nests
 * ring, then position; and a bare ring is just positions. All three are
 * flattened to a list of rings, so the caller does not have to know which of
 * them `d3.contours` handed it.
 *
 * @param coordinates - Whatever the `coordinates` accessor produced
 * @returns Every ring in it, in order
 */
function collectRings(coordinates: unknown): number[][][] {
  if (!Array.isArray(coordinates)) {
    return [];
  }
  if (isPosition(coordinates[0])) {
    return [coordinates as number[][]];
  }
  return coordinates.flatMap(entry => collectRings(entry));
}

/**
 * Binds a D3.js contour plot to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the level paths — one per threshold — and give `x` and
 * `y` the transforms from the grid `d3.contours()` walked back onto the
 * chart's axes (`x: i => x0 + i * dx`), or the inverse scales when the
 * geometry is `d3.contourDensity()`'s pixels (`x: px => xScale.invert(px)`).
 *
 * A level drawn as several disjoint rings is flattened into one curve, in the
 * order the rings appear: a row of the payload is a single polyline. Every
 * point announced is a real point of that level; what a reader cannot hear is
 * the jump from the end of one ring to the start of the next.
 *
 * The rows keep the order the paths were drawn in, which for `d3.contours()`
 * is ascending threshold — the order `ContourTrace` measures the gap to the
 * adjacent* level in, which is how it reports the gradient.
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
 * @param svg - The SVG element containing the D3 contour plot.
 * @param config - Configuration specifying the selector and grid transforms.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const contours = d3.contours().size([n, m])(values);
 * svg.selectAll('path.contour').data(contours).join('path').attr('d', d3.geoPath());
 *
 * const result = bindD3Contour(svgElement, {
 *   selector: 'path.contour',
 *   title: 'Density Field',
 *   axes: { x: 'X', y: 'Y', fill: 'Density' },
 *   x: column => x0 + column * cellWidth,
 *   y: row => y0 + row * cellHeight,
 * });
 * ```
 */
export function bindD3Contour(svg: Element, config: D3ContourConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildContourLayer(svg, config));
}

/**
 * Pure extraction core for contour plots. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildContourLayer(
  root: Element,
  config: D3ContourConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    coordinates: coordinatesAccessor = 'coordinates',
    x: toX = identity,
    y: toY = identity,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'contour level path');
  }

  const levelAccessor = inferAccessor<number>(
    config,
    'level',
    'value',
    ['level', 'threshold', 'z'],
    elements[0].datum,
  );

  const data: ContourPoint[][] = [];
  const levelPaths: Element[] = [];

  for (const { element, datum, index } of elements) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const raw = resolveAccessorOptional<number>(datum, levelAccessor, index);
    const level = Number(raw);
    const rings = collectRings(resolveAccessorOptional(datum, coordinatesAccessor, index));
    if (rings.length === 0) {
      throw new Error(
        `The level at index ${index} carries no rings: the \`coordinates\` `
        + `accessor resolved to nothing shaped like a GeoJSON geometry. `
        + `\`d3.contours()\` binds a MultiPolygon per threshold — bind those `
        + `objects to the paths, not the \`d\` strings you drew them with.`,
      );
    }

    const curve: ContourPoint[] = [];
    for (const ring of rings) {
      // A GeoJSON ring repeats its first position to close itself. That repeat
      // is geometry, not a sample of the level, and left in it would announce
      // the same place twice at the seam of every ring.
      const positions = closesOnItself(ring) ? ring.slice(0, -1) : ring;
      for (const [gridX, gridY] of positions) {
        const point: ContourPoint = { x: toX(gridX), y: toY(gridY) };
        // Carried on every point of the curve, which is where the grammar has
        // room for it: the trace reads the first one it finds.
        if (Number.isFinite(level)) {
          point.level = level;
        }
        curve.push(point);
      }
    }

    if (curve.length > 0) {
      data.push(curve);
      levelPaths.push(element);
    }
  }

  if (data.length === 0) {
    throw new Error(
      `No contour levels could be read from "${selector}": every matched path `
      + `resolved to an empty set of rings.`,
    );
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.CONTOUR,
    title,
    // One selector per level. `ContourTrace` inherits `LineTrace`'s
    // resolution, which pairs the selector list with the rows one for one, so
    // a bare selector matching every level path withdraws highlighting.
    selectors: levelPaths.length > 1
      ? stampSeriesSelectors(root, selector, levelPaths, data.length, panel)
      : scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}

/**
 * Whether a ring ends where it started, as a GeoJSON ring does.
 *
 * @param ring - One ring of a level's geometry
 * @returns True when the last position repeats the first
 */
function closesOnItself(ring: number[][]): boolean {
  if (ring.length < 2) {
    return false;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

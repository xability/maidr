/**
 * D3 binder for choropleth maps.
 *
 * A choropleth is `d3.geoPath()` over a projection: one `<path>` per region,
 * each bound to the GeoJSON feature it was drawn from. So `selector` matches
 * the region paths, and the two fields a map is read for — the region's name
 * and the value it is shaded by — are read off the feature, whose `properties`
 * is where a joined value and a place name almost always live.
 *
 * **The centroid is the part that has to be given, and the part that is easy
 * to give wrongly.** `ChoroplethPoint.lon`/`lat` are degrees, and degrees are
 * what let the reader arrow north rather than merely to the next row of a
 * list. `d3.geoPath().centroid(feature)` returns the centre in **projected
 * pixels**, so passing it makes the arrows follow the projection's paper
 * layout — inverted north on a south-up projection, and nonsense on an
 * interrupted one. `d3.geoCentroid(feature)` is the call that returns the
 * unprojected pair, and it is what the accessors should read. Coordinates
 * outside the degree ranges are dropped rather than converted by guesswork:
 * the map then reads as a region list in declared order, which is the poorer
 * reading the grammar explicitly sanctions.
 *
 * `neighbors` is not read here. Adjacency is not recoverable from rendered
 * paths, and computing it needs shared-border topology (`topojson.neighbors`)
 * that this repository does not depend on.
 */

import type { ChoroplethPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ChoroplethConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector, stampOrderedSelectors } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessorOptional } from '../util';

/** Attribute the binder stamps on each region to key its highlight. */
const REGION_ATTRIBUTE = 'data-maidr-choropleth-index';

/** Names accepted for the region, after the canonical `region`. */
const REGION_KEYS = ['name', 'NAME', 'name_long', 'admin', 'state', 'id', 'label', 'x'];

/** Names accepted for the shaded value, after the canonical `value`. */
const VALUE_KEYS = ['y', 'rate', 'density', 'count'];

/** How far a longitude may run, in degrees east. */
const LON_LIMIT = 180;

/** How far a latitude may run, in degrees north. */
const LAT_LIMIT = 90;

/**
 * Whether a value can be read as a keyed record.
 *
 * @param value - Anything
 * @returns True when a string accessor can be looked up on it
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A GeoJSON feature's own `properties` bag, when it has one.
 *
 * `d3.geoPath()` binds whole features, and everything a map joins onto one —
 * the place name, the value, a precomputed centroid — is written into
 * `properties` rather than onto the feature itself. So it is the second place
 * every accessor looks.
 *
 * @param datum - The element's D3-bound datum
 * @returns The properties bag, or undefined when the datum has none
 */
function featureProperties(datum: unknown): Record<string, unknown> | undefined {
  if (!isRecord(datum)) {
    return undefined;
  }
  const properties = datum.properties;
  return isRecord(properties) ? properties : undefined;
}

/**
 * The record the field names are inferred against: one feature's own keys and
 * its `properties`, flattened.
 *
 * Used only to ask which names are *present* — which one wins is decided by
 * the order the candidates are tried in, and where it is read from by
 * {@link resolveField}. So the shadowing this flattening implies never
 * decides anything.
 *
 * The feature it samples is the first one carrying a value rather than simply
 * the first one drawn. A map's "no data" regions are drawn like any other and
 * one of them can perfectly well be first, and a feature the join missed
 * names none of the keys the join would have written — so sampling it would
 * leave the whole map unreadable on the strength of one region.
 *
 * The bias is toward a value-bearing feature only, and deliberately not also
 * toward one carrying a region name. `id` is itself a region candidate and
 * every feature `topojson.feature()` emits has one, so a feature that names a
 * value practically always names a region key too — the extra test would
 * qualify the same feature and decide nothing. Ranking the region key across
 * features instead (preferring a `name` some *other* feature carries) would
 * trade this fallback for a hard throw on any map whose odd feature names a
 * key the rest do not, which is the worse failure. Real exports carry uniform
 * `properties` and the question does not arise.
 *
 * @param elements - Every matched region, with its D3-bound datum
 * @returns The names available on the sampled feature
 */
function inferenceSample(elements: { datum: unknown }[]): unknown {
  const candidates = ['value', ...VALUE_KEYS];
  const sampled = elements.find(({ datum }) => {
    const properties = featureProperties(datum);
    return candidates.some(key =>
      (isRecord(datum) && key in datum) || (properties !== undefined && key in properties));
  }) ?? elements[0];

  const { datum } = sampled;
  const properties = featureProperties(datum);
  if (properties === undefined) {
    return datum;
  }
  return { ...(isRecord(datum) ? datum : {}), ...properties };
}

/**
 * Reads one field off a feature.
 *
 * A function accessor is invoked with the feature, which is what a d3 caller
 * expects — `lon: d => d3.geoCentroid(d)[0]` needs the whole feature, not one
 * of its properties. A string names a key on the feature **or** on its
 * `properties`, in that order: a GeoJSON feature keeps only `type`, `id`,
 * `geometry` and `properties` at the top level, so an author writing `'NAME'`
 * can only mean the property, and making them write the path would be
 * ceremony over a shape the format fixes.
 *
 * @param datum - The element's D3-bound datum
 * @param accessor - The accessor for this field
 * @param index - The region's index within the selection
 * @returns The value, or undefined when neither place carries the key
 */
function resolveField<T>(
  datum: unknown,
  accessor: DataAccessor<T>,
  index: number,
): T | undefined {
  if (typeof accessor === 'function') {
    return accessor(datum, index);
  }
  const own = isRecord(datum)
    ? resolveAccessorOptional<T>(datum, accessor, index)
    : undefined;
  if (own !== undefined) {
    return own;
  }
  const properties = featureProperties(datum);
  return properties === undefined
    ? undefined
    : resolveAccessorOptional<T>(properties, accessor, index);
}

/**
 * Coerces a read value to a finite number, or nothing.
 *
 * @param raw - Whatever the accessor resolved
 * @returns The number, or undefined when it is not one
 */
function readFinite(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Binds a D3.js choropleth map to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the region paths — one per feature — and the defaults
 * read the name and the value off the feature's `properties`. Pass `lon` and
 * `lat` as `d3.geoCentroid(d)[0]` / `[1]`: with them the arrow keys move
 * north, south, east and west across the map, and without them the map is
 * read as a region list in the order it was drawn.
 *
 * A region whose value does not resolve is left out of the payload rather
 * than shaded with a zero — a map's "no data" regions are drawn, and
 * announcing one as zero is a number the chart does not contain. Its path is
 * left out of the highlight selectors with it, so the two stay in step.
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
 * @param svg - The SVG element containing the D3 map.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 * @throws Error when the selector matches nothing, when a matched element
 *         carries no D3-bound datum, or when no region resolves a value.
 *
 * @example
 * ```ts
 * svg.selectAll('path.region')
 *   .data(topojson.feature(us, us.objects.states).features)
 *   .join('path')
 *   .attr('d', d3.geoPath(projection));
 *
 * const result = bindD3Choropleth(svgElement, {
 *   selector: 'path.region',
 *   title: 'Unemployment by State',
 *   axes: { x: 'State', y: 'Rate' },
 *   value: d => rateByFips.get(d.id),
 *   lon: d => d3.geoCentroid(d)[0],   // DEGREES — never geoPath().centroid
 *   lat: d => d3.geoCentroid(d)[1],
 * });
 * ```
 */
export function bindD3Choropleth(svg: Element, config: D3ChoroplethConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildChoroplethLayer(svg, config));
}

/**
 * Pure extraction core for choropleth maps. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildChoroplethLayer(
  root: Element,
  config: D3ChoroplethConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'region');
  }

  const sample = inferenceSample(elements);
  const regionAccessor = inferAccessor<string | number>(config, 'region', 'region', REGION_KEYS, sample);
  const valueAccessor = inferAccessor<number>(config, 'value', 'value', VALUE_KEYS, sample);
  const lonAccessor = inferAccessor<number>(config, 'lon', 'lon', ['longitude', 'long'], sample);
  const latAccessor = inferAccessor<number>(config, 'lat', 'lat', ['latitude'], sample);

  const data: ChoroplethPoint[] = [];
  const shaded: Element[] = [];
  let unshaded = 0;
  let projected = 0;

  for (const { element, datum, index } of elements) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const value = readFinite(resolveField<number>(datum, valueAccessor, index));
    if (value === undefined) {
      // A region the join found no row for. It is drawn — in the "no data"
      // colour — but it carries no number, and the grammar has no way to say
      // so: a `y` of 0 would be sonified as the lowest region on the map.
      unshaded += 1;
      continue;
    }

    const name = resolveField<string | number>(datum, regionAccessor, index);
    if (name === undefined || name === null || name === '') {
      throw buildNoRegionError(datum, index, selector);
    }
    const point: ChoroplethPoint = {
      x: typeof name === 'number' ? name : String(name),
      y: value,
    };

    const lon = readFinite(resolveField<number>(datum, lonAccessor, index));
    const lat = readFinite(resolveField<number>(datum, latAccessor, index));
    if (lon !== undefined && lat !== undefined) {
      if (Math.abs(lon) <= LON_LIMIT && Math.abs(lat) <= LAT_LIMIT) {
        // Both or neither: a longitude alone places nothing, and the trace
        // needs the pair on every region before it bands the map at all.
        point.lon = lon;
        point.lat = lat;
      } else {
        projected += 1;
      }
    }

    data.push(point);
    shaded.push(element);
  }

  if (data.length === 0) {
    throw new Error(
      `No region matched by "${selector}" carries a value: the \`value\` `
      + `accessor resolved to nothing on every feature. A choropleth's value `
      + `is usually joined onto the feature's \`properties\` — pass a `
      + `\`value\` accessor naming where it lives, e.g. `
      + `\`value: d => rateById.get(d.id)\`.`,
    );
  }

  warnPartialCentroids(data, selector);
  if (projected > 0) {
    console.warn(
      // Counted against the regions that carried a value, not against every
      // matched path: a region with no value never reached the centroid check.
      `[maidr/d3] Dropped the centroid of ${projected} of the `
      + `${data.length} regions read from "${selector}": it fell outside `
      + `±${LON_LIMIT}° longitude or ±${LAT_LIMIT}° latitude, so it is a `
      + `projected coordinate rather than a geographic one. `
      + `\`d3.geoPath().centroid(d)\` returns pixels; \`d3.geoCentroid(d)\` `
      + `returns the degrees this needs.`,
    );
  }
  if (unshaded > 0) {
    console.warn(
      `[maidr/d3] Left ${unshaded} of the ${elements.length} regions matched `
      + `by "${selector}" out of the choropleth: the \`value\` accessor `
      + `resolved to nothing on them. Regions with no joined value are not `
      + `announced, rather than being announced as zero.`,
    );
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.CHOROPLETH,
    title,
    // One selector per region, in the payload's order. A single selector
    // matching every path would resolve the unshaded regions too, and
    // `ChoroplethTrace` withdraws highlighting entirely when the counts
    // disagree — so on any map with a "no data" region nothing would light up.
    selectors: elements.length === 1
      ? scopeSelector(root, selector, panel)
      : stampOrderedSelectors(root, selector, REGION_ATTRIBUTE, shaded, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}

/**
 * Builds the "this region has no name" error.
 *
 * Every reading of a map is by name — the announcement, the border list, the
 * cluster the description names — so a region the accessor cannot name is a
 * misconfiguration rather than a gap to degrade around. The properties are
 * listed because a GeoJSON feature keeps the name in `properties`, which is
 * where the author needs to look.
 *
 * @param datum - The feature bound to the region's path
 * @param index - Position of the path in the selection
 * @param selector - The user's selector, to locate the map
 * @returns The error to throw
 */
function buildNoRegionError(datum: unknown, index: number, selector: string): Error {
  const properties = featureProperties(datum);
  const available = properties === undefined
    ? isRecord(datum) ? Object.keys(datum).join(', ') : String(datum)
    : Object.keys(properties).join(', ');
  return new Error(
    `The region at index ${index} (matched by "${selector}") has no name: the `
    + `\`region\` accessor resolved to nothing on it. Available properties: `
    + `${available}. Pass a \`region\` accessor naming the property that `
    + `carries the place name.`,
  );
}

/**
 * Says so when only some of the regions came out placed.
 *
 * `ChoroplethTrace` bands the map only when every region carries a centroid,
 * so a map that resolves them for most of its regions and not the rest is
 * read as a plain list — the spatial reading is lost, and nothing else on the
 * page says why.
 *
 * @param data - The regions that made it into the payload
 * @param selector - The user's selector, to locate the map
 */
function warnPartialCentroids(data: ChoroplethPoint[], selector: string): void {
  const placed = data.filter(point => point.lon !== undefined).length;
  if (placed === 0 || placed === data.length) {
    return;
  }
  console.warn(
    `[maidr/d3] Only ${placed} of the ${data.length} regions matched by `
    + `"${selector}" resolved a centroid, so the map is read as a region list `
    + `in drawn order rather than banded by latitude. The arrows move north, `
    + `south, east and west only when EVERY region carries \`lon\` and `
    + `\`lat\` in degrees.`,
  );
}

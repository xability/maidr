/**
 * Core converters that turn a Vega-Lite specification (and optionally its
 * compiled Vega view) into a MAIDR JSON schema.
 *
 * The converter handles:
 *   - Single-view specs (`mark` + `encoding`)
 *   - Layered specs (`layer`)
 *   - Composite specs (`hconcat`, `vconcat`, `concat` + `columns`)
 *   - Faceted specs (`facet` operator, `encoding.row` / `encoding.column`
 *     shorthand, and wrapped facets via `facet.field` + `columns`)
 *   - Repeated specs (`repeat` row/column arrays or wrapped `repeat: [...]`)
 *
 * Multi-panel specs produce a `Maidr.subplots` grid (one subplot per
 * panel, in visual reading order); MAIDR core then starts in SUBPLOT
 * navigation scope where arrow keys move between panels and Enter drills
 * into one.
 */

import type { ChoroplethDeclaration, MaidrTraceDeclaration } from '@type/declaration';
import type {
  BarPoint,
  BoxPoint,
  ChoroplethPoint,
  DumbbellData,
  DumbbellPoint,
  ErrorBarPoint,
  GanttData,
  GanttPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  ViolinKdePoint,
  WaterfallKind,
  WaterfallPoint,
} from '@type/grammar';
import type { FacetDescriptor, RepeatCellMapping, RepeatDescriptor } from './facets';
import type {
  VegaLiteChannelDef,
  VegaLiteEncoding,
  VegaLiteFilterPredicate,
  VegaLiteSpec,
  VegaLiteToMaidrOptions,
  VegaLiteTransform,
  VegaView,
} from './types';
import { toSegmentedShares } from '@adapters/shared/normalize';
import { readDeclarationSlot, resolveFieldRef, warnUnresolvedRef } from '@adapters/shared/traceDeclaration';
import { Orientation, TraceType } from '@type/grammar';
import {
  chunkIntoRows,
  describeFacet,
  describeRepeat,
  facetCellAttrValue,
  facetCellScope,
  repeatChildName,
  resolveDomainKeys,
  scopeSelector,
  substituteRepeatFields,
} from './facets';
import { buildLineSelectors, buildSelector } from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A converted layer kept next to the spec fragment it was built from.
 *
 * `MaidrLayer` intentionally carries no trace of its Vega-Lite origin, but
 * merging sibling line layers needs the source spec to recover each
 * series' name, so the two travel together until the merge is done.
 */
interface ConvertedLayer {
  layer: MaidrLayer;
  spec: VegaLiteSpec;
}

/**
 * Convert a Vega-Lite spec (and optionally its compiled Vega view) into a
 * MAIDR-compatible schema.
 *
 * @param spec - The Vega-Lite specification object.
 * @param view - Optional compiled Vega view for runtime data extraction.
 * @param options - Optional id / title overrides.
 * @returns A complete {@link Maidr} schema ready for MAIDR consumption.
 */
export function vegaLiteToMaidr(
  spec: VegaLiteSpec,
  view?: VegaView,
  options?: VegaLiteToMaidrOptions,
): Maidr {
  const id = options?.id ?? 'vl-chart';
  const title = options?.title ?? extractTitle(spec);
  const subtitle = extractSubtitle(spec);
  const caption = spec.description;

  const domOrder = options?.domOrder;

  warnCompositeDeclaration(spec);

  // Handle composite views (concat).
  if (spec.hconcat) {
    return buildConcatMaidr(id, title, subtitle, caption, spec.hconcat, 'horizontal', view, domOrder);
  }
  if (spec.vconcat) {
    return buildConcatMaidr(id, title, subtitle, caption, spec.vconcat, 'vertical', view, domOrder);
  }
  if (spec.concat) {
    return buildConcatMaidr(id, title, subtitle, caption, spec.concat, 'wrap', view, domOrder, spec.columns);
  }

  // Faceted specs — the `facet` operator (row/column or wrapped) and the
  // `encoding.row` / `encoding.column` shorthand both normalise to the
  // same descriptor.
  const facetDescriptor = describeFacet(spec);
  if (facetDescriptor) {
    // A row-faceted density plot is a ridgeline: the facet is how the
    // curves are offset down the page, not a grid of separate charts.
    // Read as one layer the reader can walk across; anything else falls
    // through to the panel grid.
    const ridgeline = convertRidgelineLayer(spec, facetDescriptor, view);
    if (ridgeline) {
      return buildMaidr(id, title, subtitle, caption, [[{ layers: [ridgeline] }]]);
    }
    return buildFacetMaidr(id, title, subtitle, caption, spec, facetDescriptor, view, domOrder);
  }

  // Repeated specs.
  const repeatDescriptor = describeRepeat(spec);
  if (repeatDescriptor) {
    return buildRepeatMaidr(id, title, subtitle, caption, spec, repeatDescriptor, view, domOrder);
  }

  // Unsupported composite spec shapes — warn and return an empty chart.
  if (spec.facet || spec.repeat || (spec.spec && !spec.mark && !spec.layer)) {
    console.warn('[maidr/vegalite] Unsupported composition shape (facet/repeat without a child "spec", or a bare wrapped "spec").');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  // Handle layered specs.
  const isLayered = spec.layer != null && spec.layer.length > 0;
  if (isLayered) {
    // Keep each converted layer paired with the spec it came from: the
    // series names a merge needs live in the spec (color datum, filter,
    // title), not in the converted layer.
    //
    // Two layers at a time first: a lollipop and a dumbbell are each drawn
    // as a segment layer plus a dot layer, and neither half is the chart.
    // Converting them separately dropped the segment (a `rule` resolves to
    // no trace type at all) and announced the dots as a scatter.
    const layerSpecs = spec.layer ?? [];
    const rawLayers: ConvertedLayer[] = [];
    for (let i = 0; i < layerSpecs.length;) {
      const paired = convertPairedLayers(layerSpecs, i, view, spec.encoding);
      if (paired) {
        rawLayers.push({ layer: paired, spec: layerSpecs[i] });
        i += 2;
        continue;
      }
      // A `text` layer written over the mark it labels is not a second
      // chart -- see `labelsAnotherLayer`.
      if (labelsAnotherLayer(layerSpecs, i, spec.encoding)) {
        i += 1;
        continue;
      }
      const layer = convertLayerSpec(
        layerSpecs[i],
        i,
        view,
        spec.encoding,
        isLayered,
        domOrder,
        undefined,
        undefined,
        spec.transform,
      );
      if (layer)
        rawLayers.push({ layer, spec: layerSpecs[i] });
      i += 1;
    }

    // Coalesce sibling LINE layers with matching axes into a single
    // multi-series LINE layer. This handles the common Altair case where
    // a multi-series KDE / density plot is compiled into N separate
    // single-line `layer:` objects (one per group) instead of one layer
    // with a `color` encoding. Without coalescing, maidr core sees N
    // independent LINE traces and the user can only navigate within one
    // series at a time.
    const layers = coalesceSiblingLineLayers(rawLayers, spec.encoding);

    return buildMaidr(id, title, subtitle, caption, [[{ layers }]]);
  }

  // Single view.
  const layer = convertLayerSpec(spec, 0, view, undefined, false, domOrder);
  if (!layer) {
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }
  return buildMaidr(id, title, subtitle, caption, [[{ layers: [layer] }]]);
}

/**
 * Merge runs of consecutive LINE layers whose axes describe the same
 * coordinate space (matching x and y labels) into a single multi-series
 * LINE layer.
 *
 * Why: Altair compiles `transform_density` + multi-group encodings into
 * separate `layer:` objects — one mark per group — instead of using a
 * `color` encoding. The downstream maidr LineTrace expects a 2D
 * `LinePoint[][]` (one inner array per series); leaving each group as
 * its own layer makes navigation jump between traces and breaks the
 * single-plot mental model.
 *
 * Layers that don't satisfy the merge predicate (different mark types,
 * different axes, only one in the run) pass through unchanged. SCATTER +
 * LINE pairs (linreplot) are NOT collapsed because the SCATTER mark is
 * not LINE-typed and the predicate skips it.
 */
function coalesceSiblingLineLayers(
  entries: ConvertedLayer[],
  parentEncoding?: VegaLiteEncoding,
): MaidrLayer[] {
  if (entries.length < 2)
    return entries.map(e => e.layer);

  const out: MaidrLayer[] = [];
  let i = 0;

  while (i < entries.length) {
    const current = entries[i];

    // Unstacked areas join the same run: sibling `mark_area()` layers are
    // independent bands over shared axes, exactly the case this merge exists
    // for. The stacked variants are deliberately excluded — Vega-Lite stacks
    // within one mark, never across `alt.layer(...)`, so a run of them would
    // not be one stack and merging would invent a total that is not drawn.
    if (current.layer.type !== TraceType.LINE
      && current.layer.type !== TraceType.STEP
      && current.layer.type !== TraceType.AREA) {
      out.push(current.layer);
      i += 1;
      continue;
    }

    // Walk forward gathering consecutive line-family layers whose axes match.
    // A step layer only joins a run of steps that jump the same way: the
    // merged layer announces one convention, so a run mixing two would
    // describe one of them wrongly.
    const run: ConvertedLayer[] = [current];
    let j = i + 1;
    while (j < entries.length && entries[j].layer.type === current.layer.type
      && entries[j].layer.stepDirection === current.layer.stepDirection
      && axesAreCompatible(current.layer.axes, entries[j].layer.axes)) {
      run.push(entries[j]);
      j += 1;
    }

    if (run.length === 1) {
      out.push(current.layer);
    } else {
      out.push(mergeLineLayers(run, parentEncoding));
    }
    i = j;
  }

  return out;
}

function axesAreCompatible(
  a: MaidrLayer['axes'] | undefined,
  b: MaidrLayer['axes'] | undefined,
): boolean {
  if (!a || !b)
    return false;
  const ax = a.x?.label;
  const ay = a.y?.label;
  const bx = b.x?.label;
  const by = b.y?.label;
  return ax === bx && ay === by;
}

/**
 * True when a point's `z` actually identifies a series.
 *
 * Empty counts as unnamed, not named. `extractLineData` keys its groups on
 * `String(row[colorField] ?? '')`, so a layer whose rows lack the colour
 * field — common when a `color` encoding is hoisted onto a layered parent —
 * yields `z: ''`. Treating that as a real name would both block the merge
 * from filling it and let the layer vouch for a dimension it isn't in.
 */
function hasSeriesName(z: string | undefined): boolean {
  return z !== undefined && z !== '';
}

function mergeLineLayers(
  run: ConvertedLayer[],
  parentEncoding?: VegaLiteEncoding,
): MaidrLayer {
  // Each input layer's `data` is already `LinePoint[][]` with exactly
  // one inner series (because per-layer single-line extraction returns
  // `[pts]`). Flatten by concatenating those inner arrays so the merged
  // layer ends up as `[layer0_series, layer1_series, ...]`.
  const mergedData: LinePoint[][] = [];
  const mergedSelectors: string[] = [];
  let named = false;
  // Every sub-layer's answer, `undefined` included — see the z-axis
  // decision below, which requires unanimity.
  const dimensionLabels = new Set<string | undefined>();

  for (const { layer, spec } of run) {
    const encoding: VegaLiteEncoding = { ...parentEncoding, ...spec.encoding };
    // Name the series this sub-layer contributes. Layers extracted via a
    // `color`/`fill` *field* already carry a per-point `z`; those keep it
    // and only anonymous points are filled in, so a run that mixes both
    // shapes never has a derived name overwrite a real one.
    const seriesName = resolveLayerSeriesName(spec, encoding);
    const dimensionLabel = resolveSeriesDimensionLabel(spec, encoding, seriesName);
    let everySeriesNamed = true;
    let contributedSeries = false;

    if (Array.isArray(layer.data)) {
      for (const series of layer.data as LinePoint[][]) {
        contributedSeries = true;
        const points = seriesName === undefined
          ? series
          : series.map(point =>
              hasSeriesName(point.z) ? point : { ...point, z: seriesName },
            );
        if (hasSeriesName(points[0]?.z)) {
          named = true;
        } else {
          everySeriesNamed = false;
        }
        mergedData.push(points);
      }
    }
    // Only sub-layers that actually contributed a series get a vote.
    //
    // A colour-encoded layer whose dataset resolves empty produces no
    // series at all — `extractLineData` returns `[...groups.values()]`,
    // which is `[]` for zero rows — and a layer that drew nothing has no
    // stake in what the run's dimension is. Letting it vote would decide
    // the z axis on a layer the user never encounters.
    //
    // Among layers that did contribute: one that still yields an unnamed
    // series cannot vouch for the dimension either, so it abstains, which
    // the unanimity check below treats as disagreement. Without that, a
    // layer inheriting a `color` *field* from the parent reports that
    // field as the dimension even when its own rows lack it and its
    // series came out blank.
    if (contributedSeries)
      dimensionLabels.add(everySeriesNamed ? dimensionLabel : undefined);
    if (Array.isArray(layer.selectors)) {
      for (const sel of layer.selectors as string[]) {
        mergedSelectors.push(sel);
      }
    } else if (typeof layer.selectors === 'string') {
      mergedSelectors.push(layer.selectors);
    }
  }

  const merged: MaidrLayer = {
    ...run[0].layer,
    selectors: mergedSelectors,
    data: mergedData,
  };

  // Only advertise a z axis once the merge produced names AND every
  // sub-layer agrees on the same dimension. A label is a claim about all
  // the merged series at once, so one dissenting sub-layer invalidates it:
  // whether it names a *different* dimension or none at all, its series do
  // not belong to the dimension the others describe, and titling the axis
  // would mislabel them. Without a label, LineTrace's own "Group" default
  // reads better than a fabricated axis title.
  const [dimensionLabel] = [...dimensionLabels];
  if (named && dimensionLabels.size === 1 && dimensionLabel) {
    merged.axes = { ...merged.axes, z: { label: dimensionLabel } };
  }

  return merged;
}

/**
 * Matches a filter expression that is a single equality test against one
 * `datum` field, e.g. `(datum.species === 'Adelie')`,
 * `datum['Origin'] == "Europe"`, `(datum.year === 2020)` or
 * `(datum.flag === true)`.
 *
 * The right-hand side may be a quoted string, a number, or a boolean —
 * Altair emits all three unquoted-as-appropriate for
 * `transform_filter(alt.datum.f == v)`, so restricting this to strings
 * would silently drop names from every numerically grouped chart.
 *
 * Each quoted form is spelled out separately (`'([^']*)'` / `"([^"]*)"`)
 * rather than sharing a backreferenced delimiter with a lazy body. A lazy
 * `(.*?)` only has to reach *a* matching quote before the end anchor, so it
 * happily swallows an operator: `datum.a === 'x' && datum.b === 'y'` parsed
 * as the single value `x' && datum.b === 'y`. Excluding the delimiter from
 * the body makes the match stop at the closing quote, so a compound
 * predicate fails outright — while a value containing the *other* quote
 * character still parses, which is how Altair escapes.
 *
 * Deliberately anchored and deliberately narrow otherwise: anything with a
 * boolean operator, a comparison other than equality, or a non-literal
 * right-hand side fails to match and yields no name. A compound predicate
 * does not describe a single named series, so guessing one would mislabel
 * the line.
 *
 * Note this pattern is coupled to how Altair stringifies
 * `transform_filter` today. If a future version changes its spacing,
 * quoting, or parenthesisation, this stops matching and layers simply go
 * unnamed — the pre-PR behaviour, not a break. That degradation is silent
 * by design, which also means no test here will catch it: the fixtures are
 * frozen captures, so confirming continued support means re-capturing them
 * against a newer Altair rather than trusting a green suite.
 */
const SINGLE_EQUALITY_FILTER
  = /^datum(?:\.([A-Z_$][\w$]*)|\[(['"])([^'"]*)\2\])\s*===?\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|(true|false))$/i;

/**
 * Remove one *balanced* pair of wrapping parentheses, which is how Altair
 * emits its filter expressions (`(datum.species === 'Adelie')`).
 *
 * An expression containing any further parenthesis is returned untouched,
 * so it fails {@link SINGLE_EQUALITY_FILTER} and yields no name. That keeps
 * unbalanced or compound input — `(datum.f === 'v'`, `(a) === (b)` — out,
 * rather than letting independently-optional parens in the pattern accept it.
 */
function stripBalancedOuterParens(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')'))
    return trimmed;
  const inner = trimmed.slice(1, -1);
  if (inner.includes('(') || inner.includes(')'))
    return trimmed;
  return inner.trim();
}

/**
 * Read a layer's `filter` transform, but only when it declares exactly one.
 *
 * A layer narrowed by several filters (say `site` *and* `year`) is not
 * identified by any one of them: two layers agreeing on `site` but
 * differing on `year` would both resolve to the same name and collide
 * under one misleading label. Both the predicate-object and the
 * expression-string forms go through this gate so neither can name a
 * compound-filtered layer.
 *
 * Non-`filter` transforms (`density`, `aggregate`, …) are not counted —
 * they narrow nothing and routinely sit alongside a filter.
 *
 * @returns The sole filter, or `undefined` when the layer declares none
 * or more than one.
 */
function getSoleFilterTransform(
  spec: VegaLiteSpec,
): string | VegaLiteFilterPredicate | undefined {
  if (!Array.isArray(spec.transform))
    return undefined;
  const filters = spec.transform
    .map(t => t?.filter)
    .filter((f): f is string | VegaLiteFilterPredicate => f !== undefined);
  return filters.length === 1 ? filters[0] : undefined;
}

/**
 * Parse `datum.<field> === '<value>'` into its field and value.
 *
 * @returns The parsed pair, or `undefined` when the expression is not a
 * lone equality test.
 */
function parseSingleEqualityFilter(
  expression: string,
): { field: string; value: string } | undefined {
  const match = SINGLE_EQUALITY_FILTER.exec(stripBalancedOuterParens(expression));
  if (!match)
    return undefined;
  const field = match[1] ?? match[3];
  // Exactly one right-hand alternative matches; the rest are undefined.
  const value = match[4] ?? match[5] ?? match[6] ?? match[7];
  // An empty literal names nothing — `z: ''` would read as a real group
  // downstream while displaying as blank.
  if (!field || !value)
    return undefined;
  return { field, value };
}

/**
 * Resolve the display name of the series drawn by one layer of a layered
 * spec, so a merge can label it.
 *
 * Sources, most explicit first:
 *  1. `encoding.color.datum` / `encoding.fill.datum` — the constant
 *     Vega-Lite binds to a layer purely to name it in the legend.
 *  2. A `filter` transform's `{field, equal}` predicate — the value the
 *     layer was narrowed to.
 *  3. The layer's own `title`.
 *  4. A `filter` transform written as a lone `datum.f === 'v'` expression,
 *     which is what Altair emits for `transform_filter(alt.datum.f == v)`.
 *
 * @returns The series name, or `undefined` when the spec names it nowhere.
 * Callers must leave `z` unset in that case: an invented name is worse
 * than none, because it reads as authoritative to a screen reader user.
 */
function resolveLayerSeriesName(
  spec: VegaLiteSpec,
  encoding: VegaLiteEncoding,
): string | undefined {
  const datum = encoding.color?.datum ?? encoding.fill?.datum;
  if (datum != null && String(datum).length > 0)
    return String(datum);

  const filter = getSoleFilterTransform(spec);

  // `!= null` keeps a legitimate `0` / `false`; the length check drops an
  // empty one, matching the `datum` branch above. An empty name would be
  // stamped onto every point and then render blank.
  if (typeof filter === 'object' && filter.equal != null
    && String(filter.equal).length > 0) {
    return String(filter.equal);
  }

  const title = typeof spec.title === 'string' ? spec.title : spec.title?.text;
  if (title)
    return title;

  if (typeof filter === 'string') {
    const parsed = parseSingleEqualityFilter(filter);
    if (parsed)
      return parsed.value;
  }

  return undefined;
}

/**
 * Resolve the label of the *dimension* the merged series vary along —
 * the z-axis title, e.g. `"species"` for per-species density curves.
 *
 * Distinct from {@link resolveLayerSeriesName}, which names one series.
 * The two must stay correlated: a label is a claim that the names are
 * values of* that dimension. A colour channel always qualifies, since
 * whatever it holds is what the names came from. A filter only qualifies
 * when it narrowed the layer to the very value the name reports —
 * otherwise a layer titled `Trend A` and filtered on `site` would be
 * announced as site `Trend A`, which the spec never says.
 *
 * @param spec - The layer's own spec fragment.
 * @param encoding - The layer's encoding, merged with any parent's.
 * @param seriesName - The name {@link resolveLayerSeriesName} resolved for
 * this layer, used to confirm a filter actually produced it.
 * @returns The dimension label, or `undefined` when the spec does not say.
 */
function resolveSeriesDimensionLabel(
  spec: VegaLiteSpec,
  encoding: VegaLiteEncoding,
  seriesName: string | undefined,
): string | undefined {
  const channel = encoding.color ?? encoding.fill;
  // `||`, not `??`: an explicitly empty title should fall back to the
  // field name rather than discard it and drop through to the filter.
  const channelLabel = channel?.title || channel?.field;
  if (channelLabel)
    return channelLabel;

  if (seriesName === undefined)
    return undefined;

  const filter = getSoleFilterTransform(spec);
  if (typeof filter === 'object' && filter.equal != null && filter.field)
    return String(filter.equal) === seriesName ? filter.field : undefined;
  if (typeof filter === 'string') {
    const parsed = parseSingleEqualityFilter(filter);
    if (parsed)
      return parsed.value === seriesName ? parsed.field : undefined;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Maidr / metadata helpers
// ---------------------------------------------------------------------------

function buildMaidr(
  id: string,
  title: string,
  subtitle: string | undefined,
  caption: string | undefined,
  subplots: MaidrSubplot[][],
): Maidr {
  const maidr: Maidr = { id, title, subplots };
  if (subtitle)
    maidr.subtitle = subtitle;
  if (caption)
    maidr.caption = caption;
  return maidr;
}

function extractTitle(spec: VegaLiteSpec): string {
  if (!spec.title)
    return 'Vega-Lite Chart';
  if (typeof spec.title === 'string')
    return spec.title;
  return spec.title.text ?? 'Vega-Lite Chart';
}

function extractSubtitle(spec: VegaLiteSpec): string | undefined {
  if (!spec.title || typeof spec.title === 'string')
    return undefined;
  return spec.title.subtitle;
}

function getMarkType(spec: VegaLiteSpec): string | null {
  if (!spec.mark)
    return null;
  return typeof spec.mark === 'string' ? spec.mark : spec.mark.type;
}

/**
 * Where each stepping `interpolate` value puts the riser, in
 * {@link StepDirection} terms. Vega-Lite hands these to the matching d3
 * curve, so `step-after` rises after the horizontal run at the next x
 * (`hv`), `step-before` rises first at the current x (`vh`), and plain
 * `step` rises at the midpoint (`mid`). Every other value — `linear`,
 * `monotone`, `basis`, absent — interpolates and is not a step.
 */
const STEP_DIRECTION_BY_INTERPOLATE: Partial<Record<string, StepDirection>> = {
  'step': 'mid',
  'step-before': 'vh',
  'step-after': 'hv',
};

/**
 * The `extent` a composite mark declares — how far its interval reaches.
 *
 * Read for one purpose: {@link extractErrorBarData}'s fallback reproduces
 * Vega-Lite's default spread and refuses to guess any other.
 *
 * @param spec - The layer's spec fragment
 * @returns The declared extent, or `undefined` when the spec leaves it
 * to Vega-Lite
 */
function getMarkExtent(spec: VegaLiteSpec): string | undefined {
  if (!spec.mark || typeof spec.mark === 'string')
    return undefined;
  return spec.mark.extent;
}

/**
 * Read a scale's domain off the compiled view.
 *
 * Two things make this less direct than it looks. Vega **throws** for a
 * scale name it does not recognise rather than returning nothing, and a
 * composite child's scales are scoped to its own group — a concat child's y
 * scale is `concat_0_y`, not `y` — so the prefixed name is tried first and
 * the bare one after.
 *
 * @param view - The compiled view, when one was supplied
 * @param name - The scale's name — a positional axis, or `color`
 * @param markGroupPrefix - The composite child's class prefix, if any
 * @returns The domain, or `undefined` when no such scale is in scope
 */
function readScaleDomain(
  view: VegaView | undefined,
  name: string,
  markGroupPrefix: string,
): unknown[] | undefined {
  if (!view || typeof view.scale !== 'function')
    return undefined;
  const candidates = markGroupPrefix ? [`${markGroupPrefix}${name}`, name] : [name];
  for (const candidate of candidates) {
    try {
      const domain = view.scale(candidate)?.domain();
      if (Array.isArray(domain) && domain.length > 0)
        return domain;
    } catch {
      // Not in scope from here — try the next candidate name.
    }
  }
  return undefined;
}

/**
 * The step convention a spec's mark draws, or `undefined` when it draws an
 * ordinary interpolated line.
 */
function getStepDirection(spec: VegaLiteSpec): StepDirection | undefined {
  if (!spec.mark || typeof spec.mark === 'string')
    return undefined;
  const { interpolate } = spec.mark;
  return interpolate === undefined ? undefined : STEP_DIRECTION_BY_INTERPOLATE[interpolate];
}

/**
 * Map a Vega-Lite mark type + encoding to a MAIDR trace type.
 *
 * Some marks produce different MAIDR types depending on encoding:
 *   - `bar` with `bin` on x/y          → HISTOGRAM
 *   - `bar` with color/fill + stack    → STACKED / NORMALIZED / DODGED
 *   - `bar` or `rule` spanning x–x2 / y–y2 → GANTT, or WATERFALL when the
 *     bounds are consecutive running totals
 *   - `rule` with one positional field → nothing: a reference line or a
 *     lollipop's stem states no interval of its own
 *   - `text` on two continuous axes    → SCATTER whose points carry `label`
 *   - `text` on a categorical axis, or with no `text` channel → nothing:
 *     a value written over a bar, which the bar already announces
 *   - `rect`                           → HEATMAP
 *   - `point` / `circle` / `square` / `tick` → SCATTER, or DOT when one
 *     positional channel is a category
 *   - `line` with a stepping `interpolate` → STEP
 *   - `area`                           → AREA / STACKED_AREA / NORMALIZED_AREA
 *   - `arc` with a `theta` encoding    → PIE (a doughnut is the same mark
 *     with an `innerRadius`, and reads identically)
 *   - `arc` with a `radius` field      → POLAR_AREA
 *   - `errorbar` / `errorband`         → ERROR_BAR
 */
/**
 * Reads the `stack` setting a spec declares, from whichever axis carries it.
 *
 * `??` cannot do this job, and the difference is not cosmetic: Vega-Lite
 * spells "do not stack" as either `false` or `null`, and a nullish coalesce
 * discards the `null` before any check can see it, falls through to the other
 * axis, and reports `undefined` — which every caller reads as "stack by
 * default", the exact opposite of what the spec asked for.
 *
 * `undefined` here therefore means "no axis declared one", and only that.
 *
 * @param encoding - The layer's encoding, when it has one
 * @returns The declared stack setting, or undefined when none is declared
 */
function declaredStack(
  encoding?: VegaLiteEncoding,
): VegaLiteChannelDef['stack'] {
  return encoding?.y?.stack !== undefined
    ? encoding.y.stack
    : encoding?.x?.stack;
}

/**
 * Whether a declared stack setting turns stacking off.
 *
 * @param stack - The value {@link declaredStack} returned
 * @returns True when the spec asked for unstacked marks
 */
function isUnstacked(stack: VegaLiteChannelDef['stack']): boolean {
  return stack === false || stack === null;
}

/**
 * Whether a channel names a category rather than measuring a magnitude.
 *
 * Declared types only: a channel Vega-Lite infers as quantitative carries no
 * `type` in the spec the adapter reads, and reading that silence as
 * "categorical" would turn ordinary scatters into dot plots. `temporal` is
 * a magnitude here — a time axis is continuous, and a scatter over dates is
 * a scatter.
 *
 * @param channel - The channel to classify, when the spec declares one
 * @returns True when the channel is nominal or ordinal
 */
function isCategorical(channel?: VegaLiteChannelDef): boolean {
  return channel?.type === 'nominal' || channel?.type === 'ordinal';
}

/**
 * Whether a channel is bound to a data field.
 *
 * `x2` / `y2` accept a `datum` constant as readily as a field, and the two
 * mean different charts: a second bound taken from the data draws an
 * interval, while a constant one is the baseline an ordinary bar already
 * stands on.
 *
 * @param channel - The channel to test, when the spec declares one
 * @returns True when the channel reads a field
 */
function hasField(channel?: VegaLiteChannelDef): boolean {
  return typeof channel?.field === 'string' && channel.field.length > 0;
}

/**
 * Whether a spec accumulates a running total.
 *
 * The one thing that separates a waterfall from any other bar spanning
 * `y`–`y2`: a waterfall's bounds are consecutive running totals, and
 * Vega-Lite has exactly one way to compute those — a `window` transform
 * summing the contributions. Without it the two bounds are two measured
 * values, and calling their difference a contribution to a total would
 * invent an accumulation the chart never drew.
 *
 * @param transform - The transforms in scope for the layer, parent first
 * @returns True when one of them sums over a window
 */
function hasRunningSumTransform(transform?: VegaLiteTransform[]): boolean {
  if (!Array.isArray(transform))
    return false;
  return transform.some(entry =>
    Array.isArray(entry?.window) && entry.window.some(op => op?.op === 'sum'),
  );
}

/**
 * Window operations that compute a place in a table rather than a number
 * measured off the data. `row_number` is deliberately absent: it counts
 * rows in whatever order they arrive and means nothing about the values,
 * so a line drawn against it is not a bump chart.
 */
const RANK_WINDOW_OPS: ReadonlySet<string> = new Set(['rank', 'dense_rank']);

/**
 * The column a `window` transform ranks into, when one does.
 *
 * A bump chart is a line chart whose y axis is a *rank*, and Vega-Lite has
 * one way to compute one. The mark says nothing — a bump chart and a line
 * chart are the same `line` — so the transform is the only signal, and the
 * ranked column has to be named for the encoding to be checked against it.
 * The Vega-Lite schema makes `as` required on every window operation, so
 * it always is.
 *
 * @param transform - The transforms in scope for the layer, parent first
 * @returns The ranked column's name, or `undefined` when none is ranked
 */
function rankedColumn(transform?: VegaLiteTransform[]): string | undefined {
  if (!Array.isArray(transform))
    return undefined;
  for (const entry of transform) {
    if (!Array.isArray(entry?.window))
      continue;
    for (const operation of entry.window) {
      if (operation?.op != null && RANK_WINDOW_OPS.has(operation.op) && operation.as)
        return operation.as;
    }
  }
  return undefined;
}

/**
 * The key / value columns a `fold` transform produces, when one is present.
 *
 * Vega-Lite documents the default pair as `["key", "value"]`, which the
 * canonical parallel coordinates spec relies on.
 *
 * @param transform - The transforms in scope for the layer, parent first
 * @returns The two output column names, or `undefined` when nothing folds
 */
function foldedColumns(
  transform?: VegaLiteTransform[],
): { keyColumn: string; valueColumn: string } | undefined {
  if (!Array.isArray(transform))
    return undefined;
  for (const entry of transform) {
    if (!Array.isArray(entry?.fold))
      continue;
    const as = Array.isArray(entry.as) ? entry.as : undefined;
    return {
      keyColumn: as?.[0] ?? 'key',
      valueColumn: as?.[1] ?? 'value',
    };
  }
  return undefined;
}

/**
 * The `density` transform in a set of transforms, when there is one.
 *
 * Vega-Lite documents the default output pair as `["value", "density"]` —
 * the sample position first, the estimate second.
 *
 * @param transform - The transforms in scope for the layer, parent first
 * @returns The estimated field, its grouping keys and its output columns,
 * or `undefined` when nothing estimates a density
 */
function findDensityTransform(transform?: VegaLiteTransform[]): {
  groupby: string[];
  valueColumn: string;
  densityColumn: string;
} | undefined {
  if (!Array.isArray(transform))
    return undefined;
  for (const entry of transform) {
    if (typeof entry?.density !== 'string')
      continue;
    const as = Array.isArray(entry.as) ? entry.as : undefined;
    return {
      groupby: Array.isArray(entry.groupby) ? entry.groupby : [],
      valueColumn: as?.[0] ?? 'value',
      densityColumn: as?.[1] ?? 'density',
    };
  }
  return undefined;
}

/**
 * Whether a `line` layer draws one polyline per observation across several
 * variables — a parallel coordinates plot.
 *
 * Vega-Lite has no such mark, and the gallery's own recipe is what the
 * shape is: fold the variables into one `key` / `value` pair, put the key
 * on x so each variable gets its own tick, and split the mark with a
 * `detail` channel so one polyline is drawn per observation rather than
 * one zig-zag through all of them. All three are needed — a fold whose key
 * is *not* on x is a long-format multi-series line chart, and a fold
 * without a `detail` is a single path joining every row.
 *
 * @param encoding - The layer's encoding, merged with any parent's
 * @param transform - The transforms in scope for the layer
 * @returns The fold's output columns, or `null` when this is not one
 */
function resolveFoldedAxes(
  encoding?: VegaLiteEncoding,
  transform?: VegaLiteTransform[],
): { keyColumn: string; valueColumn: string } | null {
  const folded = foldedColumns(transform);
  if (!folded || !hasField(encoding?.detail))
    return null;
  return encoding?.x?.field === folded.keyColumn ? folded : null;
}

/**
 * Classify a mark that spans a range on one axis instead of standing on a
 * baseline.
 *
 * Both shapes draw a floating span from a positional channel to its `2`
 * counterpart, with the remaining axis naming the row: a gantt lane, a
 * waterfall step. They are told apart by {@link hasRunningSumTransform}.
 *
 * `bar` and `rule` both reach this. Which of the two an author writes is a
 * choice about how thick the span is drawn, not about what it means — the
 * same two bounds on the same two channels — and reading only one of them
 * left an ordinary range chart unread for the sake of its mark's name
 * (#1122).
 *
 * @param mark - The mark being classified, named only for the warning
 * @param encoding - The layer's encoding, merged with any parent's
 * @param transform - The transforms in scope for the layer
 * @returns The trace type, or `null` when the mark spans no range
 */
function resolveRangedBarType(
  mark: string,
  encoding?: VegaLiteEncoding,
  transform?: VegaLiteTransform[],
): TraceType | null {
  // A ranged bar needs a category axis to lay its rows out along; without
  // one there is nothing to name the lane or the step, and the mark is
  // some other chart the adapter has no reading for.
  if (hasField(encoding?.y) && hasField(encoding?.y2) && isCategorical(encoding?.x)) {
    return hasRunningSumTransform(transform) ? TraceType.WATERFALL : TraceType.GANTT;
  }
  if (hasField(encoding?.x) && hasField(encoding?.x2) && isCategorical(encoding?.y)) {
    return hasRunningSumTransform(transform) ? TraceType.WATERFALL : TraceType.GANTT;
  }
  // Both bounds are there but the axis opposite them left its type to
  // Vega-Lite's inference, which the spec alone cannot recover — see
  // `isCategorical`. Say which one line of the spec would fix it, and say
  // what the mark falls back to, which is not the same for the two: a `bar`
  // reads as an ordinary one whose magnitude is the lower bound by itself —
  // a silent misread — while a `rule` has no other reading and is left out
  // of the figure altogether.
  if ((hasField(encoding?.y) && hasField(encoding?.y2))
    || (hasField(encoding?.x) && hasField(encoding?.x2))) {
    const fallback = mark === 'bar'
      ? 'reading it as an ordinary bar.'
      : `leaving the ${mark} unread.`;
    console.warn(
      `[maidr/vegalite] A ${mark} spanning two positional bounds needs an explicit `
      + '"nominal" or "ordinal" type on the axis opposite them to read as a gantt '
      + `or a waterfall; ${fallback}`,
    );
  }
  return null;
}

function resolveTraceType(
  mark: string,
  encoding?: VegaLiteEncoding,
  stepDirection?: StepDirection,
  transform?: VegaLiteTransform[],
): TraceType | null {
  switch (mark) {
    case 'bar': {
      // Before the binning and stacking tests: a bar drawn between two
      // positions on one axis carries no magnitude for either of them to
      // read.
      const ranged = resolveRangedBarType(mark, encoding, transform);
      if (ranged) {
        return ranged;
      }
      if (encoding?.x?.bin || encoding?.y?.bin) {
        return TraceType.HISTOGRAM;
      }
      if (encoding?.color?.field || encoding?.fill?.field) {
        const stack = declaredStack(encoding);
        // `xOffset` (or `yOffset`) with a field is the modern Vega-Lite way
        // to dodge bars side-by-side. Treat its presence as a DODGED hint
        // even when `stack` is not explicitly disabled.
        const hasOffsetField
          = !!encoding?.xOffset?.field || !!encoding?.yOffset?.field;
        if (hasOffsetField || isUnstacked(stack)) {
          return TraceType.DODGED;
        }
        if (stack === 'normalize') {
          return TraceType.NORMALIZED;
        }
        return TraceType.STACKED;
      }
      return TraceType.BAR;
    }
    // Three charts share the `line` mark and are told apart by what fed
    // it, since the mark itself says only "join these points up".
    //
    // A `trail` joins them: Vega-Lite's own description is a line whose width
    // can vary, and both compile to one `<path>` per series over the same
    // channels, so every reading below applies to it unchanged. The width is
    // the one thing lost -- `LinePoint` carries a coordinate pair and no
    // thickness -- which is a second encoding of something a reader reaches by
    // navigating, and better lost than the whole chart, which is what the
    // default branch used to cost it (#1063).
    case 'line':
    case 'trail': {
      if (stepDirection) {
        return TraceType.STEP;
      }
      // A folded key on x with a `detail` split is the gallery's parallel
      // coordinates recipe — every column is a different quantity, which
      // is the whole chart and what the pitch has to carry.
      if (resolveFoldedAxes(encoding, transform)) {
        return TraceType.PARALLEL;
      }
      // A y axis reading a ranked column is a bump chart. The rank has to
      // be the thing plotted, not merely computed: the same window
      // transform is also how a spec sorts or filters to a top-n, and
      // those draw the underlying magnitude, which is an ordinary line.
      const rank = rankedColumn(transform);
      if (rank !== undefined && encoding?.y?.field === rank) {
        return TraceType.BUMP;
      }
      return TraceType.LINE;
    }
    // An area used to fall through to `line`, which read a stacked chart's
    // band height as if it were the only magnitude drawn. Vega-Lite stacks an
    // area by default as soon as a series channel is present — `stack` has to
    // be turned *off* to get overlapping bands — so the default branch here
    // is the stacked one, the opposite of `bar` above.
    case 'area': {
      const stack = declaredStack(encoding);
      if (stack === 'normalize') {
        return TraceType.NORMALIZED_AREA;
      }
      const hasSeries = !!encoding?.color?.field || !!encoding?.fill?.field;
      if (hasSeries && !isUnstacked(stack)) {
        return TraceType.STACKED_AREA;
      }
      // Unstacked, so the bands are independent and each reads as its own
      // series. A stepped one keeps its staircase reading: with nothing
      // accumulating, STEP loses nothing that AREA would preserve.
      return stepDirection ? TraceType.STEP : TraceType.AREA;
    }
    // A point mark against a category is a Cleveland dot plot, not a
    // scatter: one of its two coordinates is a name. `extractScatterData`
    // coerces both channels with `Number()`, so reading one as a scatter
    // put `x: NaN` on every point — audible as silence at every sample.
    // Exactly one categorical positional channel, because a point with two
    // (a dot matrix) has no magnitude to sonify at all, and a point with
    // none is the scatter this case has always meant.
    case 'point':
    case 'circle':
    case 'square':
    case 'tick': {
      const categoricalX = isCategorical(encoding?.x);
      const categoricalY = isCategorical(encoding?.y);
      if (hasField(encoding?.x) && hasField(encoding?.y) && categoricalX !== categoricalY) {
        return TraceType.DOT;
      }
      return TraceType.SCATTER;
    }
    // A `rule` draws a segment, and `x`–`x2` (or `y`–`y2`) makes that segment
    // an interval per row — the same chart `bar` draws with the same two
    // channels, differing only in how thick it is painted. Vega-Lite's own
    // gallery reaches for `rule` to draw one, and the mark resolved to
    // nothing, so the chart went unread for the sake of its mark's name
    // (#1122).
    //
    // Only when both bounds are there. A `rule` with one positional field is
    // a reference line drawn across the frame, and one with `x` and `y` is a
    // lollipop's stem running up from the baseline — neither carries an
    // interval any row of the data states, and both keep resolving to `null`
    // here. A stem under a dot layer is collapsed into the lollipop or
    // dumbbell it draws before this runs, by `convertPairedLayers`.
    case 'rule':
      return resolveRangedBarType(mark, encoding, transform);
    // A `text` mark writes a name at a position, and on two continuous axes
    // that is a labelled scatter -- the country-names-against-GDP chart
    // `ScatterPoint.label` exists for. It resolved to nothing, so such a
    // figure came back with no layers at all (#1124).
    //
    // Only on two continuous scales, which is the rule #1106 settled for the
    // Observable side and settles here for the same reason: a `text` on a
    // categorical axis is a value written over a bar or into a heatmap cell,
    // and the mark beside it already announces that number. Reading it here
    // would announce every count twice, once as a bar and once as a point
    // standing at the same place.
    //
    // A `text` with no `text` channel draws nothing to read, and a `text`
    // layer that labels another layer is declined before this runs -- see
    // `labelsAnotherLayer`.
    case 'text':
      if (!hasField(encoding?.text))
        return null;
      return hasField(encoding?.x) && hasField(encoding?.y)
        && !isCategorical(encoding?.x) && !isCategorical(encoding?.y)
        ? TraceType.SCATTER
        : null;
    case 'rect':
      return TraceType.HEATMAP;
    case 'boxplot':
      return TraceType.BOX;
    // Two channels an arc can carry its magnitude on, and they are
    // different charts. `radius` bound to a field makes the wedge's length
    // the value — a polar area, coxcomb or rose — which is read as a radar
    // is. `theta` alone makes it a pie. An arc with neither has no
    // magnitude to navigate, so it stays unsupported rather than being
    // announced as a pie whose values MAIDR would have to invent.
    case 'arc':
      if (hasField(encoding?.radius)) {
        return TraceType.POLAR_AREA;
      }
      return encoding?.theta ? TraceType.PIE : null;
    // Composite marks, handled by name the way `boxplot` above is.
    // Vega-Lite computes the bounds itself and compiles them into
    // `lower_<field>` / `upper_<field>` columns; both marks draw the same
    // three magnitudes and differ only in whether the samples are joined
    // into a band.
    case 'errorbar':
    case 'errorband':
      return TraceType.ERROR_BAR;
    // The one mark that names itself. `geoshape` draws geography and
    // nothing else compiles to it, so no author sentence is needed to
    // recognise a map — but a map is only a *choropleth* once a value
    // shades it. A `geoshape` with no colour or fill field is the outline
    // layer such a spec is usually built on top of: it carries no data, and
    // it is left unread rather than announced as a chart with no values.
    case 'geoshape':
      return hasField(encoding?.color) || hasField(encoding?.fill)
        ? TraceType.CHOROPLETH
        : null;
    default:
      return null;
  }
}

/** Extract axis label from an encoding channel. */
function getAxisLabel(channel?: VegaLiteChannelDef): string {
  if (!channel)
    return '';
  if (channel.axis && channel.axis.title != null)
    return channel.axis.title;
  if (channel.title)
    return channel.title;
  return channel.field ?? '';
}

/** Build an AxisConfig from an encoding channel. */
function getAxisConfig(channel?: VegaLiteChannelDef): { label: string } {
  return { label: getAxisLabel(channel) };
}

/**
 * The title a channel was **written** with, ignoring its field name.
 *
 * {@link getAxisLabel} falls back to the field, which is right almost
 * everywhere: the column a chart plots is usually what the axis is called.
 * It is wrong when the plotted column is an artefact of how the chart was
 * drawn rather than of what it measures — a parallel coordinates plot's
 * min-max normalisation, whose column is called `norm_val` and whose axis
 * the gallery spec hides.
 *
 * @param channel - The channel to read, when the spec declares one
 * @returns The authored title, or `undefined` when there is none
 */
function authoredLabel(channel?: VegaLiteChannelDef): string | undefined {
  if (channel?.axis && channel.axis.title != null)
    return channel.axis.title;
  return channel?.title;
}

/**
 * Read a layer's data from its compiled Vega **mark** dataset
 * (`layer_<N>_marks`), which Vega registers alongside the data pipelines.
 *
 * Every item in that dataset is a scenegraph mark instance carrying the
 * exact source row it was rendered from on `datum`, in DOM order. That
 * makes it the only source that is both correct per layer and aligned
 * with the highlight selectors.
 *
 * The name-based fallback in {@link resolveData} cannot do either. It
 * guesses pipeline names (`data_0`, `data_1`, …), but Vega-Lite numbers
 * those sequentially over the *whole* compiled spec, not per layer, and
 * skips indices for layers that need no transform. An Altair
 * `transform_density` + `alt.layer(...)` chart compiles to `data_1` /
 * `data_2` / `data_3` with no `data_0`, so the guesses land one dataset
 * short from layer 1 onward: layers 1 and 2 both draw the wrong series
 * and the last series never appears at all.
 *
 * @returns The layer's rows, or `undefined` when the dataset is absent or
 * does not look like mark items — in which case the caller falls back to
 * name guessing, preserving the previous behaviour. A dataset present but
 * holding zero items counts as absent for the same reason
 * {@link readViewDataset} gives: MAIDR core cannot navigate a zero-point
 * trace, so an empty result is not a usable answer. The cost is that a
 * layer which legitimately renders nothing takes the fallback and may show
 * another dataset's rows.
 */
function resolveMarkItemData(
  view: VegaView,
  markDatasetName: string,
): Record<string, unknown>[] | undefined {
  let items: unknown;
  try {
    items = view.data(markDatasetName);
  } catch {
    return undefined;
  }
  if (!Array.isArray(items) || items.length === 0)
    return undefined;

  const rows: Record<string, unknown>[] = [];
  for (const item of items) {
    const datum = (item as { datum?: unknown })?.datum;
    // Bail on the whole dataset rather than emitting a partial series:
    // dropping points would silently shorten the line.
    if (typeof datum !== 'object' || datum === null || Array.isArray(datum))
      return undefined;
    rows.push(datum as Record<string, unknown>);
  }
  return rows;
}

/**
 * Enumerate every dataset registered on a compiled Vega view, keyed by name.
 *
 * Two traps here, both silent, both validated against vega 6.3.1:
 *
 * 1. `getState`'s `data` option is a **predicate** — `(name, object) =>
 *    boolean` — not a boolean. Passing `true` makes Vega throw
 *    `options.data is not a function`.
 * 2. The values it returns are Vega's internal state descriptors, **not
 *    rows**. `getState(...).data.data_2` is `{}`; only
 *    `view.data('data_2')` yields the records.
 *
 * So this returns names only. Anything that reads a value off `getState`
 * and tests it with `Array.isArray` silently finds nothing.
 *
 * @returns Every registered dataset name, or `[]` when the view exposes no
 * usable `getState`.
 */
function getViewDatasetNames(view: VegaView): string[] {
  try {
    const stateGetter = view.getState;
    if (typeof stateGetter !== 'function')
      return [];
    const datasets = stateGetter.call(view, { data: () => true })?.data;
    return datasets && typeof datasets === 'object' ? Object.keys(datasets) : [];
  } catch (error) {
    // Degrading to "no datasets" is the safe direction, but it is also how
    // the `{ data: true }` bug above stayed invisible for so long. A view
    // that has `getState` and still throws is unexpected, so say so rather
    // than let a future regression here look like an empty chart.
    console.warn(
      '[maidr/vegalite] view.getState() failed; falling back to dataset '
      + 'name guessing.',
      error,
    );
    return [];
  }
}

/**
 * Fetch a dataset's rows by name, or `undefined` when it holds none.
 *
 * Pairs with {@link getViewDatasetNames}: enumeration gives names, this
 * gives rows. Vega rejects names outside the current scope by throwing.
 *
 * A zero-row dataset is deliberately reported the same as a missing one,
 * so callers fall through rather than adopt it. MAIDR core cannot navigate
 * a zero-point trace — `buildFacetMaidr` drops such layers outright for
 * that reason — so an empty result is not a usable answer here. The cost is
 * that a layer which legitimately renders nothing takes the fallback and
 * may show another dataset's rows instead of being empty; that trade is
 * pre-existing and is exercised by the fallback tests.
 */
function readViewDataset(
  view: VegaView,
  name: string,
): Record<string, unknown>[] | undefined {
  try {
    const rows = view.data(name);
    return Array.isArray(rows) && rows.length > 0 ? rows : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True for compiled-Vega dataset names that hold layout / legend / header
 * internals rather than chart data. Facet compilations register
 * `row_domain` / `column_domain` / `facet_domain*`, header / footer group
 * datasets, and the `cell` scenegraph dataset; repeat compilations
 * register one `<childName>_group` dataset per cell.
 */
function isInternalDatasetName(name: string): boolean {
  return name === 'root'
    || name === 'cell'
    || name.endsWith('_domain')
    || name.includes('_domain_')
    || name.endsWith('_group')
    || name.endsWith('_header')
    || name.endsWith('_footer')
    || name.includes('-title');
}

/**
 * True when a dataset row is a Vega scenegraph item (group mark instance)
 * rather than a plain data record. Scenegraph items carry `mark` /
 * `bounds` bookkeeping fields that no user dataset would have together.
 */
function isSceneGraphRow(row: Record<string, unknown>): boolean {
  return 'mark' in row && 'bounds' in row && 'items' in row;
}

/**
 * Whether a dataset's rows expose every column a layer needs.
 *
 * @param rows - The candidate rows
 * @param fields - The columns the layer reads, or `undefined` to accept any
 * @returns True when the dataset is usable
 */
function rowsCarryFields(
  rows: Record<string, unknown>[],
  fields?: readonly string[],
): boolean {
  if (!fields || fields.length === 0)
    return true;
  return rows.length > 0 && fields.every(field => field in rows[0]);
}

/**
 * Resolve the data array for a layer.
 *
 * Tries the compiled Vega view first (more accurate since it includes
 * aggregations, filters, and other transforms), then falls back to the
 * spec's inline data.
 *
 * `requiredFields` narrows the guesses to datasets that actually carry the
 * columns the layer reads. The name guessing below is ordered by layer
 * index, which is wrong whenever a spec's pipelines do not line up with its
 * layers — the gallery's parallel coordinates chart is layer 1 and its rows
 * are in `data_0`, while `data_1` holds the axis rules' row counts, so the
 * unfiltered guess hands the polylines a two-column table of tallies. A
 * caller that knows which columns must be present says so; every other
 * caller keeps the previous first-non-empty behaviour.
 */
function resolveData(
  spec: VegaLiteSpec,
  layerIndex: number,
  view?: VegaView,
  markDatasetName?: string,
  requiredFields?: readonly string[],
): Record<string, unknown>[] {
  // Exact path first: a layer's own mark dataset. See
  // `resolveMarkItemData` — the name-guessing below is a fallback.
  if (view && markDatasetName) {
    const markRows = resolveMarkItemData(view, markDatasetName);
    if (markRows && rowsCarryFields(markRows, requiredFields))
      return markRows;
  }

  // Common Vega dataset names produced by the VL compiler.
  // Include layer-specific dataset names for composite specs.
  const datasetNames = [
    `data_${layerIndex}`,
    'data_0',
    'source_0',
    `data_${layerIndex + 1}`,
    'data_1',
    'source',
    'data_2',
  ];
  if (view) {
    for (const name of datasetNames) {
      try {
        const rows = view.data(name);
        if (rows && rows.length > 0 && rowsCarryFields(rows, requiredFields))
          return rows;
      } catch {
        // dataset may not exist — try next
      }
    }

    // Fallback: enumerate every dataset on the compiled view and return
    // the first non-empty one whose rows look like records. This catches
    // Vega-generated names we don't know about (e.g. `bin_maxbins_10_value`,
    // `data_3`, internal aggregation outputs for histograms).
    //
    // Known limitation: this fallback returns the FIRST matching dataset
    // without verifying that its rows expose the encoded fields. For
    // single-source specs (the common case) the only non-empty dataset
    // is the user's data, and the fallback is correct. For specs with
    // multiple stages (joins, lookups, filtered branches, separate
    // datasets per layer) this can pick an upstream/intermediate
    // dataset and silently produce mismatched announcements. We
    // intentionally do NOT filter by encoding field names because Vega
    // legitimately renames fields after binning (e.g. `value` →
    // `bin_maxbins_10_value`); a stricter check would break
    // histograms. A field-aware redesign that recognises bin/aggregate
    // transforms is tracked as a follow-up.
    for (const name of getViewDatasetNames(view)) {
      // Skip the names we already tried above.
      if (datasetNames.includes(name))
        continue;
      // Faceted / repeated compilations register layout-internal
      // datasets (facet/row/column domains, headers, footers, and
      // per-group scenegraph items like `cell` or `child__*_group`)
      // that hold no chart data. Skip them by name pattern, and skip
      // any dataset whose rows are scenegraph items rather than
      // data records.
      if (isInternalDatasetName(name))
        continue;
      const rows = readViewDataset(view, name);
      if (rows && typeof rows[0] === 'object' && rows[0] !== null
        && !isSceneGraphRow(rows[0]) && rowsCarryFields(rows, requiredFields)) {
        return rows;
      }
    }
  }

  // Inline data fallback.
  if (spec.data && typeof spec.data === 'object') {
    const d = spec.data as { values?: Record<string, unknown>[] };
    if (Array.isArray(d.values))
      return d.values;
  }

  console.warn(
    `[maidr/vegalite] Could not resolve dataset for layer index ${layerIndex}. `
    + `Tried names: ${datasetNames.join(', ')}`,
  );
  return [];
}

// ---------------------------------------------------------------------------
// DOM-order mapping
// ---------------------------------------------------------------------------

/**
 * Map a segmented MAIDR trace type to the `domMapping` hint that tells
 * `SegmentedTrace.mapToSvgElements` how Vega-Lite laid out the bars in
 * the SVG.
 *
 * Vega-Lite renders:
 *   - **Stacked / normalised** bars in **series-major** order: every
 *     bar of the first colour is emitted first, then every bar of the
 *     second colour, etc. → `{ order: 'row' }` so iteration is
 *     row-major over `data[seriesIndex][barIndex]`.
 *   - **Dodged** bars in **subject-major** order: for each x-axis
 *     subject, every series bar is emitted in turn (interleaved). →
 *     `{ order: 'column', groupDirection: 'forward' }` so iteration is
 *     column-major and walks the series top-to-bottom in our 2D data.
 *
 * The detection mirrors the proven pattern in
 * `src/adapters/d3/binders/segmented.ts`. A caller can override the
 * detection by passing `domOrder` in {@link VegaLiteToMaidrOptions}.
 */
function determineDomMapping(
  traceType: TraceType,
  override?: 'series-major' | 'subject-major',
): { order: 'row' | 'column'; groupDirection?: 'forward' | 'reverse' } {
  const order = override
    ?? (traceType === TraceType.DODGED ? 'subject-major' : 'series-major');
  return order === 'series-major'
    ? { order: 'row' }
    : { order: 'column', groupDirection: 'forward' };
}

// ---------------------------------------------------------------------------
// Data extraction per chart type
// ---------------------------------------------------------------------------

/**
 * Read a channel's value from a compiled Vega row, accounting for the
 * name-mangling Vega-Lite applies to aggregated fields.
 *
 * Vega-Lite compiles an aggregate encoding such as
 * `{ aggregate: 'mean', field: 'b' }` into an output column named
 * `<op>_<field>` (e.g. `mean_b`), so the raw field name (`b`) is absent
 * from the aggregated dataset. Count aggregates without an explicit field
 * instead emit the synthetic `__count` column.
 *
 * Lookup order: the explicit field FIRST (source of truth when present),
 * then the `<aggregate>_<field>` compiled name, then `__count`.
 *
 * @returns The resolved value, or `undefined` when no candidate is present.
 */
function readEncodedValue(
  row: Record<string, unknown>,
  channel: VegaLiteChannelDef | undefined,
  field: string,
): unknown {
  if (row[field] != null)
    return row[field];
  const aggregate = channel?.aggregate;
  if (aggregate != null && row[`${aggregate}_${field}`] != null)
    return row[`${aggregate}_${field}`];
  return (row as Record<string, unknown>).__count;
}

/**
 * Read one bar per row: a category and the magnitude drawn for it.
 *
 * `isHorizontal` decides which channel is which, defaulting to the
 * quantitative-x test the rest of the file uses. A dot plot passes its own
 * answer: it is identified by which channel is a *category*, so a value
 * channel whose type the spec leaves for Vega-Lite to infer still lands on
 * the value side.
 *
 * @param rows - The layer's resolved rows
 * @param encoding - The layer's encoding, merged with any parent's
 * @param isHorizontal - Whether the magnitude rides x rather than y
 * @returns One point per row, in data-flow order
 */
function extractBarData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
  isHorizontal: boolean = isHorizontalEncoding(encoding),
): BarPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';

  // Keep data in input/data-flow order. The DOM emitted by Vega follows
  // this order. For simple bars the renderer sorts visually (Vega
  // alphabetises nominal axes by default); we re-sort the actual SVG
  // children in the bind step so querySelectorAll order matches what
  // the user sees, keeping highlight indices aligned with data indices.
  //
  // Vega-Lite emits a synthetic `__count` field whenever the channel uses
  // `aggregate: 'count'` without an explicit `field`. extractHistogramData
  // already handles this on its yVal lookup; the same fallback is needed
  // here for count-only bar plots.
  //
  // Lookup order: explicit field FIRST, `__count` only as fallback. If the
  // user supplies an explicit field, that field is the source of truth even
  // when Vega happens to also denormalise `__count` onto the row (e.g. via
  // a joinaggregate transform). `__count` is consulted only when the named
  // field is absent or nullish, which is exactly the count-aggregate case.
  return rows.map((row) => {
    if (isHorizontal) {
      return {
        x: Number(readEncodedValue(row, encoding.x, xField) ?? 0),
        y: String(row[yField] ?? ''),
      };
    }
    return {
      x: String(row[xField] ?? ''),
      y: Number(readEncodedValue(row, encoding.y, yField) ?? 0),
    };
  });
}

/**
 * Read one slice per row: the colour channel names it, `theta` measures it.
 *
 * Rows stay in dataset order, which for an arc mark IS the drawn order — the
 * `stack` transform Vega-Lite compiles a `theta` encoding into computes each
 * slice's start and end angle without reordering the rows it reads. So no
 * visual-order pass is needed at bind time the way simple bars need one: slice
 * k is already wedge k.
 */
function extractPieData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): PiePoint[] {
  const labelChannel = encoding.color ?? encoding.fill;
  const labelField = labelChannel?.field ?? 'category';
  const thetaField = encoding.theta?.field ?? 'theta';

  return rows.map(row => ({
    x: String(row[labelField] ?? ''),
    y: Number(readEncodedValue(row, encoding.theta, thetaField) ?? 0),
  }));
}

/**
 * Read one spoke per row: a category and the radius drawn for it.
 *
 * A polar area is a radar with wedges instead of an outline, so the payload
 * is a radar's — a single series of `{x, y}` — and `RadarTrace` reads the
 * categories round the circle. One series, because a coxcomb draws one
 * wedge per category rather than one ring per group; a spec that groups its
 * wedges by colour still names each wedge with that colour value, which is
 * what the label channel below picks up.
 *
 * Rows stay in dataset order for the reason {@link extractPieData} gives:
 * the `stack` transform behind a `theta` encoding computes angles without
 * reordering, so wedge k is row k.
 *
 * @param rows - The layer's resolved rows
 * @param encoding - The layer's encoding, merged with any parent's
 * @returns One series of spokes, ready for a radar reading
 */
function extractPolarAreaData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): LinePoint[][] {
  // The colour channel names the wedges when there is one; failing that the
  // angular channel does, which is what a spec that lays its categories out
  // by `theta` alone uses.
  const labelChannel = encoding.color ?? encoding.fill ?? encoding.theta;
  const labelField = labelChannel?.field ?? 'category';
  const radiusField = encoding.radius?.field ?? 'radius';

  return [rows.map(row => ({
    x: String(row[labelField] ?? ''),
    y: Number(readEncodedValue(row, encoding.radius, radiusField) ?? 0),
  }))];
}

function extractHistogramData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): HistogramPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';

  // Vega compiles binned data with `bin_maxbins_N_<field>` and
  // `bin_maxbins_N_<field>_end` fields.  The maxbins value varies
  // so we detect the actual field names from the first row.
  let binStart: string | undefined;
  let binEnd: string | undefined;
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    const binPrefix = `bin_`;
    const binSuffix = `_${xField}`;
    const endSuffix = `_${xField}_end`;
    binStart = keys.find(k => k.startsWith(binPrefix) && k.endsWith(binSuffix) && !k.endsWith(endSuffix));
    binEnd = keys.find(k => k.startsWith(binPrefix) && k.endsWith(endSuffix));
  }

  return rows.map((row) => {
    const xMin = Number((binStart ? row[binStart] : undefined) ?? row[xField] ?? 0);
    const xMax = Number((binEnd ? row[binEnd] : undefined) ?? xMin + 1);
    // Lookup order: explicit field FIRST, `__count` only as fallback. See
    // the matching note in `extractBarData` for why explicit fields win.
    const yVal = Number(row[yField] ?? row.__count ?? 0);

    return {
      x: `${xMin}-${xMax}`,
      y: yVal,
      xMin,
      xMax,
      yMin: 0,
      yMax: yVal,
    };
  });
}

function extractSegmentedData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): SegmentedPoint[][] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';
  const colorField = encoding.color?.field ?? encoding.fill?.field ?? 'group';

  // Detect horizontal orientation the same way extractBarData does: when x
  // is the quantitative channel and y is the category, the bars run
  // horizontally (e.g. `y:{field:'variety',type:'nominal'}`,
  // `x:{field:'yield',type:'quantitative'}`).
  const xIsQuantitative = encoding.x?.type === 'quantitative'
    || encoding.x?.aggregate != null;
  const yIsQuantitative = encoding.y?.type === 'quantitative'
    || encoding.y?.aggregate != null;
  const isHorizontal = xIsQuantitative && !yIsQuantitative;

  // Group by fill value. Each group becomes a row in the 2D array.
  // Insertion order is preserved so navigation order follows Vega's
  // data-flow order. The MAIDR `SegmentedTrace.mapToSvgElements`
  // iterates the SVG DOM via `layer.domMapping` set by `convertLayerSpec`
  // — `{ order: 'row' }` for stacked/normalised (series-major DOM)
  // or `{ order: 'column', groupDirection: 'forward' }` for dodged
  // (subject-major DOM).
  //
  // For horizontal charts the value lives on x and the category on y, so
  // emit `{ x: value, y: category }` (mirroring extractBarData and the
  // chartjs adapter's `indexAxis: 'y'` handling); the core AbstractBarPlot
  // reads the value from `point.x` when `orientation` is HORIZONTAL.
  //
  // `readEncodedValue` resolves aggregate-mangled columns (e.g. `sum_yield`)
  // and the synthetic `__count` field; the explicit field wins when present.
  const groups = new Map<string, SegmentedPoint[]>();
  for (const row of rows) {
    const fill = String(row[colorField] ?? '');
    const pt: SegmentedPoint = isHorizontal
      ? {
          x: Number(readEncodedValue(row, encoding.x, xField) ?? 0),
          y: String(row[yField] ?? ''),
          z: fill,
        }
      : {
          x: String(row[xField] ?? ''),
          y: Number(readEncodedValue(row, encoding.y, yField) ?? 0),
          z: fill,
        };
    if (!groups.has(fill))
      groups.set(fill, []);
    groups.get(fill)!.push(pt);
  }

  return [...groups.values()];
}

/**
 * Whether a segmented bar's series sit either side of a baseline.
 *
 * No Vega-Lite spec says "diverging". A population pyramid is authored as
 * an ordinary stacked bar over a `calculate` that negates one side, and a
 * Likert chart the same way, so the only evidence is in the resolved
 * values — which is why this runs after extraction rather than in
 * {@link resolveTraceType}.
 *
 * The test is per **series**, not per value, and that is what keeps it off
 * ordinary stacked bars. A chart of profit by region where one region had
 * a bad quarter carries negatives too, but they sit inside a series that
 * is otherwise positive; a diverging chart's sides are whole series that
 * never cross the baseline. Both directions must be present, so a chart of
 * costs — every series negative — stays the stacked bar it is.
 *
 * Zeros belong to neither side and are ignored: a Likert response nobody
 * picked is not evidence about which way that response points.
 *
 * @param series - The segmented points, one inner array per series
 * @param isHorizontal - Whether the magnitude rides x rather than y
 * @returns True when every series keeps to one side and both are used
 */
function sidesDiverge(
  series: SegmentedPoint[][],
  isHorizontal: boolean,
): boolean {
  let growsPositive = false;
  let growsNegative = false;

  for (const points of series) {
    const values = points
      .map(point => Number(isHorizontal ? point.x : point.y))
      .filter(value => Number.isFinite(value) && value !== 0);
    if (values.length === 0)
      continue;
    const positive = values.every(value => value > 0);
    const negative = values.every(value => value < 0);
    if (!positive && !negative)
      return false;
    growsPositive ||= positive;
    growsNegative ||= negative;
  }

  return growsPositive && growsNegative;
}

/**
 * Whether a segmented layer's rows arrive one series at a time.
 *
 * Vega draws a bar per row in dataset order, so the row order *is* the DOM
 * order: rows grouped by series produce `[series0-all-categories,
 * series1-all-categories, …]`, and interleaved rows produce
 * `[category0-all-series, …]`. Which of the two a spec yields depends on
 * how its source data was written, not on what kind of bar it is — which
 * is why the adapter usually leaves `domMapping` for bind-time detection
 * against the rendered SVG rather than guessing from the trace type.
 *
 * @param rows - The layer's resolved rows, in dataset order
 * @param colorField - The column telling the series apart
 * @returns True when each series' rows are contiguous
 */
function rowsAreSeriesMajor(
  rows: Record<string, unknown>[],
  colorField: string,
): boolean {
  const started = new Set<string>();
  let current: string | undefined;
  for (const row of rows) {
    const series = String(row[colorField] ?? '');
    if (series === current)
      continue;
    if (started.has(series))
      return false;
    started.add(series);
    current = series;
  }
  return true;
}

function extractLineData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): LinePoint[][] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';
  const colorField = encoding.color?.field ?? encoding.fill?.field;

  if (colorField) {
    // Series order follows insertion order, which mirrors the order
    // Vega draws lines in the SVG. `buildLineSelectors` produces one
    // selector per series in the same order, keeping highlight indices
    // aligned.
    const groups = new Map<string, LinePoint[]>();
    for (const row of rows) {
      const key = String(row[colorField] ?? '');
      const pt: LinePoint = {
        x: (row[xField] ?? 0) as number | string,
        y: Number(readEncodedValue(row, encoding.y, yField) ?? 0),
        z: key,
      };
      if (!groups.has(key))
        groups.set(key, []);
      groups.get(key)!.push(pt);
    }
    return [...groups.values()];
  }

  const pts: LinePoint[] = rows.map(row => ({
    x: (row[xField] ?? 0) as number | string,
    y: Number(readEncodedValue(row, encoding.y, yField) ?? 0),
  }));
  return [pts];
}

/**
 * Read one polyline per observation across the folded variables.
 *
 * Two things separate this from {@link extractLineData}, and both are what
 * a parallel coordinates plot is.
 *
 * **The rows are grouped by `detail`, not by colour.** A row of this layer
 * is one *observation* — one penguin, one car — and the `detail` channel is
 * the only channel that identifies one. Grouped by colour instead, all
 * hundred-odd Adelie penguins would collapse into a single polyline
 * zig-zagging through every axis in turn.
 *
 * **The magnitude comes off the fold's own value column.** The gallery
 * recipe min-max normalises before plotting, because Vega-Lite has one y
 * scale and the variables do not share units — so the y channel reads
 * `norm_val`, and a layer built from it would announce every axis as a
 * number between 0 and 1. `ParallelTrace` derives each axis' extent from
 * the layer itself and pitches against it, which *is* that normalisation,
 * so handing it the raw folded values costs nothing and buys back the
 * units the reader is actually after. When no such column survives on the
 * rows, the y channel is read as it stands.
 *
 * @param rows - The layer's resolved rows
 * @param encoding - The layer's encoding, merged with any parent's
 * @param folded - The fold transform's output columns
 * @param folded.keyColumn - The column naming each variable
 * @param folded.valueColumn - The column carrying each variable's value
 * @returns One inner array per observation, in data-flow order
 */
function extractParallelData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
  folded: { keyColumn: string; valueColumn: string },
): LinePoint[][] {
  const detailField = encoding.detail?.field ?? folded.keyColumn;
  // The colour channel is what names an observation in the reader's own
  // terms — a species, a manufacturer. The `detail` field is usually a
  // synthetic row counter (`window: [{op: 'count', as: 'index'}]` in the
  // gallery spec), which says nothing the row index does not already.
  const nameField = encoding.color?.field ?? encoding.fill?.field ?? detailField;
  const valueField = rows.some(row => row[folded.valueColumn] != null)
    ? folded.valueColumn
    : encoding.y?.field ?? 'y';

  const observations = new Map<string, LinePoint[]>();
  for (const row of rows) {
    const key = String(row[detailField] ?? '');
    if (!observations.has(key))
      observations.set(key, []);
    observations.get(key)!.push({
      x: String(row[folded.keyColumn] ?? ''),
      y: Number(row[valueField] ?? 0),
      z: String(row[nameField] ?? ''),
    });
  }
  return [...observations.values()];
}

function extractScatterData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): ScatterPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';
  // What the `text` mark writes at each position, which is the thing that
  // mark is drawn for. Absent on every other mark that reaches here, and an
  // empty string counts as absent per `ScatterPoint.label` (#1124).
  const labelField = hasField(encoding.text) ? encoding.text?.field : undefined;

  return rows.map((row) => {
    const point: ScatterPoint = {
      x: Number(row[xField] ?? 0),
      y: Number(row[yField] ?? 0),
    };
    const label = labelField === undefined ? undefined : row[labelField];
    if (label !== undefined && label !== null && String(label) !== '')
      point.label = String(label);
    return point;
  });
}

/**
 * The categories of one heatmap axis, in the order the chart draws them.
 *
 * Vega sorts a nominal domain rather than keeping the rows' own order, so the
 * two disagree whenever the data was not listed already sorted — and a chart
 * announced in the rows' order then describes a grid nobody is looking at.
 *
 * Nothing is reversed. Vega lays a band scale's first domain value out at the
 * top*, which is the order {@link HeatmapData} asks for; the sibling
 * adapters reverse only because their libraries count from the bottom (#977).
 *
 * The order can come only from the compiled view: `sort` on the encoding may
 * name another field, invert it, or give an explicit list, and only Vega
 * knows what those resolved to. Without a view the rows' own order is the
 * best guess available, and is what this returns.
 *
 * @param view - The compiled view, when one was supplied
 * @param channel - The positional channel, `'x'` or `'y'`
 * @param markGroupPrefix - The composite child's class prefix, if any
 * @param seen - The categories the rows carried, in the order they arrived
 * @returns The drawn order, or `seen` when there is no view to ask
 */
function orderedHeatmapAxis(
  view: VegaView | undefined,
  channel: string,
  markGroupPrefix: string,
  seen: string[],
): string[] {
  const domain = readScaleDomain(view, channel, markGroupPrefix);
  if (!domain)
    return seen;

  const present = new Set(seen);
  const ordered = domain.map(String).filter(value => present.has(value));
  // A domain naming *more* than this layer draws is still authoritative about
  // the relative order of what it does draw — a scale shared across a
  // composite spec is the ordinary case — so the extras are simply filtered
  // out. A domain missing one of the rows is a different matter: it is not
  // describing this grid, and taking it would drop a row the chart shows.
  return ordered.length === seen.length ? ordered : seen;
}

function extractHeatmapData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
  view?: VegaView,
  markGroupPrefix = '',
): HeatmapData {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';
  const colorField = encoding.color?.field ?? encoding.fill?.field ?? 'value';

  const xLabelsSet = new Set<string>();
  const yLabelsSet = new Set<string>();
  for (const row of rows) {
    xLabelsSet.add(String(row[xField] ?? ''));
    yLabelsSet.add(String(row[yField] ?? ''));
  }
  const xLabels = orderedHeatmapAxis(view, 'x', markGroupPrefix, [...xLabelsSet]);
  const yLabels = orderedHeatmapAxis(view, 'y', markGroupPrefix, [...yLabelsSet]);

  const xIndex = new Map(xLabels.map((l, i) => [l, i]));
  const yIndex = new Map(yLabels.map((l, i) => [l, i]));
  const points: number[][] = yLabels.map(() => xLabels.map(() => 0));

  for (const row of rows) {
    const xi = xIndex.get(String(row[xField] ?? ''));
    const yi = yIndex.get(String(row[yField] ?? ''));
    if (xi !== undefined && yi !== undefined) {
      points[yi][xi] = Number(row[colorField] ?? 0);
    }
  }

  return { x: xLabels, y: yLabels, points };
}

/**
 * Extract box plot data, preferring pre-computed Vega statistics when
 * available.  Vega-Lite's `boxplot` mark compiles to datasets with
 * `lower_box_<field>`, `upper_box_<field>`, `mid_box_<field>`,
 * `lower_whisker_<field>`, and `upper_whisker_<field>` columns.
 * When those are present we use them directly; otherwise we compute
 * quartiles from the raw values.
 */
function extractBoxData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): BoxPoint[] {
  // Mirror the valField pattern: catField is the NON-quantitative field so
  // horizontal boxplots (x=quant, y=nominal) group by y, not x. Without
  // this, horizontal Iris boxplots group by 43 unique petalLength values
  // instead of 3 species, which causes BOX BUILD count-mismatch SKIP.
  const catField = encoding.x?.type === 'quantitative'
    ? (encoding.y?.field ?? 'y')
    : (encoding.x?.field ?? 'x');
  const valField = encoding.x?.type === 'quantitative'
    ? (encoding.x?.field ?? 'x')
    : (encoding.y?.field ?? 'y');

  // Detect pre-computed Vega statistics.
  const lowerBoxKey = `lower_box_${valField}`;
  const upperBoxKey = `upper_box_${valField}`;
  const midBoxKey = `mid_box_${valField}`;
  const lowerWhiskerKey = `lower_whisker_${valField}`;
  const upperWhiskerKey = `upper_whisker_${valField}`;

  const hasPrecomputed = rows.length > 0 && lowerBoxKey in rows[0];

  // Boxes are emitted in the same order as the rows of the compiled
  // dataset. We keep that order so highlight indices match the SVG
  // group order.
  if (hasPrecomputed) {
    // Vega-Lite's joinaggregate transform produces a denormalized dataset:
    // each raw row carries both its original value AND the replicated box
    // stats for its category group. Deduplicate by category, and extract
    // outliers from raw values that fall outside the whisker bounds.
    interface BoxAccumulator {
      stats: { min: number; q1: number; q2: number; q3: number; max: number };
      lowerOutliers: number[];
      upperOutliers: number[];
    }
    const groups = new Map<string, BoxAccumulator>();

    for (const row of rows) {
      const fill = String(row[catField] ?? '');

      // Pre-computed stats (identical for every row in this category).
      const min = Number(row[lowerWhiskerKey] ?? row[lowerBoxKey] ?? 0);
      const q1 = Number(row[lowerBoxKey] ?? 0);
      const q2 = Number(row[midBoxKey] ?? 0);
      const q3 = Number(row[upperBoxKey] ?? 0);
      const max = Number(row[upperWhiskerKey] ?? row[upperBoxKey] ?? 0);

      if (!groups.has(fill)) {
        groups.set(fill, {
          stats: { min, q1, q2, q3, max },
          lowerOutliers: [],
          upperOutliers: [],
        });
      }

      // Outlier classification: the raw quantitative value coexists with
      // the aggregated stats in the denormalized dataset. If the field is
      // absent (genuinely pre-aggregated dataset with no raw rows),
      // outliers stay empty — that is the correct behaviour because such
      // datasets do not carry individual outlier observations.
      const rawValue = row[valField];
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        const g = groups.get(fill)!;
        if (rawValue < g.stats.min) {
          g.lowerOutliers.push(rawValue);
        } else if (rawValue > g.stats.max) {
          g.upperOutliers.push(rawValue);
        }
      }
    }

    // Preserve first-seen category order. Sort outliers ascending per
    // BoxPoint consumer contract.
    const result: BoxPoint[] = [];
    for (const [fill, g] of groups) {
      g.lowerOutliers.sort((a, b) => a - b);
      g.upperOutliers.sort((a, b) => a - b);
      result.push({
        z: fill,
        lowerOutliers: g.lowerOutliers,
        min: g.stats.min,
        q1: g.stats.q1,
        q2: g.stats.q2,
        q3: g.stats.q3,
        max: g.stats.max,
        upperOutliers: g.upperOutliers,
      });
    }
    return result;
  }

  // Fall back to computing from raw values.
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[catField] ?? '');
    const val = Number(row[valField] ?? 0);
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key)!.push(val);
  }

  const result: BoxPoint[] = [];
  for (const [fill, values] of groups) {
    values.sort((a, b) => a - b);
    const n = values.length;
    const q1 = percentile(values, 0.25);
    const q2 = percentile(values, 0.5);
    const q3 = percentile(values, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    const lowerOutliers = values.filter(v => v < lowerFence);
    const upperOutliers = values.filter(v => v > upperFence);
    const nonOutliers = values.filter(v => v >= lowerFence && v <= upperFence);

    result.push({
      z: fill,
      lowerOutliers,
      min: nonOutliers.length > 0 ? nonOutliers[0] : (n > 0 ? values[0] : 0),
      q1,
      q2,
      q3,
      max: nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : (n > 0 ? values[n - 1] : 0),
      upperOutliers,
    });
  }

  return result;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0)
    return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi)
    return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * True when the value axis is x — a chart whose rows run across the page
 * rather than up it.
 *
 * The same test `extractBarData`, `extractBoxData` and the layer conversion
 * below already make: a quantitative (or aggregated) x against a category y.
 *
 * @param encoding - The layer's encoding, merged with any parent's
 * @returns True when x measures and y names
 */
function isHorizontalEncoding(encoding: VegaLiteEncoding): boolean {
  const xIsQuantitative = encoding.x?.type === 'quantitative'
    || encoding.x?.aggregate != null;
  const yIsQuantitative = encoding.y?.type === 'quantitative'
    || encoding.y?.aggregate != null;
  return xIsQuantitative && !yIsQuantitative;
}

/**
 * Strips binary floating-point noise from a subtracted magnitude.
 *
 * A contribution is derived rather than authored, so `4000.2 - 1707.1`
 * announces as `2293.099999999999` unless it is cleaned up. Twelve
 * significant figures rather than a fixed number of decimals, for the
 * reason `WaterfallTrace` and `GanttTrace` both give: the decimals a chart
 * needs depend on its scale.
 *
 * @param value - A magnitude obtained by subtraction
 * @returns The same magnitude without the trailing artifact
 */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * The spread Vega-Lite draws by default around an `errorbar` centre.
 *
 * Only the default is reproduced. A spec asking for `ci`, `iqr` or `stdev`
 * gets no bounds from the fallback below rather than a standard error
 * dressed up as the interval it asked for — a wrong interval is worse than
 * an absent one, because the reader has no way to tell.
 *
 * @param values - The observations in one group
 * @returns The standard error, or `NaN` when a single observation makes it
 * undefined
 */
function standardError(values: number[]): number {
  if (values.length < 2)
    return Number.NaN;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / (values.length - 1);
  return Math.sqrt(variance) / Math.sqrt(values.length);
}

/**
 * Extract error bar data, preferring the bounds Vega-Lite computed.
 *
 * The `errorbar` and `errorband` marks are composites: Vega-Lite aggregates
 * the raw observations itself and compiles the result into
 * `center_<field>`, `lower_<field>` and `upper_<field>` columns, one row per
 * sample. Those columns are the bounds the chart actually drew — whichever
 * `extent` the spec asked for — so they are used verbatim when present, the
 * way {@link extractBoxData} uses `lower_box_<field>`.
 *
 * The fallback runs only when the layer resolved to raw observations, which
 * happens when no compiled view is available. It reproduces Vega-Lite's
 * default extent and nothing else; see {@link standardError}.
 *
 * @param rows - The layer's resolved rows
 * @param encoding - The layer's encoding, merged with any parent's
 * @param extent - The spec's declared `extent`, when it declares one
 * @returns One estimate per sample, with the interval when it is known
 */
function extractErrorBarData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
  extent?: string,
): ErrorBarPoint[] {
  // The category names the sample and the estimate is always `y`, whichever
  // way round the chart is drawn: `ErrorBarTrace` reads the magnitude off
  // `y` in both orientations and swaps only the axis labels. That is the
  // opposite of `extractBarData`, which moves the value onto `x`.
  const isHorizontal = isHorizontalEncoding(encoding);
  const catChannel = isHorizontal ? encoding.y : encoding.x;
  const valChannel = isHorizontal ? encoding.x : encoding.y;
  const catField = catChannel?.field ?? (isHorizontal ? 'y' : 'x');
  const valField = valChannel?.field ?? (isHorizontal ? 'x' : 'y');

  const lowerKey = `lower_${valField}`;
  const upperKey = `upper_${valField}`;
  const centerKey = `center_${valField}`;

  if (rows.length > 0 && lowerKey in rows[0]) {
    return rows.map((row) => {
      const point: ErrorBarPoint = {
        x: String(row[catField] ?? ''),
        y: Number(row[centerKey] ?? readEncodedValue(row, valChannel, valField) ?? 0),
      };
      // Each bound independently: Vega-Lite draws one-sided intervals, and
      // dropping the estimate for want of the other half loses more than it
      // protects.
      const lower = Number(row[lowerKey]);
      if (Number.isFinite(lower))
        point.yMin = lower;
      const upper = Number(row[upperKey]);
      if (Number.isFinite(upper))
        point.yMax = upper;
      return point;
    });
  }

  // Raw observations: aggregate them the way the mark would have.
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[catField] ?? '');
    const value = Number(row[valField]);
    if (!groups.has(key))
      groups.set(key, []);
    if (Number.isFinite(value))
      groups.get(key)!.push(value);
  }

  const points: ErrorBarPoint[] = [];
  for (const [key, values] of groups) {
    const mean = values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    const point: ErrorBarPoint = { x: key, y: withoutFloatNoise(mean) };
    const spread = extent === undefined || extent === 'stderr'
      ? standardError(values)
      : Number.NaN;
    if (Number.isFinite(spread)) {
      point.yMin = withoutFloatNoise(mean - spread);
      point.yMax = withoutFloatNoise(mean + spread);
    }
    points.push(point);
  }
  return points;
}

/**
 * Which fields a ranged bar reads, and which way round it is drawn.
 *
 * A gantt spans `x`–`x2` with its lanes on y (the ordinary way to draw a
 * schedule); a waterfall, and a vertical ranged bar, span `y`–`y2` with the
 * rows on x.
 *
 * @param encoding - The layer's encoding, merged with any parent's
 * @returns The row field, the two bound fields, and the orientation
 */
function resolveRangedFields(encoding: VegaLiteEncoding): {
  rowField: string;
  startField: string;
  endField: string;
  isHorizontal: boolean;
} {
  const isHorizontal = hasField(encoding.x) && hasField(encoding.x2);
  return isHorizontal
    ? {
        rowField: encoding.y?.field ?? 'y',
        startField: encoding.x?.field ?? 'x',
        endField: encoding.x2?.field ?? 'x2',
        isHorizontal,
      }
    : {
        rowField: encoding.x?.field ?? 'x',
        startField: encoding.y?.field ?? 'y',
        endField: encoding.y2?.field ?? 'y2',
        isHorizontal,
      };
}

/**
 * Group a ranged bar's rows into lanes.
 *
 * Lanes keep first-seen row order rather than the scale's, so lane k holds
 * the intervals Vega drew k-th — which is what lets the highlight
 * selectors, resolved in DOM order, be sliced per lane. Lanes the scale
 * declares but no row fills are appended after, because an empty lane is a
 * real statement about a schedule and the nested payload exists to carry
 * one.
 *
 * @param rows - The layer's resolved rows
 * @param encoding - The layer's encoding, merged with any parent's
 * @param laneDomain - The lane scale's domain, when the view exposes one
 * @returns The lanes and their names, in drawing order
 */
function extractGanttData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
  laneDomain?: unknown[],
): GanttData {
  const { rowField, startField, endField } = resolveRangedFields(encoding);

  const lanes = new Map<string, GanttPoint[]>();
  for (const row of rows) {
    const lane = String(row[rowField] ?? '');
    const point: GanttPoint = {
      x: lane,
      start: Number(row[startField] ?? 0),
      end: Number(row[endField] ?? 0),
    };
    if (!lanes.has(lane))
      lanes.set(lane, []);
    lanes.get(lane)!.push(point);
  }

  for (const lane of laneDomain ?? []) {
    const name = String(lane ?? '');
    if (!lanes.has(name))
      lanes.set(name, []);
  }

  return { points: [...lanes.values()], lanes: [...lanes.keys()] };
}

/**
 * Whether grouping the rows into lanes preserves their order.
 *
 * `GanttTrace` slices one flat list of SVG elements into lanes, taking the
 * first lane's worth, then the second's. Vega emits those elements in row
 * order, so the slicing is only correct when each lane's rows are already
 * adjacent. Interleaved rows — a resource booked, then another, then the
 * first again — would hand lane A the element Vega drew for lane B, so the
 * caller withholds the selectors instead.
 *
 * @param rows - The layer's resolved rows
 * @param rowField - The field naming the lane
 * @returns True when every lane's rows are contiguous
 */
function lanesFollowRowOrder(
  rows: Record<string, unknown>[],
  rowField: string,
): boolean {
  const seen = new Set<string>();
  let current: string | undefined;
  for (const row of rows) {
    const lane = String(row[rowField] ?? '');
    if (lane === current)
      continue;
    if (seen.has(lane))
      return false;
    seen.add(lane);
    current = lane;
  }
  return true;
}

/**
 * Read one step per row: where the running total stood before it, where it
 * stood after, and the contribution between them.
 *
 * `start` and `end` come straight from the two positional bounds the bar is
 * drawn between, which are the running totals Vega-Lite's `window` sum
 * produced. `delta` is their difference — carried rather than left to the
 * consumer, per {@link WaterfallPoint}.
 *
 * A step is a `total` when it stands on the baseline at either end of the
 * sequence, which is how the opening and closing bars of a waterfall are
 * drawn: they restate the running total rather than contributing to it. A
 * middle step that happens to start from zero is a contribution like any
 * other, and reads as one.
 *
 * @param rows - The layer's resolved rows
 * @param encoding - The layer's encoding, merged with any parent's
 * @returns The steps, in the order the chart draws them
 */
function extractWaterfallData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): WaterfallPoint[] {
  const { rowField, startField, endField } = resolveRangedFields(encoding);

  return rows.map((row, index) => {
    const start = Number(row[startField] ?? 0);
    const end = Number(row[endField] ?? 0);
    const delta = withoutFloatNoise(end - start);
    const isEndOfSequence = index === 0 || index === rows.length - 1;
    const kind: WaterfallKind = start === 0 && isEndOfSequence
      ? 'total'
      : (delta < 0 ? 'decrease' : 'increase');

    return { x: String(row[rowField] ?? ''), start, end, delta, kind };
  });
}

// ---------------------------------------------------------------------------
// Paired layers — one chart drawn as a segment layer plus a dot layer
// ---------------------------------------------------------------------------

/** Marks Vega-Lite draws a connecting segment with. */
function isConnectorMark(mark: string | null): boolean {
  return mark === 'rule' || mark === 'line';
}

/** Marks Vega-Lite draws a dot with. */
function isDotMark(mark: string | null): boolean {
  return mark === 'point' || mark === 'circle' || mark === 'square';
}

/**
 * The category channel of an encoding and the value channel opposite it.
 *
 * @param encoding - The layer's encoding, merged with any parent's
 * @returns The two fields and which way round they are drawn, or `null`
 * when the encoding is not one category against one magnitude
 */
function resolveCategoryChannels(encoding: VegaLiteEncoding): {
  catField: string;
  valChannel: VegaLiteChannelDef | undefined;
  valField: string;
  isHorizontal: boolean;
} | null {
  if (!hasField(encoding.x) || !hasField(encoding.y))
    return null;
  const categoricalX = isCategorical(encoding.x);
  const categoricalY = isCategorical(encoding.y);
  if (categoricalX === categoricalY)
    return null;
  return categoricalY
    ? {
        catField: encoding.y?.field ?? 'y',
        valChannel: encoding.x,
        valField: encoding.x?.field ?? 'x',
        isHorizontal: true,
      }
    : {
        catField: encoding.x?.field ?? 'x',
        valChannel: encoding.y,
        valField: encoding.y?.field ?? 'y',
        isHorizontal: false,
      };
}

/**
 * Pair up the two values a dumbbell compares at each category.
 *
 * The two ends are two rows of the same dataset told apart by a grouping
 * field — the year, the treatment arm — which is also where their names
 * come from, and there is no other source for those: announced as "start"
 * and "end", a chart of life expectancy in 1990 against 2020 tells the
 * reader which dot they are on but not which year it is.
 *
 * Returns `null` unless the data really is paired: exactly two values of
 * the grouping field, and exactly one row per category for each of them.
 * A category with three rows, or with the same end twice, is some other
 * chart, and a dumbbell reading of it would silently drop rows.
 *
 * @param rows - The dot layer's resolved rows
 * @param encoding - The dot layer's encoding, merged with any parent's
 * @param endOrder - The colour scale's domain, when the view exposes one
 * @returns The paired rows with their end names, or `null`
 */
function extractDumbbellData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
  endOrder?: unknown[],
): DumbbellData | null {
  const channels = resolveCategoryChannels(encoding);
  const groupField = encoding.color?.field ?? encoding.fill?.field;
  if (!channels || !groupField || rows.length === 0)
    return null;

  // The scale's domain is the order the chart draws the ends in; failing
  // that, the order they first appear in the data. A third distinct value
  // settles it — the group is not a pair — so stop there rather than walk
  // the rest of the rows.
  const ends: string[] = [];
  const endSet = new Set<string>();
  for (const value of endOrder ?? rows.map(row => row[groupField])) {
    const name = String(value ?? '');
    if (endSet.has(name))
      continue;
    if (ends.length === 2)
      return null;
    endSet.add(name);
    ends.push(name);
  }
  if (ends.length !== 2)
    return null;

  const pairs = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const category = String(row[channels.catField] ?? '');
    const end = String(row[groupField] ?? '');
    if (!endSet.has(end))
      return null;
    if (!pairs.has(category))
      pairs.set(category, new Map());
    const pair = pairs.get(category)!;
    if (pair.has(end))
      return null;
    pair.set(end, Number(readEncodedValue(row, channels.valChannel, channels.valField) ?? 0));
  }

  const points: DumbbellPoint[] = [];
  for (const [category, pair] of pairs) {
    const start = pair.get(ends[0]);
    const end = pair.get(ends[1]);
    if (start === undefined || end === undefined)
      return null;
    points.push({ x: category, start, end });
  }

  return { points, startLabel: ends[0], endLabel: ends[1] };
}

// ---------------------------------------------------------------------------
// Choropleth
// ---------------------------------------------------------------------------

/** How the shared declaration reader names this adapter in its warnings. */
const DECLARATION_ADAPTER = 'Vega-Lite';

/**
 * Where a `geoshape` layer's two facts live: what each region is called,
 * and the value it is shaded by.
 *
 * The region field is the part a map does not carry positionally — a
 * choropleth has no `x` — so it is recovered from the join that built the
 * layer, or named outright in a `usermeta.maidr` block.
 */
interface ChoroplethFields {
  /** Field naming each region, resolved against the row. */
  region: string;
  /** What to call the regions on the announced axis. */
  regionLabel: string;
  /** Field carrying the shaded value. */
  value: string;
  /** What to call the values on the announced axis. */
  valueLabel: string;
  /**
   * The channel `value` came from, when it came from the encoding rather
   * than from a declaration — which is what says whether Vega-Lite renamed
   * the column while aggregating it.
   */
  valueChannel?: VegaLiteChannelDef;
  /** The declaration, when the spec carried one. */
  declaration?: ChoroplethDeclaration;
}

/**
 * Read a field off a row, reaching into nested objects for a dotted name.
 *
 * TopoJSON features nest everything a spec can key on: a world map joins on
 * `properties.name` and a US one on `id`, and Vega resolves both as field
 * accessors. A flat property wins, since Vega-Lite escapes a literal dot in
 * a column name and the unescaped form is then the nested one.
 *
 * @param row - The row the layer resolved
 * @param field - The field name, possibly a dotted path
 * @returns The value, or `undefined` when the path leads nowhere
 */
function readFieldPath(row: Record<string, unknown>, field: string): unknown {
  if (field in row)
    return row[field];
  if (!field.includes('.'))
    return undefined;

  let value: unknown = row;
  for (const step of field.split('.')) {
    if (typeof value !== 'object' || value === null)
      return undefined;
    value = (value as Record<string, unknown>)[step];
  }
  return value;
}

/**
 * A number in degrees, or nothing.
 *
 * Degrees are the whole point of a centroid — they are what settles whether
 * a rising value means north or south — so anything that is not one is left
 * out rather than passed on. A projected or normalised coordinate would put
 * regions in compass directions from one another that the map does not.
 *
 * @param value - Whatever the centroid field resolved to
 * @returns The coordinate, or `undefined`
 */
function toDegrees(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '')
    return undefined;
  const degrees = Number(value);
  return Number.isFinite(degrees) ? degrees : undefined;
}

/**
 * The field a `geoshape` layer names its regions with, read off the spec.
 *
 * A choropleth is built by joining values onto geometry, and the join key
 * is* the region's identity — it is the one field guaranteed present on
 * every drawn feature and distinct between them. Failing that, the tooltip:
 * on a map it is the only place left where a spec says what a region is,
 * since there is no positional channel to say it. A tooltip entry naming
 * the shaded value is skipped, because announcing the value as the region's
 * name would leave the map with no names at all.
 *
 * @param encoding - The layer's encoding, merged with any parent's
 * @param transform - The transforms in scope for the layer
 * @param valueField - The field the regions are shaded by
 * @returns The field and the label to announce it under, or `null`
 */
function resolveRegionSource(
  encoding: VegaLiteEncoding,
  transform: VegaLiteTransform[] | undefined,
  valueField: string | undefined,
): { field: string; label: string } | null {
  const joined = transform?.find(entry => typeof entry.lookup === 'string')?.lookup;
  if (typeof joined === 'string' && joined.length > 0) {
    // `properties.name` is a path into the feature, not a name a reader
    // would recognise; the leaf of it is.
    const leaf = joined.slice(joined.lastIndexOf('.') + 1);
    return { field: joined, label: leaf };
  }

  const tooltip = encoding.tooltip;
  const channels = Array.isArray(tooltip) ? tooltip : tooltip ? [tooltip] : [];
  const named = channels.find(
    channel => hasField(channel) && channel.field !== valueField,
  );
  return named?.field ? { field: named.field, label: getAxisLabel(named) } : null;
}

/**
 * Work out which columns a choropleth layer reads.
 *
 * A declaration outranks the spec for both facts. Note that `region` does
 * **not** fall back to a column literally called `region` the way the
 * naming law's other fields fall back to their own names: a `geoshape`
 * spec's join already names the field, so the spec-derived answer is the
 * better default and is used wherever the author named nothing.
 *
 * @param encoding - The layer's encoding, merged with any parent's
 * @param transform - The transforms in scope for the layer
 * @param declaration - The layer's `usermeta.maidr` block, when it declared one
 * @param seriesRef - How the author can find this layer, for warnings
 * @returns The fields to read, or `null` when the spec names no regions
 */
function resolveChoroplethFields(
  encoding: VegaLiteEncoding,
  transform: VegaLiteTransform[] | undefined,
  declaration: ChoroplethDeclaration | undefined,
  seriesRef: string,
): ChoroplethFields | null {
  const valueChannel = encoding.color ?? encoding.fill;
  const value = declaration?.value ?? valueChannel?.field;
  if (value === undefined) {
    console.warn(
      `[MAIDR ${DECLARATION_ADAPTER}] maidr declaration for "choropleth" on `
      + `${seriesRef} has no colour or fill field to shade the regions by and `
      + `names none with "value"; the map is left unread.`,
    );
    return null;
  }

  const region = declaration?.region
    ? { field: declaration.region, label: declaration.region }
    : resolveRegionSource(encoding, transform, valueChannel?.field);
  if (!region) {
    console.warn(
      `[maidr/vegalite] A geoshape map on ${seriesRef} names its regions `
      + `nowhere MAIDR can read: add the "lookup" transform that joins the `
      + `values on, a "tooltip" naming the region field, or a `
      + `usermeta.maidr block declaring "region". The map is left unread.`,
    );
    return null;
  }

  return {
    region: region.field,
    regionLabel: region.label,
    value,
    valueLabel: declaration?.value !== undefined || !valueChannel
      ? value
      : getAxisLabel(valueChannel),
    valueChannel: declaration?.value === undefined ? valueChannel : undefined,
    declaration,
  };
}

/**
 * Read one region per row: what it is called and the value shading it.
 *
 * A row the join left unmatched carries no value — Vega still draws the
 * geometry, unshaded — and is dropped rather than shaded with a stand-in:
 * a region announced as zero is a claim the map does not make. Dropping it
 * costs the layer its highlighting when it happens, since the regions then
 * no longer line up one-to-one with the drawn shapes, so say so.
 *
 * `lon`/`lat` are read only from a declaration. A projection is not
 * inverted to synthesise them: with the pair the reader walks the map by
 * compass direction, and with a *wrong* pair they walk a map that does not
 * exist, so the centroids come from the author or not at all.
 *
 * @param rows - The layer's resolved rows
 * @param fields - The columns this layer reads
 * @param seriesRef - How the author can find this layer, for warnings
 * @returns One region per readable row, in data-flow order
 */
function extractChoroplethData(
  rows: Record<string, unknown>[],
  fields: ChoroplethFields,
  seriesRef: string,
): ChoroplethPoint[] {
  const { declaration } = fields;
  const resolved = new Set<string>();
  const points: ChoroplethPoint[] = [];

  for (const row of rows) {
    const name = readFieldPath(row, fields.region);
    if (name !== undefined && name !== null) {
      resolved.add('region');
    }
    const read = fields.valueChannel
      ? readEncodedValue(row, fields.valueChannel, fields.value)
      : readFieldPath(row, fields.value);
    if (read !== undefined && read !== null) {
      resolved.add('value');
    }

    const shaded = Number(read);
    if (name === undefined || name === null || !Number.isFinite(shaded)) {
      continue;
    }

    const point: ChoroplethPoint = {
      x: typeof name === 'number' ? name : String(name),
      y: shaded,
    };
    if (declaration) {
      const lon = toDegrees(resolveFieldRef(row, declaration.lon, 'lon'));
      const lat = toDegrees(resolveFieldRef(row, declaration.lat, 'lat'));
      // Each half is tracked on its own, because the diagnostic answers a
      // different question than the payload does: whether *this* name found
      // degrees on the row. Tracking the pair together makes a correctly
      // named `lon` report as missing whenever `lat` is the typo, pointing
      // the author at the one field that was right.
      if (lon !== undefined) {
        resolved.add('lon');
      }
      if (lat !== undefined) {
        resolved.add('lat');
      }
      // Both or neither: half a centroid places a region nowhere, and
      // `ChoroplethTrace` bands the map only when every region has the pair.
      if (lon !== undefined && lat !== undefined) {
        point.lon = lon;
        point.lat = lat;
      }
    }
    points.push(point);
  }

  if (points.length < rows.length) {
    console.warn(
      `[maidr/vegalite] ${rows.length - points.length} of ${rows.length} `
      + `geoshape features on ${seriesRef} carry no value to announce and were `
      + `dropped; the remaining regions no longer line up with the drawn `
      + `shapes, so this layer is not highlighted.`,
    );
  }
  reportUnresolvedRefs(declaration, resolved, seriesRef);
  return points;
}

/**
 * Report every field the author named that no row of the layer carried.
 *
 * An explicit {@link FieldRef} is used verbatim, so a typo resolves to
 * nothing on every row and the fact is quietly left out of the payload.
 * Saying which name missed is what turns that into something the author can
 * fix.
 *
 * @param declaration - The layer's declaration, when it carried one
 * @param resolved - The canonical names that resolved on at least one row
 * @param seriesRef - How the author can find this layer
 */
function reportUnresolvedRefs(
  declaration: ChoroplethDeclaration | undefined,
  resolved: Set<string>,
  seriesRef: string,
): void {
  if (!declaration) {
    return;
  }
  const named: [string, string | undefined][] = [
    ['region', declaration.region],
    ['value', declaration.value],
    ['lon', declaration.lon],
    ['lat', declaration.lat],
  ];
  for (const [canonical, ref] of named) {
    if (ref !== undefined && !resolved.has(canonical)) {
      warnUnresolvedRef(
        { adapter: DECLARATION_ADAPTER, seriesRef },
        ref,
        canonical,
      );
    }
  }
}

/**
 * Apply a `usermeta.maidr` block's `type` over the mark's own reading.
 *
 * A declaration outranks every heuristic, but only where the library
 * construct can back it: Vega-Lite says what most of its marks are, and the
 * one thing a spec cannot say for itself here is that a `geoshape` is a
 * choropleth when no colour encoding shades it. Anything else declared is
 * reported against what was actually drawn and read as the undeclared
 * chart, per the disagreement rule — never thrown, and never announced as a
 * chart the marks do not draw.
 *
 * @param declaration - The layer's declaration, when it carried one
 * @param mark - The layer's mark
 * @param resolved - What the mark and its encoding resolved to
 * @param seriesRef - How the author can find this layer
 * @returns The type to read the layer as
 */
function applyDeclaredType(
  declaration: MaidrTraceDeclaration | null,
  mark: string,
  resolved: TraceType | null,
  seriesRef: string,
): TraceType | null {
  if (!declaration || declaration.type === resolved) {
    return resolved;
  }
  if (declaration.type === TraceType.CHOROPLETH && mark === 'geoshape') {
    return TraceType.CHOROPLETH;
  }
  console.warn(
    `[MAIDR ${DECLARATION_ADAPTER}] maidr declaration for "${declaration.type}" `
    + `on ${seriesRef} names a chart this adapter cannot read from a "${mark}" `
    + `mark; reading it as the undeclared chart.`,
  );
  return resolved;
}

/**
 * Report a declaration written on a spec node that becomes no single layer.
 *
 * A declaration says what **one** layer means. On a `layer`, `concat`,
 * `facet` or `repeat` parent it names none of the several layers below it,
 * and guessing which one it meant would announce the wrong half of a
 * composite map as the chart. Move it down onto the child it describes.
 *
 * Called at every point a composite node is descended into, not only on the
 * entry spec: a concat child or a faceted child can itself be a `layer`, and
 * a declaration stranded on one of those is as unusable as on the outer
 * node. Each call site fires once per node, so a misplaced declaration is
 * reported once however many panels the node expands into.
 *
 * @param spec - The spec about to be converted
 */
function warnCompositeDeclaration(spec: VegaLiteSpec): void {
  if (spec.usermeta?.maidr === undefined) {
    return;
  }
  const composite = spec.layer ?? spec.hconcat ?? spec.vconcat ?? spec.concat
    ?? spec.facet ?? spec.repeat;
  if (composite === undefined) {
    return;
  }
  console.warn(
    `[MAIDR ${DECLARATION_ADAPTER}] maidr declaration on a composite spec `
    + `names no one layer; move it onto the layer, concat or facet child it `
    + `describes. Ignored.`,
  );
}

/**
 * Whether a layer is a `text` mark written over the mark it labels.
 *
 * Vega-Lite's way of labelling points is a `layer:` of the mark and a `text`
 * on the same two positional channels. Both halves then satisfy the labelled
 * scatter test in {@link resolveTraceType}, and the figure would come back
 * with two scatters over one set of points -- the same numbers announced
 * twice, once with names and once without.
 *
 * The labels belong *on* the points rather than beside them, which is what
 * the Observable adapter's `labelOverlays` does. Declining is the smaller
 * half of that: the layered chart reads exactly as it did before #1124,
 * while a standalone `text` gains the reading it never had.
 *
 * Told by the fields, not by the order: a label layer may be written before
 * or after the mark it labels, and a `text` layer over *different* channels
 * is a chart of its own rather than an annotation.
 *
 * @param specs - The layered spec's children
 * @param index - Position of the candidate label layer
 * @param parentEncoding - Encoding hoisted onto the layered parent
 * @returns True when this layer only names another layer's marks
 */
function labelsAnotherLayer(
  specs: VegaLiteSpec[],
  index: number,
  parentEncoding: VegaLiteEncoding | undefined,
): boolean {
  if (getMarkType(specs[index]) !== 'text')
    return false;

  const labels: VegaLiteEncoding = { ...parentEncoding, ...specs[index].encoding };
  if (!hasField(labels.x) || !hasField(labels.y))
    return false;

  return specs.some((sibling, at) => {
    if (at === index || getMarkType(sibling) === 'text')
      return false;
    const drawn: VegaLiteEncoding = { ...parentEncoding, ...sibling.encoding };
    return drawn.x?.field === labels.x?.field && drawn.y?.field === labels.y?.field;
  });
}

/**
 * Convert a segment layer and the dot layer that follows it into the one
 * chart they draw together.
 *
 * Vega-Lite has no lollipop mark and no dumbbell mark: both are authored as
 * a `layer:` of a segment and its dots. Read layer by layer, the segment is
 * dropped — a `rule` with one positional field resolves to no trace type,
 * which is every stem this pairs — and the dots are announced as a scatter,
 * so the chart loses the thing it is drawn to show: the stem's magnitude, or
 * the gap between the pair.
 *
 * This pass runs *before* per-layer conversion, which is what keeps a genuine
 * ranged dot plot reading as a dumbbell now that a `rule` spanning two bounds
 * has a reading of its own (#1122).
 *
 * The two are told apart by the data. Two values at every category, told
 * apart by a grouping field, is a dumbbell; one value at each is a
 * lollipop, whose stem runs from the baseline and carries no second
 * magnitude of its own.
 *
 * The highlight goes on the **segment** layer in both cases: it is one
 * element per row (Vega draws one `<path>` per `detail` group, one `<line>`
 * per rule) and it spans what the reader is being told, where a dot layer
 * holds two elements per dumbbell row.
 *
 * @param specs - The layered spec's children
 * @param index - Position of the candidate segment layer
 * @param view - The compiled view, when one was supplied
 * @param parentEncoding - Encoding hoisted onto the layered parent
 * @returns The collapsed layer, or `null` when this is not such a pair
 */
function convertPairedLayers(
  specs: VegaLiteSpec[],
  index: number,
  view: VegaView | undefined,
  parentEncoding: VegaLiteEncoding | undefined,
): MaidrLayer | null {
  const connectorSpec = specs[index];
  const dotSpec = specs[index + 1];
  if (!dotSpec)
    return null;

  const connectorMark = getMarkType(connectorSpec);
  const dotMark = getMarkType(dotSpec);
  if (!connectorMark || !isConnectorMark(connectorMark) || !isDotMark(dotMark))
    return null;

  const connectorEncoding: VegaLiteEncoding = { ...parentEncoding, ...connectorSpec.encoding };
  const dotEncoding: VegaLiteEncoding = { ...parentEncoding, ...dotSpec.encoding };

  // Both layers must draw the same two channels of the same data, or they
  // are two charts that happen to be stacked — a mean rule over a
  // histogram, an annotation over a scatter.
  const channels = resolveCategoryChannels(dotEncoding);
  if (!channels
    || connectorEncoding.x?.field !== dotEncoding.x?.field
    || connectorEncoding.y?.field !== dotEncoding.y?.field) {
    return null;
  }

  // A `line` connector only connects when it says what it joins. Vega-Lite's
  // ranged dot plot draws one path per category by naming that category in
  // `detail`; a `line` under a dot layer without it is the ordinary
  // line-with-markers idiom, whose colour series a dumbbell reading would
  // announce as the two ends of a comparison nobody drew — a two-series line
  // over an ordinal x, one row per category per series, satisfies every other
  // test here. A `rule` needs no such proof: it is one segment per row by
  // construction, and it draws no series of its own.
  if (connectorMark === 'line' && connectorEncoding.detail?.field !== channels.catField) {
    return null;
  }

  const selectors = buildSelector(connectorMark, index, true);
  const axes: MaidrLayer['axes'] = {
    x: getAxisConfig(dotEncoding.x),
    y: getAxisConfig(dotEncoding.y),
  };

  const dotRows = resolveData(dotSpec, index + 1, view, `layer_${index + 1}_marks`);
  const dumbbell = extractDumbbellData(
    dotRows,
    dotEncoding,
    readScaleDomain(view, 'color', ''),
  );
  if (dumbbell) {
    const layer: MaidrLayer = {
      id: String(index),
      type: TraceType.DUMBBELL,
      selectors,
      axes,
      data: dumbbell,
    };
    if (channels.isHorizontal)
      layer.orientation = Orientation.HORIZONTAL;
    return layer;
  }

  // A lollipop's stem runs from the baseline to the value, so it carries no
  // second bound of its own; one that does is a segment between two
  // measured values, which is a chart this pass has no reading for.
  if (connectorMark !== 'rule'
    || hasField(connectorEncoding.x2) || hasField(connectorEncoding.y2)) {
    return null;
  }

  // The stem's own rows, so the points line up with the elements the
  // selector resolves to.
  const rows = resolveData(connectorSpec, index, view, `layer_${index}_marks`);
  if (rows.length === 0)
    return null;

  // One stem per category. Several rows at one category is a strip plot or
  // a grouped chart, whose repeated categories a lollipop reading would
  // announce as if they were distinct — the dots read better as the dot
  // plot they are, which is what the ordinary per-layer path produces.
  const categories = new Set(rows.map(row => String(row[channels.catField] ?? '')));
  if (categories.size !== rows.length)
    return null;

  const layer: MaidrLayer = {
    id: String(index),
    type: TraceType.LOLLIPOP,
    selectors,
    axes,
    data: extractBarData(rows, connectorEncoding, channels.isHorizontal),
  };
  if (channels.isHorizontal)
    layer.orientation = Orientation.HORIZONTAL;
  return layer;
}

// ---------------------------------------------------------------------------
// Layer conversion
// ---------------------------------------------------------------------------

function convertLayerSpec(
  spec: VegaLiteSpec,
  index: number,
  view?: VegaView,
  parentEncoding?: VegaLiteEncoding,
  isLayered?: boolean,
  domOrderOverride?: 'series-major' | 'subject-major',
  selectorOverride?: { layerIndex: number; markGroupPrefix: string; cellScope?: string },
  rowsOverride?: Record<string, unknown>[],
  parentTransform?: VegaLiteTransform[],
): MaidrLayer | null {
  const mark = getMarkType(spec);
  if (!mark)
    return null;

  // Merge parent encoding (from layered spec) with layer encoding.
  const encoding: VegaLiteEncoding = {
    ...parentEncoding,
    ...spec.encoding,
  };

  // A layered spec's own transforms run before every layer's, so the two
  // together are what produced this layer's rows. Only trace resolution
  // reads them: the series naming below deliberately still looks at the
  // layer's own `transform`, since a parent filter narrows every layer
  // alike and so names none of them.
  const transform = parentTransform
    ? [...parentTransform, ...(spec.transform ?? [])]
    : spec.transform;

  const stepDirection = getStepDirection(spec);

  // `usermeta` is Vega-Lite's own slot for third-party metadata, and the
  // only home a JSON-authored or Altair-produced spec has for a
  // declaration. Read before the mark's own reading, since a declaration
  // outranks every heuristic.
  const seriesRef = `layer ${index}`;
  const declaration = readDeclarationSlot(spec.usermeta, {
    adapter: DECLARATION_ADAPTER,
    seriesRef,
  });
  const traceType = applyDeclaredType(
    declaration,
    mark,
    resolveTraceType(mark, encoding, stepDirection, transform),
    seriesRef,
  );

  if (!traceType)
    return null;

  const axes: MaidrLayer['axes'] = {
    x: getAxisConfig(encoding.x),
    y: getAxisConfig(encoding.y),
  };

  const layered = isLayered ?? false;

  // Concat children render their mark groups under Vega class tokens like
  // `concat_<i>_marks` / `concat_<i>_layer_<j>_marks`, not the bare `marks`
  // / `layer_<N>_marks` used by single-view and layered specs. When a
  // selector override is supplied, use its local layer index and class
  // prefix so highlight selectors match those concat mark groups.
  const selectorLayerIndex = selectorOverride?.layerIndex ?? index;
  const markGroupPrefix = selectorOverride?.markGroupPrefix ?? '';

  // A parallel coordinates layer is the one case where the layer index is
  // no guide to the pipeline: the gallery spec draws its axis rules first,
  // so the polylines are layer 1 reading `data_0`. Naming the fold's own
  // columns lets the resolver skip the rule layer's tally table.
  const folded = resolveFoldedAxes(encoding, transform);

  // Faceted callers pre-filter the resolved dataset down to one panel's
  // rows and pass them here, bypassing dataset-name resolution.
  const rows = rowsOverride ?? resolveData(
    spec,
    index,
    view,
    layered ? `${markGroupPrefix}layer_${selectorLayerIndex}_marks` : undefined,
    folded && traceType === TraceType.PARALLEL
      ? [folded.keyColumn, folded.valueColumn]
      : undefined,
  );

  let data: MaidrLayer['data'];
  let selectors: MaidrLayer['selectors'];
  let orientation: Orientation | undefined;
  let domMapping: MaidrLayer['domMapping'];
  // The type the layer is announced as. Almost always the resolved one;
  // a diverging bar is the exception, since nothing but the values says
  // a stacked bar is drawn either side of a baseline.
  let announcedType = traceType;

  switch (traceType) {
    case TraceType.BAR: {
      data = extractBarData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      const xIsQuant = encoding.x?.type === 'quantitative'
        || encoding.x?.aggregate != null;
      const yIsQuant = encoding.y?.type === 'quantitative'
        || encoding.y?.aggregate != null;
      if (xIsQuant && !yIsQuant) {
        orientation = Orientation.HORIZONTAL;
      }
      break;
    }
    // A dot plot is a bar chart drawn with a point instead of a bar: one
    // category, one magnitude, and the same flip when the value rides x.
    // `BarTrace` serves both, so the extraction is shared — but the flip is
    // read off the *category* channel here, since that is the one a dot
    // plot is identified by.
    case TraceType.DOT: {
      const isHorizontal = isCategorical(encoding.y);
      data = extractBarData(rows, encoding, isHorizontal);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      if (isHorizontal) {
        orientation = Orientation.HORIZONTAL;
      }
      break;
    }
    case TraceType.HISTOGRAM: {
      data = extractHistogramData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      break;
    }
    case TraceType.STACKED:
    case TraceType.DODGED:
    case TraceType.NORMALIZED: {
      const segments = extractSegmentedData(rows, encoding);
      data = segments;
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      // Horizontal segmented bars (x=quantitative, y=nominal) carry the
      // value on x and the category on y. The core SegmentedTrace reads
      // the value from `point.x` only when `orientation` is HORIZONTAL,
      // mirroring the BAR and BOX cases above.
      const xIsQuant = encoding.x?.type === 'quantitative'
        || encoding.x?.aggregate != null;
      const yIsQuant = encoding.y?.type === 'quantitative'
        || encoding.y?.aggregate != null;
      if (xIsQuant && !yIsQuant) {
        orientation = Orientation.HORIZONTAL;
      }
      // `stack: "normalize"` asks *Vega-Lite* to divide, so the rows hold the
      // raw values by definition and the shares exist only on screen. The core
      // divides nothing itself — `NORMALIZED` and `STACKED` announce one
      // payload identically — so without this the reader is pitched the counts
      // while every column is drawn the same height (#965).
      if (traceType === TraceType.NORMALIZED) {
        data = toSegmentedShares(segments, orientation === Orientation.HORIZONTAL);
      }
      // A population pyramid and a Likert chart are both authored as this
      // exact spec — Vega-Lite has no diverging mark — so the two sides
      // are recognised from the values. Stacked only: a normalised bar
      // divides a total and cannot straddle a baseline, and a dodged one
      // places its series side by side rather than either side of it.
      if (traceType === TraceType.STACKED
        && sidesDiverge(segments, orientation === Orientation.HORIZONTAL)) {
        announcedType = TraceType.DIVERGING;
      }
      // Only populate `domMapping` when the caller has explicitly
      // requested an order via `options.domOrder`. When omitted, leave
      // it undefined so bind-time runtime detection (in
      // `vegalite-entry.ts`) can inspect the rendered SVG and choose
      // the right order — Vega's DOM emission depends on the input
      // data row order, not the trace type, so a static fallback here
      // would frequently be wrong.
      if (domOrderOverride) {
        domMapping = determineDomMapping(traceType, domOrderOverride);
      } else if (announcedType === TraceType.DIVERGING) {
        // That detection only runs for the three types it names, so a
        // diverging layer would reach `SegmentedTrace` with no hint and
        // take its row-major default — wrong for the gallery pyramid,
        // whose source rows interleave the two sides. The row order is
        // the DOM order, so it answers the same question the bind-time
        // pass does, from the data the converter already has.
        domMapping = determineDomMapping(
          traceType,
          rowsAreSeriesMajor(rows, encoding.color?.field ?? encoding.fill?.field ?? 'group')
            ? 'series-major'
            : 'subject-major',
        );
      }
      break;
    }
    // A step mark is a line Vega-Lite draws as a staircase, and an area is a
    // line plus a fill that is drawn rather than encoded. Same points, same
    // one-path-per-series geometry, so the extraction is identical for all of
    // them; the stacked area variants differ only in what `AreaTrace`
    // announces on top of it. A bump chart joins the group for the same
    // reason: `BumpTrace` reads the multi-line payload unchanged and
    // differs only in inverting the pitch, since its y axis is a rank.
    case TraceType.LINE:
    case TraceType.AREA:
    case TraceType.BUMP:
    case TraceType.NORMALIZED_AREA:
    case TraceType.STACKED_AREA:
    case TraceType.STEP: {
      const lineData = extractLineData(rows, encoding);
      data = lineData;
      // Line/area traces expect selectors as string[] (one per series).
      selectors = buildLineSelectors(mark, lineData.length, selectorLayerIndex, layered, markGroupPrefix);
      break;
    }
    // One polyline per observation rather than one per colour, and every
    // column a different quantity. Vega draws one `<path>` per `detail`
    // group, so the per-series selectors line up one to one with the rows.
    case TraceType.PARALLEL: {
      if (!folded) {
        return null;
      }
      const observations = extractParallelData(rows, encoding, folded);
      data = observations;
      selectors = buildLineSelectors(
        mark,
        observations.length,
        selectorLayerIndex,
        layered,
        markGroupPrefix,
      );
      // The x channel carries the folded key, so it already names what the
      // columns are. The y channel does not name what the numbers are: it
      // reads the normalised column the fold was drawn into, whose name
      // (`norm_val`) describes the drawing rather than the data, and the
      // gallery spec hides its axis outright. Fall back to the fold's own
      // value column, which is what the points now carry.
      axes.y = { label: authoredLabel(encoding.y) ?? folded.valueColumn };
      // What one observation is called, when the spec says.
      const named = encoding.color ?? encoding.fill;
      if (named) {
        axes.z = getAxisConfig(named);
      }
      break;
    }
    case TraceType.SCATTER:
      data = extractScatterData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      break;
    case TraceType.HEATMAP:
      data = extractHeatmapData(rows, encoding, view, markGroupPrefix);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      break;
    // A map has no positional channels at all, so its axes are named after
    // the two things it does carry: what a region is called, and what
    // shades it.
    case TraceType.CHOROPLETH: {
      const fields = resolveChoroplethFields(
        encoding,
        transform,
        declaration?.type === TraceType.CHOROPLETH ? declaration : undefined,
        seriesRef,
      );
      if (!fields) {
        return null;
      }
      data = extractChoroplethData(rows, fields, seriesRef);
      // Emitted unconditionally: Vega draws one `<path>` per feature, and
      // `ChoroplethTrace` refuses a selector set whose element count does
      // not match the regions it was given, so a map that dropped an
      // unmatched feature degrades to no highlight rather than to the wrong
      // one.
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      axes.x = { label: fields.regionLabel };
      axes.y = { label: fields.valueLabel };
      break;
    }
    case TraceType.PIE:
      data = extractPieData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      // An arc has no x or y to name the axes after — the pair built above is
      // two empty labels. The slice labels come from the colour channel and
      // the magnitudes from `theta`, so the layer's axes are named after those.
      axes.x = getAxisConfig(encoding.color ?? encoding.fill);
      axes.y = getAxisConfig(encoding.theta);
      break;
    case TraceType.POLAR_AREA: {
      const spokes = extractPolarAreaData(rows, encoding);
      data = spokes;
      // `RadarTrace` extends `LineTrace`, which expects one selector per
      // series — here always one, since a polar area draws one wedge per
      // category rather than one ring per group.
      selectors = buildLineSelectors(mark, spokes.length, selectorLayerIndex, layered, markGroupPrefix);
      // An arc has no x or y, exactly as for a pie above: the spokes are
      // named by the colour (or angular) channel and measured by `radius`.
      axes.x = getAxisConfig(encoding.color ?? encoding.fill ?? encoding.theta);
      axes.y = getAxisConfig(encoding.radius);
      break;
    }
    case TraceType.ERROR_BAR: {
      data = extractErrorBarData(rows, encoding, getMarkExtent(spec));
      // The whip of an `errorbar` is one `<line>` per sample, which is what
      // `markToCssClass` points this at. An `errorband` instead draws every
      // sample into a single `<path>`, so the count check in
      // `ErrorBarTrace.mapToSvgElements` fails and the layer goes
      // unhighlighted — the honest outcome, since the chart contains no
      // per-sample element to highlight. A spec that turns on the
      // composite's optional `ticks` loses its highlight the same way: the
      // extra parts shift the whip out of `layer_<N>_marks`.
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      if (isHorizontalEncoding(encoding)) {
        orientation = Orientation.HORIZONTAL;
      }
      break;
    }
    case TraceType.GANTT: {
      const { rowField, isHorizontal } = resolveRangedFields(encoding);
      // The lane scale's domain carries lanes that no interval fills, which
      // the rows cannot: an unbooked lane is a real row of a schedule and
      // the nested payload exists to express it.
      data = extractGanttData(
        rows,
        encoding,
        readScaleDomain(view, isHorizontal ? 'y' : 'x', markGroupPrefix),
      );
      // Only when the lanes are contiguous in row order — see
      // `lanesFollowRowOrder`. Withholding the selectors leaves the layer
      // unhighlighted; emitting them would highlight another lane's bar.
      if (lanesFollowRowOrder(rows, rowField)) {
        selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      }
      // A schedule drawn the ordinary way runs its bars along x and stacks
      // its lanes down y, which is what `GanttTrace` calls horizontal.
      if (isHorizontal) {
        orientation = Orientation.HORIZONTAL;
      }
      break;
    }
    case TraceType.WATERFALL: {
      data = extractWaterfallData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      // `WaterfallTrace` carries no orientation: it announces the step's
      // label against `axes.x` and the contribution against `axes.y`. A
      // waterfall drawn along x holds those the other way round, so the two
      // titles swap here — otherwise the step name is announced under the
      // amount axis' title and the amount under the step's.
      if (resolveRangedFields(encoding).isHorizontal) {
        [axes.x, axes.y] = [axes.y, axes.x];
      }
      break;
    }
    case TraceType.BOX: {
      data = extractBoxData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      // Vega-Lite boxplot orientation is implicit from encoding type:
      // x=quantitative + y=nominal/ordinal => HORIZONTAL.
      // Mirrors the BAR detection at lines 748-754. maidr core needs the
      // `orientation` field on the layer to (a) interpret axes labels
      // correctly (category axis vs value axis) and (b) switch arrow-key
      // navigation to within-quartile (up/down for horz, left/right for
      // vert). Without this, horizontal boxplots default to vertical-mode
      // navigation (species-to-species) and the screen reader confuses
      // the x and y labels.
      const xIsQuant = encoding.x?.type === 'quantitative'
        || encoding.x?.aggregate != null;
      const yIsQuant = encoding.y?.type === 'quantitative'
        || encoding.y?.aggregate != null;
      if (xIsQuant && !yIsQuant) {
        orientation = Orientation.HORIZONTAL;
      }
      break;
    }
    default:
      return null;
  }

  // Scope selectors to one facet cell. All facet cells share identical
  // mark-group classes (`child_marks` / `child_layer_<j>_marks`), so the
  // only way to address one panel's marks is via the `data-maidr-cell`
  // attribute stamped on the cell's item <g> at bind time.
  const cellScope = selectorOverride?.cellScope;
  if (cellScope) {
    if (typeof selectors === 'string') {
      selectors = scopeSelector(selectors, cellScope);
    } else if (Array.isArray(selectors)) {
      selectors = (selectors as string[]).map(sel => scopeSelector(sel, cellScope));
    }
  }

  const layer: MaidrLayer = {
    id: String(index),
    type: announcedType,
    selectors,
    axes,
    data,
  };

  // Naming is independent of the type: an author whose declared type could
  // not be honoured still named this layer, and the two fields are the only
  // way a spec says which of several layers a reader has switched to.
  if (declaration?.title !== undefined) {
    layer.title = declaration.title;
  }
  if (declaration?.name !== undefined) {
    layer.name = declaration.name;
  }
  if (stepDirection && traceType === TraceType.STEP) {
    layer.stepDirection = stepDirection;
  }
  if (orientation) {
    layer.orientation = orientation;
  }
  if (domMapping) {
    layer.domMapping = domMapping;
  }

  return layer;
}

// ---------------------------------------------------------------------------
// Composite views (concat)
// ---------------------------------------------------------------------------

function buildConcatMaidr(
  id: string,
  title: string,
  subtitle: string | undefined,
  caption: string | undefined,
  specs: VegaLiteSpec[],
  direction: 'horizontal' | 'vertical' | 'wrap',
  view?: VegaView,
  domOrder?: 'series-major' | 'subject-major',
  columns?: number,
): Maidr {
  // Track a global layer counter so that each concat child resolves
  // dataset names independently (Vega names datasets sequentially
  // across the entire compiled spec, not per-child).
  let globalLayerIndex = 0;

  const subplotEntries: MaidrSubplot[] = specs.map((childSpec, i) => {
    // A concat child is a spec node `vegaLiteToMaidr` never sees, so a
    // declaration written on one that is itself composite is caught here or
    // not at all. Once per child, not once per layer.
    warnCompositeDeclaration(childSpec);
    // Each concat child compiles to a per-cell Vega scope group
    // (`concat_<i>_group`) wrapping the panel's background path. Pointing
    // the subplot selector at that background gives MAIDR core a real
    // per-panel element to measure, which is what lets it compute the
    // visual panel order (and vertical arrow direction) for multi-row
    // vconcat / wrapped-concat grids — Vega SVGs carry no `axes_*` ids.
    const selector = `g.mark-group.role-scope.concat_${i}_group > g > path.background`;
    if (childSpec.layer) {
      const layers = childSpec.layer.map((layerSpec, j) => {
        // Vega names this child's mark groups `concat_<i>_layer_<j>_marks`
        // (local layer index `j`, not the global data index), so drive the
        // selector off those while keeping `globalLayerIndex` for the data
        // lookup, which follows Vega's sequential dataset numbering.
        const layer = convertLayerSpec(
          layerSpec,
          globalLayerIndex,
          view,
          childSpec.encoding,
          true,
          domOrder,
          { layerIndex: j, markGroupPrefix: `concat_${i}_` },
        );
        // Assign a unique ID that encodes both the concat index and the
        // layer index within the child to avoid duplicates across subplots.
        if (layer)
          layer.id = `${i}_${j}`;
        globalLayerIndex++;
        return layer;
      }).filter(Boolean) as MaidrLayer[];
      return { layers, selector };
    }
    // A single-view concat child renders under `concat_<i>_marks` (or the
    // sugar-expanded `concat_<i>_layer_0_marks`).
    const layer = convertLayerSpec(
      childSpec,
      globalLayerIndex,
      view,
      undefined,
      false,
      domOrder,
      { layerIndex: 0, markGroupPrefix: `concat_${i}_` },
    );
    if (layer)
      layer.id = `${i}_0`;
    globalLayerIndex++;
    return { layers: layer ? [layer] : [], selector };
  });

  // A subplot with zero layers inside a grid crashes MAIDR core's Subplot
  // model on focus; collapse to the same single empty figure other
  // unsupported specs produce (bindVegaLite skips mounting that shape).
  if (subplotEntries.some(entry => entry.layers.length === 0)) {
    console.warn('[maidr/vegalite] Concat spec contains a child with an unsupported mark type.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  // vconcat produces one subplot per row (column layout).
  // hconcat produces all subplots in a single row.
  // General `concat` wraps into rows of `columns` panels (Vega-Lite's
  // default when `columns` is omitted is a single unbounded row).
  let subplots: MaidrSubplot[][];
  if (direction === 'vertical') {
    subplots = subplotEntries.map(s => [s]);
  } else if (direction === 'wrap') {
    subplots = chunkIntoRows(subplotEntries, columns);
  } else {
    subplots = [subplotEntries];
  }

  return buildMaidr(id, title, subtitle, caption, subplots);
}

// ---------------------------------------------------------------------------
// Faceted views (facet operator / encoding shorthand / wrapped facet)
// ---------------------------------------------------------------------------

/** One facet panel: dataset row filters plus the announced panel title. */
interface FacetCellDef {
  filters: Array<[field: string, key: string]>;
  title: string;
}

/**
 * The facet values in the order Vega actually laid the panels out.
 *
 * Neither obvious source answers this. The `row_domain` dataset is an
 * un-ordered `aggregate` over the rows, so it reports first-seen order —
 * and Vega then *sorts* the cells before laying them out, ascending by
 * default and by whatever `sort` the channel declares otherwise. A facet
 * over `["Jan", "Apr", "Jul"]` renders as Apr, Jan, Jul, so pairing curves
 * with elements by `row_domain` order lights the wrong ridge for two of
 * the three.
 *
 * The `cell` dataset is the group mark's own items, which *are* the
 * rendered panels: verified against vega 6.3.1 for the default sort, an
 * explicit sort array and `sort: "descending"`, matching the scenegraph
 * exactly in all three.
 *
 * @param view - The compiled view, when one was supplied
 * @param field - The facet field naming each panel
 * @returns The panel keys in render order, or `undefined` when the view
 * cannot answer — in which case the caller falls back to a sorted domain,
 * which is what Vega's default lays out anyway
 */
function resolveFacetCellKeys(
  view: VegaView | undefined,
  field: string,
): string[] | undefined {
  if (!view)
    return undefined;
  let items: unknown;
  try {
    items = view.data('cell');
  } catch {
    return undefined;
  }
  if (!Array.isArray(items) || items.length === 0)
    return undefined;

  const keys: string[] = [];
  for (const item of items) {
    const datum = (item as { datum?: unknown })?.datum;
    if (typeof datum !== 'object' || datum === null
      || !(field in (datum as Record<string, unknown>))) {
      return undefined;
    }
    keys.push(String((datum as Record<string, unknown>)[field]));
  }
  return keys;
}

/**
 * Convert a row-faceted density plot into the one ridgeline layer it draws.
 *
 * A ridgeline (joy plot) is authored as a facet, because Vega-Lite has no
 * other way to offset the curves down the page — the gallery's own
 * "Faceted Density Plot" is one, with `bounds: "flush"` and zero spacing
 * turning the panels into a stack of ridges. Taken at face value that is a
 * grid of N independent AREA subplots, and a reader has to leave one panel
 * and enter the next to compare two curves, which is the comparison the
 * chart exists to make.
 *
 * So the facet is read as what it draws: one layer, one curve per group,
 * every group on one density scale.
 *
 * The conditions are deliberately narrow, and each of them is a place where
 * a wrong reading would be worse than the panelled one:
 *
 *   - **Rows only.** Columns of ridges are not offset curves, and a
 *     row x column grid is a small-multiples chart whatever the mark.
 *   - **A bare `area` child.** A layered child (an area under its own
 *     outline, say) draws more elements per cell than there are groups,
 *     and the highlight would land on whichever the selector reached first.
 *   - **A `density` transform grouped by the facet field.** Without it the
 *     panels are not curves of one distribution, and `y` is a magnitude
 *     rather than an estimate.
 *   - **Two groups or more.** One ridge is a density plot, which the facet
 *     path already reads correctly.
 *
 * Anything else falls through to {@link buildFacetMaidr} unchanged.
 *
 * @param spec - The faceted spec
 * @param descriptor - Its normalised facet description
 * @param view - The compiled view, when one was supplied
 * @returns The ridgeline layer, or `null` when this is some other facet
 */
function convertRidgelineLayer(
  spec: VegaLiteSpec,
  descriptor: FacetDescriptor,
  view?: VegaView,
): MaidrLayer | null {
  const groupField = descriptor.rowChannel?.field;
  if (!groupField || descriptor.columnChannel || descriptor.wrapChannel)
    return null;

  const childSpec = descriptor.childSpec;
  if (getMarkType(childSpec) !== 'area')
    return null;

  // The transform sits on whichever spec the author put it on: the unit
  // spec in the `encoding.row` shorthand, the panel template under a
  // `facet` operator, or the operator's own parent.
  const density = findDensityTransform(childSpec.transform)
    ?? findDensityTransform(spec.transform);
  if (!density || !density.groupby.includes(groupField))
    return null;

  // Which axis the estimate rides. Drawn the usual way the value runs
  // along x and the density up y, but a ridgeline turned on its side is
  // the same chart and the same payload.
  const encoding = childSpec.encoding ?? {};
  const alongX = encoding.y?.field === density.densityColumn;
  const valueChannel = alongX ? encoding.x : encoding.y;
  const densityChannel = alongX ? encoding.y : encoding.x;
  if (densityChannel?.field !== density.densityColumn
    || valueChannel?.field !== density.valueColumn) {
    return null;
  }

  const specForData = childSpec.data != null ? childSpec : { ...childSpec, data: spec.data };
  const rows = resolveData(
    specForData,
    0,
    view,
    undefined,
    [groupField, density.valueColumn, density.densityColumn],
  );

  // The rendered cell order, which is the order the one selector below
  // resolves its elements in — so the groups have to be built in it, or
  // every curve highlights its neighbour. `resolveDomainKeys` without a
  // dataset name sorts the distinct values, which is what Vega's default
  // facet sort lays out; see `resolveFacetCellKeys` for why the
  // `row_domain` dataset is the wrong answer here.
  const groups = (resolveFacetCellKeys(view, groupField)
    ?? resolveDomainKeys(groupField, rows, view))
    .map(key => rows
      .filter(row => String(row[groupField]) === key)
      .map((row): ViolinKdePoint => ({
        x: key,
        y: Number(row[density.valueColumn] ?? 0),
        density: Number(row[density.densityColumn] ?? 0),
      })))
    // A domain value the data never fills renders no cell at all, so it
    // has no element for the pairing and no samples to navigate.
    .filter(group => group.length > 0);
  if (groups.length < 2)
    return null;

  return {
    id: '0',
    type: TraceType.RIDGELINE,
    // Vega draws each cell's area as a single `<path>` under the shared
    // `child_marks` class, so one selector reaches every ridge in cell
    // order — one element per group, which is what `RidgelineTrace` pairs
    // its curves with. No `data-maidr-cell` scoping: this layer is the
    // whole chart rather than one panel of it.
    selectors: buildSelector('area', 0, false, 'child_'),
    // `RidgelineTrace` reads `x` as the value axis and `z` as the name of
    // the dimension the groups vary along; the density is announced
    // against the latter.
    axes: {
      x: getAxisConfig(valueChannel),
      y: getAxisConfig(descriptor.rowChannel),
      z: getAxisConfig(descriptor.rowChannel),
    },
    data: groups,
  };
}

/**
 * Resolve the raw source dataset (pre-transform rows carrying the facet
 * fields). Used when the layer's own dataset resolution lands on a table
 * that lost the facet fields.
 */
function resolveSourceRows(
  spec: VegaLiteSpec,
  view?: VegaView,
): Record<string, unknown>[] {
  if (view) {
    try {
      const rows = view.data('source_0');
      if (Array.isArray(rows) && rows.length > 0)
        return rows;
    } catch {
      // No source dataset — fall through to inline data.
    }
  }
  const data = spec.data as { values?: Record<string, unknown>[] } | undefined;
  if (data && typeof data === 'object' && Array.isArray(data.values))
    return data.values;
  return [];
}

/**
 * Resolve one dataset per layer for a **faceted** layered spec, by taking
 * the compiled `data_<N>` pipelines in ascending order.
 *
 * Faceted specs cannot use the exact `layer_<N>_marks` lookup that
 * {@link resolveMarkItemData} gives non-faceted ones: Vega nests a facet's
 * marks inside the per-cell group, so `child_layer_<N>_marks` is not a
 * top-level dataset and `view.data()` rejects it. What Vega does expose at
 * the top level is one fully-computed pipeline per layer, spanning every
 * cell — precisely the pre-filter rows the caller slices per cell.
 *
 * Name guessing cannot pick those apart. An Altair `transform_density` +
 * `alt.layer(...)` chart wrapped in a facet compiles to `data_2` / `data_3`
 * with no `data_0` or `data_1` at top level, so every layer resolves to
 * `data_2` and each series draws the first layer's curve.
 *
 * Deliberately fails closed: it returns rows only when the number of
 * plausible pipelines matches the number of layers exactly. Any other
 * count means the mapping is ambiguous — layers sharing one dataset, or an
 * intermediate pipeline being counted — and the caller keeps its existing
 * behaviour rather than acting on a guess.
 *
 * **The ascending-order rule is empirical, not a documented Vega-Lite
 * contract.** It is validated against vega 6.3.1 / vega-lite 6.4.x with
 * two-layer facets, including one whose layers transform asymmetrically
 * (`facetedAsymmetricLayers.ts`) — the shape that makes a *repeat* spec
 * number its layers in reverse (`repeatLayeredLine.ts`), which is why the
 * rule is not extended there. A three-layer facet was measured too
 * (`facetedThreeLayers.ts`) and falls back rather than mapping: only two
 * of its layers keep a pipeline spanning every cell, so the coverage check
 * rejects the third and the count no longer matches.
 *
 * Still unverified: a facet where three or more layers *all* keep
 * full-coverage pipelines, and future compiler versions. The guards keep a
 * changed numbering scheme falling back rather than misbehaving, but they
 * cannot catch a reordering that preserves both the count and the
 * coverage. Re-check against the fixtures before relying on this more
 * widely.
 *
 * @returns One row array per layer, or `undefined` when no unambiguous
 * mapping exists.
 */
/**
 * True when `rows` contain every facet value the chart renders.
 *
 * @param rows - The candidate dataset's rows.
 * @param expected - Facet field to the full set of its values.
 */
function coversEveryFacetValue(
  rows: Record<string, unknown>[],
  expected: Map<string, Set<string>>,
): boolean {
  for (const [field, values] of expected) {
    const present = new Set<string>();
    for (const row of rows)
      present.add(String(row[field]));
    for (const value of values) {
      if (!present.has(value))
        return false;
    }
  }
  return true;
}

function resolveFacetLayerDatasets(
  view: VegaView | undefined,
  layerCount: number,
  facetFields: string[],
  sourceRows: Record<string, unknown>[],
): Record<string, unknown>[][] | undefined {
  if (!view || layerCount < 2 || facetFields.length === 0)
    return undefined;

  // Every facet value the chart will render. Vega registers these in its
  // compiled domain datasets, which is more reliable than the source rows
  // (an Altair spec names its data, so `source_0` often does not exist).
  const expected = new Map<string, Set<string>>();
  for (const field of facetFields) {
    const values = new Set<string>();
    for (const domain of ['column_domain', 'row_domain', 'facet_domain']) {
      const rows = readViewDataset(view, domain);
      if (!rows || !(field in rows[0]))
        continue;
      for (const row of rows)
        values.add(String(row[field]));
    }
    if (values.size === 0) {
      for (const row of sourceRows) {
        if (field in row)
          values.add(String(row[field]));
      }
    }
    // Without a known domain there is nothing to check coverage against,
    // and an unchecked mapping is exactly what this guard exists to stop.
    if (values.size === 0)
      return undefined;
    expected.set(field, values);
  }

  const candidates: { index: number; rows: Record<string, unknown>[] }[] = [];
  for (const name of getViewDatasetNames(view)) {
    const match = /^data_(\d+)$/.exec(name);
    if (!match || isInternalDatasetName(name))
      continue;
    const rows = readViewDataset(view, name);
    if (!rows)
      continue;
    const first = rows[0];
    if (typeof first !== 'object' || first === null || isSceneGraphRow(first))
      continue;
    // Facet fields are always groupby keys, so a pipeline that lost them
    // is an intermediate stage rather than a layer's rendered data.
    if (!facetFields.every(field => field in first))
      continue;
    // And it must span every facet value, because the caller slices it per
    // cell. Vega also leaves *cell-scoped* datasets registered under
    // `data_<N>` names — a layer that reads the faceted source directly
    // never gets a pre-facet pipeline of its own, and the leftovers hold
    // one cell's rows each. Those pass the field check and can even match
    // the layer count exactly, so without this the mapping would hand each
    // layer a single panel's data and blank out every other panel.
    if (!coversEveryFacetValue(rows, expected))
      continue;
    candidates.push({ index: Number(match[1]), rows });
  }

  if (candidates.length !== layerCount)
    return undefined;
  return candidates.sort((a, b) => a.index - b.index).map(c => c.rows);
}

/**
 * Build a multi-subplot Maidr for a faceted spec.
 *
 * Grid construction: row facet values become grid rows and column facet
 * values become grid columns, in Vega's layout order (the compiled
 * `row_domain` / `column_domain` / `facet_domain` datasets when a view is
 * available, ascending value order otherwise). Wrapped facets chunk the
 * single facet field's values into rows of `columns` panels. Cross facets
 * are sparse: Vega only renders a cell for (row, column) combinations
 * present in the data, so the grid emits exactly those combinations
 * (rows may be ragged), keeping the subplot order aligned with the
 * rendered cell order.
 *
 * Every panel's layers are converted from the shared child spec with the
 * resolved dataset pre-filtered down to that panel's facet value(s), and
 * the panel's first layer title carries the facet value (e.g. `site: A`)
 * — MAIDR core uses that as the panel display name in subplot summaries.
 *
 * Selectors are scoped per panel with a `data-maidr-cell` attribute that
 * `stampFacetCells` (see `facets.ts`) writes onto each rendered cell at
 * bind time, because all facet cells share identical Vega mark classes.
 */
function buildFacetMaidr(
  id: string,
  title: string,
  subtitle: string | undefined,
  caption: string | undefined,
  spec: VegaLiteSpec,
  descriptor: FacetDescriptor,
  view?: VegaView,
  domOrder?: 'series-major' | 'subject-major',
): Maidr {
  const childSpec = descriptor.childSpec;
  // With the `facet` operator the child is a separate spec node that
  // `vegaLiteToMaidr` never inspects, so a declaration misplaced on a
  // layered child is caught here. The `encoding.row`/`column` shorthand is
  // deliberately excluded: there the child is the entry spec with the facet
  // channels stripped, carrying the same declaration object, and it was
  // already checked once — warning again would print the same line twice.
  if (spec.facet != null && spec.spec != null) {
    warnCompositeDeclaration(spec.spec);
  }
  const isLayered = childSpec.layer != null && childSpec.layer.length > 0;
  const layerSpecs = isLayered ? childSpec.layer! : [childSpec];
  const facetFields = [
    descriptor.rowChannel?.field,
    descriptor.columnChannel?.field,
    descriptor.wrapChannel?.field,
  ].filter((field): field is string => field != null);

  // Resolve each layer's full dataset once; cells filter it below. When a
  // layer's dataset resolution lands on a table without the facet fields
  // (they are always groupby keys, so this signals a wrong dataset), fall
  // back to the raw source rows.
  // Prefer an unambiguous per-layer mapping over name guessing, which
  // collapses every layer of a faceted layered spec onto one dataset.
  const perLayerDatasets = resolveFacetLayerDatasets(
    view,
    layerSpecs.length,
    facetFields,
    resolveSourceRows(spec, view),
  );
  const layerRows = layerSpecs.map((layerSpec, j) => {
    if (perLayerDatasets)
      return perLayerDatasets[j];
    const specForData: VegaLiteSpec = layerSpec.data != null
      ? layerSpec
      : { ...layerSpec, data: childSpec.data ?? spec.data };
    let rows = resolveData(specForData, j, view);
    if (rows.length > 0 && !facetFields.every(field => field in rows[0])) {
      const source = resolveSourceRows(spec, view);
      if (source.length > 0 && facetFields.every(field => field in source[0])) {
        rows = source;
      }
    }
    return rows;
  });
  // Union across ALL layers: a sparse layer declared first (e.g. an
  // annotation layer covering a subset of facet values) must not hide
  // panels that a fuller layer's data would produce.
  const allRows = layerRows.flat();

  // Build the grid of cell definitions in visual reading order.
  const grid: FacetCellDef[][] = [];
  if (descriptor.wrapChannel?.field) {
    const field = descriptor.wrapChannel.field;
    const keys = resolveDomainKeys(field, allRows, view, 'facet_domain');
    const cells = keys.map(key => ({
      filters: [[field, key]] as FacetCellDef['filters'],
      title: `${field}: ${key}`,
    }));
    grid.push(...chunkIntoRows(cells, descriptor.columns));
  } else {
    const rowField = descriptor.rowChannel?.field;
    const colField = descriptor.columnChannel?.field;
    const rowKeys: (string | null)[] = rowField
      ? resolveDomainKeys(rowField, allRows, view, 'row_domain')
      : [null];
    const colKeys: (string | null)[] = colField
      ? resolveDomainKeys(colField, allRows, view, 'column_domain')
      : [null];

    // Cross facets are sparse: Vega only renders cells for (row, column)
    // combinations present in the data. The combo key is joined with NUL
    // (which cannot appear in field values) - a bare space would make
    // row="East Coast"/col="City" collide with row="East"/col="Coast City".
    const comboKey = (rowValue: unknown, colValue: unknown): string =>
      `${String(rowValue)}\u0000${String(colValue)}`;
    const combos = new Set<string>();
    if (rowField && colField) {
      for (const row of allRows) {
        combos.add(comboKey(row[rowField], row[colField]));
      }
    }

    for (const rowKey of rowKeys) {
      const cellsInRow: FacetCellDef[] = [];
      for (const colKey of colKeys) {
        if (rowField && colField && !combos.has(comboKey(rowKey, colKey))) {
          continue;
        }
        const filters: FacetCellDef['filters'] = [];
        const titleParts: string[] = [];
        if (rowField && rowKey !== null) {
          filters.push([rowField, rowKey]);
          titleParts.push(`${rowField}: ${rowKey}`);
        }
        if (colField && colKey !== null) {
          filters.push([colField, colKey]);
          titleParts.push(`${colField}: ${colKey}`);
        }
        cellsInRow.push({ filters, title: titleParts.join(', ') });
      }
      if (cellsInRow.length > 0) {
        grid.push(cellsInRow);
      }
    }
  }

  if (grid.length === 0) {
    console.warn('[maidr/vegalite] Faceted spec produced no panels (empty data?).');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  const parentEncoding = isLayered ? childSpec.encoding : undefined;
  const subplots: MaidrSubplot[][] = [];
  let flatIndex = 0;
  let hasEmptyPanel = false;
  for (let r = 0; r < grid.length; r++) {
    const subplotRow: MaidrSubplot[] = [];
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      const scope = facetCellScope(facetCellAttrValue(id, r, c));
      const rawLayers = layerSpecs.map((layerSpec, j) => {
        const cellRows = layerRows[j].filter(row =>
          cell.filters.every(([field, key]) => String(row[field]) === key),
        );
        // Skip layers whose rows don't cover this facet value (e.g. an
        // annotation layer with its own dataset covering only some cells).
        // convertLayerSpec would happily emit a layer with `data: []`,
        // and a zero-point trace crashes MAIDR core's state getters the
        // moment the user PageUp/PageDown's onto it.
        if (cellRows.length === 0) {
          return null;
        }
        const layer = convertLayerSpec(
          layerSpec,
          j,
          view,
          parentEncoding,
          isLayered,
          domOrder,
          { layerIndex: j, markGroupPrefix: 'child_', cellScope: scope },
          cellRows,
        );
        return layer ? { layer, spec: layerSpec } : null;
      }).filter(Boolean) as ConvertedLayer[];
      const layers = coalesceSiblingLineLayers(rawLayers, parentEncoding);
      layers.forEach((layer, j) => {
        layer.id = `${flatIndex}_${j}`;
      });
      if (layers.length === 0) {
        hasEmptyPanel = true;
      } else {
        // The FIRST layer's title is the panel display name in MAIDR's
        // subplot summaries — announce the facet value(s) there.
        layers[0].title = cell.title;
      }
      subplotRow.push({ layers, selector: `${scope} > path.background` });
      flatIndex++;
    }
    subplots.push(subplotRow);
  }

  // A panel with zero layers crashes MAIDR core's Subplot model; fall back
  // to the same single empty figure other unsupported specs produce.
  if (hasEmptyPanel) {
    console.warn('[maidr/vegalite] Faceted spec uses an unsupported mark type.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  return buildMaidr(id, title, subtitle, caption, subplots);
}

// ---------------------------------------------------------------------------
// Repeated views (repeat operator)
// ---------------------------------------------------------------------------

/**
 * Build a multi-subplot Maidr for a `repeat` spec.
 *
 * The grid comes straight from the repeat definition: `repeat.row` fields
 * become grid rows and `repeat.column` fields become grid columns
 * (row-major); the wrapped array form (`repeat: [...]` + `columns`) is
 * chunked into rows. Each cell converts the shared child spec with its
 * `{repeat: ...}` field references substituted for that cell's fields.
 *
 * Unlike facets, repeat cells compile to per-cell Vega child views whose
 * mark classes are already unique *within one chart*
 * (`child__row_<rf>column_<cf>_marks` etc.), so selectors are class-scoped
 * and no bind-time stamping is needed. Cross-chart uniqueness (two charts
 * built from the same repeated fields compile to identical class names) is
 * handled at bind time, where `bindVegaLite` prefixes every selector with
 * the chart container's id.
 */
function buildRepeatMaidr(
  id: string,
  title: string,
  subtitle: string | undefined,
  caption: string | undefined,
  spec: VegaLiteSpec,
  descriptor: RepeatDescriptor,
  view?: VegaView,
  domOrder?: 'series-major' | 'subject-major',
): Maidr {
  const childSpec = descriptor.childSpec;
  // `describeRepeat` only answers for `spec.repeat` + `spec.spec`, so the
  // child is always a separate node the entry check never saw. Warn once
  // here, before the per-cell loop — a misplaced declaration is one mistake,
  // not one per repeated panel.
  warnCompositeDeclaration(childSpec);

  // Grid of per-cell field mappings in reading order.
  interface RepeatCellDef { mapping: RepeatCellMapping; title: string }
  let grid: RepeatCellDef[][];
  if (descriptor.wrapFields) {
    const cells = descriptor.wrapFields.map(field => ({
      mapping: { repeat: field },
      title: field,
    }));
    grid = chunkIntoRows(cells, descriptor.columns);
  } else {
    const rowFields: (string | undefined)[] = descriptor.rowFields ?? [undefined];
    const colFields: (string | undefined)[] = descriptor.columnFields ?? [undefined];
    grid = rowFields.map(rowField => colFields.map((colField) => {
      const mapping: RepeatCellMapping = {};
      if (rowField !== undefined) {
        mapping.row = rowField;
      }
      if (colField !== undefined) {
        mapping.column = colField;
      }
      const cellTitle = rowField !== undefined && colField !== undefined
        ? `${rowField} vs ${colField}`
        : rowField ?? colField ?? '';
      return { mapping, title: cellTitle };
    }));
  }

  if (grid.length === 0) {
    console.warn('[maidr/vegalite] Repeat spec produced no panels.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  // Track a global layer counter for dataset-name guessing, mirroring
  // buildConcatMaidr: Vega numbers `data_<k>` datasets sequentially across
  // the whole compiled spec, not per repeated child.
  let globalLayerIndex = 0;
  let flatIndex = 0;
  let hasEmptyPanel = false;

  const subplots: MaidrSubplot[][] = grid.map(rowCells => rowCells.map((cell) => {
    const cellSpec = substituteRepeatFields(childSpec, cell.mapping);
    if (cellSpec.data == null) {
      cellSpec.data = spec.data;
    }
    const childName = repeatChildName(cell.mapping);
    const isLayered = cellSpec.layer != null && cellSpec.layer.length > 0;
    const layerSpecs = isLayered ? cellSpec.layer! : [cellSpec];
    const parentEncoding = isLayered ? cellSpec.encoding : undefined;

    const rawLayers = layerSpecs.map((layerSpec, j) => {
      const specForData: VegaLiteSpec = layerSpec.data != null
        ? layerSpec
        : { ...layerSpec, data: cellSpec.data };
      const layer = convertLayerSpec(
        specForData,
        globalLayerIndex,
        view,
        parentEncoding,
        isLayered,
        domOrder,
        { layerIndex: j, markGroupPrefix: `${childName}_` },
      );
      globalLayerIndex++;
      return layer ? { layer, spec: specForData } : null;
    }).filter(Boolean) as ConvertedLayer[];
    const layers = coalesceSiblingLineLayers(rawLayers, parentEncoding);
    layers.forEach((layer, j) => {
      layer.id = `${flatIndex}_${j}`;
    });
    if (layers.length === 0) {
      hasEmptyPanel = true;
    } else {
      layers[0].title = cell.title;
    }
    flatIndex++;
    return {
      layers,
      selector: `g.mark-group.role-scope.${childName}_group > g > path.background`,
    };
  }));

  if (hasEmptyPanel) {
    console.warn('[maidr/vegalite] Repeat spec uses an unsupported mark type.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  return buildMaidr(id, title, subtitle, caption, subplots);
}

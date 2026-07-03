/**
 * Core converters that turn a Vega-Lite specification (and optionally its
 * compiled Vega view) into a MAIDR JSON schema.
 *
 * The converter handles:
 *   - Single-view specs (`mark` + `encoding`)
 *   - Layered specs (`layer`)
 *   - Composite specs (`hconcat`, `vconcat`, `concat`)
 *
 * Faceted (`facet`) and repeated (`repeat`) specs are not yet supported;
 * the converter logs a warning and returns an empty MAIDR schema in
 * those cases.
 */

import type {
  BarPoint,
  BoxPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type {
  VegaLiteChannelDef,
  VegaLiteEncoding,
  VegaLiteSpec,
  VegaLiteToMaidrOptions,
  VegaView,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import { buildLineSelectors, buildSelector } from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

  // Handle composite views (concat).
  if (spec.hconcat) {
    return buildConcatMaidr(id, title, subtitle, caption, spec.hconcat, 'horizontal', view, domOrder);
  }
  if (spec.vconcat) {
    return buildConcatMaidr(id, title, subtitle, caption, spec.vconcat, 'vertical', view, domOrder);
  }
  if (spec.concat) {
    return buildConcatMaidr(id, title, subtitle, caption, spec.concat, 'wrap', view, domOrder);
  }

  // Unsupported composite spec types — warn and return an empty chart.
  if (spec.facet) {
    console.warn('[maidr/vegalite] Faceted specs are not yet supported.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }
  if (spec.repeat) {
    console.warn('[maidr/vegalite] Repeat specs are not yet supported.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }
  if (spec.spec && !spec.mark && !spec.layer) {
    console.warn('[maidr/vegalite] Wrapped "spec" compositions are not yet supported.');
    return buildMaidr(id, title, subtitle, caption, [[{ layers: [] }]]);
  }

  // Handle layered specs.
  const isLayered = spec.layer != null && spec.layer.length > 0;
  if (isLayered) {
    const rawLayers = spec.layer!.map((layerSpec, i) =>
      convertLayerSpec(layerSpec, i, view, spec.encoding, isLayered, domOrder),
    ).filter(Boolean) as MaidrLayer[];

    // Coalesce sibling LINE layers with matching axes into a single
    // multi-series LINE layer. This handles the common Altair case where
    // a multi-series KDE / density plot is compiled into N separate
    // single-line `layer:` objects (one per group) instead of one layer
    // with a `color` encoding. Without coalescing, maidr core sees N
    // independent LINE traces and the user can only navigate within one
    // series at a time.
    const layers = coalesceSiblingLineLayers(rawLayers);

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
function coalesceSiblingLineLayers(layers: MaidrLayer[]): MaidrLayer[] {
  if (layers.length < 2)
    return layers;

  const out: MaidrLayer[] = [];
  let i = 0;

  while (i < layers.length) {
    const current = layers[i];

    if (current.type !== TraceType.LINE) {
      out.push(current);
      i += 1;
      continue;
    }

    // Walk forward gathering consecutive LINE layers whose axes match.
    const run: MaidrLayer[] = [current];
    let j = i + 1;
    while (j < layers.length && layers[j].type === TraceType.LINE
      && axesAreCompatible(current.axes, layers[j].axes)) {
      run.push(layers[j]);
      j += 1;
    }

    if (run.length === 1) {
      out.push(current);
    } else {
      out.push(mergeLineLayers(run));
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

function mergeLineLayers(run: MaidrLayer[]): MaidrLayer {
  // Each input layer's `data` is already `LinePoint[][]` with exactly
  // one inner series (because per-layer single-line extraction returns
  // `[pts]`). Flatten by concatenating those inner arrays so the merged
  // layer ends up as `[layer0_series, layer1_series, ...]`.
  const mergedData: LinePoint[][] = [];
  const mergedSelectors: string[] = [];

  for (const layer of run) {
    if (Array.isArray(layer.data)) {
      for (const series of layer.data as LinePoint[][]) {
        mergedData.push(series);
      }
    }
    if (Array.isArray(layer.selectors)) {
      for (const sel of layer.selectors as string[]) {
        mergedSelectors.push(sel);
      }
    } else if (typeof layer.selectors === 'string') {
      mergedSelectors.push(layer.selectors);
    }
  }

  return {
    ...run[0],
    selectors: mergedSelectors,
    data: mergedData,
  };
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
 * Map a Vega-Lite mark type + encoding to a MAIDR trace type.
 *
 * Some marks produce different MAIDR types depending on encoding:
 *   - `bar` with `bin` on x/y          → HISTOGRAM
 *   - `bar` with color/fill + stack    → STACKED / NORMALIZED / DODGED
 *   - `rect`                           → HEATMAP
 *   - `tick`                           → SCATTER (individual value marks)
 */
function resolveTraceType(
  mark: string,
  encoding?: VegaLiteEncoding,
): TraceType | null {
  switch (mark) {
    case 'bar': {
      if (encoding?.x?.bin || encoding?.y?.bin) {
        return TraceType.HISTOGRAM;
      }
      if (encoding?.color?.field || encoding?.fill?.field) {
        const stack = encoding?.y?.stack ?? encoding?.x?.stack;
        // `xOffset` (or `yOffset`) with a field is the modern Vega-Lite way
        // to dodge bars side-by-side. Treat its presence as a DODGED hint
        // even when `stack` is not explicitly disabled.
        const hasOffsetField
          = !!encoding?.xOffset?.field || !!encoding?.yOffset?.field;
        if (hasOffsetField || stack === false || stack === null) {
          return TraceType.DODGED;
        }
        if (stack === 'normalize') {
          return TraceType.NORMALIZED;
        }
        return TraceType.STACKED;
      }
      return TraceType.BAR;
    }
    case 'line':
      return TraceType.LINE;
    case 'point':
    case 'circle':
    case 'square':
    case 'tick':
      return TraceType.SCATTER;
    case 'area':
      return TraceType.LINE;
    case 'rect':
      return TraceType.HEATMAP;
    case 'boxplot':
      return TraceType.BOX;
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
 * Resolve the data array for a layer.
 *
 * Tries the compiled Vega view first (more accurate since it includes
 * aggregations, filters, and other transforms), then falls back to the
 * spec's inline data.
 */
function resolveData(
  spec: VegaLiteSpec,
  layerIndex: number,
  view?: VegaView,
): Record<string, unknown>[] {
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
        if (rows && rows.length > 0)
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
    try {
      // `view.getState({ data: true })` returns all datasets keyed by name.
      // The exact return shape is loosely typed across Vega versions, so
      // narrow defensively.

      const stateGetter = (view as any).getState as
        | ((opts?: { data?: boolean }) => unknown)
        | undefined;
      if (typeof stateGetter === 'function') {
        const state = stateGetter.call(view, { data: true }) as
          | { data?: Record<string, unknown> }
          | undefined;
        const datasets = state?.data;
        if (datasets && typeof datasets === 'object') {
          for (const [name, rows] of Object.entries(datasets)) {
            // Skip the names we already tried above.
            if (datasetNames.includes(name))
              continue;
            if (Array.isArray(rows) && rows.length > 0
              && typeof rows[0] === 'object' && rows[0] !== null) {
              return rows as Record<string, unknown>[];
            }
          }
        }
      }
    } catch {
      // getState() shape varies across Vega versions; ignore and fall through.
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

function extractBarData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): BarPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';

  const xIsQuantitative = encoding.x?.type === 'quantitative'
    || encoding.x?.aggregate != null;
  const yIsQuantitative = encoding.y?.type === 'quantitative'
    || encoding.y?.aggregate != null;

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
    if (xIsQuantitative && !yIsQuantitative) {
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

function extractScatterData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): ScatterPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';

  return rows.map(row => ({
    x: Number(row[xField] ?? 0),
    y: Number(row[yField] ?? 0),
  }));
}

function extractHeatmapData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
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
  const xLabels = [...xLabelsSet];
  const yLabels = [...yLabelsSet];

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
  selectorOverride?: { layerIndex: number; markGroupPrefix: string },
): MaidrLayer | null {
  const mark = getMarkType(spec);
  if (!mark)
    return null;

  // Merge parent encoding (from layered spec) with layer encoding.
  const encoding: VegaLiteEncoding = {
    ...parentEncoding,
    ...spec.encoding,
  };

  const traceType = resolveTraceType(mark, encoding);

  if (!traceType)
    return null;

  const rows = resolveData(spec, index, view);

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

  let data: MaidrLayer['data'];
  let selectors: MaidrLayer['selectors'];
  let orientation: Orientation | undefined;
  let domMapping: MaidrLayer['domMapping'];

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
    case TraceType.HISTOGRAM: {
      data = extractHistogramData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      break;
    }
    case TraceType.STACKED:
    case TraceType.DODGED:
    case TraceType.NORMALIZED: {
      data = extractSegmentedData(rows, encoding);
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
      // Only populate `domMapping` when the caller has explicitly
      // requested an order via `options.domOrder`. When omitted, leave
      // it undefined so bind-time runtime detection (in
      // `vegalite-entry.ts`) can inspect the rendered SVG and choose
      // the right order — Vega's DOM emission depends on the input
      // data row order, not the trace type, so a static fallback here
      // would frequently be wrong.
      if (domOrderOverride) {
        domMapping = determineDomMapping(traceType, domOrderOverride);
      }
      break;
    }
    case TraceType.LINE: {
      const lineData = extractLineData(rows, encoding);
      data = lineData;
      // Line/area traces expect selectors as string[] (one per series).
      selectors = buildLineSelectors(mark, lineData.length, selectorLayerIndex, layered, markGroupPrefix);
      break;
    }
    case TraceType.SCATTER:
      data = extractScatterData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      break;
    case TraceType.HEATMAP:
      data = extractHeatmapData(rows, encoding);
      selectors = buildSelector(mark, selectorLayerIndex, layered, markGroupPrefix);
      break;
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

  const layer: MaidrLayer = {
    id: String(index),
    type: traceType,
    selectors,
    axes,
    data,
  };

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
): Maidr {
  // Track a global layer counter so that each concat child resolves
  // dataset names independently (Vega names datasets sequentially
  // across the entire compiled spec, not per-child).
  let globalLayerIndex = 0;

  const subplotEntries: MaidrSubplot[] = specs.map((childSpec, i) => {
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
      return { layers };
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
    return { layers: layer ? [layer] : [] };
  });

  // vconcat produces one subplot per row (column layout).
  // hconcat / concat produce all subplots in a single row.
  let subplots: MaidrSubplot[][];
  if (direction === 'vertical') {
    subplots = subplotEntries.map(s => [s]);
  } else {
    subplots = [subplotEntries];
  }

  return buildMaidr(id, title, subtitle, caption, subplots);
}

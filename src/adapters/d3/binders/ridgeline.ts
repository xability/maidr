/**
 * D3 binder for ridgeline (joy) plots.
 *
 * One `d3.area()` density curve per group, the curves offset down the page so
 * their shapes can be compared. `selector` matches one `<path>` per group and
 * the samples come from that path's own bound array.
 *
 * **The offset is not data.** A ridgeline's vertical stagger exists so the
 * curves do not sit on top of one another; it says nothing about any group. So
 * the binder reads the kernel-density value the chart computed *before* adding
 * the group's baseline to it — never the drawn y — and refuses to guess when
 * the samples carry no such value. Fed the drawn y instead, every group's
 * loudness would be a function of where it happened to be stacked, and the
 * lowest ridge would be the loudest chart-wide.
 */

import type { MaidrLayer, ViolinKdePoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3RidgelineConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/** Properties a group's sample array is commonly carried under. */
const SAMPLE_KEYS = ['values', 'samples', 'points', 'curve', 'density'] as const;

/**
 * Whether a datum is the `[key, values]` tuple `d3.group()` and `d3.groups()`
 * produce, which is how a ridgeline's per-group data most often arrives.
 *
 * @param datum - The datum bound to a group's path
 * @returns True when it is a grouping tuple
 */
function isGroupTuple(datum: unknown): datum is [unknown, unknown[]] {
  return Array.isArray(datum) && datum.length === 2 && Array.isArray(datum[1]);
}

/**
 * Finds the samples a group's curve was drawn from.
 *
 * @param datum - The datum bound to the group's path
 * @param accessor - The user's `samples` accessor, when they gave one
 * @param index - The group's index within the selection
 * @returns The samples
 * @throws Error when no sample array can be reached
 */
function resolveSamples(
  datum: unknown,
  accessor: DataAccessor<unknown[]> | undefined,
  index: number,
): unknown[] {
  const found = accessor !== undefined
    ? resolveAccessor<unknown[]>(datum, accessor, index)
    : findSamples(datum);

  if (!Array.isArray(found)) {
    throw new TypeError(
      `The ridge at index ${index} has no samples: its datum is `
      + `${String(datum)} rather than an array of density samples, and carries `
      + `no ${SAMPLE_KEYS.join('/')} property holding one. Point \`samples\` at `
      + `the kernel-density array the curve was drawn from.`,
    );
  }
  return found;
}

/**
 * Reaches the sample array on a group datum without a user accessor.
 *
 * @param datum - The datum bound to the group's path
 * @returns The samples, or `undefined` when none is reachable
 */
function findSamples(datum: unknown): unknown[] | undefined {
  if (isGroupTuple(datum)) {
    return datum[1];
  }
  if (Array.isArray(datum)) {
    return datum;
  }
  if (datum !== null && typeof datum === 'object') {
    const record = datum as Record<string, unknown>;
    for (const key of SAMPLE_KEYS) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** Keys a group's name is commonly carried under, canonical first. */
const GROUP_KEYS = ['key', 'name', 'x', 'label', 'category'] as const;

/**
 * Names a group, from whatever its datum says.
 *
 * Looked for on the group's own datum first, then on one of its samples —
 * `selectAll('path').data(d3.groups(rows, d => d.cohort))` puts the name in
 * the first place, `.data(byCohort)` over ready-made sample arrays puts it in
 * the second. Falls back to the group's ordinal, which at least distinguishes
 * the ridges from one another when the chart's data names nothing.
 *
 * @param datum - The datum bound to the group's path
 * @param sample - One of the group's samples
 * @param config - The binder config, read for an explicit `group` accessor
 * @param index - The group's index within the selection
 * @returns The group's name
 */
function resolveGroupName(
  datum: unknown,
  sample: unknown,
  config: D3RidgelineConfig,
  index: number,
): string | number {
  const source = isGroupTuple(datum) ? datum[0] : datum;
  if (typeof source === 'string' || typeof source === 'number') {
    return source;
  }

  for (const candidate of [source, sample]) {
    const accessor = inferAccessor<string | number>(
      config,
      'group',
      'group',
      [...GROUP_KEYS],
      candidate,
    );
    const name = resolveAccessorOptional<string | number>(candidate, accessor, index);
    if (typeof name === 'string' || typeof name === 'number') {
      return name;
    }
  }
  return index;
}

/**
 * Binds a D3.js ridgeline (joy) plot to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the group curves — one `<path>` per ridge. Each path's
 * datum supplies the group's samples: the array itself, a `d3.groups()` tuple,
 * or a `values`/`samples`/`points`/`curve` property holding one.
 *
 * The three per-sample fields are named for what they mean rather than for the
 * payload keys they land on, because a ridgeline's value axis is usually the
 * drawn `x`: `group` names the ridge, `value` is the position along the value
 * axis, and `density` is the curve's own half-width there — the density
 * **before** the ridge's baseline was added to it. Passing the drawn y for
 * `density` is the one mistake this chart type invites; the binder cannot
 * detect it, so it is worth checking against the array you fed
 * `d3.area().y1(...)`.
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
 * @param svg - The SVG element containing the D3 ridgeline plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Ridgeline(svgElement, {
 *   selector: 'path.ridge',
 *   title: 'Delivery Time by Cohort',
 *   axes: { x: 'Days', y: 'Cohort', fill: 'Cohort' },
 *   group: 'cohort',
 *   value: 'days',
 *   density: 'density',
 * });
 * ```
 */
export function bindD3Ridgeline(svg: Element, config: D3RidgelineConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildRidgelineLayer(svg, config));
}

/**
 * Pure extraction core for ridgeline plots. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildRidgelineLayer(
  root: Element,
  config: D3RidgelineConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector, samples: samplesAccessor } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'ridge curve');
  }

  const sampleDatum = resolveSamples(elements[0].datum, samplesAccessor, 0)[0];
  const valueAccessor = inferAccessor<number>(
    config,
    'value',
    'value',
    ['x', 't', 'position'],
    sampleDatum,
  );
  const densityAccessor = inferAccessor<number>(
    config,
    'density',
    'density',
    ['kde', 'width', 'p', 'estimate'],
    sampleDatum,
  );

  const data: ViolinKdePoint[][] = [];
  const legend: string[] = [];

  for (const { datum, index } of elements) {
    const samples = resolveSamples(datum, samplesAccessor, index);
    const group = resolveGroupName(datum, samples[0], config, index);

    const curve: ViolinKdePoint[] = samples.map((sample, position) => ({
      x: group,
      y: Number(resolveAccessor<number>(sample, valueAccessor, position)),
      density: readDensity(sample, densityAccessor, group, position),
    }));

    data.push(curve);
    legend.push(String(group));
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.RIDGELINE,
    title,
    // One element per group, which is what the chart draws: `RidgelineTrace`
    // resolves the selectors to a flat list and requires exactly one entry per
    // ridge, then lights that ridge's whole curve from any of its samples. The
    // groups are emitted in DOM order, so one scoped selector is already in
    // the payload's order.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer, legend };
}

/**
 * Reads a sample's density, refusing anything that is not a finite number.
 *
 * The density is the whole chart — it is what the ridge's height *is* — so a
 * missing one is an error with instructions rather than a `NaN` that sonifies
 * as silence partway along an otherwise ordinary-sounding curve.
 *
 * @param sample - One sample of the group's curve
 * @param accessor - The density accessor
 * @param group - The group's name, for the error message
 * @param position - The sample's position along the curve
 * @returns The density
 * @throws Error when the sample carries no finite density
 */
function readDensity(
  sample: unknown,
  accessor: DataAccessor<number>,
  group: string | number,
  position: number,
): number {
  const raw = resolveAccessorOptional<number>(sample, accessor, position);
  const density = Number(raw);
  if (!Number.isFinite(density)) {
    throw new TypeError(
      `Sample ${position} of the ridge "${String(group)}" carries no density: `
      + `the \`density\` accessor resolved to ${String(raw)}. Point it at the `
      + `kernel-density value the curve was drawn from — the half-width `
      + `**before** the ridge's baseline offset was added, which is the number `
      + `you passed to \`d3.area().y1(...)\` inside the offset arithmetic, not `
      + `the drawn y itself.`,
    );
  }
  return density;
}

/**
 * D3 binder for violin plots.
 *
 * A violin is two layers over one set of marks, which is why it is a binder of
 * its own rather than an option on another: the KDE curve a reader walks along,
 * and the five-number summary the box overlay draws. `VIOLIN_KDE` and
 * `VIOLIN_BOX` are both in the grammar and neither had a d3 binder (#1068).
 */

import type { BoxPoint, MaidrLayer, ViolinKdePoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ViolinConfig, DataAccessor } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { selectorPrefix } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeChart, generateId, inferAccessor, queryD3Elements, resolveAccessorOptional } from '../util';
import { stampSeriesSelectors } from './line';

/**
 * Binds a D3.js violin plot to MAIDR, generating the accessible data
 * representation.
 *
 * A violin is `d3.area()` over the KDE bins, mirrored about each category's
 * centre, so `selector` matches one `<path>` per category with that category's
 * bin array bound to it — exactly the shape {@link bindD3Line} reads off a line
 * path. Point `boxSelector` at the box overlay's groups, when the chart draws
 * one, and the summary is read from them the way {@link bindD3Box} reads a box.
 *
 * @remarks
 * **The KDE is never used to derive the summary.** Quartiles can be computed
 * off a density curve, and doing so would announce numbers that are not the
 * data's: a KDE is smoothed, so its quartiles belong to the bandwidth rather
 * than to the observations, and a reader told "Q1 is 4.2" cannot tell that it
 * was inferred. A violin drawn without a summary is read as its curves alone.
 *
 * **Timing — call after D3 has rendered**, as with every binder here: the
 * bound `__data__` is what is read, so calling before `.data().join()` throws
 * "No elements found for selector …".
 *
 * @param svg - The SVG element containing the D3 violin plot.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} whose `layer` is the KDE and whose `layers`
 *          carries the box summary too, when the chart states one.
 *
 * @example
 * ```ts
 * bindD3Violin(svgElement, {
 *   selector: 'path.violin',
 *   boxSelector: 'g.box',
 *   title: 'Distribution by Species',
 *   axes: { x: 'Species', y: 'Sepal length' },
 *   fill: 'species',
 *   value: 'v',
 *   density: 'estimate',
 * });
 * ```
 */
export function bindD3Violin(svg: Element, config: D3ViolinConfig): D3BinderResult {
  const built: D3BuiltLayer[] = [buildViolinKdeLayer(svg, config)];
  const box = buildViolinBoxLayer(svg, config);
  if (box) {
    built.push(box);
  }
  return finalizeChart(svg, config, built);
}

/**
 * The KDE half: one curve per category, each sample carrying its density.
 *
 * @param root   - The element to query within.
 * @param config - The binder config.
 * @param panel  - The panel scope, on a multi-panel bind.
 * @returns The built layer.
 * @throws When the selector matches nothing, or a violin carries no datum.
 */
function buildViolinKdeLayer(
  root: Element,
  config: D3ViolinConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector, orientation = Orientation.VERTICAL } = config;

  const violins = queryD3Elements(root, selector);
  if (violins.length === 0) {
    throw buildNoElementsError(root, selector, 'violin path');
  }

  // The datum bound to a violin is either the bin array itself -- which is what
  // `.data(groups.map(g => g.bins))` leaves -- or an object wrapping it
  // alongside the category name. Sampling the first one decides which, and the
  // sample for the per-bin accessors is a bin either way.
  const first = violins[0].datum;
  const kdeAccessor = inferAccessor<unknown[]>(
    config,
    'kde',
    'kde',
    ['density', 'samples', 'bins', 'values'],
    Array.isArray(first) ? undefined : first,
  );
  const sampleBins = binsOf(first, kdeAccessor, 0);
  const sampleBin = sampleBins?.[0];

  const fillAccessor = inferAccessor<string>(
    config,
    'fill',
    'fill',
    ['group', 'series', 'category', 'z', 'label', 'name'],
    Array.isArray(first) ? sampleBin : first,
  );
  const valueAccessor = inferAccessor<number>(
    config,
    'value',
    'value',
    ['v', 'y', 'x'],
    sampleBin,
  );
  const densityAccessor = inferAccessor<number>(
    config,
    'density',
    'density',
    ['estimate', 'd', 'count'],
    sampleBin,
  );

  const data: ViolinKdePoint[][] = [];
  const curvePaths: (Element | null)[] = [];

  for (const { element, datum, index } of violins) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    const bins = binsOf(datum, kdeAccessor, index);
    if (!bins || bins.length === 0) {
      continue;
    }

    // A violin bound its bin array directly has no room for the category name,
    // so the bins carry it; one bound an object usually names it there.
    const label = resolveAccessorOptional<string>(
      Array.isArray(datum) ? bins[0] : datum,
      fillAccessor,
      index,
    ) ?? `Violin ${index + 1}`;

    data.push(bins.map((bin, binIndex) => ({
      x: label,
      y: Number(resolveAccessorOptional<number>(bin, valueAccessor, binIndex) ?? Number.NaN),
      density: Number(resolveAccessorOptional<number>(bin, densityAccessor, binIndex) ?? Number.NaN),
    })));
    curvePaths.push(element);
  }

  if (data.length === 0) {
    throw buildNoElementsError(root, selector, 'violin path with KDE samples');
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.VIOLIN_KDE,
    title,
    orientation,
    // One selector per curve, the way a multi-series line is stamped: the trace
    // walks a row at a time, so a single shared selector would resolve every
    // curve for every row.
    selectors: stampSeriesSelectors(root, selector, curvePaths, data.length, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer, legend: data.map(curve => String(curve[0]?.x ?? '')) };
}

/**
 * The box half, when the chart draws one and states a summary.
 *
 * Returns `null` rather than throwing on every way it can be absent — no
 * `boxSelector`, no groups matching it, no quantiles on their data — because a
 * violin without a summary is a chart this adapter can still read, not one it
 * failed on.
 *
 * @param root   - The element to query within.
 * @param config - The binder config.
 * @param panel  - The panel scope, on a multi-panel bind.
 * @returns The built layer, or `null` when there is no summary to read.
 */
function buildViolinBoxLayer(
  root: Element,
  config: D3ViolinConfig,
  panel?: D3PanelScope,
): D3BuiltLayer | null {
  const {
    title,
    axes,
    format,
    boxSelector,
    boxRectSelector = 'rect',
    orientation = Orientation.VERTICAL,
  } = config;
  if (!boxSelector) {
    return null;
  }

  const groups = queryD3Elements(root, boxSelector);
  if (groups.length === 0) {
    return null;
  }

  const sample = groups[0].datum;
  const fillAccessor = inferAccessor<string>(
    config,
    'fill',
    'fill',
    ['group', 'series', 'category', 'z', 'label', 'name'],
    sample,
  );
  const quantiles = {
    min: inferAccessor<number>(config, 'min', 'min', ['whiskerLow', 'lower'], sample),
    q1: inferAccessor<number>(config, 'q1', 'q1', ['lowerQuartile'], sample),
    q2: inferAccessor<number>(config, 'q2', 'q2', ['median'], sample),
    q3: inferAccessor<number>(config, 'q3', 'q3', ['upperQuartile'], sample),
    max: inferAccessor<number>(config, 'max', 'max', ['whiskerHigh', 'upper'], sample),
  };
  const lowerOutliers = inferAccessor<number[]>(config, 'lowerOutliers', 'lowerOutliers', ['lowOutliers'], sample);
  const upperOutliers = inferAccessor<number[]>(config, 'upperOutliers', 'upperOutliers', ['highOutliers'], sample);

  const data: BoxPoint[] = [];
  const boxes: Element[] = [];

  for (const { element, datum, index } of groups) {
    if (datum === undefined || datum === null) {
      continue;
    }
    const five = readQuantiles(datum, quantiles, index);
    if (!five) {
      continue;
    }
    data.push({
      z: resolveAccessorOptional<string>(datum, fillAccessor, index) ?? `Violin ${index + 1}`,
      lowerOutliers: resolveAccessorOptional<number[]>(datum, lowerOutliers, index) ?? [],
      ...five,
      upperOutliers: resolveAccessorOptional<number[]>(datum, upperOutliers, index) ?? [],
    });
    boxes.push(element);
  }

  // All of them or none: `BoxTrace` pairs its selectors with its points by
  // index, so a summary read for some categories and not others would put every
  // later box's highlight on the wrong category.
  if (data.length === 0 || data.length !== groups.length) {
    return null;
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.VIOLIN_BOX,
    title,
    orientation,
    selectors: boxSelectors(root, boxes, boxRectSelector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}

/** The five-number summary on a datum, or `null` when it does not state one. */
function readQuantiles(
  datum: unknown,
  accessors: Record<'min' | 'q1' | 'q2' | 'q3' | 'max', DataAccessor<number>>,
  index: number,
): { min: number; q1: number; q2: number; q3: number; max: number } | null {
  const read = (key: 'min' | 'q1' | 'q2' | 'q3' | 'max'): number | undefined => {
    const value = resolveAccessorOptional<number>(datum, accessors[key], index);
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };

  const min = read('min');
  const q1 = read('q1');
  const q2 = read('q2');
  const q3 = read('q3');
  const max = read('max');
  if (min === undefined || q1 === undefined || q2 === undefined
    || q3 === undefined || max === undefined) {
    return null;
  }
  return { min, q1, q2, q3, max };
}

/**
 * The KDE bins on a violin's datum, whichever way they were bound.
 *
 * @param datum    - The violin's `__data__`.
 * @param accessor - The configured or inferred bins accessor.
 * @param index    - The violin's index, for accessors that take one.
 * @returns The bins, or `null` when the datum holds none.
 */
function binsOf(datum: unknown, accessor: DataAccessor<unknown[]>, index: number): unknown[] | null {
  if (Array.isArray(datum)) {
    return datum;
  }
  const bins = resolveAccessorOptional<unknown[]>(datum, accessor, index);
  return Array.isArray(bins) ? bins : null;
}

/**
 * One selector per box, stamped so each resolves to its own group.
 *
 * `ViolinBoxTrace` reads a box a section at a time from one selector per
 * category, so — unlike {@link bindD3Box}, which names each part of each box —
 * the group itself is what has to be nameable.
 *
 * @param root      - The element the selectors are scoped to.
 * @param boxes     - The box groups, in payload order.
 * @param rect      - Selector for the IQR rect, kept for the caller's own use.
 * @param panel     - The panel scope, on a multi-panel bind.
 * @returns One selector per box.
 */
function boxSelectors(
  root: Element,
  boxes: Element[],
  rect: string,
  panel?: D3PanelScope,
): string[] {
  const prefix = selectorPrefix(root, panel);
  return boxes.map((element, index) => {
    element.removeAttribute('data-maidr-violin-box');
    element.setAttribute('data-maidr-violin-box', String(index));
    // The rect rather than the group: a highlight drawn over the whole group
    // would cover the whiskers and the outliers as well as the body.
    return `${prefix} [data-maidr-violin-box="${index}"] ${rect}`;
  });
}

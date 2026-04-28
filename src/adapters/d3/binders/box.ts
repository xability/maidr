/**
 * D3 binder for box plots.
 *
 * Extracts data from D3.js-rendered box plot SVG elements and generates
 * the MAIDR JSON schema for accessible box plot interaction.
 */

import type { BoxPoint, BoxSelector, Maidr, MaidrLayer } from '../../../type/grammar';
import type { D3BinderResult, D3BoxConfig } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { cssEscape, ensureContainerId } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, getD3Datum, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Binds a D3.js box plot to MAIDR, generating the accessible data representation.
 *
 * Box plots in D3 are typically constructed from multiple SVG elements per box
 * (a rect for the IQR, lines for whiskers, a line for the median, and circles
 * for outliers). This binder extracts statistical summary data from D3-bound
 * data on the box group elements.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * box-group element's D3-bound `__data__`: the 5-number summary
 * (`min`/`q1`/`q2`/`q3`/`max`) plus optional outlier arrays. Calling it
 * before `.data().join()` has run (or before the SVG is mounted) throws
 * "No elements found for selector …" or "Property '…' not found on datum".
 *
 * Typical call sites:
 * - **Vanilla JS:** right after your `selectAll(...).data(...).join(...)` chain.
 * - **React:** inside `useEffect`, never during render. Prefer
 *   {@link MaidrD3} / {@link useD3Adapter} from `maidr/react`, which
 *   handle the post-render timing for you.
 * - **Async data:** inside the `.then(...)` of your fetch, after drawing.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 box plot.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Box(svgElement, {
 *   selector: 'g.box',
 *   title: 'Distribution by Category',
 *   axes: { x: 'Category', y: 'Value' },
 *   fill: 'category',
 *   min: 'whiskerLow',
 *   q1: 'q1',
 *   q2: 'median',
 *   q3: 'q3',
 *   max: 'whiskerHigh',
 *   lowerOutliers: 'lowOutliers',
 *   upperOutliers: 'highOutliers',
 * });
 * ```
 */
export function bindD3Box(svg: Element, config: D3BoxConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    fill: fillAccessor = 'fill',
    min: minAccessor = 'min',
    q1: q1Accessor = 'q1',
    q2: q2Accessor = 'q2',
    q3: q3Accessor = 'q3',
    max: maxAccessor = 'max',
    lowerOutliers: lowerOutliersAccessor = 'lowerOutliers',
    upperOutliers: upperOutliersAccessor = 'upperOutliers',
    orientation = Orientation.VERTICAL,
    autoApply,
  } = config;

  const boxGroups = queryD3Elements(svg, selector);
  if (boxGroups.length === 0) {
    throw buildNoElementsError(svg, selector, 'box group');
  }

  const data: BoxPoint[] = boxGroups.map(({ element, datum, index }) => {
    // Try to get data from the group element's D3 binding first
    let effectiveDatum = datum;

    // If no data on the group, try to find it on child elements
    if (effectiveDatum === undefined || effectiveDatum === null) {
      const firstChild = element.querySelector('rect, line, path');
      if (firstChild) {
        effectiveDatum = getD3Datum(firstChild);
      }
    }

    if (effectiveDatum === undefined || effectiveDatum === null) {
      throw buildNoDatumError(selector, index);
    }

    // Outlier arrays are optional - use resolveAccessorOptional
    const lowerOutliers = resolveAccessorOptional<number[]>(effectiveDatum, lowerOutliersAccessor, index) ?? [];
    const upperOutliers = resolveAccessorOptional<number[]>(effectiveDatum, upperOutliersAccessor, index) ?? [];

    return {
      z: resolveAccessor<string>(effectiveDatum, fillAccessor, index),
      lowerOutliers,
      min: resolveAccessor<number>(effectiveDatum, minAccessor, index),
      q1: resolveAccessor<number>(effectiveDatum, q1Accessor, index),
      q2: resolveAccessor<number>(effectiveDatum, q2Accessor, index),
      q3: resolveAccessor<number>(effectiveDatum, q3Accessor, index),
      max: resolveAccessor<number>(effectiveDatum, maxAccessor, index),
      upperOutliers,
    };
  });

  const layerId = generateId();

  // Ensure the SVG has a stable id so selectors can be absolutely scoped
  // (consumers resolve selectors via global `document.querySelector`, so they
  // must be unique page-wide). `ensureContainerId` auto-assigns an id when
  // the user-supplied SVG lacks one, mirroring `scopeSelector`'s behaviour.
  const svgId = ensureContainerId(svg);

  // BoxTrace.mapToSvgElements (src/model/box.ts) requires one BoxSelector
  // object per box (it bails when `selectors.length !== points.length`). A
  // bare `scopeSelector(svg, selector)` yields a single string, whose `.length`
  // is the character count — the model fails silently and no highlight renders.
  //
  // Stamp each box group + its sub-parts with MAIDR-owned data attributes so
  // we can emit absolutely-scoped, structurally-stable selectors. This mirrors
  // the line-path stamping in `binders/line.ts` and the Google Charts adapter's
  // `data-maidr-*` convention. `removeAttribute` before `setAttribute` keeps
  // rebinding idempotent when D3 re-runs a data join.
  const isHorizontal = orientation === Orientation.HORIZONTAL;

  const boxSelectors: BoxSelector[] = boxGroups.map(({ element }, boxIndex) => {
    element.removeAttribute('data-maidr-box-index');
    element.setAttribute('data-maidr-box-index', String(boxIndex));

    // Direct children only: D3 box groups pack rect/lines/circles as siblings.
    // Using descendant queries would pick up decoration nested deeper (legend
    // swatches, title text, etc.) which happen to share tag names.
    const children = Array.from(element.children);
    const rect = children.find(c => c.localName === 'rect') as SVGRectElement | undefined;
    if (!rect) {
      throw new Error(
        `D3 box binder: no <rect> found inside "${selector}"[${boxIndex}]. `
        + `Each box group must contain a <rect> representing the IQR body.`,
      );
    }
    rect.removeAttribute('data-maidr-box-part');
    rect.setAttribute('data-maidr-box-part', 'iq');

    // Rect bounds define the coordinate system for classifying sibling
    // lines/outliers relative to the IQR body.
    const rectX = Number(rect.getAttribute('x') ?? 0);
    const rectY = Number(rect.getAttribute('y') ?? 0);
    const rectW = Number(rect.getAttribute('width') ?? 0);
    const rectH = Number(rect.getAttribute('height') ?? 0);
    const rectCx = rectX + rectW / 2;
    const rectCy = rectY + rectH / 2;

    // Classify each <line>. Role swaps by orientation:
    //   Vertical boxplot:   median = horizontal line (|dx| > |dy|)
    //                       whiskers = vertical lines (above/below rect center)
    //   Horizontal boxplot: median = vertical line   (|dy| > |dx|)
    //                       whiskers = horizontal lines (left/right of rect center)
    const lines = children.filter(c => c.localName === 'line') as SVGLineElement[];
    for (const line of lines) {
      const x1 = Number(line.getAttribute('x1') ?? 0);
      const y1 = Number(line.getAttribute('y1') ?? 0);
      const x2 = Number(line.getAttribute('x2') ?? 0);
      const y2 = Number(line.getAttribute('y2') ?? 0);
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      line.removeAttribute('data-maidr-box-part');

      let part: 'q2' | 'lower-whisker' | 'upper-whisker';
      if (isHorizontal) {
        if (dy > dx) {
          part = 'q2';
        } else {
          part = midX < rectCx ? 'lower-whisker' : 'upper-whisker';
        }
      } else {
        if (dx > dy) {
          part = 'q2';
        } else {
          // SVG y grows downward, so a larger midpoint y is visually below
          // the rect center ⇒ lower whisker.
          part = midY > rectCy ? 'lower-whisker' : 'upper-whisker';
        }
      }
      line.setAttribute('data-maidr-box-part', part);
    }

    // Classify outlier markers. D3 boxplots commonly use <circle>; a D3
    // chart may omit outliers entirely, in which case we emit empty arrays
    // (BoxTrace tolerates this per the type contract).
    const outlierEls = children.filter(c => c.localName === 'circle') as SVGCircleElement[];
    const lowerOutlierIndices: number[] = [];
    const upperOutlierIndices: number[] = [];

    outlierEls.forEach((outlier, outlierIndex) => {
      const cx = Number(outlier.getAttribute('cx') ?? 0);
      const cy = Number(outlier.getAttribute('cy') ?? 0);
      const isLower = isHorizontal ? cx < rectCx : cy > rectCy;
      outlier.removeAttribute('data-maidr-box-part');
      outlier.removeAttribute('data-maidr-outlier-index');
      outlier.setAttribute(
        'data-maidr-box-part',
        isLower ? 'lower-outlier' : 'upper-outlier',
      );
      outlier.setAttribute('data-maidr-outlier-index', String(outlierIndex));
      (isLower ? lowerOutlierIndices : upperOutlierIndices).push(outlierIndex);
    });

    const base = `#${cssEscape(svgId)} ${selector}[data-maidr-box-index="${boxIndex}"]`;
    return {
      lowerOutliers: lowerOutlierIndices.map(
        i => `${base} [data-maidr-box-part="lower-outlier"][data-maidr-outlier-index="${i}"]`,
      ),
      min: `${base} [data-maidr-box-part="lower-whisker"]`,
      iq: `${base} [data-maidr-box-part="iq"]`,
      q2: `${base} [data-maidr-box-part="q2"]`,
      max: `${base} [data-maidr-box-part="upper-whisker"]`,
      upperOutliers: upperOutlierIndices.map(
        i => `${base} [data-maidr-box-part="upper-outlier"][data-maidr-outlier-index="${i}"]`,
      ),
    };
  });

  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.BOX,
    title,
    selectors: boxSelectors,
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [layer] }]],
  };

  applyMaidrData(svg, maidr, autoApply);
  return { maidr, layer };
}

/**
 * Vega-Lite adapter entry point for MAIDR.
 *
 * This module re-exports the Vega-Lite adapter API and exposes it globally
 * for script-tag (UMD) usage. The primary consumer-facing API is
 * {@link bindVegaLite}, which converts a Vega-Lite spec to MAIDR and mounts
 * the accessible UI on the rendered SVG.
 *
 * @remarks
 * Vega-Lite renders asynchronously via `vegaEmbed()`. The adapter must be
 * called **after** `vegaEmbed()` resolves so that the SVG and the compiled
 * Vega view are both available.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
 * <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
 * <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
 * <script src="maidr.js"></script>
 * <script src="maidr/dist/vegalite.js"></script>
 * <script>
 *   const spec = {
 *     data: { values: [{ a: 'A', b: 28 }, { a: 'B', b: 55 }] },
 *     mark: 'bar',
 *     encoding: {
 *       x: { field: 'a', type: 'nominal' },
 *       y: { field: 'b', type: 'quantitative' },
 *     },
 *   };
 *   vegaEmbed('#chart', spec).then((result) => {
 *     maidrVegaLite.bindVegaLite(result.view, spec);
 *   });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

import type {
  VegaLiteSpec,
  VegaLiteToMaidrOptions,
  VegaView,
} from './adapters/vegalite/types';
import type { BoxPoint, BoxSelector, HeatmapData, LinePoint, Maidr, MaidrLayer } from './type/grammar';
import { vegaLiteToMaidr } from './adapters/vegalite/converters';
import { Orientation, TraceType } from './type/grammar';
import { initMaidrOnElement } from './util/initMaidr';

/**
 * Toggle this flag (`maidrVegaLite.debug = true`) to enable diagnostic
 * console output from the adapter. Useful when debugging highlight /
 * navigation alignment issues.
 */
let debugEnabled = false;

function debugLog(...args: unknown[]): void {
  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.log('[maidr/vegalite]', ...args);
  }
}

/**
 * For simple bar charts Vega-Lite emits the bars in **data order**, but
 * lays them out visually in **scale-domain order** (alphabetical by
 * default for nominal axes). MAIDR's `BarTrace` highlights the i-th
 * `<path>` returned by `querySelectorAll(selector)` for the i-th data
 * point, and announces `data[i]` for that same point — so both arrays
 * must agree with the visual order.
 *
 * Before this step:
 *   - `layer.data[i]`     is the i-th row from the spec dataset (data flow order)
 *   - `querySelectorAll[i]` is the i-th `<path>` in the SVG (also data flow order)
 *   ⇒ data[i] ↔ DOM[i] (paired correctly), but neither reflects the
 *     visual left-to-right order the user sees.
 *
 * We pair each DOM element with its data point, sort the pairs by the
 * element's `getBoundingClientRect()` position (x for vertical bars,
 * y for horizontal), then:
 *   1. Re-append the elements in sorted order so `querySelectorAll`
 *      returns visual order.
 *   2. Replace `layer.data` with the sorted data so the announcement
 *      and audio for the i-th bar match what the user sees.
 *
 * Vega positions bars via `transform` attributes, so re-appending only
 * changes DOM order — the visual layout is untouched. Segmented layers
 * (stacked / dodged / normalised) use `layer.domMapping` instead and
 * must NOT be re-ordered here.
 */
function sortSimpleBarsByVisualOrder(svg: SVGSVGElement, layers: MaidrLayer[]): void {
  for (const layer of layers) {
    if (layer.type !== TraceType.BAR)
      continue;
    if (typeof layer.selectors !== 'string')
      continue;
    if (!Array.isArray(layer.data))
      continue;

    const selector = layer.selectors;
    const elements = Array.from(svg.querySelectorAll<SVGGraphicsElement>(selector));
    if (elements.length < 2)
      continue;

    // Bail out if DOM/data lengths don't match — pairing would be
    // unsafe and the bug they describe is bigger than this step can fix.
    const data = layer.data as unknown[];
    if (elements.length !== data.length) {
      debugLog(
        `bar layer "${layer.id}": skipping visual-order sort (DOM has `
        + `${elements.length} elements but data has ${data.length} entries)`,
      );
      continue;
    }

    const isHorizontal = layer.orientation === Orientation.HORIZONTAL;

    // Pair each data point with its corresponding DOM element. They
    // start aligned because Vega emits marks in data-flow order.
    const pairs = data.map((point, i) => ({
      point,
      element: elements[i],
    }));

    pairs.sort((a, b) => {
      const ra = a.element.getBoundingClientRect();
      const rb = b.element.getBoundingClientRect();
      return isHorizontal ? ra.y - rb.y : ra.x - rb.x;
    });

    // No-op when already sorted.
    const alreadySorted = pairs.every((p, i) => p.element === elements[i]);
    if (alreadySorted) {
      debugLog(`bar layer "${layer.id}": DOM order already matches visual order`);
      continue;
    }

    debugLog(
      `bar layer "${layer.id}": re-sorting ${pairs.length} bars by `
      + `${isHorizontal ? 'visual y' : 'visual x'} to align highlight + data with rendered order`,
    );

    // 1. Replace the layer's data with the visual-order data.
    //    BarPoint[] is the only shape `data` holds for BAR layers.
    layer.data = pairs.map(p => p.point) as MaidrLayer['data'];

    // 2. Re-append elements in sorted order. appendChild moves the node
    //    in place; it doesn't clone, so listeners/refs are preserved.
    //    Group by parent first so cross-group ordering isn't disturbed.
    const byParent = new Map<Element, SVGGraphicsElement[]>();
    for (const { element } of pairs) {
      const parent = element.parentElement;
      if (!parent)
        continue;
      const arr = byParent.get(parent);
      if (arr)
        arr.push(element);
      else
        byParent.set(parent, [element]);
    }
    for (const [parent, group] of byParent) {
      for (const el of group)
        parent.appendChild(el);
    }
  }
}

/**
 * Resolve the rendered fill colour of an SVG element. Vega applies
 * fill via either an attribute (`fill="..."`) or, in newer builds,
 * a `style="fill: ..."` declaration. We try both.
 */
function resolveFill(el: Element): string {
  const attr = el.getAttribute('fill');
  if (attr && attr !== 'none')
    return attr;
  // Fall back to computed style for browsers / Vega builds that put fill
  // on the inline `style` attribute.
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const computed = window.getComputedStyle(el).fill;
    if (computed)
      return computed;
  }
  return '';
}

/**
 * Detect the DOM emission order for a segmented (stacked / dodged /
 * normalised) bar layer by sampling the first two rendered elements.
 *
 * MAIDR's `SegmentedTrace.mapToSvgElements` reads `layer.domMapping` to
 * decide how to slice the flat DOM list back into the
 * `data[seriesIndex][barIndex]` 2-D grid.  Vega-Lite's actual emission
 * order, however, depends on the input row order — not the trace type —
 * so a static type-based default is unreliable.  We mirror the D3
 * adapter's runtime detection: compare the fill of the first two
 * rendered elements.
 *
 * - Same fill → DOM is **series-major** (`[A1, A2, A3, B1, B2, B3]`)
 *   → `{ order: 'row' }`.
 * - Different fill → DOM is **subject-major** (`[A1, B1, A2, B2, A3, B3]`)
 *   → `{ order: 'column', groupDirection: 'forward' }`.
 *
 * Returns `undefined` when detection is impossible (fewer than 2
 * elements, no fills) so the caller can fall back to the type-based
 * default rather than silently picking the wrong order.
 */
function detectSegmentedDomOrder(
  svg: SVGSVGElement,
  layer: MaidrLayer,
): MaidrLayer['domMapping'] | undefined {
  if (typeof layer.selectors !== 'string') {
    return undefined;
  }
  const elements = Array.from(svg.querySelectorAll<SVGGraphicsElement>(layer.selectors));
  if (elements.length < 2) {
    return undefined;
  }

  const fill0 = resolveFill(elements[0]);
  const fill1 = resolveFill(elements[1]);
  if (!fill0 || !fill1) {
    return undefined;
  }

  const seriesMajor = fill0 === fill1;
  return seriesMajor
    ? { order: 'row' }
    : { order: 'column', groupDirection: 'forward' };
}

/**
 * For each segmented layer (STACKED / DODGED / NORMALIZED), populate
 * `layer.domMapping` from runtime detection. Caller-supplied
 * `domMapping` is preserved (e.g. when set via `options.domOrder`).
 */
function applySegmentedDomMappings(
  svg: SVGSVGElement,
  layers: MaidrLayer[],
): void {
  for (const layer of layers) {
    if (
      layer.type !== TraceType.STACKED
      && layer.type !== TraceType.DODGED
      && layer.type !== TraceType.NORMALIZED
    ) {
      continue;
    }
    if (layer.domMapping) {
      continue;
    }
    const detected = detectSegmentedDomOrder(svg, layer);
    if (detected) {
      layer.domMapping = detected;
    }
  }
}

/**
 * For a STACKED layer, ensure that **`data[0]` is the visually
 * bottom-most series** (the one whose segments sit closest to the
 * x-axis baseline). Maidr's `SegmentedTrace` initialises navigation
 * at `row=0, col=0`, so without this step the user lands on whichever
 * series Vega happened to emit first — typically the *top* of the
 * stack, which is the opposite of what sighted users perceive as the
 * "first" segment.
 *
 * Why we re-order DOM as well as data: Maidr's
 * `SegmentedTrace.mapToSvgElements` reads `layer.domMapping` to slice
 * the flat DOM list back into the `data[seriesIndex][barIndex]` 2-D
 * grid. If we only re-ordered `data`, the slice would still pick the
 * *original* series' elements, so the highlight would point to the
 * wrong segment. Re-appending the DOM nodes inside each x-category in
 * the new series order keeps `domMapping` valid — Vega positions
 * marks via `transform` so DOM order changes alone don't move the
 * visual layout.
 *
 * Applies to STACKED and NORMALIZED layers — both stack segments
 * vertically (or horizontally) on top of each other, sharing the same
 * x-category, so "bottom-most" is well-defined for both. DODGED bars
 * are side-by-side (no top/bottom) and are skipped.
 */
function reorderSegmentedSeriesByVisualBottom(
  svg: SVGSVGElement,
  layers: MaidrLayer[],
): void {
  for (const layer of layers) {
    if (layer.type !== TraceType.STACKED && layer.type !== TraceType.NORMALIZED) {
      continue;
    }
    if (typeof layer.selectors !== 'string') {
      continue;
    }
    if (!Array.isArray(layer.data) || layer.data.length < 2) {
      continue;
    }

    const data = layer.data as Array<Array<{ z?: string }>>;
    const seriesCount = data.length;
    const categoryCount = data[0]?.length ?? 0;
    if (categoryCount === 0) {
      continue;
    }

    const elements = Array.from(
      svg.querySelectorAll<SVGGraphicsElement>(layer.selectors),
    );
    if (elements.length !== seriesCount * categoryCount) {
      continue;
    }

    // Resolve the indices of the elements that belong to the FIRST
    // x-category. Their bounding boxes tell us which series sits at
    // the visual bottom of the stack.
    const order = layer.domMapping?.order ?? 'row';
    const firstCatDomIndices: number[] = [];
    if (order === 'column') {
      // subject-major: per-category emission, so the first N elements
      // are the first category, one per series.
      for (let s = 0; s < seriesCount; s++) {
        firstCatDomIndices.push(s);
      }
    } else {
      // series-major: each series occupies a contiguous block of size
      // categoryCount; the first category is at the start of each block.
      for (let s = 0; s < seriesCount; s++) {
        firstCatDomIndices.push(s * categoryCount);
      }
    }

    // Find which DOM-series-index corresponds to the visual bottom by
    // largest screen-space `bottom` (`y + height`).
    let bottomDomSeries = 0;
    let maxBottom = -Infinity;
    firstCatDomIndices.forEach((domIdx, dataDomSeries) => {
      const rect = elements[domIdx].getBoundingClientRect();
      const bottom = rect.y + rect.height;
      if (bottom > maxBottom) {
        maxBottom = bottom;
        bottomDomSeries = dataDomSeries;
      }
    });

    if (bottomDomSeries === 0) {
      continue;
    }

    // Build the new series order: bottom-most first, others retain
    // their relative order. For 2-series this is just a swap; for
    // N-series it puts the bottom at index 0 and keeps the rest stable.
    const newOrder: number[] = [bottomDomSeries];
    for (let s = 0; s < seriesCount; s++) {
      if (s !== bottomDomSeries) {
        newOrder.push(s);
      }
    }

    // 1. Reorder `data` so series 0 is the bottom-most.
    const newData = newOrder.map(s => data[s]);
    layer.data = newData as MaidrLayer['data'];

    // 2. Reorder DOM elements *within each x-category* so that the
    //    layout assumed by `domMapping` still holds — the new data
    //    series 0 must point at the new DOM "first series" slot.
    const newElements: SVGGraphicsElement[] = [];
    if (order === 'column') {
      // subject-major: for each category, append elements in newOrder.
      for (let c = 0; c < categoryCount; c++) {
        for (const s of newOrder) {
          newElements.push(elements[c * seriesCount + s]);
        }
      }
    } else {
      // series-major: append entire series blocks in newOrder.
      for (const s of newOrder) {
        for (let c = 0; c < categoryCount; c++) {
          newElements.push(elements[s * categoryCount + c]);
        }
      }
    }

    // Re-append nodes to their parents in `newElements` order.
    // appendChild moves a node in place (no clone), so listeners /
    // refs survive. Group by parent to avoid disturbing cross-group
    // ordering.
    const byParent = new Map<Element, SVGGraphicsElement[]>();
    for (const el of newElements) {
      const parent = el.parentElement;
      if (!parent) {
        continue;
      }
      const arr = byParent.get(parent);
      if (arr) {
        arr.push(el);
      } else {
        byParent.set(parent, [el]);
      }
    }
    for (const [parent, group] of byParent) {
      for (const el of group) {
        parent.appendChild(el);
      }
    }
  }
}

/**
 * For HISTOGRAM layers, pair each data bin with its corresponding DOM
 * element and sort by visual x-position (or y for horizontal). This
 * mirrors {@link sortSimpleBarsByVisualOrder} but applies to histograms
 * specifically, since the post-binning Vega dataset row order is not
 * guaranteed to match the rendered left-to-right bin order — Vega's
 * binning transform sorts by `bin_start` but other transforms
 * (filters, calculate, sample) may reorder rows in the dataset the
 * adapter reads from.
 *
 * The current symptom we're fixing is "nav and announced data are
 * correct, but the highlight rectangle moves randomly" — that
 * indicates `data[i]` is paired with the wrong `<path>`, which is
 * exactly what visual-order sorting fixes.
 */
function sortHistogramBinsByVisualOrder(
  svg: SVGSVGElement,
  layers: MaidrLayer[],
): void {
  for (const layer of layers) {
    if (layer.type !== TraceType.HISTOGRAM) {
      continue;
    }
    if (typeof layer.selectors !== 'string') {
      continue;
    }
    if (!Array.isArray(layer.data)) {
      continue;
    }

    const selector = layer.selectors;
    const elements = Array.from(
      svg.querySelectorAll<SVGGraphicsElement>(selector),
    );
    const data = layer.data as unknown[];

    if (elements.length === 0) {
      continue;
    }
    if (elements.length !== data.length) {
      // Most likely cause: Vega omitted zero-count bins from the DOM,
      // or the selector picked up extra elements. Either way pairing
      // is unsafe — bail and let the existing `mapToSvgElements`
      // zero-bin handling do its best.
      continue;
    }

    const isHorizontal = layer.orientation === Orientation.HORIZONTAL;

    const pairs = data.map((point, i) => ({
      point,
      element: elements[i],
    }));

    pairs.sort((a, b) => {
      const ra = a.element.getBoundingClientRect();
      const rb = b.element.getBoundingClientRect();
      return isHorizontal ? ra.y - rb.y : ra.x - rb.x;
    });

    const alreadySorted = pairs.every((p, i) => p.element === elements[i]);
    if (alreadySorted) {
      continue;
    }

    // 1. Replace `layer.data` with the visual-order sequence.
    layer.data = pairs.map(p => p.point) as MaidrLayer['data'];

    // 2. Re-append DOM elements in sorted order so `querySelectorAll`
    //    later returns them in the same sequence as `layer.data`.
    const byParent = new Map<Element, SVGGraphicsElement[]>();
    for (const { element } of pairs) {
      const parent = element.parentElement;
      if (!parent) {
        continue;
      }
      const arr = byParent.get(parent);
      if (arr) {
        arr.push(element);
      } else {
        byParent.set(parent, [element]);
      }
    }
    for (const [parent, group] of byParent) {
      for (const el of group) {
        parent.appendChild(el);
      }
    }
  }
}

/**
 * For HEATMAP layers, reconcile the data layout (`HeatmapData.x`,
 * `.y`, `.points`) and the DOM emission order with the **visual grid
 * layout** that Vega-Lite renders.
 *
 * Why this is needed
 * ------------------
 * Vega-Lite emits one mark per dataset row in **input row order**,
 * which does NOT necessarily match the visual grid laid out by the
 * x/y scales (which are typically alphabetical or by scale-domain).
 * `extractHeatmapData` builds `points[yi][xi]` using `Set`-insertion
 * order of labels — also dataset-driven, not visual.
 *
 * `Heatmap.mapToSvgElements`'s SVGPath branch (the one our adapter
 * hits, since `buildSelector` returns `path` for `mark: 'rect'`)
 * assumes DOM is in **row-major visual order**:
 *
 *   flatIndex = (numRows - 1 - r) * numCols + c
 *
 * (with the `numRows - 1 - r` flip mirroring the model's reversal of
 * `points` so navigation row 0 = visual bottom). When DOM emission
 * doesn't follow row-major visual order, the highlight rect lands
 * on the wrong cell while the announced text matches the data —
 * the "highlight jumps randomly" symptom.
 *
 * Strategy
 * --------
 * 1. Detect the current DOM↔data pairing convention (row-major or
 *    column-major) from the rects of `DOM[0]` vs `DOM[1]`.
 * 2. Annotate each DOM element with its current `(yi, xi)` data
 *    coordinates and visual centre.
 * 3. Cluster sorted-by-y elements into visual rows (using a
 *    half-cell-height tolerance).
 * 4. Within each row, sort left-to-right by x.
 * 5. Rebuild `HeatmapData` so `y` is top-to-bottom labels, `x` is
 *    left-to-right labels, and `points[r][c]` is the value at the
 *    visual cell at row `r` (from top) and column `c` (from left).
 * 6. Re-append DOM nodes in row-major visual order.
 *
 * The model's existing reverse on `y` and `points` then makes
 * navigation row 0 = visual bottom, which is what sighted users
 * expect (Cartesian "first" = bottom).
 */
function sortHeatmapCellsByVisualOrder(
  svg: SVGSVGElement,
  layers: MaidrLayer[],
): void {
  for (const layer of layers) {
    if (layer.type !== TraceType.HEATMAP) {
      continue;
    }
    if (typeof layer.selectors !== 'string') {
      continue;
    }
    const data = layer.data as HeatmapData | undefined;
    if (
      !data
      || !Array.isArray(data.x)
      || !Array.isArray(data.y)
      || !Array.isArray(data.points)
    ) {
      continue;
    }

    const ny = data.y.length;
    const nx = data.x.length;
    const expected = nx * ny;
    if (expected === 0) {
      continue;
    }

    const elements = Array.from(
      svg.querySelectorAll<SVGGraphicsElement>(layer.selectors),
    );

    if (elements.length !== expected) {
      continue;
    }

    // 1. Detect DOM emission convention from first two elements.
    //    If they share roughly the same y, DOM is row-major
    //    (incrementing xi first within a row). Otherwise we treat it
    //    as column-major (incrementing yi first within a column).
    const r0 = elements[0].getBoundingClientRect();
    const r1 = elements[1].getBoundingClientRect();
    const cellHeight = r0.height || r0.width || 1;
    const sameRow = Math.abs(r0.y - r1.y) < cellHeight / 2;
    const isRowMajor = sameRow;

    // 2. Annotate each DOM element with its (yi, xi) and centre.
    interface Cell {
      element: SVGGraphicsElement;
      yi: number;
      xi: number;
      value: number;
      yLabel: string;
      xLabel: string;
      cy: number;
      cx: number;
    }
    const cells: Cell[] = elements.map((element, k) => {
      const yi = isRowMajor ? Math.floor(k / nx) : k % ny;
      const xi = isRowMajor ? k % nx : Math.floor(k / ny);
      const rect = element.getBoundingClientRect();
      return {
        element,
        yi,
        xi,
        value: data.points[yi]?.[xi] ?? 0,
        yLabel: data.y[yi] ?? '',
        xLabel: data.x[xi] ?? '',
        cy: rect.y + rect.height / 2,
        cx: rect.x + rect.width / 2,
      };
    });

    // 3. Sort by visual y, then cluster into rows by y proximity.
    const tolerance = cellHeight / 2;
    const byCy = [...cells].sort((a, b) => a.cy - b.cy);
    const rows: Cell[][] = [];
    for (const cell of byCy) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].cy - cell.cy) < tolerance) {
        last.push(cell);
      } else {
        rows.push([cell]);
      }
    }

    // 4. Sort each row left-to-right; verify uniform width.
    for (const row of rows) {
      row.sort((a, b) => a.cx - b.cx);
    }
    if (rows.length !== ny || rows.some(r => r.length !== nx)) {
      continue;
    }

    // Bail out if everything is already in canonical row-major
    // visual order — avoids a needless DOM reflow.
    const flatVisual = rows.flat();
    const alreadyRowMajor = isRowMajor
      && flatVisual.every((c, i) => c.element === elements[i]);
    if (alreadyRowMajor) {
      continue;
    }

    // 5. Rebuild HeatmapData in visual top→bottom, left→right order.
    const newY = rows.map(r => r[0].yLabel);
    const newX = rows[0].map(c => c.xLabel);
    const newPoints = rows.map(r => r.map(c => c.value));

    layer.data = { x: newX, y: newY, points: newPoints };

    // 6. Re-append DOM elements in visual row-major order so
    //    Heatmap.mapToSvgElements's path branch (flatIndex =
    //    (numRows-1-r)*numCols + c) lands on the right cell.
    const byParent = new Map<Element, SVGGraphicsElement[]>();
    for (const cell of flatVisual) {
      const parent = cell.element.parentElement;
      if (!parent) {
        continue;
      }
      const arr = byParent.get(parent);
      if (arr) {
        arr.push(cell.element);
      } else {
        byParent.set(parent, [cell.element]);
      }
    }
    for (const [parent, group] of byParent) {
      for (const el of group) {
        parent.appendChild(el);
      }
    }
  }
}

/**
 * Read the X-axis tick labels in **visual left-to-right order**.
 *
 * Vega-Lite renders both X and Y axes inside `g.role-axis` groups; we
 * pick the one whose label texts vary along the X-screen direction
 * (vs. Y) and return their `textContent` sorted by screen X. Returns
 * `[]` when no suitable axis can be found (e.g. quantitative axis with
 * tick labels not laid out as discrete categories).
 *
 * Used by {@link sortLinesByVisualOrder} to align line-chart data with
 * the visual order Vega-Lite renders for nominal/ordinal X scales.
 */
function readXAxisLabelsInVisualOrder(svg: SVGSVGElement): string[] {
  const axisGroups = Array.from(svg.querySelectorAll<SVGGElement>('g.role-axis'));
  let bestLabels: string[] = [];
  let bestVariance = -1;

  for (const axisGroup of axisGroups) {
    const texts = Array.from(axisGroup.querySelectorAll<SVGTextElement>('text'));
    if (texts.length < 2)
      continue;

    const items = texts
      .map((t) => {
        const r = t.getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          label: (t.textContent ?? '').trim(),
        };
      })
      .filter(it => it.label.length > 0);

    if (items.length < 2)
      continue;

    const xs = items.map(it => it.x);
    const ys = items.map(it => it.y);
    const xVar = Math.max(...xs) - Math.min(...xs);
    const yVar = Math.max(...ys) - Math.min(...ys);

    // X axis: text x-positions vary more than y-positions.
    if (xVar > yVar && xVar > bestVariance) {
      const sorted = items.slice().sort((a, b) => a.x - b.x);
      bestLabels = sorted.map(it => it.label);
      bestVariance = xVar;
    }
  }

  return bestLabels;
}

/**
 * For LINE layers, Vega-Lite renders the `<path>`'s `d` attribute with
 * M/L commands in **visual x-axis order** (alphabetical by default for
 * nominal/ordinal scales), but `extractLineData` returns
 * `LinePoint[][]` in **insertion order**. MAIDR's `LineTrace`
 * highlights synthetic circles derived from path coordinates (visual
 * order) but announces `data[seriesIdx][i]` from insertion order — so
 * the green dot lands on Aug while the text reads "Feb, 32".
 *
 * Fix: read the X-axis tick labels in visual position order, then
 * reorder each series' data so `data[seriesIdx][i].x === axisLabels[i]`.
 *
 * No DOM mutation is needed — `LineTrace.mapViaPathParsing` already
 * walks the path in visual order; we only have to align the data
 * array. Skipped for numeric/temporal axes (where natural ordering
 * matches insertion order) and for layers whose data labels can't be
 * matched against axis ticks.
 */
function sortLinesByVisualOrder(svg: SVGSVGElement, layers: MaidrLayer[]): void {
  let axisLabels: string[] | null = null;

  for (const layer of layers) {
    if (layer.type !== TraceType.LINE)
      continue;
    if (!Array.isArray(layer.data) || layer.data.length === 0)
      continue;

    const seriesArr = layer.data as LinePoint[][];

    // Skip when the data is purely numeric/temporal — Vega renders
    // those in natural numeric order, which already matches the
    // insertion order of the converter.
    let hasStringX = false;
    for (const series of seriesArr) {
      if (series.length > 0 && typeof series[0].x === 'string') {
        hasStringX = true;
        break;
      }
    }
    if (!hasStringX)
      continue;

    // Lazily resolve axis labels once per call.
    if (axisLabels === null) {
      axisLabels = readXAxisLabelsInVisualOrder(svg);
    }
    if (axisLabels.length === 0) {
      debugLog(`line layer "${layer.id}": no X-axis labels found, skipping visual-order sort`);
      continue;
    }

    let reorderedAny = false;
    for (let s = 0; s < seriesArr.length; s++) {
      const series = seriesArr[s];
      if (series.length < 2)
        continue;

      const map = new Map<string, LinePoint>();
      for (const pt of series) {
        map.set(String(pt.x), pt);
      }

      const reordered: LinePoint[] = [];
      for (const label of axisLabels) {
        const pt = map.get(label);
        if (pt !== undefined)
          reordered.push(pt);
      }

      // Only swap when the reorder is complete (every data point
      // matched an axis label) and actually differs from the original.
      if (reordered.length !== series.length)
        continue;
      const same = reordered.every((pt, i) => pt === series[i]);
      if (same)
        continue;

      seriesArr[s] = reordered;
      reorderedAny = true;
    }

    if (reorderedAny) {
      debugLog(`line layer "${layer.id}": reordered series data to match visual x-axis order`);
    }
  }
}

/**
 * For BOX layers, replace the placeholder single-string selector
 * (`"g.mark-rect.role-mark.{marks} path"`) with a properly typed
 * `BoxSelector[]` (one entry per box group), populate outlier
 * values into `BoxPoint.lowerOutliers` / `.upperOutliers`, and stamp
 * `data-maidr-box-index` / `data-maidr-box-part` attributes on each
 * sub-mark element so attribute-scoped selectors uniquely identify
 * each part regardless of how Vega-Lite nests `<g class="mark-group">`
 * wrappers around the rendered sub-marks.
 *
 * Why this is needed
 * ------------------
 * Vega-Lite's `mark: 'boxplot'` is a composite that compiles to four
 * sub-mark groups, **each containing all groups' sub-marks mixed
 * together** rather than one group per box:
 *   - `g.mark-rect`   (one `<path>` per group: Q1–Q3 box)
 *   - `g.mark-rule`   (two `<line>`s per group: lower & upper whiskers)
 *   - `g.mark-tick`   (one `<path>` per group: median tick)
 *   - `g.mark-symbol` (variable `<path>` per outlier)
 *
 * MAIDR's `BoxTrace.mapToSvgElements` expects `BoxSelector[]` with
 * one entry per group, each containing per-sub-mark CSS selectors.
 * The current adapter passes a single string, so the type cast in
 * `BoxTrace` results in `mapToSvgElements` returning `null` and no
 * highlight is drawn at all.
 *
 * Strategy
 * --------
 * 1. Query each sub-mark group (rects, rules, ticks, outliers).
 * 2. Validate counts: `N` rects, `N` ticks, `2N` rules.
 * 3. Pair sub-marks to box groups by visual cx (vertical) / cy
 *    (horizontal). For each rect, find its 2 nearest rules
 *    (whiskers) and 1 nearest tick (median).
 * 4. Distinguish min vs max whisker by cy (vertical: larger cy is
 *    visually lower → min) or cx (horizontal: smaller cx is the
 *    "min" side).
 * 5. For each outlier, assign to the nearest group; classify upper
 *    vs lower by comparing its cy/cx to the rect centre.
 * 6. Compute outlier values via linear interpolation between the
 *    `min` rule's far-end pixel anchor (= `BoxPoint.min`) and the
 *    `max` rule's far-end anchor (= `BoxPoint.max`). Rounded to
 *    integer.
 * 7. Re-append elements in deterministic group-major order and stamp
 *    `data-maidr-box-index` / `data-maidr-box-part` attributes on
 *    each sub-mark (rect, rules, tick, outliers).
 * 8. Reorder `layer.data` to match the new visual group order and
 *    populate the outlier arrays.
 * 9. Replace `layer.selectors` with the new `BoxSelector[]` built
 *    from attribute-scoped selectors (avoids `:nth-of-type()` which
 *    is ambiguous under Vega-Lite's nested `<g class="mark-group">`
 *    wrappers).
 *
 * Caveats
 * -------
 * - Assumes the y-scale is linear (true for the typical box plot;
 *   logs and bails on degenerate cases like zero IQR).
 * - Outlier values are interpolated from pixels, not from Vega's
 *   internal stat dataset, so they may differ by ±1 unit due to
 *   rounding. That's acceptable for sonification + announce.
 * - Bails (with a diag log) on any structural surprise (count
 *   mismatch, unparseable selector); the layer remains in its
 *   current (already-broken) state — never worse.
 */
function buildBoxPlotSelectorsFromDom(
  svg: SVGSVGElement,
  layers: MaidrLayer[],
): void {
  for (const layer of layers) {
    if (layer.type !== TraceType.BOX) {
      continue;
    }
    if (typeof layer.selectors !== 'string') {
      continue;
    }
    if (!Array.isArray(layer.data)) {
      continue;
    }
    const data = layer.data as BoxPoint[];
    const N = data.length;
    if (N === 0) {
      continue;
    }

    // 0. Discover sub-mark groups in the rendered DOM.
    //
    //    Vega-Lite v5 compiles `mark: 'boxplot'` to a nested layered
    //    spec. The actual DOM has FIVE groups:
    //      - g.mark-symbol.role-mark.layer_0_layer_0_marks    → outliers
    //      - g.mark-rule.role-mark.layer_0_layer_1_layer_0_marks → 1
    //          whisker line per box (one of {lower, upper})
    //      - g.mark-rule.role-mark.layer_0_layer_1_layer_1_marks → 1
    //          whisker line per box (the other side)
    //      - g.mark-rect.role-mark.layer_1_layer_0_marks       → IQ box
    //          (one path per box; data-bearing aria-labels)
    //      - g.mark-rect.role-mark.layer_1_layer_1_marks       → median
    //          bar (one 1px-tall path per box; no aria-label)
    //
    //    The placeholder `marksClass` in `layer.selectors` does not
    //    correspond to any single group, so we must discover groups by
    //    scanning the DOM and disambiguating IQ vs median (by aria-label
    //    presence) and lower vs upper whisker (by geometric position).
    const allRectGroups = Array.from(
      svg.querySelectorAll<SVGGElement>('g.mark-rect.role-mark'),
    );
    const allRuleGroups = Array.from(
      svg.querySelectorAll<SVGGElement>('g.mark-rule.role-mark'),
    );
    const allSymbolGroups = Array.from(
      svg.querySelectorAll<SVGGElement>('g.mark-symbol.role-mark'),
    );

    // IQ rect group's first path has a non-empty aria-label; the
    // median rect group's paths have no aria-label.
    let iqRectGroup: SVGGElement | null = null;
    let medianRectGroup: SVGGElement | null = null;
    for (const g of allRectGroups) {
      const firstPath = g.querySelector('path');
      if (!firstPath) {
        continue;
      }
      const ariaLabel = firstPath.getAttribute('aria-label') ?? '';
      if (ariaLabel.length > 0) {
        if (!iqRectGroup) {
          iqRectGroup = g;
        }
      } else if (!medianRectGroup) {
        medianRectGroup = g;
      }
    }
    if (!iqRectGroup || !medianRectGroup || allRuleGroups.length < 2) {
      continue;
    }

    // 1. Query sub-marks within each discovered group.
    const rects = Array.from(
      iqRectGroup.querySelectorAll<SVGGraphicsElement>('path'),
    );
    const ticks = Array.from(
      medianRectGroup.querySelectorAll<SVGGraphicsElement>('path'),
    );
    const ruleGroupAEls = Array.from(
      allRuleGroups[0].querySelectorAll<SVGGraphicsElement>('line'),
    );
    const ruleGroupBEls = Array.from(
      allRuleGroups[1].querySelectorAll<SVGGraphicsElement>('line'),
    );
    const outliers = allSymbolGroups.length > 0
      ? Array.from(
          allSymbolGroups[0].querySelectorAll<SVGGraphicsElement>('path'),
        )
      : [];

    // 2. Validate counts.
    if (
      rects.length !== N
      || ticks.length !== N
      || ruleGroupAEls.length !== N
      || ruleGroupBEls.length !== N
    ) {
      continue;
    }

    const isVertical = layer.orientation !== Orientation.HORIZONTAL;

    interface ElInfo {
      el: SVGGraphicsElement;
      cx: number;
      cy: number;
      rect: DOMRect;
    }
    const toInfo = (el: SVGGraphicsElement): ElInfo => {
      const r = el.getBoundingClientRect();
      return {
        el,
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
        rect: r,
      };
    };

    const rectInfos = rects.map(toInfo);
    const tickInfos = ticks.map(toInfo);
    const ruleAInfos = ruleGroupAEls.map(toInfo);
    const ruleBInfos = ruleGroupBEls.map(toInfo);
    const outlierInfos = outliers.map(toInfo);

    // 3. Sort each per-box collection in visual order. Because rects,
    //    ticks, and the two rule arrays each contain exactly N elements
    //    (one per box), sorting them by the same axis pairs them up
    //    index-wise without any nearest-neighbour matching.
    const cmpVisual = (a: ElInfo, b: ElInfo): number =>
      isVertical ? a.cx - b.cx : a.cy - b.cy;
    rectInfos.sort(cmpVisual);
    tickInfos.sort(cmpVisual);
    ruleAInfos.sort(cmpVisual);
    ruleBInfos.sort(cmpVisual);

    // 4. Classify rule groups: which is the lower-whisker group and
    //    which is the upper-whisker group? Each group has N lines (one
    //    per box). For vertical boxplots, the lower whisker extends
    //    BELOW the box (visually larger cy); for horizontal, to the
    //    LEFT (smaller cx). Compare averages once per layer and use
    //    the result for every box.
    const avg = (xs: ElInfo[], pick: (e: ElInfo) => number): number =>
      xs.reduce((s, e) => s + pick(e), 0) / xs.length;
    let lowerRuleInfos: ElInfo[];
    let upperRuleInfos: ElInfo[];
    if (isVertical) {
      const aAvgCy = avg(ruleAInfos, e => e.cy);
      const bAvgCy = avg(ruleBInfos, e => e.cy);
      // Higher avg cy → visually lower → lower whisker group.
      if (aAvgCy > bAvgCy) {
        lowerRuleInfos = ruleAInfos;
        upperRuleInfos = ruleBInfos;
      } else {
        lowerRuleInfos = ruleBInfos;
        upperRuleInfos = ruleAInfos;
      }
    } else {
      const aAvgCx = avg(ruleAInfos, e => e.cx);
      const bAvgCx = avg(ruleBInfos, e => e.cx);
      // Smaller avg cx → visually left → lower (min) whisker group.
      if (aAvgCx < bAvgCx) {
        lowerRuleInfos = ruleAInfos;
        upperRuleInfos = ruleBInfos;
      } else {
        lowerRuleInfos = ruleBInfos;
        upperRuleInfos = ruleAInfos;
      }
    }
    interface GroupBundle {
      rect: ElInfo;
      minRule: ElInfo;
      maxRule: ElInfo;
      tick: ElInfo;
      lowerOutliers: Array<{ info: ElInfo; value: number }>;
      upperOutliers: Array<{ info: ElInfo; value: number }>;
      dataIndex: number;
    }

    // 5. Build per-box bundles by index-wise pairing.
    const groups: GroupBundle[] = rectInfos.map((rectInfo, i) => ({
      rect: rectInfo,
      minRule: lowerRuleInfos[i],
      maxRule: upperRuleInfos[i],
      tick: tickInfos[i],
      lowerOutliers: [],
      upperOutliers: [],
      dataIndex: -1,
    }));

    // Map each visual group to a data row. Prefer label-based matching
    // (parse the IQ rect's aria-label and search for any `data[].z`
    // token within it). Fall back to positional pairing when a label
    // can't be resolved — this keeps the previously-working alphabetic
    // case correct while supporting unsorted / custom-domain data.
    const usedDataIdx = new Set<number>();
    groups.forEach((g, i) => {
      const label = g.rect.el.getAttribute('aria-label') ?? '';
      let matchIdx = -1;
      if (label.length > 0) {
        for (let j = 0; j < data.length; j++) {
          if (usedDataIdx.has(j)) {
            continue;
          }
          const z = data[j].z;
          if (typeof z === 'string' && z.length > 0 && label.includes(z)) {
            matchIdx = j;
            break;
          }
        }
      }
      if (matchIdx === -1) {
        // Positional fallback — first unused data index in visual order.
        for (let j = 0; j < data.length; j++) {
          if (!usedDataIdx.has(j)) {
            matchIdx = j;
            break;
          }
        }
        if (matchIdx === -1) {
          matchIdx = i;
        }
      }
      usedDataIdx.add(matchIdx);
      g.dataIndex = matchIdx;
    });

    // 5. Classify outliers: nearest group, then upper/lower.
    for (const ot of outlierInfos) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < groups.length; i++) {
        const d = isVertical
          ? Math.abs(ot.cx - groups[i].rect.cx)
          : Math.abs(ot.cy - groups[i].rect.cy);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const g = groups[bestIdx];
      const isLower = isVertical
        ? ot.cy > g.rect.cy
        : ot.cx < g.rect.cx;

      // 6. Compute outlier value via linear interpolation between
      //    the min/max rule far-end pixel anchors.
      const minAnchor = isVertical ? g.minRule.rect.bottom : g.minRule.rect.left;
      const maxAnchor = isVertical ? g.maxRule.rect.top : g.maxRule.rect.right;
      const span = minAnchor - maxAnchor;
      const dp = data[g.dataIndex];
      let value: number;
      if (Math.abs(span) < 0.5 || dp.max === dp.min) {
        value = isLower ? dp.min : dp.max;
      } else {
        const pos = isVertical ? ot.cy : ot.cx;
        const t = (minAnchor - pos) / span;
        value = Math.round(dp.min + t * (dp.max - dp.min));
      }

      if (isLower) {
        g.lowerOutliers.push({ info: ot, value });
      } else {
        g.upperOutliers.push({ info: ot, value });
      }
    }

    // Sort outliers ascending so DOM order matches data array order
    // (lower outliers go from most-extreme-low to least-extreme;
    // upper outliers go from least-extreme-high to most-extreme).
    for (const g of groups) {
      g.lowerOutliers.sort((a, b) => a.value - b.value);
      g.upperOutliers.sort((a, b) => a.value - b.value);
    }

    // 7. Re-append nodes in deterministic group-major order and stamp
    //    `data-maidr-box-index` / `data-maidr-box-part` attributes on
    //    each element. Stamping is required because Vega-Lite wraps
    //    each sub-mark in a `<g class="mark-group">`, which makes
    //    `:nth-of-type()` selectors sibling-relative and ambiguous
    //    (every path is :nth-of-type(1) within its own parent group).
    //    Attribute-scoped selectors built in step 9 are robust against
    //    that nesting.
    const reappend = (el: SVGGraphicsElement): void => {
      const parent = el.parentElement;
      if (parent) {
        parent.appendChild(el);
      }
    };
    groups.forEach((g, i) => {
      reappend(g.rect.el);
      g.rect.el.setAttribute('data-maidr-box-index', String(i));
      g.rect.el.setAttribute('data-maidr-box-part', 'iq');
    });
    groups.forEach((g, i) => {
      reappend(g.minRule.el);
      g.minRule.el.setAttribute('data-maidr-box-index', String(i));
      g.minRule.el.setAttribute('data-maidr-box-part', 'min');
      reappend(g.maxRule.el);
      g.maxRule.el.setAttribute('data-maidr-box-index', String(i));
      g.maxRule.el.setAttribute('data-maidr-box-part', 'max');
    });
    groups.forEach((g, i) => {
      reappend(g.tick.el);
      g.tick.el.setAttribute('data-maidr-box-index', String(i));
      g.tick.el.setAttribute('data-maidr-box-part', 'q2');
    });
    groups.forEach((g, i) => {
      g.lowerOutliers.forEach((o, k) => {
        reappend(o.info.el);
        o.info.el.setAttribute('data-maidr-box-index', String(i));
        o.info.el.setAttribute('data-maidr-box-part', 'lower-outlier');
        o.info.el.setAttribute('data-maidr-outlier-index', String(k));
      });
      g.upperOutliers.forEach((o, k) => {
        reappend(o.info.el);
        o.info.el.setAttribute('data-maidr-box-index', String(i));
        o.info.el.setAttribute('data-maidr-box-part', 'upper-outlier');
        o.info.el.setAttribute('data-maidr-outlier-index', String(k));
      });
    });
    // 8. Reorder layer.data to match visual group order and populate
    //    outlier arrays.
    const newData: BoxPoint[] = groups.map((g) => {
      const dp = data[g.dataIndex];
      return {
        ...dp,
        lowerOutliers: g.lowerOutliers.map(o => o.value),
        upperOutliers: g.upperOutliers.map(o => o.value),
      };
    });
    layer.data = newData;

    // 9. Build the per-group BoxSelector[] using attribute-scoped
    //    selectors. We avoid `:nth-of-type()` because Vega-Lite wraps
    //    each sub-mark in a `<g class="mark-group">`, which makes those
    //    selectors sibling-relative.
    //
    //    We also avoid scoping by parent class (e.g. `.layer_1_layer_0_marks`)
    //    because Vega-Lite's compound boxplot uses different `layer_*_marks`
    //    classes for each sub-mark, and the class names are not stable
    //    across spec variations. The data attributes stamped in step 7
    //    provide unambiguous identification on their own — combined
    //    with the tag name they're guaranteed to match exactly one
    //    element per (box, part) pair.
    const boxSelectors: BoxSelector[] = groups.map((g, i) => {
      const idxAttr = `[data-maidr-box-index="${i}"]`;
      const lowerSels = g.lowerOutliers.map((_, k) =>
        `path${idxAttr}[data-maidr-box-part="lower-outlier"][data-maidr-outlier-index="${k}"]`,
      );
      const upperSels = g.upperOutliers.map((_, k) =>
        `path${idxAttr}[data-maidr-box-part="upper-outlier"][data-maidr-outlier-index="${k}"]`,
      );
      return {
        lowerOutliers: lowerSels,
        min: `line${idxAttr}[data-maidr-box-part="min"]`,
        max: `line${idxAttr}[data-maidr-box-part="max"]`,
        iq: `path${idxAttr}[data-maidr-box-part="iq"]`,
        q2: `path${idxAttr}[data-maidr-box-part="q2"]`,
        upperOutliers: upperSels,
      };
    });

    layer.selectors = boxSelectors;
  }
}

/**
 * Walk the MAIDR schema and collect every layer.  The schema is a
 * 2-D grid of subplots, each containing a list of layers; this helper
 * just flattens that for the post-render DOM-sort step.
 */
function collectLayers(maidr: Maidr): MaidrLayer[] {
  const layers: MaidrLayer[] = [];
  for (const row of maidr.subplots) {
    for (const subplot of row) {
      for (const layer of subplot.layers) {
        layers.push(layer);
      }
    }
  }
  return layers;
}

export { vegaLiteToMaidr } from './adapters/vegalite/converters';

export type {
  VegaLiteChannelDef,
  VegaLiteEncoding,
  VegaLiteSpec,
  VegaLiteToMaidrOptions,
  VegaView,
} from './adapters/vegalite/types';

/**
 * Initialise MAIDR on an already-rendered Vega-Lite chart.
 *
 * Locates the `<svg>` inside the Vega view's container, converts the spec
 * to a {@link Maidr} schema, and mounts the accessible MAIDR UI on it.
 *
 * **The view must have completed its first render before this is called.**
 * `vegaEmbed(...)` resolves when the view is *constructed*, not when it has
 * *rendered*, so callers using this entry point directly must
 * `await view.runAsync()` between embedding and binding:
 *
 * ```js
 * const result = await vegaEmbed('#vis', vlSpec, { renderer: 'svg' });
 * await result.view.runAsync(); // wait for the first paint
 * maidrVegaLite.bindVegaLite(result.view, vlSpec, { id: 'my-chart' });
 * ```
 *
 * For most use cases prefer {@link embed}, which performs both steps for you.
 *
 * @param view - The compiled Vega `View` returned by `vegaEmbed`.
 * @param spec - The original Vega-Lite specification.
 * @param options - Optional id / title overrides.
 */
export function bindVegaLite(
  view: VegaView,
  spec: VegaLiteSpec,
  options?: VegaLiteToMaidrOptions,
): void {
  const container = view.container();
  if (!container) {
    console.error('[maidr/vegalite] View has no container element.');
    return;
  }

  const svg = container.querySelector('svg');
  if (!svg) {
    console.error(
      '[maidr/vegalite] No <svg> element found in the Vega view container. '
      + 'The chart will not be focusable or accessible.\n\n'
      + 'This usually means one of:\n'
      + '  1. The view has not finished its first render yet.\n'
      + '     Fix: await view.runAsync() before calling bindVegaLite(),\n'
      + '     or use maidrVegaLite.embed() which does this for you.\n'
      + '  2. The view was created with renderer: "canvas".\n'
      + '     Fix: pass { renderer: "svg" } to vegaEmbed() — MAIDR can\n'
      + '     only navigate SVG output.',
    );
    return;
  }

  // Derive an id from the options, the container, or a timestamp fallback.
  // Use || for container.id since empty string is falsy but not nullish.
  const id = options?.id
    || container.id
    || `vl-${Date.now()}`;

  const maidr: Maidr = vegaLiteToMaidr(spec, view, { ...options, id });
  const layers = collectLayers(maidr);

  // Align the simple-bar SVG DOM order with the visual order so MAIDR's
  // index-based highlight lands on the right bar. Segmented layers are
  // handled by the dom-mapping step below instead of re-ordering the DOM.
  sortSimpleBarsByVisualOrder(svg as SVGSVGElement, layers);

  // For segmented (stacked / dodged / normalised) layers, detect the
  // actual DOM emission order from the rendered SVG and populate
  // `layer.domMapping`. This avoids wrongly assuming a layout order
  // based on trace type — Vega's emission depends on input row order.
  applySegmentedDomMappings(svg as SVGSVGElement, layers);

  // For STACKED layers, ensure series 0 in `data` is the visually
  // bottom-most series so initial focus (row=0) lands at the bottom of
  // the stack, matching sighted-user expectations. Must run AFTER
  // `applySegmentedDomMappings` because we rely on its `domMapping`
  // output to know how DOM elements are grouped per category.
  reorderSegmentedSeriesByVisualBottom(svg as SVGSVGElement, layers);

  // For HISTOGRAM layers, pair data bins with DOM elements and sort by
  // visual position so `data[i]` lines up with the i-th left-to-right
  // bin. Fixes "highlight jumps randomly" when the post-bin Vega
  // dataset row order differs from the rendered visual order.
  sortHistogramBinsByVisualOrder(svg as SVGSVGElement, layers);

  // For HEATMAP layers, reconcile data axis label order, the
  // `points[yi][xi]` matrix, and DOM emission order with the actual
  // visual grid layout. Fixes "highlight on wrong cell" when Vega
  // emits marks in dataset row order rather than scale-domain order.
  sortHeatmapCellsByVisualOrder(svg as SVGSVGElement, layers);

  // For LINE layers, align each series' data with the visual x-axis
  // tick order. Fixes "highlight column != announced x-value" when
  // Vega-Lite renders nominal/ordinal X scales alphabetically while
  // the dataset is in insertion (e.g. calendar) order.
  sortLinesByVisualOrder(svg as SVGSVGElement, layers);

  // For BOX layers, build the per-group BoxSelector[] from the
  // rendered DOM and populate outlier values. Fixes "highlight
  // doesn't appear at all" caused by `buildSelector` returning a
  // single string instead of the per-group structure
  // BoxTrace.mapToSvgElements expects.
  buildBoxPlotSelectorsFromDom(svg as SVGSVGElement, layers);

  // SVGSVGElement is not an HTMLElement, but initMaidrOnElement only
  // needs basic DOM node capabilities (parentNode, attributes).
  // Widen through Element which both SVG and HTML elements extend.
  initMaidrOnElement(maidr, svg as Element as HTMLElement);
}

/**
 * Options accepted by {@link embed}.
 */
export interface VegaLiteEmbedOptions extends VegaLiteToMaidrOptions {
  /**
   * Options forwarded to `vegaEmbed`. By default `actions: false` is set
   * but can be overridden here.
   */
  embedOptions?: Record<string, unknown>;
}

/**
 * Result of {@link embed} — gives callers access to the underlying Vega view.
 */
export interface VegaLiteEmbedResult {
  view: VegaView;
}

/**
 * Render a Vega-Lite spec **and** mount MAIDR on it, in a single call.
 *
 * This wraps `vegaEmbed()` + {@link bindVegaLite} and handles the two things
 * that make the manual path error-prone:
 *
 * 1. Forces `renderer: "svg"`. MAIDR navigates the rendered DOM via CSS
 *    selectors that target SVG elements (`g.mark-rect path`, etc.) and
 *    cannot operate on a `<canvas>`-rendered chart. If the caller passes
 *    `embedOptions: { renderer: 'canvas' }` we log a warning and override.
 * 2. `await result.view.runAsync()` — waits for the first render frame to
 *    complete. `vegaEmbed(...)` resolves when the view is *constructed*,
 *    not when it has *painted*; binding before the first paint races the
 *    DOM and is the root cause of "No SVG found" errors on slow/aggregated
 *    specs (histograms, complex transforms).
 *
 * Requires the global `vegaEmbed` (from the `vega-embed` script) to be
 * loaded before this function is called.
 *
 * @param target - A CSS selector or HTMLElement that will host the chart.
 * @param spec - The Vega-Lite specification.
 * @param options - Optional MAIDR id / title and `vegaEmbed` options.
 * @returns A promise that resolves with the underlying Vega `View`.
 *
 * @example
 * ```js
 * maidrVegaLite.embed('#chart', spec, { id: 'tips-bar' });
 * ```
 */
export async function embed(
  target: string | HTMLElement,
  spec: VegaLiteSpec,
  options?: VegaLiteEmbedOptions,
): Promise<VegaLiteEmbedResult> {
  const container = typeof target === 'string'
    ? document.querySelector<HTMLElement>(target)
    : target;
  if (!container) {
    throw new Error(`[maidr/vegalite] embed(): container not found for ${String(target)}`);
  }

  const vegaEmbedFn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    = (typeof window !== 'undefined' ? (window as any).vegaEmbed : undefined) as
      | ((
        el: HTMLElement | string,
        spec: VegaLiteSpec,
        opts?: Record<string, unknown>,
      ) => Promise<{ view: VegaView }>)
      | undefined;
  if (typeof vegaEmbedFn !== 'function') {
    throw new TypeError(
      '[maidr/vegalite] embed(): global `vegaEmbed` is not available. '
      + 'Load the vega-embed script (https://cdn.jsdelivr.net/npm/vega-embed@6) '
      + 'before calling maidrVegaLite.embed().',
    );
  }

  // Merge user options, then enforce `renderer: 'svg'`. We explicitly
  // override after the spread so a caller-supplied `renderer: 'canvas'`
  // can't slip through and produce a non-navigable chart.
  const userEmbedOpts = options?.embedOptions ?? {};
  const userRenderer = (userEmbedOpts as { renderer?: string }).renderer;
  if (userRenderer && userRenderer !== 'svg') {
    console.warn(
      `[maidr/vegalite] MAIDR requires renderer: "svg" but received `
      + `"${userRenderer}". Overriding so the chart remains navigable.`,
    );
  }
  const embedOpts = {
    actions: false,
    ...userEmbedOpts,
    renderer: 'svg' as const,
  };

  const result = await vegaEmbedFn(container, spec, embedOpts);

  // Wait for the first render to complete. Without this, the SVG may not
  // be in the DOM yet when bindVegaLite runs querySelector('svg').
  await result.view.runAsync();

  bindVegaLite(result.view, spec, {
    id: options?.id,
    title: options?.title,
  });
  return { view: result.view };
}

/**
 * Toggle adapter-level diagnostic logging at runtime.
 *
 * Useful when debugging highlight or navigation alignment problems —
 * the adapter logs the converted MAIDR schema and any DOM re-ordering
 * it performs. Off by default.
 *
 * @example
 * ```js
 * maidrVegaLite.setDebug(true);
 * maidrVegaLite.embed('#chart', spec);
 * ```
 */
export function setDebug(enabled: boolean): void {
  debugEnabled = !!enabled;
}

// Expose the Vega-Lite adapter globally for script-tag usage (UMD build).
// Only runs in browser environments (not SSR / Node.js).
declare global {
  interface Window {
    maidrVegaLite?: {
      bindVegaLite: typeof bindVegaLite;
      embed: typeof embed;
      vegaLiteToMaidr: typeof vegaLiteToMaidr;
      setDebug: typeof setDebug;
      /**
       * Setter-style alias for {@link setDebug} so callers can write
       * `maidrVegaLite.debug = true` instead of calling `setDebug()`.
       */
      debug: boolean;
    };
  }
}

if (typeof window !== 'undefined') {
  const api = {
    bindVegaLite,
    embed,
    vegaLiteToMaidr,
    setDebug,
  };
  // Expose `debug` as a property with a getter/setter so the canonical
  // `maidrVegaLite.debug = true` toggle works.
  Object.defineProperty(api, 'debug', {
    get: () => debugEnabled,
    set: (v: boolean) => {
      debugEnabled = !!v;
    },
    enumerable: true,
  });
  window.maidrVegaLite = api as Window['maidrVegaLite'];
}

// Re-export core MAIDR types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';

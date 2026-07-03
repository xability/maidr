/**
 * Facet / repeat helpers for the Vega-Lite adapter.
 *
 * Vega-Lite has three multi-panel mechanisms beyond concat:
 *   1. The `facet` operator (`facet: {row?, column?}` or `facet: {field}` +
 *      `columns`) with the panel template under `spec`.
 *   2. The facet *shorthand*: `row` / `column` channels inside a unit or
 *      layered spec's `encoding`.
 *   3. The `repeat` operator (`repeat: {row?, column?}` arrays or
 *      `repeat: [...]` + `columns`), whose child spec uses
 *      `{repeat: 'row'|'column'|'repeat'}` field references.
 *
 * This module holds the pure descriptor / grid / selector helpers plus the
 * bind-time DOM pass that stamps each rendered facet cell with a
 * `data-maidr-cell` attribute. The actual Maidr assembly lives in
 * `converters.ts` (`buildFacetMaidr` / `buildRepeatMaidr`).
 *
 * Rendered DOM reference (Vega-Lite v5, SVG renderer):
 *   - Facets compile to ONE `<g class="mark-group role-scope cell">` group
 *     whose direct `<g>` children are the per-cell items (reading order).
 *     Inside each item, marks render as `g.mark-*.role-mark.child_marks`
 *     (unit child) or `child_layer_<j>_marks` (layered child). All cells
 *     share those classes, so per-cell scoping requires stamping the item.
 *   - Repeats compile to one `<g class="mark-group role-scope
 *     <childName>_group">` per cell, and the marks inside carry the
 *     already-unique class `<childName>_marks`, where `<childName>` is
 *     `child__row_<rf>column_<cf>` / `child__row_<rf>` /
 *     `child__column_<cf>` / `child__<f>` (non-word characters in field
 *     names replaced with `_`). No stamping is needed for repeats.
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import type {
  VegaLiteChannelDef,
  VegaLiteSpec,
  VegaView,
} from './types';

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

/**
 * Normalised facet description. Exactly one of the following holds:
 *   - `rowChannel` and/or `columnChannel` set (row/column faceting), or
 *   - `wrapChannel` set (wrapped faceting; `columns` bounds the row width).
 */
export interface FacetDescriptor {
  rowChannel?: VegaLiteChannelDef;
  columnChannel?: VegaLiteChannelDef;
  wrapChannel?: VegaLiteChannelDef;
  columns?: number;
  /** The per-panel template spec (facet channels already stripped). */
  childSpec: VegaLiteSpec;
}

/** Normalised repeat description. */
export interface RepeatDescriptor {
  rowFields?: string[];
  columnFields?: string[];
  wrapFields?: string[];
  columns?: number;
  childSpec: VegaLiteSpec;
}

/**
 * Detect a faceted spec — either the top-level `facet` operator or the
 * `encoding.row` / `encoding.column` shorthand on a unit / layered spec —
 * and normalise it into a {@link FacetDescriptor}.
 *
 * Returns `null` when the spec is not faceted (or is malformed, e.g.
 * `facet` without `spec`).
 */
export function describeFacet(spec: VegaLiteSpec): FacetDescriptor | null {
  // Top-level facet operator.
  if (spec.facet && spec.spec) {
    const facet = spec.facet;
    if (facet.field) {
      return {
        wrapChannel: facet,
        columns: spec.columns,
        childSpec: spec.spec,
      };
    }
    if (facet.row?.field || facet.column?.field) {
      return {
        rowChannel: facet.row?.field ? facet.row : undefined,
        columnChannel: facet.column?.field ? facet.column : undefined,
        childSpec: spec.spec,
      };
    }
    return null;
  }

  // Encoding shorthand on a unit or layered spec.
  const hasView = spec.mark != null || (spec.layer != null && spec.layer.length > 0);
  const rowChannel = spec.encoding?.row;
  const columnChannel = spec.encoding?.column;
  if (hasView && (rowChannel?.field || columnChannel?.field)) {
    const { row: _row, column: _column, ...childEncoding } = spec.encoding!;
    const childSpec: VegaLiteSpec = { ...spec, encoding: childEncoding };
    return {
      rowChannel: rowChannel?.field ? rowChannel : undefined,
      columnChannel: columnChannel?.field ? columnChannel : undefined,
      childSpec,
    };
  }

  return null;
}

/**
 * Detect a `repeat` spec and normalise it into a {@link RepeatDescriptor}.
 * Returns `null` when the spec is not a (well-formed) repeat.
 */
export function describeRepeat(spec: VegaLiteSpec): RepeatDescriptor | null {
  if (!spec.repeat || !spec.spec)
    return null;
  if (Array.isArray(spec.repeat)) {
    if (spec.repeat.length === 0)
      return null;
    return {
      wrapFields: spec.repeat,
      columns: spec.columns,
      childSpec: spec.spec,
    };
  }
  const rowFields = spec.repeat.row;
  const columnFields = spec.repeat.column;
  if ((rowFields?.length ?? 0) === 0 && (columnFields?.length ?? 0) === 0)
    return null;
  return {
    rowFields: rowFields && rowFields.length > 0 ? rowFields : undefined,
    columnFields: columnFields && columnFields.length > 0 ? columnFields : undefined,
    childSpec: spec.spec,
  };
}

// ---------------------------------------------------------------------------
// Repeat helpers
// ---------------------------------------------------------------------------

/** One repeated cell's field assignment. */
export interface RepeatCellMapping {
  row?: string;
  column?: string;
  repeat?: string;
}

/**
 * Replace `{repeat: 'row'|'column'|'repeat'}` field references anywhere in
 * a child spec with the concrete field names for one repeated cell.
 * Deep-clones the spec so cells never share mutable state.
 */
export function substituteRepeatFields(
  spec: VegaLiteSpec,
  mapping: RepeatCellMapping,
): VegaLiteSpec {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const repeatRef = record.repeat;
      if (typeof repeatRef === 'string' && Object.keys(record).length === 1) {
        const substituted = mapping[repeatRef as keyof RepeatCellMapping];
        if (substituted !== undefined)
          return substituted;
      }
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(record)) {
        out[key] = walk(val);
      }
      return out;
    }
    return value;
  };
  return walk(spec) as VegaLiteSpec;
}

/**
 * Compute the Vega child-view name for one repeated cell. The rendered SVG
 * uses this name in the cell group class (`<name>_group`) and the mark
 * group class (`<name>_marks`), which is what makes repeat selectors
 * per-cell unique without any stamping.
 *
 * Mirrors Vega-Lite's `varName` sanitisation: every non-word character in
 * a field name becomes `_`.
 */
export function repeatChildName(cell: RepeatCellMapping): string {
  const sanitize = (field: string): string => field.replace(/\W/g, '_');
  if (cell.row !== undefined && cell.column !== undefined) {
    return `child__row_${sanitize(cell.row)}column_${sanitize(cell.column)}`;
  }
  if (cell.row !== undefined) {
    return `child__row_${sanitize(cell.row)}`;
  }
  if (cell.column !== undefined) {
    return `child__column_${sanitize(cell.column)}`;
  }
  return `child__${sanitize(cell.repeat ?? '')}`;
}

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

/**
 * Chunk a flat list of cells into grid rows of at most `columns` items
 * (row-major). `columns` omitted or non-positive means "unbounded" —
 * Vega-Lite's default wrap layout is a single row.
 */
export function chunkIntoRows<T>(items: T[], columns?: number): T[][] {
  if (!columns || columns <= 0 || columns >= items.length) {
    return items.length > 0 ? [items] : [];
  }
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

/**
 * Resolve a facet field's domain keys in Vega's layout order.
 *
 * Prefers the compiled view's domain dataset (`row_domain`,
 * `column_domain`, or `facet_domain`), which reflects the exact order Vega
 * lays cells out in — including custom facet sorts. Falls back to the
 * distinct values found in `fallbackRows`, sorted ascending (Vega-Lite's
 * default facet sort).
 *
 * Keys are `String()`-ified so they compare consistently with the
 * per-cell row filtering, which stringifies the same dataset values.
 */
export function resolveDomainKeys(
  field: string,
  fallbackRows: Record<string, unknown>[],
  view?: VegaView,
  datasetName?: string,
): string[] {
  if (view && datasetName) {
    try {
      const rows = view.data(datasetName);
      if (Array.isArray(rows) && rows.length > 0 && field in rows[0]) {
        return rows.map(row => String(row[field]));
      }
    } catch {
      // Dataset missing (e.g. no view or non-facet compilation) — fall back.
    }
  }

  const seen = new Set<string>();
  const distinct: unknown[] = [];
  for (const row of fallbackRows) {
    const key = String(row[field]);
    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(row[field]);
    }
  }
  const allNumbers = distinct.every(v => typeof v === 'number');
  distinct.sort((a, b) => {
    if (allNumbers)
      return (a as number) - (b as number);
    return String(a).localeCompare(String(b));
  });
  return distinct.map(v => String(v));
}

// ---------------------------------------------------------------------------
// Cell-scoped selectors
// ---------------------------------------------------------------------------

/**
 * Compute the `data-maidr-cell` attribute value for a facet cell. Includes
 * the chart id so several faceted charts on one page never share a value
 * (MAIDR resolves all selectors document-globally).
 */
export function facetCellAttrValue(chartId: string, row: number, col: number): string {
  const safeId = chartId.replace(/[^\w-]/g, '_');
  return `${safeId}-${row}-${col}`;
}

/** CSS selector matching the stamped facet cell item for `attrValue`. */
export function facetCellScope(attrValue: string): string {
  return `g[data-maidr-cell="${attrValue}"]`;
}

/**
 * Prefix every alternative in a (possibly comma-separated) selector with a
 * cell scope, so `a, b` becomes `<scope> a, <scope> b`. The adapter never
 * emits selectors containing commas inside a single alternative, so a
 * plain split is safe.
 */
export function scopeSelector(selector: string, scope: string): string {
  return selector
    .split(',')
    .map(part => `${scope} ${part.trim()}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Bind-time DOM stamping (facet cells)
// ---------------------------------------------------------------------------

/** Per-layer DOM scope info used by the bind-time fixup passes. */
export interface CellDomInfo {
  /** The cell's item `<g>` — ancestor of exactly that cell's marks. */
  root: Element;
  /** Selector prefix that scopes a bare mark selector to this cell. */
  scope: string;
}

const FACET_CELL_GROUP_SELECTOR = 'g.mark-group.role-scope.cell';

/** Extract the `data-maidr-cell` value referenced by a subplot selector. */
function parseCellAttr(selector: string | undefined): string | null {
  if (!selector)
    return null;
  const match = selector.match(/\[data-maidr-cell="([^"]+)"\]/);
  return match ? match[1] : null;
}

/** True when the element has a non-zero layout box (rendered pages). */
function hasLayout(el: Element | undefined): boolean {
  if (!el)
    return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/**
 * Stamp each rendered facet cell item with the `data-maidr-cell` value its
 * subplot's selectors were emitted against. MUST run before any fixup pass
 * (or trace construction) resolves the cell-scoped selectors.
 *
 * Cells are matched to grid slots in visual reading order (top-to-bottom,
 * left-to-right, clustered by row) when the SVG is laid out, falling back
 * to DOM order otherwise — Vega emits facet cell items in exactly that
 * reading order (the facet partition is sorted by [row, column] domain).
 *
 * As a cross-check, the facet header texts (`role-row-header` /
 * `role-column-header` titles) are compared against the panel titles the
 * converter wrote into each cell's first layer; mismatches log a warning
 * but do not abort (navigation and audio still work; only highlighting
 * placement could be off).
 */
export function stampFacetCells(svg: SVGSVGElement, maidr: Maidr): void {
  const cellGroup = svg.querySelector(FACET_CELL_GROUP_SELECTOR);
  if (!cellGroup)
    return;

  // Collect the expected attribute values in grid reading order.
  const expected: { attr: string; title?: string }[] = [];
  for (const row of maidr.subplots) {
    for (const subplot of row) {
      const attr = parseCellAttr(subplot.selector);
      if (!attr)
        return; // Not a facet-scoped maidr (e.g. concat) — nothing to stamp.
      expected.push({ attr, title: subplot.layers[0]?.title });
    }
  }
  if (expected.length === 0)
    return;

  // One direct <g> child per rendered cell. Cross facets (row x column)
  // compile with `cross: true`, so Vega renders a cell for EVERY (row,
  // column) combination — including combinations with no data, which get
  // no `role-mark` group inside. The converter deliberately emits no
  // subplot for those (an empty-data panel would crash MAIDR core), so
  // skip mark-less cells here to keep the pairing aligned.
  const items = Array.from(cellGroup.children)
    .filter((el): el is SVGGElement =>
      el.tagName.toLowerCase() === 'g' && el.querySelector('g.role-mark') !== null,
    );
  if (items.length !== expected.length) {
    console.warn(
      `[maidr/vegalite] Facet cell count mismatch: SVG has ${items.length} `
      + `cells but the schema expects ${expected.length}. Highlighting will `
      + `be disabled for this chart; navigation still works.`,
    );
    return;
  }

  // Order cells visually (row clusters by top, then left-to-right) when the
  // page is laid out; otherwise trust DOM order, which Vega emits in the
  // same reading order.
  let ordered = items;
  if (hasLayout(items[0])) {
    const infos = items.map((el) => {
      const rect = el.getBoundingClientRect();
      return { el, top: rect.top, left: rect.left, height: rect.height };
    });
    infos.sort((a, b) => a.top - b.top);
    const tolerance = Math.max((infos[0]?.height ?? 0) / 2, 1);
    const clusters: (typeof infos)[] = [];
    for (const info of infos) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last[0].top - info.top) < tolerance) {
        last.push(info);
      } else {
        clusters.push([info]);
      }
    }
    for (const cluster of clusters) {
      cluster.sort((a, b) => a.left - b.left);
    }
    ordered = clusters.flat().map(info => info.el);
  }

  ordered.forEach((el, i) => {
    el.setAttribute('data-maidr-cell', expected[i].attr);
  });

  crossCheckHeaders(svg, maidr);
}

/**
 * Best-effort verification that the facet header labels rendered by Vega
 * match the panel titles the converter derived from the data. A mismatch
 * means the grid order assumed at conversion time differs from the actual
 * layout (e.g. an unsupported custom facet sort without a compiled view).
 */
function crossCheckHeaders(svg: SVGSVGElement, maidr: Maidr): void {
  const headerTexts = (role: string): string[] =>
    Array.from(svg.querySelectorAll(
      `g.mark-group.${role} g.mark-text.role-title-text text`,
    )).map(text => (text.textContent ?? '').trim());

  const columnHeaders = headerTexts('role-column-header');
  const firstRow = maidr.subplots[0] ?? [];
  if (columnHeaders.length === firstRow.length && columnHeaders.length > 0) {
    columnHeaders.forEach((header, c) => {
      const title = firstRow[c]?.layers[0]?.title ?? '';
      if (header && !title.includes(header)) {
        console.warn(
          `[maidr/vegalite] Facet column header "${header}" does not match `
          + `panel title "${title}". Panel order may be misaligned `
          + `(custom facet sort?).`,
        );
      }
    });
  }

  const rowHeaders = headerTexts('role-row-header');
  if (rowHeaders.length === maidr.subplots.length && rowHeaders.length > 0) {
    rowHeaders.forEach((header, r) => {
      const title = maidr.subplots[r]?.[0]?.layers[0]?.title ?? '';
      if (header && !title.includes(header)) {
        console.warn(
          `[maidr/vegalite] Facet row header "${header}" does not match `
          + `panel title "${title}". Panel order may be misaligned `
          + `(custom facet sort?).`,
        );
      }
    });
  }
}

/**
 * Build the per-layer cell scope map used by the bind-time fixup passes
 * that need a per-panel DOM root (`buildBoxPlotSelectorsFromDom`,
 * `sortLinesByVisualOrder`). Works for both facet subplots (after
 * {@link stampFacetCells} has run) and repeat subplots (whose selectors
 * are class-scoped and need no stamping).
 *
 * Returns an empty map for single-panel and concat charts, whose
 * subplots carry no selector.
 */
export function buildCellDomMap(
  svg: SVGSVGElement,
  maidr: Maidr,
): Map<MaidrLayer, CellDomInfo> {
  const map = new Map<MaidrLayer, CellDomInfo>();
  for (const row of maidr.subplots) {
    for (const subplot of row) {
      const selector = subplot.selector;
      if (!selector)
        continue;
      // Subplot selectors point at the cell's background path
      // (`<scope> > path.background` for facets,
      //  `<scope> > g > path.background` for repeats); the first segment
      // is the cell scope and the background's parent <g> is the cell's
      // content root in both shapes.
      const scope = selector.split(' > ')[0];
      const background = svg.querySelector(selector);
      const root = background?.parentElement;
      if (!root)
        continue;
      for (const layer of subplot.layers) {
        map.set(layer, { root, scope });
      }
    }
  }
  return map;
}

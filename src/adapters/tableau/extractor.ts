/**
 * Turns worksheet snapshots into a MAIDR figure — purely.
 *
 * This is the half of the Tableau adapter that decides *what a worksheet is*.
 * Tableau's summary data is a flat table: it says what the numbers are and
 * never what was drawn with them. The Extensions API can answer that directly
 * (`getVisualSpecificationAsync`), the Embedding API cannot, so the answer is
 * assembled from three sources in a fixed order of authority — an explicit
 * override, then the visual specification when the host has one, then a
 * heuristic ladder over the columns themselves.
 *
 * Two properties of this file are load-bearing:
 *
 * 1. **It is pure.** No DOM, no React, no promises, no Tableau calls. Given the
 *    same snapshots it produces the same figure, which is what lets the whole
 *    classifier be tested with plain object literals and what lets a future
 *    Dashboard Extensions binder reuse it unchanged.
 * 2. **It never invents a reading it cannot support.** Where the evidence is
 *    ambiguous the extractor picks the *smaller* truthful answer — a two
 *    dimensional grid is read as grouped bars rather than guessed to be a
 *    highlight table, and side-by-side bars are never announced as a stack —
 *    and where there is no answer at all the worksheet is skipped with a
 *    warning rather than rendered as something it is not. Each such omission
 *    carries its reasoning at the point it is made.
 *
 * The {@link SelectionIndex} is built alongside the figure, from the same rows,
 * so every navigable position remembers the dimension values of the row it came
 * from. That is what `selection.ts` turns back into a Tableau mark selection at
 * runtime; extraction itself performs no selection and sets no `onNavigate`.
 */

import type {
  AxisConfig,
  HeatmapData,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '../../type/grammar';
import type {
  TableauAdapterOptions,
  TableauClassifiedColumn,
  TableauDimensionColumn,
  TableauMeasureColumn,
  TableauRow,
  TableauSelectionCriteria,
  TableauVisualSpecification,
  TableauWorksheetOverride,
  WorksheetSnapshot,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';
import { classifyColumns, toCategoryKey, toDateValue, toFiniteNumber } from './fields';

const ADAPTER_PREFIX = '[MAIDR tableau]';

/** Separator for composite map keys. A NUL cannot occur in a rendered cell. */
const KEY_SEPARATOR = '\u0000';

/** Figure ids when the caller supplies none. The binder pins one per binding. */
let nextFigureId = 0;

/**
 * Everything the runtime needs to turn a MAIDR navigation position back into a
 * Tableau mark selection.
 *
 * Positions are addressed exactly as MAIDR addresses them, so a lookup is an
 * index rather than a search:
 *
 * - a **bar** or **pie** layer is one row, so its cells live at `[0][col]`;
 * - a **grouped** layer (dodged/stacked bars, multi-series lines and areas) is
 *   one row per series, in the same order as the layer's outer data array —
 *   note that `SegmentedTrace` appends a synthetic "Total" row of its own, and
 *   that row deliberately has no entry here: a total is not a mark;
 *   the lookup misses and the runtime clears the selection instead;
 * - a **heat** layer's rows are reversed to match `Heatmap`'s own constructor,
 *   which flips `y` and `points` so row 0 is the bottom of the drawn grid;
 * - a **point** cloud is addressed by `pointIndices` rather than by row/column,
 *   so it lives in {@link SelectionIndex.points} instead.
 *
 * A `null` entry means the position is not addressable — a rectangularized
 * filler cell that no mark was ever drawn for, or a row whose dimension value
 * is missing. The runtime clears the selection for those rather than selecting
 * something adjacent.
 */
export interface SelectionIndex {
  /** Layer id → `[row][col]` → criteria for that cell, or `null`. */
  readonly cells: Map<string, (readonly TableauSelectionCriteria[] | null)[][]>;
  /** Layer id → per-data-index criteria, for point clouds only. */
  readonly points: Map<string, (readonly TableauSelectionCriteria[] | null)[]>;
  /**
   * Layer id → the name of the worksheet that layer was built from.
   *
   * A worksheet that yields no layer contributes no subplot, so a layer id is
   * the index among the survivors and does not line up with the caller's own
   * worksheet list.
   * The binder needs the correspondence to route a selection to the right
   * worksheet, and only the extractor knows which snapshots survived.
   */
  readonly worksheets: Map<string, string>;
}

/**
 * The result of extracting a set of worksheets.
 *
 * Mirrors the Chart.js adapter's `{ maidr, layerDatasetIndices }` contract: the
 * schema plus the bookkeeping needed to route navigation back into the host
 * library. `maidr.onNavigate` is deliberately **not** set — wiring it is the
 * binder's job, and leaving extraction pure is what makes it testable.
 */
export interface TableauExtraction {
  /** The MAIDR data object, ready for `<Maidr data={...}>`. */
  readonly maidr: Maidr;
  /** Where each navigable position came from, for the selection bridge. */
  readonly selection: SelectionIndex;
}

/**
 * The shapes MAIDR trace types collapse into for the purpose of building data.
 *
 * Several trace types are byte-for-byte the same payload and differ only in how
 * the model announces them — `dodged_bar`, `stacked_bar` and
 * `stacked_normalized_bar` are all `SegmentedPoint[][]`, and the whole line
 * family is `LinePoint[][]` — so the builders are keyed by shape rather than by
 * trace type.
 */
type TraceFamily = 'bar' | 'segmented' | 'line' | 'scatter' | 'heat' | 'pie';

/** What a mark type resolves to, or what to do when it resolves to nothing. */
type MarkTypeDecision
  = | { readonly kind: 'trace'; readonly type: TraceType }
    | { readonly kind: 'ladder' }
    | { readonly kind: 'skip' };

/** Which columns play which role in one worksheet, after overrides. */
interface ColumnPlan {
  /** Dimensions in read order: category, then group, then the ignored rest. */
  readonly dimensions: readonly TableauDimensionColumn[];
  /** Measures in read order: the value first, then the rest in view order. */
  readonly measures: readonly TableauMeasureColumn[];
  /** `D[0]`: what a reader navigates between. */
  readonly category: TableauDimensionColumn | null;
  /** `D[1]`: what a series is. */
  readonly group: TableauDimensionColumn | null;
  /** `M[0]`: the magnitude, except on a point cloud where it is the x axis. */
  readonly value: TableauMeasureColumn | null;
}

/** A built payload plus the position index that addresses it. */
interface LayerBuild {
  readonly data: MaidrLayer['data'];
  readonly cells?: (readonly TableauSelectionCriteria[] | null)[][];
  readonly points?: (readonly TableauSelectionCriteria[] | null)[];
}

/** One worksheet's finished layer, with its position index. */
interface BuiltLayer {
  readonly layer: MaidrLayer;
  readonly cells?: (readonly TableauSelectionCriteria[] | null)[][];
  readonly points?: (readonly TableauSelectionCriteria[] | null)[];
}

/**
 * A flat category/magnitude pair, assignable to `BarPoint`.
 *
 * Which field holds which depends on the layer's orientation: a vertical bar
 * carries its category in `x` and its magnitude in `y`, and a horizontal one
 * carries them the other way round, because that is how `AbstractBarPlot` reads
 * an oriented layer. A `pie` layer is never oriented, so the pie path only ever
 * builds the vertical form and stays assignable to `PiePoint` as well.
 */
interface FlatPoint {
  readonly x: string | number;
  readonly y: number | string;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Log an adapter-prefixed warning at most once per extraction.
 *
 * Every warning here describes a property of the *worksheet*, not of a row, so
 * it would otherwise repeat once per row and drown the console. The latch is
 * per call rather than per module so a refresh still reports a condition that
 * is still true, and so a test never depends on what an earlier test logged.
 *
 * @param warned - Messages already logged during this extraction.
 * @param message - What was ambiguous, and what the extractor did about it.
 */
function warnOnce(warned: Set<string>, message: string): void {
  if (warned.has(message)) {
    return;
  }
  warned.add(message);
  console.warn(`${ADAPTER_PREFIX} ${message}`);
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/**
 * Compose a composite map key from category and group keys.
 *
 * @param first - First component.
 * @param second - Second component.
 * @returns The two joined by a separator no rendered cell can contain.
 */
function cellKey(first: string, second: string): string {
  return `${first}${KEY_SEPARATOR}${second}`;
}

/**
 * Every distinct value of one column, in first-appearance order.
 *
 * First-appearance rather than sorted, because summary data arrives in the
 * order the view laid the marks out and that is the order a reader sees.
 *
 * @param rows - The worksheet's rows, in view order.
 * @param viewIndex - The column to read.
 * @returns The distinct rendered values, in the order they first occur.
 */
function distinctKeys(rows: readonly TableauRow[], viewIndex: number): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    const key = toCategoryKey(row[viewIndex]);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Build the selection criterion addressing one dimension value of one row.
 *
 * `fieldName` is `Column.fieldName` **verbatim**. A date-part column such as
 * `YEAR(Order Date)` is not unwrapped into a base field plus a range: what
 * `SelectionCriteria.fieldName` means for a date part is undocumented, and a
 * guessed transform would select the wrong marks confidently.
 *
 * @param dimension - The dimension to address.
 * @param row - The source row, in view order.
 * @returns The criterion, or `null` when the cell is a gap and therefore names
 * no mark.
 */
function criterionFor(
  dimension: TableauDimensionColumn,
  row: TableauRow,
): TableauSelectionCriteria | null {
  const cell = row[dimension.viewIndex];
  const fieldName = dimension.column.fieldName;

  // A real date takes the documented single-date range form. `min === max ===
  // the same Date` is how Tableau's own examples address one day.
  const date = toDateValue(cell);
  if (date !== null) {
    return { fieldName, value: { min: date, max: date } };
  }

  const key = toCategoryKey(cell);
  if (key === '') {
    return null;
  }
  return { fieldName, value: key };
}

/**
 * Build the criteria addressing one row across several dimensions.
 *
 * @param dimensions - Every dimension that participates in the address.
 * @param row - The source row, in view order.
 * @returns One criterion per dimension, or `null` when any of them is a gap —
 * a partial address would select a whole band of marks instead of one.
 */
function rowCriteria(
  dimensions: readonly TableauDimensionColumn[],
  row: TableauRow,
): readonly TableauSelectionCriteria[] | null {
  const criteria: TableauSelectionCriteria[] = [];
  for (const dimension of dimensions) {
    const criterion = criterionFor(dimension, row);
    if (criterion === null) {
      return null;
    }
    criteria.push(criterion);
  }
  return criteria.length === 0 ? null : criteria;
}

// ---------------------------------------------------------------------------
// Column planning
// ---------------------------------------------------------------------------

/**
 * Resolve an override's column name against the classified columns.
 *
 * `Column.fieldName` is tried first because it is what a page author sees in
 * Tableau; `fieldId` second because it is what survives a rename.
 *
 * @param name - The name the page asked for.
 * @param candidates - The columns of the matching role.
 * @returns The column, or `null` when nothing matches.
 */
function resolveColumn<T extends TableauClassifiedColumn>(
  name: string,
  candidates: readonly T[],
): T | null {
  const byName = candidates.find(candidate => candidate.column.fieldName === name);
  if (byName !== undefined) {
    return byName;
  }
  return candidates.find(candidate => candidate.column.fieldId === name) ?? null;
}

/**
 * Resolve one override name, warning when it names nothing.
 *
 * An unresolved name is a page bug, and a silent fallback would leave the
 * author looking at a chart built from the wrong column with no clue why, so
 * the warning names every column that *was* available.
 *
 * @param name - The requested column, or `undefined` when unset.
 * @param candidates - The columns of the matching role.
 * @param role - What the name was asked for, for the message.
 * @param worksheet - The worksheet name, for the message.
 * @param warned - Per-extraction warning latch.
 * @returns The resolved column, or `null` to fall back to the heuristic pick.
 */
function resolveOverride<T extends TableauClassifiedColumn>(
  name: string | undefined,
  candidates: readonly T[],
  role: string,
  worksheet: string,
  warned: Set<string>,
): T | null {
  if (name === undefined) {
    return null;
  }
  const resolved = resolveColumn(name, candidates);
  if (resolved !== null) {
    return resolved;
  }
  const available = candidates.map(candidate => candidate.column.fieldName).join(', ');
  warnOnce(
    warned,
    `worksheet "${worksheet}": no ${role} column named "${name}". `
    + `Available: ${available === '' ? '(none)' : available}. `
    + `Falling back to the heuristic pick.`,
  );
  return null;
}

/**
 * Decide which column plays which role in one worksheet.
 *
 * Only `D[0]` and `D[1]` are read. Further dimensions cannot be expressed by
 * any MAIDR trace — a third grouping level has nowhere to go in a
 * `SegmentedPoint[][]` — so they are ignored, and named in a warning so the
 * author can see which facts the reading leaves out.
 *
 * @param snapshot - The worksheet snapshot.
 * @param override - The page's overrides for this worksheet.
 * @param warned - Per-extraction warning latch.
 * @returns The resolved plan; any role may be `null` when nothing fills it.
 */
function planColumns(
  snapshot: WorksheetSnapshot,
  override: TableauWorksheetOverride,
  warned: Set<string>,
): ColumnPlan {
  const { dimensions, measures } = classifyColumns(snapshot.columns);

  const requestedCategory = resolveOverride(
    override.x,
    dimensions,
    'dimension',
    snapshot.name,
    warned,
  );
  const requestedGroup = resolveOverride(
    override.z,
    dimensions,
    'dimension',
    snapshot.name,
    warned,
  );
  const requestedValue = resolveOverride(
    override.y,
    measures,
    'measure',
    snapshot.name,
    warned,
  );

  let category = requestedCategory ?? dimensions.find(d => d !== requestedGroup) ?? null;
  let groupRequest = requestedGroup;

  // One column cannot be both the category axis and the series: that would
  // build a grouped chart of one category per group, which is a shape the page
  // cannot have meant.
  if (groupRequest !== null && groupRequest === category) {
    warnOnce(
      warned,
      `worksheet "${snapshot.name}": "${groupRequest.column.fieldName}" is already `
      + `the category axis, so it cannot also group the series; ignoring the group.`,
    );
    groupRequest = null;
  }

  // ...and it cannot be the series when it is the only dimension there is. The
  // search above excludes the requested group from the category candidates, so
  // a one-dimension worksheet would otherwise leave the category unset, and the
  // ladder would drop the worksheet reporting that it has no dimension to
  // navigate — which is false, and never names the override that caused it.
  if (groupRequest !== null && category === null) {
    warnOnce(
      warned,
      `worksheet "${snapshot.name}": "${groupRequest.column.fieldName}" is the only `
      + `dimension, so it cannot group the series; reading it as the category axis.`,
    );
    category = groupRequest;
    groupRequest = null;
  }

  const group = groupRequest ?? dimensions.find(d => d !== category) ?? null;
  const extras = dimensions.filter(d => d !== category && d !== group);
  if (extras.length > 0) {
    warnOnce(
      warned,
      `worksheet "${snapshot.name}": only the first two dimensions are read; `
      + `ignoring ${extras.map(d => `"${d.column.fieldName}"`).join(', ')}.`,
    );
  }

  const orderedDimensions = [category, group, ...extras].filter(
    (d): d is TableauDimensionColumn => d !== null,
  );
  const value = requestedValue ?? measures[0] ?? null;
  const orderedMeasures = value === null
    ? []
    : [value, ...measures.filter(measure => measure !== value)];

  return {
    dimensions: orderedDimensions,
    measures: orderedMeasures,
    category,
    group,
    value,
  };
}

// ---------------------------------------------------------------------------
// Trace-type decision
// ---------------------------------------------------------------------------

/**
 * The data shape a trace type is built from.
 *
 * The inferable set is small on purpose (§2.3): everything else is reachable
 * only through `overrides.traceType`, and a type this does not know is refused
 * rather than approximated.
 *
 * @param type - The trace type to place.
 * @returns Its family, or `null` when the extractor cannot build that type.
 */
function traceFamily(type: TraceType): TraceFamily | null {
  switch (type) {
    case TraceType.BAR:
      return 'bar';
    case TraceType.DODGED:
    case TraceType.STACKED:
    case TraceType.NORMALIZED:
      return 'segmented';
    case TraceType.LINE:
    case TraceType.STEP:
    case TraceType.AREA:
    case TraceType.STACKED_AREA:
    case TraceType.NORMALIZED_AREA:
      return 'line';
    case TraceType.SCATTER:
      return 'scatter';
    case TraceType.HEATMAP:
      return 'heat';
    case TraceType.PIE:
      return 'pie';
    default:
      return null;
  }
}

/**
 * Whether every row of the view fills exactly one cell of the `D[0] × D[1]`
 * grid.
 *
 * `HeatmapData` is a rectangle: `points[r].length` must equal `x.length` for
 * every row. A view whose row count does not match the product has holes, and a
 * hole filled with a zero is a value the viz never drew.
 *
 * @param plan - The worksheet's column plan.
 * @param rows - The worksheet's rows.
 * @returns Whether a complete grid can be built.
 */
function isCompleteGrid(plan: ColumnPlan, rows: readonly TableauRow[]): boolean {
  if (plan.category === null || plan.group === null || rows.length === 0) {
    return false;
  }
  const columns = distinctKeys(rows, plan.category.viewIndex).length;
  const bands = distinctKeys(rows, plan.group.viewIndex).length;
  return rows.length === columns * bands;
}

/**
 * Whether a trace type can actually be built from this worksheet.
 *
 * @param type - The requested trace type.
 * @param plan - The worksheet's column plan.
 * @param rows - The worksheet's rows.
 * @returns Whether the required columns (and, for `heat`, the complete grid)
 * are present.
 */
function canBuild(
  type: TraceType,
  plan: ColumnPlan,
  rows: readonly TableauRow[],
): boolean {
  switch (traceFamily(type)) {
    case 'bar':
    case 'pie':
    case 'line':
      return plan.category !== null && plan.value !== null;
    case 'segmented':
      return plan.category !== null && plan.group !== null && plan.value !== null;
    case 'scatter':
      return plan.measures.length >= 2;
    case 'heat':
      return plan.value !== null && isCompleteGrid(plan, rows);
    default:
      return false;
  }
}

/**
 * Map a Tableau mark type onto a MAIDR trace type.
 *
 * Used only when a visual specification is available — the Extensions API
 * today, and any future Embedding release that adds it. The mark type is the
 * only *direct* evidence of what the author drew, so it outranks the heuristic
 * ladder; it does not outrank an explicit override.
 *
 * @param markType - `MarksSpecification.primitiveType`, as Tableau spells it.
 * @param plan - The worksheet's column plan.
 * @param rows - The worksheet's rows.
 * @param worksheet - The worksheet name, for warnings.
 * @param warned - Per-extraction warning latch.
 * @returns The trace type, or an instruction to fall through to the ladder, or
 * to skip the worksheet entirely.
 */
function markTypeToTrace(
  markType: string,
  plan: ColumnPlan,
  rows: readonly TableauRow[],
  worksheet: string,
  warned: Set<string>,
): MarkTypeDecision {
  switch (markType) {
    case 'bar':
      // A second dimension is a second series, whichever way Tableau laid the
      // bars out. `dodged_bar` rather than `stacked_bar` for the reason the
      // ladder gives below: the data cannot tell them apart.
      return { kind: 'trace', type: plan.group === null ? TraceType.BAR : TraceType.DODGED };
    case 'line':
      return { kind: 'trace', type: TraceType.LINE };
    case 'area':
      // Never `stacked_area`: summary data gives each band its own value for
      // both layouts, so the stack is not recoverable. `overrides.traceType`
      // is the only way to declare one.
      return { kind: 'trace', type: TraceType.AREA };
    case 'circle':
    case 'shape':
      // A categorical dot plot is drawn with the same primitive as a scatter,
      // and MAIDR's `point` demands numeric x and y. Without two measures to
      // put on those axes this is not a point cloud, so the ladder decides.
      return plan.measures.length >= 2
        ? { kind: 'trace', type: TraceType.SCATTER }
        : { kind: 'ladder' };
    case 'square':
    case 'heatmap':
      if (isCompleteGrid(plan, rows)) {
        return { kind: 'trace', type: TraceType.HEATMAP };
      }
      warnOnce(
        warned,
        `worksheet "${worksheet}" is drawn with ${markType} marks but its rows do `
        + `not fill a complete grid; reading it as grouped bars instead.`,
      );
      return { kind: 'ladder' };
    case 'pie':
      return { kind: 'trace', type: TraceType.PIE };
    case 'gantt-bar':
    case 'text':
    case 'map':
    case 'polygon':
    case 'viz-extension':
      // Refused rather than approximated: a gantt needs a start and an end
      // where the summary gives a duration, a map needs centroids and a
      // neighbour list Tableau does not expose, and a text table has no
      // magnitude to sonify at all.
      return { kind: 'skip' };
    default:
      // There is no `Automatic` member in `MarkType` — Tableau resolves it to
      // whatever primitive it drew — but the docs never say the enum is closed,
      // so an unrecognised mark falls through to the ladder rather than
      // throwing away a worksheet the columns can still describe.
      return { kind: 'ladder' };
  }
}

/**
 * The mark type of the active marks card, when the host reported one.
 *
 * `activeMarksSpecificationIndex` selects the card focused in the authoring UI
 * and is undocumented in view mode, so the first card is the fallback rather
 * than an error.
 *
 * @param spec - The worksheet's visual specification, when it has one.
 * @returns The primitive type, or `undefined`.
 */
function activeMarkType(spec: TableauVisualSpecification | undefined): string | undefined {
  const cards = spec?.marksSpecifications;
  if (cards === undefined || cards.length === 0) {
    return undefined;
  }
  const index = spec?.activeMarksSpecificationIndex;
  const active = typeof index === 'number' ? cards[index] : undefined;
  return (active ?? cards[0])?.primitiveType;
}

/**
 * The heuristic ladder: what the columns alone say the worksheet is.
 *
 * Runs only when neither an override nor a visual specification settled it.
 *
 * @param plan - The worksheet's column plan.
 * @param rows - The worksheet's rows.
 * @param worksheet - The worksheet name, for warnings.
 * @param warned - Per-extraction warning latch.
 * @returns The trace type, or `null` to skip the worksheet.
 */
function ladderTraceType(
  plan: ColumnPlan,
  rows: readonly TableauRow[],
  worksheet: string,
  warned: Set<string>,
): TraceType | null {
  // C0. Nothing to sonify: every trace MAIDR has pitches a magnitude.
  if (plan.measures.length === 0 || plan.value === null) {
    warnOnce(
      warned,
      `worksheet "${worksheet}" has no measure to sonify; skipping it.`,
    );
    return null;
  }

  // C1. Several measures, and every dimension is a detail dimension (one
  //     distinct value per row): the rows are observations rather than
  //     categories, which is a point cloud.
  //
  //     This is tested *before* the "nothing to navigate" skip below, and the
  //     order is load-bearing. A worksheet with a continuous field on an axis —
  //     an unaggregated `Discount`, or a `Sales (bin)` field — has that field
  //     classified as a second *measure*, because `classifyColumn` routes every
  //     numeric column to the measure rung. Such a worksheet therefore arrives
  //     here with no dimensions at all, where `every` is vacuously true, and
  //     reading it as numeric x against numeric y is exactly what it is. Tested
  //     the other way round it would be skipped for having no category, and a
  //     perfectly readable view would vanish from the figure.
  const everyDimensionIsDetail = plan.dimensions.every(
    dimension => distinctKeys(rows, dimension.viewIndex).length === rows.length,
  );
  if (plan.measures.length >= 2 && everyDimensionIsDetail) {
    return TraceType.SCATTER;
  }

  // C2. A single aggregate has nothing to navigate between — one number is a
  //     sentence, not a chart, and MAIDR would announce a one-cell figure.
  if (plan.category === null) {
    warnOnce(
      warned,
      `worksheet "${worksheet}" has no dimension to navigate; skipping it.`,
    );
    return null;
  }

  // C3. A temporal category is an ordered axis: the marks are samples along it
  //     rather than separate bars.
  //
  //     Only a *temporal* one: a continuous numeric field never reaches here as
  //     a dimension. `classifyColumn` sends every numeric column to the measure
  //     rung, so the only dimension that can carry `numeric: true` is a
  //     date-part wrapper such as `YEAR(Order Date)`, which is already
  //     `temporal`. The continuous-axis case is C1's, above.
  if (plan.category.temporal) {
    return TraceType.LINE;
  }

  // C4. Otherwise: categories, with a second dimension read as series.
  //
  // Two deliberate omissions live here, both for the same reason — the summary
  // data does not contain the fact that would settle them:
  //
  // - **`heat` is never inferred.** Two dimensions and one measure is equally
  //   the signature of a highlight table and of a grouped bar chart. Reading it
  //   as `dodged_bar` announces exactly the same numbers, needs no complete
  //   grid, and does not reverse the y axis the way `Heatmap` does. A heat map
  //   requires the mark type or `overrides.traceType`.
  // - **`stacked_bar` is never inferred.** Summary data gives each segment its
  //   own value whether the segments were stacked or set side by side, so
  //   nothing distinguishes them. `dodged_bar` is the honest default: it
  //   announces each group's own value and never claims a total the viz may not
  //   have drawn. (`SegmentedTrace` appends its synthetic "Total" row either
  //   way, so no total is lost by choosing it.)
  return plan.group === null ? TraceType.BAR : TraceType.DODGED;
}

/**
 * Decide what one worksheet is, in the fixed order of authority.
 *
 * A → an explicit `overrides.traceType`; B → the visual specification's mark
 * type; C → the heuristic ladder. An override that cannot be honoured — `heat`
 * on a view with holes in its grid, say — degrades to the ladder's answer with
 * a warning, because a truthful smaller reading beats a confident wrong one.
 *
 * @param snapshot - The worksheet snapshot.
 * @param plan - The worksheet's column plan.
 * @param override - The page's overrides for this worksheet.
 * @param warned - Per-extraction warning latch.
 * @returns The trace type, or `null` to skip the worksheet.
 */
function decideTraceType(
  snapshot: WorksheetSnapshot,
  plan: ColumnPlan,
  override: TableauWorksheetOverride,
  warned: Set<string>,
): TraceType | null {
  const rows = snapshot.rows;

  // A. The page said so.
  if (override.traceType !== undefined) {
    if (canBuild(override.traceType, plan, rows)) {
      return override.traceType;
    }
    warnOnce(
      warned,
      `worksheet "${snapshot.name}": cannot build a "${override.traceType}" layer `
      + `from these columns; falling back to the inferred type.`,
    );
  }

  // B. Tableau said so.
  const markType = activeMarkType(snapshot.spec);
  if (markType !== undefined) {
    const decision = markTypeToTrace(markType, plan, rows, snapshot.name, warned);
    if (decision.kind === 'trace') {
      return decision.type;
    }
    if (decision.kind === 'skip') {
      warnOnce(
        warned,
        `worksheet "${snapshot.name}" is drawn with ${markType} marks, which MAIDR `
        + `has no equivalent for; skipping it.`,
      );
      return null;
    }
  }

  // C. The columns say so.
  return ladderTraceType(plan, rows, snapshot.name, warned);
}

// ---------------------------------------------------------------------------
// Data builders
// ---------------------------------------------------------------------------

/**
 * Build a flat category/magnitude series, for `bar` and `pie`.
 *
 * A row whose measure is a gap is **skipped**, not emitted as a zero: a zero is
 * a bar the viz drew at the baseline, and inventing one puts a mark where the
 * view has none.
 *
 * @param category - The category dimension.
 * @param value - The measure.
 * @param rows - The worksheet's rows, in view order.
 * @param horizontal - Whether the layer is horizontal, in which case the
 * category goes on `y` and the magnitude on `x`, which is the payload
 * `AbstractBarPlot` reads for an oriented layer.
 * @returns The points and their single-row cell index, or `null` when nothing
 * survived.
 */
function buildFlatData(
  category: TableauDimensionColumn,
  value: TableauMeasureColumn,
  rows: readonly TableauRow[],
  horizontal: boolean,
): LayerBuild | null {
  const data: FlatPoint[] = [];
  const cells: (readonly TableauSelectionCriteria[] | null)[] = [];

  for (const row of rows) {
    const magnitude = toFiniteNumber(row[value.viewIndex]);
    if (magnitude === null) {
      continue;
    }
    const categoryKey = toCategoryKey(row[category.viewIndex]);
    data.push(
      horizontal
        ? { x: magnitude, y: categoryKey }
        : { x: categoryKey, y: magnitude },
    );
    cells.push(rowCriteria([category], row));
  }

  return data.length === 0 ? null : { data, cells: [cells] };
}

/**
 * Build a rectangular grouped series, for the `dodged_bar` family.
 *
 * `SegmentedTrace.createSummaryLevel()` sums across rows by index, so every
 * inner array must hold the same categories in the same order. What it needs is
 * equal *length*, not values: it filters the segments it sums with `isMeasured`
 * and yields a gap for a category every series is missing. A `(group,
 * category)` pair with no row is therefore padded with a magnitude of `NaN` —
 * MAIDR's gap sentinel, kept out of the pitch range, announced as "missing",
 * and left silent — and never with a `0`, which would sonify as a real reading
 * at the bottom of the range, be reachable as the row's minimum, and pull the
 * scale every other bar's pitch is measured against. Its cell criteria are
 * `null` for the same reason: the pad is the adapter's scaffolding rather than
 * a mark, and selecting a mark that was never drawn is worse than selecting
 * nothing.
 *
 * @param category - The category dimension (`D[0]`).
 * @param group - The series dimension (`D[1]`).
 * @param value - The measure.
 * @param rows - The worksheet's rows, in view order.
 * @param horizontal - Whether the layer is horizontal, in which case the
 * category goes on `y` and the magnitude on `x`. The `[group][category]`
 * iteration order is unchanged: `SegmentedTrace.createSummaryLevel()` already
 * reads the category off `y` when the trace is horizontal.
 * @returns The nested points and their `[group][category]` cell index, or
 * `null` when the view is empty.
 */
function buildSegmentedData(
  category: TableauDimensionColumn,
  group: TableauDimensionColumn,
  value: TableauMeasureColumn,
  rows: readonly TableauRow[],
  horizontal: boolean,
): LayerBuild | null {
  const categories = distinctKeys(rows, category.viewIndex);
  const groups = distinctKeys(rows, group.viewIndex);
  if (categories.length === 0 || groups.length === 0) {
    return null;
  }

  // First row wins for a repeated pair. Summing would fabricate a total the
  // view may not have drawn — the extra dimensions that produce duplicates are
  // the ones `planColumns` already warned it is ignoring.
  const sourceRows = new Map<string, TableauRow>();
  for (const row of rows) {
    const key = cellKey(
      toCategoryKey(row[group.viewIndex]),
      toCategoryKey(row[category.viewIndex]),
    );
    if (!sourceRows.has(key)) {
      sourceRows.set(key, row);
    }
  }

  const data: SegmentedPoint[][] = [];
  const cells: (readonly TableauSelectionCriteria[] | null)[][] = [];

  for (const groupKey of groups) {
    const series: SegmentedPoint[] = [];
    const seriesCells: (readonly TableauSelectionCriteria[] | null)[] = [];
    for (const categoryKey of categories) {
      const source = sourceRows.get(cellKey(groupKey, categoryKey));
      const magnitude = source === undefined
        ? null
        : toFiniteNumber(source[value.viewIndex]);
      const magnitudeOrGap = magnitude ?? Number.NaN;
      series.push(
        horizontal
          ? { x: magnitudeOrGap, y: categoryKey, z: groupKey }
          : { x: categoryKey, y: magnitudeOrGap, z: groupKey },
      );
      seriesCells.push(
        source === undefined || magnitude === null
          ? null
          : rowCriteria([category, group], source),
      );
    }
    data.push(series);
    cells.push(seriesCells);
  }

  return { data, cells };
}

/**
 * Build a nested series, for the whole line family (`line`, `step`, `area`).
 *
 * Nested **even for a single series**, which is what the grammar demands. A
 * missing magnitude becomes `y: null` and never `0`: `Number(null)` is `0`,
 * which would sound like a real low reading, be reachable as the row's minimum,
 * and pull the range every other point's pitch is scaled against.
 *
 * Unlike the segmented builder this is deliberately **not** rectangularized —
 * a line with fewer samples than its neighbour is a real chart, and padding it
 * would draw points the view does not have.
 *
 * @param category - The category dimension (`D[0]`), read in view order.
 * @param group - The series dimension (`D[1]`), or `null` for one series.
 * @param value - The measure.
 * @param rows - The worksheet's rows, in view order.
 * @returns The nested points and their `[series][sample]` cell index, or `null`
 * when the view is empty.
 */
function buildLineData(
  category: TableauDimensionColumn,
  group: TableauDimensionColumn | null,
  value: TableauMeasureColumn,
  rows: readonly TableauRow[],
): LayerBuild | null {
  if (rows.length === 0) {
    return null;
  }

  const seriesIndex = new Map<string, number>();
  const data: LinePoint[][] = [];
  const cells: (readonly TableauSelectionCriteria[] | null)[][] = [];
  const address = group === null ? [category] : [category, group];

  for (const row of rows) {
    const groupKey = group === null ? '' : toCategoryKey(row[group.viewIndex]);
    let index = seriesIndex.get(groupKey);
    if (index === undefined) {
      index = data.length;
      seriesIndex.set(groupKey, index);
      data.push([]);
      cells.push([]);
    }

    const point: LinePoint = {
      x: toCategoryKey(row[category.viewIndex]),
      y: toFiniteNumber(row[value.viewIndex]),
    };
    if (group !== null) {
      point.z = groupKey;
    }
    data[index].push(point);
    cells[index].push(rowCriteria(address, row));
  }

  return { data, cells };
}

/**
 * Build a point cloud, for `point`.
 *
 * `ScatterPoint.x` and `.y` are strictly numeric, so a row missing either
 * coordinate is dropped — there is no position to place it at. A third measure
 * becomes `z`, which the grammar defines as a third numeric channel and not a
 * series name.
 *
 * The address of a point is **every** dimension of the row, not just `D[0]` and
 * `D[1]`: on a point cloud the dimensions are detail fields whose combination
 * is what identifies the mark.
 *
 * @param measures - Measures in read order; `[0]` is x, `[1]` is y, `[2]` is z.
 * @param dimensions - Every dimension, used to address the mark.
 * @param rows - The worksheet's rows, in view order.
 * @returns The points and their per-index criteria, or `null` when none had
 * both coordinates.
 */
function buildScatterData(
  measures: readonly TableauMeasureColumn[],
  dimensions: readonly TableauDimensionColumn[],
  rows: readonly TableauRow[],
): LayerBuild | null {
  const xMeasure = measures[0];
  const yMeasure = measures[1];
  if (xMeasure === undefined || yMeasure === undefined) {
    return null;
  }
  const zMeasure = measures[2];

  const data: ScatterPoint[] = [];
  const points: (readonly TableauSelectionCriteria[] | null)[] = [];

  for (const row of rows) {
    const x = toFiniteNumber(row[xMeasure.viewIndex]);
    const y = toFiniteNumber(row[yMeasure.viewIndex]);
    if (x === null || y === null) {
      continue;
    }
    const z = zMeasure === undefined ? null : toFiniteNumber(row[zMeasure.viewIndex]);
    data.push(z === null ? { x, y } : { x, y, z });
    points.push(rowCriteria(dimensions, row));
  }

  return data.length === 0 ? null : { data, points };
}

/**
 * Build a complete grid, for `heat`.
 *
 * `HeatmapData` is an object rather than an array and demands a rectangle:
 * `points.length === y.length` and `points[r].length === x.length`. Callers
 * check {@link isCompleteGrid} first, so a hole here is a duplicated pair
 * rather than a missing one; it is filled with `0` and given `null` criteria,
 * so the pad names no mark — the same criteria contract the segmented builder
 * uses for its own padding.
 *
 * @param category - The category dimension, laid along x.
 * @param group - The series dimension, laid along y.
 * @param value - The measure the cells are shaded by.
 * @param rows - The worksheet's rows, in view order.
 * @returns The grid and its cell index — **row-reversed**, to match
 * `Heatmap`'s own constructor, which reverses `y` and `points` so that row 0 is
 * the bottom of the drawn grid. Without the reversal, arrow-key row N would
 * select the marks of a different row.
 */
function buildHeatData(
  category: TableauDimensionColumn,
  group: TableauDimensionColumn,
  value: TableauMeasureColumn,
  rows: readonly TableauRow[],
): LayerBuild | null {
  const x = distinctKeys(rows, category.viewIndex);
  const y = distinctKeys(rows, group.viewIndex);
  if (x.length === 0 || y.length === 0) {
    return null;
  }

  const sourceRows = new Map<string, TableauRow>();
  for (const row of rows) {
    const key = cellKey(
      toCategoryKey(row[group.viewIndex]),
      toCategoryKey(row[category.viewIndex]),
    );
    if (!sourceRows.has(key)) {
      sourceRows.set(key, row);
    }
  }

  const points: number[][] = [];
  const cells: (readonly TableauSelectionCriteria[] | null)[][] = [];

  for (const bandKey of y) {
    const magnitudes: number[] = [];
    const bandCells: (readonly TableauSelectionCriteria[] | null)[] = [];
    for (const columnKey of x) {
      const source = sourceRows.get(cellKey(bandKey, columnKey));
      const magnitude = source === undefined
        ? null
        : toFiniteNumber(source[value.viewIndex]);
      magnitudes.push(magnitude ?? 0);
      bandCells.push(
        source === undefined || magnitude === null
          ? null
          : rowCriteria([category, group], source),
      );
    }
    points.push(magnitudes);
    cells.push(bandCells);
  }

  const data: HeatmapData = { x, y, points };
  return { data, cells: [...cells].reverse() };
}

/**
 * Dispatch to the builder for a trace type's family.
 *
 * @param type - The decided trace type.
 * @param plan - The worksheet's column plan.
 * @param rows - The worksheet's rows, in view order.
 * @param horizontal - Whether the layer is horizontal. Only the bar families
 * are oriented, so only they read it; the rest ignore it.
 * @returns The built payload, or `null` when the worksheet yields no data.
 */
function buildData(
  type: TraceType,
  plan: ColumnPlan,
  rows: readonly TableauRow[],
  horizontal: boolean,
): LayerBuild | null {
  const { category, group, value, measures, dimensions } = plan;

  switch (traceFamily(type)) {
    case 'bar':
    case 'pie':
      return category === null || value === null
        ? null
        : buildFlatData(category, value, rows, horizontal);
    case 'segmented':
      return category === null || group === null || value === null
        ? null
        : buildSegmentedData(category, group, value, rows, horizontal);
    case 'line':
      return category === null || value === null
        ? null
        : buildLineData(category, group, value, rows);
    case 'scatter':
      return buildScatterData(measures, dimensions, rows);
    case 'heat':
      return category === null || group === null || value === null
        ? null
        : buildHeatData(category, group, value, rows);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Layer assembly
// ---------------------------------------------------------------------------

/**
 * The default axis captions for one trace family.
 *
 * Which column an axis names depends on what the chart is: a point cloud puts
 * two *measures* on x and y, and a heat map puts the second *dimension* on y
 * and the measure on the colour axis. Naming them by position alone would
 * announce the wrong field, which is a defect a reader cannot see past.
 *
 * @param family - The family the layer belongs to.
 * @param plan - The worksheet's column plan.
 * @param horizontal - Whether the layer is horizontal, in which case a bar
 * family's captions are swapped with its payload: the magnitude is on x and the
 * category on y.
 * @returns The captions, each absent when the family has no such axis.
 */
function defaultAxisLabels(
  family: TraceFamily,
  plan: ColumnPlan,
  horizontal: boolean,
): { x?: string; y?: string; z?: string } {
  if (family === 'scatter') {
    return {
      x: plan.measures[0]?.caption,
      y: plan.measures[1]?.caption,
      z: plan.measures[2]?.caption,
    };
  }
  if (family === 'heat') {
    // `z` names what the cells are shaded by, which is the measure — the two
    // dimensions are already spoken for by x and y.
    return {
      x: plan.category?.caption,
      y: plan.group?.caption,
      z: plan.value?.caption,
    };
  }
  if (horizontal) {
    // A horizontal bar carries its magnitude on x and its category on y, so the
    // captions travel with the payload. Naming them the other way round would
    // announce the category label over the number and the measure label over
    // the category name.
    return {
      x: plan.value?.caption,
      y: plan.category?.caption,
      z: plan.group?.caption,
    };
  }
  return {
    x: plan.category?.caption,
    y: plan.value?.caption,
    // `z` names what a *series is*, per the grammar, not the values it carries.
    z: plan.group?.caption,
  };
}

/**
 * Build a layer's axis configuration.
 *
 * Axes are always `AxisConfig` objects: a bare string is not accepted by the
 * grammar and silently degrades the label to `'X'` at runtime.
 *
 * An explicit `override.axes` caption always wins, including on a horizontal
 * layer: a page that hand-writes a caption is writing it for the axis as the
 * layer will actually emit it.
 *
 * @param family - The family the layer belongs to.
 * @param plan - The worksheet's column plan.
 * @param override - The page's overrides for this worksheet.
 * @param horizontal - Whether the layer is horizontal, which swaps a bar
 * family's default captions along with its payload.
 * @returns The axis configuration, with an axis omitted only when neither an
 * override nor a column names it.
 */
function buildAxes(
  family: TraceFamily,
  plan: ColumnPlan,
  override: TableauWorksheetOverride,
  horizontal: boolean,
): { x?: AxisConfig; y?: AxisConfig; z?: AxisConfig } {
  const defaults = defaultAxisLabels(family, plan, horizontal);
  const axes: { x?: AxisConfig; y?: AxisConfig; z?: AxisConfig } = {};

  const x = override.axes?.x ?? defaults.x;
  if (x !== undefined) {
    axes.x = { label: x };
  }
  const y = override.axes?.y ?? defaults.y;
  if (y !== undefined) {
    axes.y = { label: y };
  }
  const z = override.axes?.z ?? defaults.z;
  if (z !== undefined) {
    axes.z = { label: z };
  }

  return axes;
}

/**
 * Build the single layer one worksheet contributes.
 *
 * One worksheet is exactly one layer, and one layer is exactly one subplot, so
 * `layerId` is the subplot index and is figure-unique by construction.
 *
 * @param snapshot - The worksheet snapshot.
 * @param override - The page's overrides for this worksheet.
 * @param layerId - The layer id to stamp, i.e. the survivor index.
 * @param warned - Per-extraction warning latch.
 * @returns The layer and its position index, or `null` when the worksheet
 * contributes nothing — in which case it contributes no subplot either.
 */
function buildLayer(
  snapshot: WorksheetSnapshot,
  override: TableauWorksheetOverride,
  layerId: string,
  warned: Set<string>,
): BuiltLayer | null {
  if (snapshot.rows.length === 0) {
    warnOnce(warned, `worksheet "${snapshot.name}" returned no rows; skipping it.`);
    return null;
  }

  const plan = planColumns(snapshot, override, warned);
  const type = decideTraceType(snapshot, plan, override, warned);
  if (type === null) {
    return null;
  }

  const family = traceFamily(type);
  if (family === null) {
    warnOnce(
      warned,
      `worksheet "${snapshot.name}": no builder for a "${type}" layer; skipping it.`,
    );
    return null;
  }

  // `orientation: 'horz'` is a claim about the payload, not a decoration on it.
  // `AbstractBarPlot` reads an oriented layer's magnitude off `point.x` and its
  // category off `point.y`, so a horizontal bar family has to be *built*
  // transposed; stamping the flag onto the vertical shape would hand every bar
  // `Number('<category>')`, i.e. `NaN`, and leave the chart silent with an empty
  // braille display. Only the bar families are oriented — `IS_ORIENTED` is
  // false for line, scatter, heat and pie, whose models ignore the field
  // entirely — so nothing else transposes.
  const horizontal = override.orientation === Orientation.HORIZONTAL
    && (family === 'bar' || family === 'segmented');

  const build = buildData(type, plan, snapshot.rows, horizontal);
  if (build === null) {
    warnOnce(
      warned,
      `worksheet "${snapshot.name}" produced no sonifiable data; skipping it.`,
    );
    return null;
  }

  const layer: MaidrLayer = {
    id: layerId,
    type,
    title: override.title ?? snapshot.name,
    axes: buildAxes(family, plan, override, horizontal),
    data: build.data,
  };
  // Nothing in the summary data says which way Tableau drew the bars, or where
  // a step jumps, so both are emitted only when the page declared them.
  if (override.orientation !== undefined) {
    layer.orientation = override.orientation;
  }
  if (override.stepDirection !== undefined) {
    layer.stepDirection = override.stepDirection;
  }

  // `selectors` is never emitted: there is no DOM to select, and highlighting
  // goes through the selection bridge instead. A layer without them keeps
  // audio, text, braille, autoplay, review and the description modal.
  return { layer, cells: build.cells, points: build.points };
}

/**
 * Apply the page's include-list and per-worksheet `skip` flags.
 *
 * `options.worksheets` is honoured **in the order the page wrote it**, which is
 * the only order the page can express a preference in; without it the order is
 * `dashboard.worksheets`, i.e. the order the author added them, which is also
 * the order a screen reader already narrates the dashboard in.
 *
 * @param snapshots - Every snapshot that was read.
 * @param options - The adapter options.
 * @param warned - Per-extraction warning latch.
 * @returns The snapshots to build layers from, in figure order.
 */
function selectSnapshots(
  snapshots: readonly WorksheetSnapshot[],
  options: TableauAdapterOptions,
  warned: Set<string>,
): WorksheetSnapshot[] {
  let included: WorksheetSnapshot[];
  if (options.worksheets === undefined) {
    included = [...snapshots];
  } else {
    included = [];
    for (const name of options.worksheets) {
      const match = snapshots.find(snapshot => snapshot.name === name);
      if (match === undefined) {
        warnOnce(warned, `no worksheet named "${name}" was read; ignoring it.`);
        continue;
      }
      included.push(match);
    }
  }

  return included.filter(
    snapshot => options.overrides?.[snapshot.name]?.skip !== true,
  );
}

/**
 * Build a MAIDR figure, and its selection index, from worksheet snapshots.
 *
 * The figure is laid out as **N rows × 1 column**: one worksheet per subplot,
 * in the order the snapshots arrive. Tableau documents that "screen readers
 * read views or objects in a dashboard in the order in which they were added",
 * and `dashboard.worksheets` is that order — so paging through the subplots
 * matches the order a reader is already narrated the dashboard in.
 *
 * A worksheet that yields no layer contributes **no subplot**: `Figure` crashes
 * on a subplot with zero layers, and the controller refuses to construct itself
 * when no subplot has any. When every worksheet is skipped the result has an
 * empty `subplots` array, which the binder reads as "leave the page alone".
 *
 * `maidr.onNavigate` is not set here. Extraction is pure; the binder spreads
 * its own callback on.
 *
 * @param snapshots - One snapshot per worksheet, in figure order.
 * @param options - The page's adapter options.
 * @returns The MAIDR data object and the selection index that addresses it.
 */
export function extractTableau(
  snapshots: readonly WorksheetSnapshot[],
  options: TableauAdapterOptions = {},
): TableauExtraction {
  const warned = new Set<string>();
  const subplots: MaidrSubplot[][] = [];
  const cells = new Map<string, (readonly TableauSelectionCriteria[] | null)[][]>();
  const points = new Map<string, (readonly TableauSelectionCriteria[] | null)[]>();
  const worksheets = new Map<string, string>();

  for (const snapshot of selectSnapshots(snapshots, options, warned)) {
    // The survivor index, not the input index: a skipped worksheet must not
    // shift the ids every later lookup is keyed by.
    const layerId = String(subplots.length);
    const built = buildLayer(
      snapshot,
      options.overrides?.[snapshot.name] ?? {},
      layerId,
      warned,
    );
    if (built === null) {
      continue;
    }

    subplots.push([{ layers: [built.layer] }]);
    worksheets.set(layerId, snapshot.name);
    if (built.cells !== undefined) {
      cells.set(layerId, built.cells);
    }
    if (built.points !== undefined) {
      points.set(layerId, built.points);
    }
  }

  const maidr: Maidr = {
    id: options.id ?? `maidr-tableau-${nextFigureId++}`,
    subplots,
  };
  if (options.title !== undefined) {
    maidr.title = options.title;
  }

  return { maidr, selection: { cells, points, worksheets } };
}

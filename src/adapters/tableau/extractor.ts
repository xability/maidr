/**
 * Turns worksheet snapshots into a MAIDR figure — purely.
 *
 * This is the half of the Tableau adapter that decides *what a worksheet is*.
 * Tableau's summary data is a flat table: it says what the numbers are and
 * never what was drawn with them. `getVisualSpecificationAsync` answers that
 * directly and is declared on both the Embedding and the Extensions
 * `Worksheet`, but the host page loads whichever library build it likes, so its
 * answer is available rather than guaranteed. The reading is therefore
 * assembled from three sources in a fixed order of authority — an explicit
 * override, then the visual specification when the host reported one, then a
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
  TableauWorksheetGeometry,
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
 * Used whenever the host reported a visual specification. The mark type is the
 * only *direct* evidence of what the author drew, so it outranks the heuristic
 * ladder; it does not outrank an explicit override.
 *
 * Every one of `MarkType`'s thirteen members is handled explicitly. The
 * parameter is a `string` rather than {@link TableauMarkType} on purpose: the
 * payload crosses an iframe boundary from a library build this code did not
 * choose, so the union describes what Tableau declares and this function
 * describes what may actually arrive.
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
      // Unreachable for every member `MarkType` declares in contract 1.211.0 —
      // the thirteen cases above are the whole enum, and there is no
      // `Automatic` among them, because Tableau resolves that to whatever
      // primitive it drew. It is kept live for the two reasons a closed enum
      // does not close this switch: the host page loads whichever Embedding
      // build it likes, up to and including a later one with a fourteenth
      // member, and the payload is untrusted JSON from across an iframe
      // boundary. Either way an unrecognised mark falls through to the ladder
      // rather than throwing away a worksheet the columns can still describe.
      return { kind: 'ladder' };
  }
}

/**
 * The mark type of the active marks card, when the host reported one.
 *
 * `activeMarksSpecificationIndex` is declared as a bare `number` carrying no
 * documentation whatsoever — nothing says it is integral, non-negative, or in
 * range of `marksSpecifications`, in either authoring or view mode. It is
 * therefore range-checked, and a value that is not a usable index falls back to
 * the first card rather than raising: an out-of-range index is a fact about the
 * host's bookkeeping, not a reason to drop a worksheet whose cards are right
 * there. An empty card list returns `undefined`, which sends the caller to the
 * ladder.
 *
 * Every member read here is *required* in the shipped declarations. The checks
 * are still runtime checks, because the object arrives as JSON from a library
 * build this code did not choose, and TypeScript's word for what a contract
 * promises is not evidence about what crossed the boundary.
 *
 * @param spec - The worksheet's visual specification, when it has one.
 * @param worksheet - The worksheet name, for warnings.
 * @param warned - Per-extraction warning latch.
 * @returns The primitive type, or `undefined` when there is no card to read.
 */
function activeMarkType(
  spec: TableauVisualSpecification | undefined,
  worksheet: string,
  warned: Set<string>,
): string | undefined {
  const cards = spec?.marksSpecifications;
  if (cards === undefined || cards.length === 0) {
    return undefined;
  }

  // One entry is one marks card, and Tableau gives a dual-axis worksheet a card
  // per measure. Nothing in the contract says which axis a card belongs to, or
  // whether the axes are synchronized, and no summary-data column can be
  // attributed to a card — so merging them into a multi-layer figure is not
  // something the payload licenses. One card is read, and the fact that the
  // others exist is said out loud rather than passed over.
  if (cards.length > 1) {
    warnOnce(
      warned,
      `worksheet "${worksheet}" has ${cards.length} marks cards (a dual-axis view `
      + `has one per measure); reading only the active one.`,
    );
  }

  const index = spec?.activeMarksSpecificationIndex;
  const inRange = typeof index === 'number'
    && Number.isInteger(index)
    && index >= 0
    && index < cards.length;
  if (!inRange) {
    warnOnce(
      warned,
      `worksheet "${worksheet}": the visual specification's active marks card `
      + `index (${String(index)}) is not one of its ${cards.length} cards; `
      + `reading the first card instead.`,
    );
  }

  const active = inRange ? cards[index] : cards[0];
  return active?.primitiveType;
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
  const markType = activeMarkType(snapshot.spec, snapshot.name, warned);
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

// ---------------------------------------------------------------------------
// Dashboard layout
// ---------------------------------------------------------------------------

/**
 * How much of two objects' extents must overlap along one axis before they are
 * read as sharing a row (vertically), or as being stacked rather than side by
 * side (horizontally).
 *
 * Measured as a **fraction of the shorter extent**, never as a pixel tolerance.
 * A fixed tolerance is the wrong shape of rule: ten pixels is generous on a
 * 600px dashboard and meaningless on a 4000px one, and it moves again under
 * browser zoom and device-pixel ratio. A ratio is scale-free, which also means
 * it cannot be invalidated by the one thing about the units that the
 * declarations do not pin down.
 *
 * A half is not a tuned constant. It is the point where "these two sit side by
 * side" stops being more true than "one is above the other": below half, most
 * of each object's extent is unshared, which is exactly when a sighted reader
 * reads them as stacked. It is also nowhere near the case it exists to absorb —
 * the real cause of imperfect alignment in a tiled dashboard is per-object
 * padding and borders, a few pixels on objects hundreds of pixels tall, an
 * overlap ratio of about 0.98. The threshold therefore only bites on layouts
 * that are genuinely ambiguous, which is precisely where the grid is abandoned.
 */
const BAND_OVERLAP_RATIO = 0.5;

/**
 * One subplot that survived extraction, still paired with what it came from.
 *
 * Built in snapshot order and numbered before any layout happens, so that the
 * layer ids and the {@link SelectionIndex} keyed by them are identical whether
 * the figure ends up a grid or a column.
 */
interface BuiltSubplot {
  /** The layer id — the index among survivors. Never derived from position. */
  readonly layerId: string;
  /** The snapshot the subplot was built from, geometry included. */
  readonly snapshot: WorksheetSnapshot;
  /** The one-layer subplot itself. */
  readonly subplot: MaidrSubplot;
}

/** A survivor whose geometry passed the gates, ready to be banded. */
interface PlacedSubplot {
  /** Position among the survivors; the tie-break that makes sorting total. */
  readonly order: number;
  readonly subplot: MaidrSubplot;
  readonly geometry: TableauWorksheetGeometry;
}

/** The outcome of trying to lay a figure out from its dashboard geometry. */
interface LayoutAttempt {
  /** The subplot grid, or `null` when the geometry did not support one. */
  readonly rows: MaidrSubplot[][] | null;
  /**
   * Why a grid was rejected, when the page is likely to want to know.
   *
   * `null` when there was no geometry to reject in the first place — a single
   * worksheet, a story, an older embedding library, the `'column'` option —
   * which is the ordinary case and not worth a word. A dashboard that *did*
   * report geometry and still got a column is the surprising case, so that one
   * says why.
   */
  readonly reason: string | null;
}

/**
 * The shared fraction of two one-dimensional intervals, against the shorter.
 *
 * @param aStart - Start of the first interval.
 * @param aLength - Length of the first interval; must be positive.
 * @param bStart - Start of the second interval.
 * @param bLength - Length of the second interval; must be positive.
 * @returns `0` when they do not overlap, up to `1` when one contains the other.
 */
function overlapRatio(
  aStart: number,
  aLength: number,
  bStart: number,
  bLength: number,
): number {
  const shared
    = Math.min(aStart + aLength, bStart + bLength) - Math.max(aStart, bStart);
  if (shared <= 0) {
    return 0;
  }
  // Both lengths are positive — degenerate extents are rejected before any
  // banding starts — so this never divides by zero.
  return shared / Math.min(aLength, bLength);
}

/**
 * Order two placed subplots top-to-bottom, then left-to-right.
 *
 * @param a - One subplot.
 * @param b - The other.
 * @returns Negative when `a` comes first, positive when `b` does.
 */
function compareTopThenLeft(a: PlacedSubplot, b: PlacedSubplot): number {
  if (a.geometry.y !== b.geometry.y) {
    return a.geometry.y - b.geometry.y;
  }
  if (a.geometry.x !== b.geometry.x) {
    return a.geometry.x - b.geometry.x;
  }
  // Two objects at the same point cannot be separated by geometry. Falling back
  // to survivor order keeps the comparator total, so the result is the same on
  // every engine rather than depending on the sort's stability.
  return a.order - b.order;
}

/**
 * Order two placed subplots left-to-right, then top-to-bottom.
 *
 * @param a - One subplot.
 * @param b - The other.
 * @returns Negative when `a` comes first, positive when `b` does.
 */
function compareLeftThenTop(a: PlacedSubplot, b: PlacedSubplot): number {
  if (a.geometry.x !== b.geometry.x) {
    return a.geometry.x - b.geometry.x;
  }
  if (a.geometry.y !== b.geometry.y) {
    return a.geometry.y - b.geometry.y;
  }
  return a.order - b.order;
}

/**
 * Lay the survivors out as a grid using the dashboard's own geometry, or
 * decline.
 *
 * Survivors are swept top-to-bottom into **bands**: a worksheet joins the band
 * being built when its vertical extent overlaps the band's by at least
 * {@link BAND_OVERLAP_RATIO} of the shorter of the two, and starts a new band
 * otherwise. Within a band the order is left-to-right. That is the whole rule.
 *
 * Bands are emitted **bottom-most first**, so the bottom row of the dashboard
 * becomes row 0 of the figure. That is not a preference; it is what makes the
 * arrows true. The Tableau extractor emits no `selectors` — there is no DOM to
 * select — so `resolveSubplotLayout` cannot measure anything and every Tableau
 * figure takes its fallback layout, which sets `invertVertical: false`. With
 * that flag clear, `MovableGrid` maps *Move Up* to `row + 1`, i.e. row 0 is
 * navigationally the bottom of the figure — the same convention `Heatmap`
 * follows when it reverses its rows. Emitting the top band first would leave a
 * reader at the top-left of the dashboard told that Down is unavailable while
 * Up carried them downwards. A wrong direction under a key named "Move Up" is
 * worse than a wrong ordinal.
 *
 * The ordinal is the accepted cost: `buildFallbackLayout` numbers its
 * `visualOrderMap` in data-array order, so the bottom-left subplot is announced
 * as "Subplot 1". Naming it correctly means teaching `resolveSubplotLayout` to
 * accept caller-supplied positions, which is a shared-utility change affecting
 * every DOM-less adapter. The announcement still carries the worksheet's own
 * title, which is what identifies it; the number is not a spatial claim.
 *
 * A grid is declined outright — no partial grids, ever — when:
 *
 * 1. **any** survivor has no geometry (an older library, a lone worksheet, a
 *    story, or a worksheet no dashboard object named);
 * 2. any extent is degenerate, which would make the overlap ratio meaningless;
 * 3. any survivor floats or is invisible (see below);
 * 4. a band turns out to be *chained* — the sweep is single-linkage, so it
 *    would happily merge A with B and B with C while A and C barely touch, so
 *    every pair inside a closed band is re-checked against the same ratio. A
 *    staircase is not a row;
 * 5. two members of a band overlap horizontally by more than the same ratio,
 *    which means they are stacked within the band and "left to right" does not
 *    order them.
 *
 * A floating worksheet disqualifies the *whole* figure rather than being woven
 * in: floating objects are positioned independently of the tiled layout and
 * routinely sit on top of tiled ones, so their coordinates do not place them in
 * a row. An invisible one likewise — dropping it would silently remove data the
 * page may have named explicitly, and placing it in the grid would be a claim
 * about something that is not on screen. The column makes no spatial claim at
 * all and includes everything in author order, which is the honest answer to
 * both.
 *
 * All-singleton bands are *not* a failure: a genuinely vertical dashboard read
 * in geometry order is more truthful than one read in the order its worksheets
 * happened to be added. Nor is a single band holding everything, which is a
 * genuine 1×N dashboard.
 *
 * Pure, like everything else in this file: the geometry arrives on the
 * snapshots, captured once by the binder from `dashboard.objects`. It follows
 * that the grid is computed at read time and is not recomputed when the window
 * is merely resized — the refresh events are filter, parameter, data and tab
 * changes, not `resize` — which is the same trade `options.live` makes
 * elsewhere: rebuilding the figure under a navigating reader is worse than a
 * layout that reflects the dashboard as it was read.
 *
 * @param built - Every survivor, in figure order, already numbered.
 * @returns The grid and no reason, or no grid and a reason worth reporting.
 */
function layOutByGeometry(built: readonly BuiltSubplot[]): LayoutAttempt {
  const placed: PlacedSubplot[] = [];
  for (const [order, entry] of built.entries()) {
    const geometry = entry.snapshot.geometry;
    if (geometry === undefined) {
      return { rows: null, reason: null };
    }
    if (geometry.isFloating) {
      return {
        rows: null,
        reason: `worksheet "${entry.snapshot.name}" floats above the dashboard `
          + `layout, so its position does not place it in a row`,
      };
    }
    if (!geometry.isVisible) {
      return {
        rows: null,
        reason: `worksheet "${entry.snapshot.name}" is hidden on the dashboard, `
          + `so placing it in the layout would claim it is on screen`,
      };
    }
    if (!(geometry.width > 0) || !(geometry.height > 0)) {
      return {
        rows: null,
        reason: `worksheet "${entry.snapshot.name}" reported a zero or negative `
          + `size (${geometry.width}×${geometry.height})`,
      };
    }
    placed.push({ order, subplot: entry.subplot, geometry });
  }
  if (placed.length === 0) {
    return { rows: null, reason: null };
  }

  placed.sort(compareTopThenLeft);

  const bands: PlacedSubplot[][] = [];
  // The running union of the band being built, as a half-open interval.
  let top = 0;
  let bottom = 0;
  for (const member of placed) {
    const { y, height } = member.geometry;
    const current = bands.at(-1);
    const joins = current !== undefined
      && overlapRatio(top, bottom - top, y, height) >= BAND_OVERLAP_RATIO;
    if (current === undefined || !joins) {
      bands.push([member]);
      top = y;
      bottom = y + height;
      continue;
    }
    current.push(member);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + height);
  }

  for (const band of bands) {
    band.sort(compareLeftThenTop);
    for (let i = 0; i < band.length; i++) {
      for (let j = i + 1; j < band.length; j++) {
        const a = band[i].geometry;
        const b = band[j].geometry;
        if (overlapRatio(a.y, a.height, b.y, b.height) < BAND_OVERLAP_RATIO) {
          return {
            rows: null,
            reason: 'the worksheets form a staircase rather than rows — two of '
              + 'them were chained into the same band by a third without '
              + 'sharing a row themselves',
          };
        }
        if (overlapRatio(a.x, a.width, b.x, b.width) > BAND_OVERLAP_RATIO) {
          return {
            rows: null,
            reason: 'two worksheets in the same row overlap horizontally, so '
              + 'there is no left-to-right order between them',
          };
        }
      }
    }
  }

  // Bottom-most band first: with `invertVertical` clear, row 0 is the bottom of
  // the figure, so this is what makes Up move up the dashboard.
  const rows: MaidrSubplot[][] = [];
  for (let index = bands.length - 1; index >= 0; index--) {
    const band = bands[index];
    // Unreachable: a band is created around a member and only ever grows. It is
    // dropped rather than trusted because an empty row is the one shape that
    // crashes the model — `Figure.activeSubplot` reads `subplots[r][0]`.
    if (band.length === 0) {
      continue;
    }
    rows.push(band.map(member => member.subplot));
  }
  return rows.length === 0 ? { rows: null, reason: null } : { rows, reason: null };
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
 * One worksheet becomes one subplot holding one layer. How those subplots are
 * arranged has two answers, and the fallback is always available:
 *
 * - **A geometry-aware grid**, when the snapshots carry the dashboard geometry
 *   the binder read off `dashboard.objects` *and* that geometry is
 *   unambiguous. Worksheets that share a row of the dashboard share a row of
 *   the figure, left to right, and the dashboard's bottom row is row 0 — see
 *   {@link layOutByGeometry} for the banding rule, for why the bottom comes
 *   first, and for the five ways a grid is declined.
 * - **N rows × 1 column** otherwise: one worksheet per subplot, in the order
 *   the snapshots arrive. This is what an older embedding library gets, since
 *   it reports no geometry at all; it is also what a single worksheet, a
 *   `layout: 'column'` option, and every ambiguous dashboard get. Tableau
 *   documents that "screen readers read views or objects in a dashboard in the
 *   order in which they were added", and `dashboard.worksheets` is that order,
 *   so this ordering is one a reader has already been narrated.
 *
 * **Layer ids are assigned before any layout happens**, as the running count of
 * survivors, and are never derived from a grid position. That is load-bearing:
 * `SelectionIndex.cells`, `.points` and `.worksheets` are keyed by them, and
 * the binder turns those keys into live worksheets. Numbering after banding
 * would hand out duplicate ids the moment a row held more than one subplot and
 * would route highlights to the wrong worksheet. Banding is only ever a
 * permutation of an already-numbered list, so the ids — and the whole selection
 * index — are identical for the same input whichever layout is chosen. Nothing
 * downstream reads a row or a column out of a layer id; the model stores it and
 * echoes it back.
 *
 * A worksheet that yields no layer contributes **no subplot**: `Figure` crashes
 * on a subplot with zero layers, and the controller refuses to construct itself
 * when no subplot has any. It is therefore never a band member either, so a
 * skipped worksheet leaves no hole in the grid. When every worksheet is skipped
 * the result has an empty `subplots` array, which the binder reads as "leave
 * the page alone".
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
  const built: BuiltSubplot[] = [];
  const cells = new Map<string, (readonly TableauSelectionCriteria[] | null)[][]>();
  const points = new Map<string, (readonly TableauSelectionCriteria[] | null)[]>();
  const worksheets = new Map<string, string>();

  for (const snapshot of selectSnapshots(snapshots, options, warned)) {
    // The survivor index, not the input index: a skipped worksheet must not
    // shift the ids every later lookup is keyed by. Counted here, before the
    // layout exists, so the ids cannot depend on where a subplot lands.
    const layerId = String(built.length);
    const layer = buildLayer(
      snapshot,
      options.overrides?.[snapshot.name] ?? {},
      layerId,
      warned,
    );
    if (layer === null) {
      continue;
    }

    built.push({ layerId, snapshot, subplot: { layers: [layer.layer] } });
    worksheets.set(layerId, snapshot.name);
    if (layer.cells !== undefined) {
      cells.set(layerId, layer.cells);
    }
    if (layer.points !== undefined) {
      points.set(layerId, layer.points);
    }
  }

  const attempt: LayoutAttempt = options.layout === 'column'
    ? { rows: null, reason: null }
    : layOutByGeometry(built);
  if (attempt.reason !== null) {
    warnOnce(
      warned,
      `${attempt.reason}; laying the dashboard out as one worksheet per row `
      + `instead. Pass layout: 'column' to ask for that without the check.`,
    );
  }
  const subplots: MaidrSubplot[][]
    = attempt.rows ?? built.map(entry => [entry.subplot]);

  const maidr: Maidr = {
    id: options.id ?? `maidr-tableau-${nextFigureId++}`,
    subplots,
  };
  if (options.title !== undefined) {
    maidr.title = options.title;
  }

  return { maidr, selection: { cells, points, worksheets } };
}

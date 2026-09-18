/**
 * The runtime half of the Tableau selection bridge.
 *
 * A MAIDR figure built from an embedded viz has no DOM to highlight: the marks
 * live inside Tableau's own iframe and are not reachable with a CSS selector.
 * The only visual feedback channel the Embedding API affords is Tableau's own
 * mark selection, so MAIDR's cursor is mirrored into the viz by asking the
 * worksheet to select the marks the cursor is on.
 *
 * The extractor already recorded, for every navigable position, the dimension
 * values of the row it came from ({@link SelectionIndex}). This module turns
 * one of those addresses into a `selectMarksByValueAsync` call, and — just as
 * importantly — decides when *not* to make one:
 *
 * - a position with no address (a rectangularized filler cell, a row with a
 *   missing dimension value, the synthetic "Total" row a segmented trace adds)
 *   **clears** the selection rather than selecting something adjacent;
 * - a multi-point selection that cannot be expressed exactly clears too,
 *   because the criteria are combined as a cross product and an inexact one
 *   would highlight marks the reader is not on;
 * - a worksheet whose first selection call rejects has selection disabled
 *   **permanently**, with one warning. Everything else about MAIDR — audio,
 *   text, braille, autoplay, review — is untouched. Degrading quietly is the
 *   contract; retrying a call that is known to reject is not.
 *
 * The bridge also runs the other way. A mark a sighted user clicks in the viz
 * arrives as a `markselectionchanged` event, and {@link handleMarkSelection}
 * turns the marks it covers back into the position they were read from, so
 * MAIDR's cursor follows the click. Two things make that harder than the
 * forward direction, and both are handled here rather than in the binder:
 *
 * - **MAIDR's own selections come back as the same event**, and the API does
 *   not say which are which. Every selection and clear this module issues is
 *   remembered (see {@link SelectionBridge.issued}), and an event that resolves
 *   to one of them is its echo, consumed and ignored -- so the adapter never
 *   answers its own write, and a burst of arrow keys whose echoes arrive late
 *   cannot drag the cursor back through where it has been.
 * - **A mark carries no id**, so the position is found by matching the mark's
 *   dimension values against the criteria the index recorded. Where two rows
 *   share those values the match is ambiguous, and an ambiguous mark moves
 *   nothing: landing the reader on the wrong one of two is worse than
 *   leaving them where they are.
 */

import type { NavigateCallback, NavigationTarget } from '../../type/grammar';
import type { SelectionIndex } from './extractor';
import type {
  TableauDataTable,
  TableauMarksCollection,
  TableauMarksSelectedEvent,
  TableauSelectionCriteria,
  TableauWorksheet,
} from './types';
import { toCategoryKey, toDateValue } from './fields';

/**
 * The navigation position MAIDR reports, exactly as the grammar defines it.
 *
 * Taken from {@link NavigateCallback} rather than restated, so a change to the
 * callback's payload is a compile error here instead of a silent mismatch.
 */
type NavigationInfo = Parameters<NavigateCallback>[0];

const ADAPTER_PREFIX = '[MAIDR tableau]';

/**
 * `SelectionUpdateType.Replace`.
 *
 * The Embedding API library is loaded by the host page and never imported by
 * this bundle, so the enum object is not reachable from here — but its declared
 * value is documented and stable
 * (help.tableau.com/current/api/embedding_api/en-us/reference/enums/SelectionUpdateType.html).
 * Note the value is prefixed: `'select-replace'`, not `'replace'`. It lives in
 * one named constant rather than being inlined at the call site, so there is
 * exactly one place to correct if Tableau ever changes it.
 */
const SELECT_REPLACE = 'select-replace';

/**
 * Guards the adapter against reacting to its own writes.
 *
 * Programmatic selection fires Tableau's `MarkSelectionChanged`. This adapter
 * does not listen for that event — syncing MAIDR's cursor from a user click is
 * a separate piece of work — so there is no loop to break today. The flag
 * exists because the binder also clears the selection before every re-read, and
 * whatever comes to listen must be able to tell that clear apart from a user
 * action.
 */
export interface SelectionGuard {
  /** True while a selection change originated from MAIDR rather than a user. */
  programmatic: boolean;
}

/**
 * Everything {@link applySelection} needs, gathered once at bind time.
 */
export interface SelectionBridge {
  /** Where every navigable position came from, from the extractor. */
  readonly index: SelectionIndex;
  /** Layer id → the worksheet that layer was built from. */
  readonly worksheets: Map<string, TableauWorksheet>;
  /** Shared re-entrancy flag. */
  readonly guard: SelectionGuard;
  /**
   * Worksheets, **by name**, whose selection has been permanently disabled by
   * a rejection.
   *
   * Keyed by name and not by layer id: a layer id is an index among the
   * worksheets that survived one extraction, so a refresh that drops a
   * worksheet re-points every id after it at a different worksheet, and a latch
   * earned by one worksheet would silence another. A worksheet name is stable
   * across refreshes — it is already how {@link SelectionBridge.worksheets} is
   * rebuilt.
   */
  readonly disabled: Set<string>;
  /**
   * Worksheets, **by name**, whose selection MAIDR currently holds.
   *
   * Shared across refreshes like {@link SelectionBridge.disabled}. A worksheet
   * joins when a navigation selects marks in it and leaves when MAIDR clears
   * it or a user's own click replaces the selection. It is what lets focus
   * leaving the figure clear only what MAIDR put there: a colleague's click
   * on a mark takes the focus with it, and clearing that selection because
   * focus left would undo the very click the reader is about to follow.
   */
  readonly owned: Set<string>;
  /**
   * The selections and clears this bridge issued most recently, so their
   * echoes can be told from a user's own clicks. See
   * {@link handleMarkSelection}; bounded by {@link MAX_ISSUED_SELECTIONS}.
   */
  readonly issued: IssuedSelection[];
}

/**
 * One selection or clear MAIDR issued, in the position it was issued for.
 *
 * Kept as a position rather than as criteria because that is what an incoming
 * event is resolved to before it is compared: the two sides then meet in one
 * currency, and a point cloud's multi-mark selection is one entry whose
 * echo, resolved to any one of its points, is recognised.
 */
export interface IssuedSelection {
  /** The worksheet the call went to. */
  readonly worksheet: string;
  /** The position selected, or `null` for a clear. */
  readonly position: IssuedPosition | null;
}

/** The position a forward selection covered. */
type IssuedPosition
  = | { layerId: string; row: number; col: number }
    | { layerId: string; pointIndices: readonly number[] };

/**
 * How many issued selections a bridge remembers.
 *
 * Tableau answers a selection with one event, so a consumed echo frees its
 * entry and the ring only ever holds the calls still in flight -- a handful
 * during autoplay at its fastest. The bound is for the calls Tableau answers
 * with no event at all (a selection that changed nothing), which would
 * otherwise accumulate for the life of the bridge.
 */
const MAX_ISSUED_SELECTIONS = 16;

/**
 * What {@link handleMarkSelection} did with an event.
 *
 * - `echo`: the event answered a selection or clear this bridge issued.
 * - `cleared`: a user deselected everything; a kept target was withdrawn.
 * - `unresolved`: a user selected marks no position names exactly; a kept
 *   target was withdrawn, since it no longer describes the selection.
 * - `navigated`: the cursor moved to the mark, or will on the next focus-in.
 * - `refused`: the chart would not take the position -- it is not mounted, or
 *   the position is not one the figure has.
 */
export type MarkSelectionOutcome = 'echo' | 'cleared' | 'unresolved' | 'navigated' | 'refused';

/**
 * Create an empty guard.
 *
 * @returns A guard with no programmatic write in flight.
 */
export function createSelectionGuard(): SelectionGuard {
  return { programmatic: false };
}

/**
 * Run a Tableau call with the programmatic flag raised.
 *
 * The flag is lowered in a microtask rather than synchronously: the promise a
 * selection call returns may resolve when the action was *initiated* rather
 * than completed, so lowering it in the same turn would race the event the flag
 * exists to classify.
 *
 * @param guard - The shared guard.
 * @param call - The Tableau call to make.
 * @returns The call's promise, with the flag lowered once it settles.
 */
function withGuard(guard: SelectionGuard, call: () => Promise<void>): Promise<void> {
  guard.programmatic = true;
  return call().finally(() => {
    queueMicrotask(() => {
      guard.programmatic = false;
    });
  });
}

/**
 * Disable a worksheet's selection after a rejection, once and for good.
 *
 * `selectMarksByValueAsync` rejects on an invalid field name or an invalid
 * value, and neither becomes valid by being retried — a wrong `fieldName` is
 * wrong on every navigation step, so an un-latched adapter would log once per
 * arrow key. Guessing a different field to try instead is worse still: it would
 * highlight marks chosen by the adapter rather than by the data.
 *
 * The latch is keyed by worksheet name rather than by layer id, because it
 * outlives the refresh that can renumber the layer ids underneath it.
 *
 * @param bridge - The selection bridge.
 * @param worksheetName - The worksheet whose selection failed, and the latch key.
 * @param criteria - The criteria that were rejected, for the message.
 * @param error - The rejection.
 */
function disableWorksheetSelection(
  bridge: SelectionBridge,
  worksheetName: string,
  criteria: readonly TableauSelectionCriteria[],
  error: unknown,
): void {
  if (bridge.disabled.has(worksheetName)) {
    return;
  }
  bridge.disabled.add(worksheetName);
  const fields = criteria.map(criterion => `"${criterion.fieldName}"`).join(', ');
  console.warn(
    `${ADAPTER_PREFIX} could not select marks in worksheet "${worksheetName}" `
    + `by ${fields}; mark selection is now disabled for this worksheet. `
    + `Audio, text and braille are unaffected.`,
    error,
  );
}

/**
 * Clear the marks MAIDR selected in one worksheet.
 *
 * @param worksheet - The worksheet to clear.
 * @param guard - The shared guard, so the clear is not read as a user action.
 * @returns A promise that settles once the clear has been requested. A failure
 * is logged rather than thrown: a stale highlight is a cosmetic problem inside
 * the viz, and nothing MAIDR announces depends on it.
 */
export function clearSelection(
  worksheet: TableauWorksheet,
  guard: SelectionGuard,
): Promise<void> {
  return withGuard(guard, () => worksheet.clearSelectedMarksAsync()).catch(
    (error: unknown) => {
      console.warn(
        `${ADAPTER_PREFIX} could not clear the mark selection in worksheet `
        + `"${worksheet.name}".`,
        error,
      );
    },
  );
}

/**
 * Clear every worksheet MAIDR may have selected marks in.
 *
 * Used when focus leaves the figure, before every re-read, and on dispose, so
 * the adapter never leaves a selection behind in a workbook it no longer
 * drives.
 *
 * @param worksheets - The bound worksheets.
 * @param guard - The shared guard.
 * @returns A promise that settles once every clear has been requested.
 */
export function clearAllSelections(
  worksheets: Iterable<TableauWorksheet>,
  guard: SelectionGuard,
): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const worksheet of worksheets) {
    pending.push(clearSelection(worksheet, guard));
  }
  return Promise.all(pending).then(() => undefined);
}

/**
 * Combine several points' criteria into one exact selection.
 *
 * A point cloud's selection is a *set of points* rather than a cell, so a
 * highlight may cover many marks at once. Tableau combines criteria as a **cross
 * product**: `[{A: [a1, a2]}, {B: [b1, b2]}]` selects four marks, not two. So a
 * multi-point selection is expressible exactly only when the points differ in
 * exactly one field — then that field's values become the array and every other
 * field is a shared constant, which is precise because a detail dimension
 * identifies a row.
 *
 * Anything else returns `null` and the caller clears instead. Over-selecting
 * would tell the reader that marks are highlighted which their cursor is not
 * on, which is worse than highlighting nothing.
 *
 * @param points - The layer's per-index criteria, from the extractor.
 * @param indices - The data indices the highlight covers.
 * @returns Criteria selecting exactly those points, or `null` when no exact
 * selection exists.
 */
export function mergePointCriteria(
  points: readonly (readonly TableauSelectionCriteria[] | null)[] | undefined,
  indices: readonly number[],
): readonly TableauSelectionCriteria[] | null {
  if (points === undefined || indices.length === 0) {
    return null;
  }

  const selected: (readonly TableauSelectionCriteria[])[] = [];
  for (const index of indices) {
    const criteria = points[index];
    // An out-of-range index or an unaddressable point makes the *set*
    // inexpressible, not just that one point: selecting the rest would claim a
    // selection the reader is not on.
    if (criteria === undefined || criteria === null || criteria.length === 0) {
      return null;
    }
    selected.push(criteria);
  }

  const first = selected[0];
  if (selected.length === 1) {
    return first;
  }

  // Every point must address the same fields, in the same order, for "differ in
  // exactly one field" to be a question that can be asked at all.
  const fieldNames = first.map(criterion => criterion.fieldName);
  const sameFields = selected.every(
    criteria =>
      criteria.length === fieldNames.length
      && criteria.every((criterion, i) => criterion.fieldName === fieldNames[i]),
  );
  if (!sameFields) {
    return null;
  }

  const varying: number[] = [];
  for (let i = 0; i < fieldNames.length; i++) {
    const values = new Set(selected.map(criteria => valueKey(criteria[i].value)));
    if (values.size > 1) {
      varying.push(i);
    }
  }
  if (varying.length > 1) {
    return null;
  }
  if (varying.length === 0) {
    // Every point carries the same address, so one of them selects them all.
    return first;
  }

  const varyingIndex = varying[0];
  const values: string[] = [];
  for (const criteria of selected) {
    const value = criteria[varyingIndex].value;
    // Only a plain string can join a multi-value list: a range cannot be one of
    // several values, and an already-multi-valued criterion would have to be
    // flattened, which loses which point contributed what.
    if (typeof value !== 'string') {
      return null;
    }
    if (!values.includes(value)) {
      values.push(value);
    }
  }

  return first.map((criterion, i) =>
    i === varyingIndex ? { fieldName: criterion.fieldName, value: values } : criterion,
  );
}

/**
 * A comparable key for a criterion's value.
 *
 * `SelectionCriteria.value` is a union of a string, a list of strings and a
 * range, so equality has to be structural. A `Date` is compared by its epoch
 * milliseconds rather than by identity, since two reads of the same cell are
 * two `Date` objects.
 *
 * @param value - The criterion's value.
 * @returns A string that is equal exactly when the values are.
 */
function valueKey(value: TableauSelectionCriteria['value']): string {
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (Array.isArray(value)) {
    return `a:${value.join(' ')}`;
  }
  const bound = (edge: number | Date): string =>
    edge instanceof Date ? String(edge.getTime()) : String(edge);
  return `r:${bound(value.min)}:${bound(value.max)}`;
}

/**
 * Mirror MAIDR's cursor into the viz as a Tableau mark selection.
 *
 * @param bridge - The selection bridge built at bind time.
 * @param info - The navigation position, or `null` when the cursor left the
 * chart — which clears every bound worksheet, since nothing else signals that
 * the selection ended and a stale highlight would follow the reader to another
 * panel.
 * @returns A promise that settles once the selection (or clear) has been
 * requested. It never rejects: a selection failure disables the layer and
 * clears, and a clear failure is logged.
 */
export function applySelection(
  bridge: SelectionBridge,
  info: NavigationInfo,
): Promise<void> {
  if (info === null) {
    return clearAllSelections(bridge.worksheets.values(), bridge.guard);
  }

  const { layerId } = info;
  const worksheet = bridge.worksheets.get(layerId);
  if (worksheet === undefined || bridge.disabled.has(worksheet.name)) {
    return Promise.resolve();
  }

  // `pointIndices` present means `row` and `col` are both `-1` and name no
  // position: a point cloud's selection is a set of points, not a cell.
  const criteria = info.pointIndices !== undefined
    ? mergePointCriteria(bridge.index.points.get(layerId), info.pointIndices)
    : bridge.index.cells.get(layerId)?.[info.row]?.[info.col] ?? null;

  if (criteria === null || criteria.length === 0) {
    return clearOwnedSelection(bridge, worksheet);
  }

  recordIssued(bridge, worksheet.name, info.pointIndices !== undefined
    ? { layerId, pointIndices: info.pointIndices }
    : { layerId, row: info.row, col: info.col });
  bridge.owned.add(worksheet.name);
  return withGuard(bridge.guard, () =>
    worksheet.selectMarksByValueAsync(criteria, SELECT_REPLACE)).catch(
    (error: unknown) => {
      disableWorksheetSelection(bridge, worksheet.name, criteria, error);
      return clearOwnedSelection(bridge, worksheet);
    },
  );
}

/**
 * Clear one worksheet through the bridge, so the clear is remembered and the
 * worksheet is no longer counted as held.
 *
 * @param bridge - The selection bridge.
 * @param worksheet - The worksheet to clear.
 * @returns A promise that settles once the clear has been requested.
 */
function clearOwnedSelection(bridge: SelectionBridge, worksheet: TableauWorksheet): Promise<void> {
  recordIssued(bridge, worksheet.name, null);
  bridge.owned.delete(worksheet.name);
  return clearSelection(worksheet, bridge.guard);
}

/**
 * Clear every worksheet MAIDR currently holds a selection in, and only those.
 *
 * Used when focus leaves the figure. A worksheet whose selection a user has
 * since replaced with a click of their own is left alone: that click is the
 * one the reader is about to be taken to, and its highlight is the colleague's
 * pointer, not MAIDR's.
 *
 * @param bridge - The selection bridge.
 * @returns A promise that settles once every clear has been requested.
 */
export function clearOwnedSelections(bridge: SelectionBridge): Promise<void> {
  const pending: Promise<void>[] = [];
  const seen = new Set<string>();
  for (const worksheet of bridge.worksheets.values()) {
    if (!bridge.owned.has(worksheet.name) || seen.has(worksheet.name)) {
      continue;
    }
    seen.add(worksheet.name);
    pending.push(clearOwnedSelection(bridge, worksheet));
  }
  return Promise.all(pending).then(() => undefined);
}

/**
 * Remember a selection or clear this bridge issued, for echo detection.
 *
 * @param bridge - The selection bridge.
 * @param worksheet - The worksheet the call went to.
 * @param position - The position selected, or `null` for a clear.
 */
function recordIssued(
  bridge: SelectionBridge,
  worksheet: string,
  position: IssuedPosition | null,
): void {
  bridge.issued.push({ worksheet, position });
  if (bridge.issued.length > MAX_ISSUED_SELECTIONS) {
    bridge.issued.splice(0, bridge.issued.length - MAX_ISSUED_SELECTIONS);
  }
}

/**
 * Whether an incoming event answers something this bridge issued, consuming
 * the entry when it does.
 *
 * The oldest matching entry is the one consumed, since Tableau answers calls
 * in the order they were made. A clear matches a clear; a cell matches the
 * same cell; a point matches any point of a multi-point selection.
 *
 * @param bridge - The selection bridge.
 * @param worksheet - The worksheet the event names, or `null` when it names none.
 * @param target - What the event's marks resolved to.
 * @returns True when the event was an echo.
 */
function takeEcho(
  bridge: SelectionBridge,
  worksheet: string | null,
  target: NavigationTarget | null,
): boolean {
  const index = bridge.issued.findIndex((entry) => {
    if (worksheet !== null && entry.worksheet !== worksheet) {
      return false;
    }
    if (target === null || entry.position === null) {
      return target === null && entry.position === null;
    }
    if (entry.position.layerId !== target.layerId) {
      return false;
    }
    if ('pointIndex' in target) {
      return 'pointIndices' in entry.position
        && entry.position.pointIndices.includes(target.pointIndex);
    }
    return 'row' in entry.position
      && entry.position.row === target.row
      && entry.position.col === target.col;
  });
  if (index === -1) {
    return false;
  }
  bridge.issued.splice(index, 1);
  return true;
}

/**
 * A comparable key for one criteria list, field by field.
 *
 * @param criteria - The criteria addressing one position.
 * @returns A string equal exactly when two lists address the same marks.
 */
function criteriaKey(criteria: readonly TableauSelectionCriteria[]): string {
  return criteria.map(criterion => `${criterion.fieldName}=${valueKey(criterion.value)}`).join('\u0000');
}

/**
 * The key a mark's row would have been given by the extractor, or `null`
 * when the row cannot be addressed the way the index addresses its positions.
 *
 * Spelled exactly as `rowCriteria` in the extractor spells a criterion -- a
 * date as a single-day range, anything else as its category key -- so the two
 * meet. A field the marks table does not carry, or a gap in one, is `null`:
 * a partial key would match a whole band of positions.
 *
 * @param table - The marks table the row is from.
 * @param row - The row.
 * @param fields - The dimension fields the index addresses this layer by.
 * @returns The key, or `null`.
 */
function markKey(
  table: TableauDataTable,
  row: readonly (TableauDataTable['data'][number][number] | undefined)[],
  fields: readonly string[],
): string | null {
  const parts: string[] = [];
  for (const fieldName of fields) {
    const column = table.columns.find(candidate => candidate.fieldName === fieldName);
    if (column === undefined) {
      return null;
    }
    const cell = row[column.index];
    const date = toDateValue(cell);
    if (date !== null) {
      parts.push(`${fieldName}=${valueKey({ min: date, max: date })}`);
      continue;
    }
    const key = toCategoryKey(cell);
    if (key === '') {
      return null;
    }
    parts.push(`${fieldName}=${valueKey(key)}`);
  }
  return parts.join('\u0000');
}

/** A position's key, or the marker for a key two positions share. */
type Resolution = NavigationTarget | 'ambiguous';

/**
 * Every position of one layer, keyed the way {@link markKey} keys a mark.
 *
 * @param index - The selection index.
 * @param layerId - The layer.
 * @returns The positions by key, and the fields the keys are built from; or
 * `null` when the layer has no addressable position at all.
 */
function positionsOfLayer(
  index: SelectionIndex,
  layerId: string,
): { fields: readonly string[]; positions: Map<string, Resolution> } | null {
  const positions = new Map<string, Resolution>();
  let fields: readonly string[] | null = null;

  const record = (criteria: readonly TableauSelectionCriteria[] | null, target: NavigationTarget): void => {
    if (criteria === null || criteria.length === 0) {
      return;
    }
    fields ??= criteria.map(criterion => criterion.fieldName);
    const key = criteriaKey(criteria);
    positions.set(key, positions.has(key) ? 'ambiguous' : target);
  };

  const cells = index.cells.get(layerId);
  if (cells !== undefined) {
    cells.forEach((cellRow, row) => {
      cellRow.forEach((criteria, col) => record(criteria, { layerId, row, col }));
    });
  }
  const points = index.points.get(layerId);
  if (points !== undefined) {
    points.forEach((criteria, pointIndex) => record(criteria, { layerId, pointIndex }));
  }

  return fields === null ? null : { fields, positions };
}

/**
 * The one position a set of selected marks was read from, or `null`.
 *
 * Every layer built from the named worksheet is tried -- every layer at all
 * when the event names none -- and every selected mark is resolved against it.
 * The answer is a position only when all of the marks resolve to the same one:
 * a multi-mark selection that spans several positions names no single place
 * to land, and an ambiguous mark names two.
 *
 * @param index - The selection index of the mounted read.
 * @param marks - The marks the selection covers.
 * @param worksheetName - The worksheet the event names, or `null`.
 * @returns The position, or `null` when the marks name none exactly.
 */
export function positionOfMarks(
  index: SelectionIndex,
  marks: TableauMarksCollection,
  worksheetName: string | null,
): NavigationTarget | null {
  let found: NavigationTarget | null = null;
  let foundKey: string | null = null;

  for (const [layerId, name] of index.worksheets) {
    if (worksheetName !== null && name !== worksheetName) {
      continue;
    }
    const layer = positionsOfLayer(index, layerId);
    if (layer === null) {
      continue;
    }
    for (const table of marks.data) {
      for (const row of table.data) {
        const key = markKey(table, row, layer.fields);
        if (key === null) {
          continue;
        }
        const resolution = layer.positions.get(key);
        if (resolution === undefined) {
          continue;
        }
        if (resolution === 'ambiguous') {
          return null;
        }
        const resolvedKey = `${layerId}\u0000${key}`;
        if (foundKey !== null && foundKey !== resolvedKey) {
          return null;
        }
        found = resolution;
        foundKey = resolvedKey;
      }
    }
  }
  return found;
}

/**
 * Whether an event's `detail` is a mark-selection payload this module can read.
 *
 * @param detail - `event.detail`, whatever the host put there.
 * @returns True when it carries `getMarksAsync`.
 */
export function isMarksSelectedEvent(detail: unknown): detail is TableauMarksSelectedEvent {
  return detail !== null
    && typeof detail === 'object'
    && typeof (detail as TableauMarksSelectedEvent).getMarksAsync === 'function';
}

/**
 * Follow a change of selection in the viz with MAIDR's cursor.
 *
 * The marks the selection now covers are fetched and resolved to the position
 * they were read from ({@link positionOfMarks}). An event that answers a
 * selection or clear this bridge issued is consumed as an echo and changes
 * nothing. Anything else is a user's doing, and the worksheet is no longer
 * counted as one MAIDR holds a selection in -- the click replaced it. A
 * position is handed to `navigate`; no position (nothing selected, or marks no
 * position names exactly) withdraws a target the chart may still be holding,
 * since it no longer describes what is selected.
 *
 * @param bridge - The selection bridge of the mounted read.
 * @param detail - The event's payload.
 * @param navigate - Moves the chart's cursor, or keeps the target for the
 * next focus-in; `null` withdraws a kept target. Returns whether the chart
 * accepted it.
 * @returns What was done with the event. Never rejects: a marks fetch that
 * fails is logged and read as an event that resolved to nothing an echo.
 */
export async function handleMarkSelection(
  bridge: SelectionBridge,
  detail: TableauMarksSelectedEvent,
  navigate: (target: NavigationTarget | null) => boolean,
): Promise<MarkSelectionOutcome> {
  const worksheetName = typeof detail.worksheet?.name === 'string' ? detail.worksheet.name : null;
  let marks: TableauMarksCollection;
  try {
    marks = await detail.getMarksAsync();
  } catch (error: unknown) {
    console.warn(
      `${ADAPTER_PREFIX} could not read the marks a selection covers; `
      + `the cursor stays where it is.`,
      error,
    );
    return 'refused';
  }
  const tables = Array.isArray(marks?.data) ? marks.data : [];
  const target = positionOfMarks(bridge.index, { data: tables }, worksheetName);

  // The flag catches an echo that arrives before the issuing call has settled;
  // the ring catches the ones that arrive after. Both are consulted so an
  // entry the flag answered for does not linger to swallow a later click.
  const echoed = takeEcho(bridge, worksheetName, target);
  if (echoed || bridge.guard.programmatic) {
    return 'echo';
  }

  if (target === null) {
    if (worksheetName !== null) {
      bridge.owned.delete(worksheetName);
    }
    navigate(null);
    return tables.every(table => table.data.length === 0) ? 'cleared' : 'unresolved';
  }

  const worksheet = bridge.worksheets.get(target.layerId);
  if (worksheet !== undefined) {
    bridge.owned.delete(worksheet.name);
  }
  return navigate(target) ? 'navigated' : 'refused';
}

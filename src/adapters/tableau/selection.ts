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
 */

import type { NavigateCallback } from '../../type/grammar';
import type { SelectionIndex } from './extractor';
import type { TableauSelectionCriteria, TableauWorksheet } from './types';

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
  /** Layers whose selection has been permanently disabled by a rejection. */
  readonly disabled: Set<string>;
}

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
 * Disable a layer's selection after a rejection, once and for good.
 *
 * `selectMarksByValueAsync` rejects on an invalid field name or an invalid
 * value, and neither becomes valid by being retried — a wrong `fieldName` is
 * wrong on every navigation step, so an un-latched adapter would log once per
 * arrow key. Guessing a different field to try instead is worse still: it would
 * highlight marks chosen by the adapter rather than by the data.
 *
 * @param bridge - The selection bridge.
 * @param layerId - The layer whose selection failed.
 * @param worksheetName - The worksheet, for the message.
 * @param criteria - The criteria that were rejected, for the message.
 * @param error - The rejection.
 */
function disableLayer(
  bridge: SelectionBridge,
  layerId: string,
  worksheetName: string,
  criteria: readonly TableauSelectionCriteria[],
  error: unknown,
): void {
  if (bridge.disabled.has(layerId)) {
    return;
  }
  bridge.disabled.add(layerId);
  const fields = criteria.map(criterion => `"${criterion.fieldName}"`).join(', ');
  console.warn(
    `${ADAPTER_PREFIX} could not select marks in worksheet "${worksheetName}" `
    + `by ${fields}; mark selection is now disabled for this layer. `
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
 * Used on blur and on dispose, so the adapter never leaves a selection behind
 * in a workbook it no longer drives.
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
  if (worksheet === undefined || bridge.disabled.has(layerId)) {
    return Promise.resolve();
  }

  // `pointIndices` present means `row` and `col` are both `-1` and name no
  // position: a point cloud's selection is a set of points, not a cell.
  const criteria = info.pointIndices !== undefined
    ? mergePointCriteria(bridge.index.points.get(layerId), info.pointIndices)
    : bridge.index.cells.get(layerId)?.[info.row]?.[info.col] ?? null;

  if (criteria === null || criteria.length === 0) {
    return clearSelection(worksheet, bridge.guard);
  }

  return withGuard(bridge.guard, () =>
    worksheet.selectMarksByValueAsync(criteria, SELECT_REPLACE)).catch(
    (error: unknown) => {
      disableLayer(bridge, layerId, worksheet.name, criteria, error);
      return clearSelection(worksheet, bridge.guard);
    },
  );
}

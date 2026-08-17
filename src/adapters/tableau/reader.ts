/**
 * The only module in the Tableau adapter that awaits Tableau.
 *
 * Everything downstream — classification, trace-type inference, layer
 * construction, selection criteria — is pure and works off the
 * {@link WorksheetSnapshot} this file produces. That split is what lets the
 * extractor be tested with plain object mocks, and what will let a future
 * Dashboard Extensions binder reuse the whole pipeline unchanged: the
 * Extensions `Worksheet` satisfies the same structural interface.
 *
 * Three documented traps drive the shape of the code here:
 *
 * 1. **Column order.** `DataTableReader` sorts its columns alphabetically;
 *    `getSummaryColumnsInfoAsync` is in view order. Rows are remapped once, on
 *    the way out, so every index downstream is a view index.
 * 2. **One reader at a time.** "Only one active `DataTableReader` for summary
 *    data is supported", and a released reader throws on further use. Reads are
 *    serialized through {@link enqueueTableauRead}, and `releaseAsync` runs in
 *    a `finally` on every path.
 * 3. **`ignoreSelection` is undecidable.** Its documented description is the
 *    inverse of its name on both API surfaces, so the adapter never passes it —
 *    {@link TableauGetSummaryDataOptions} does not even declare it. The binder
 *    clears the selection before a re-read instead. The only option passed is
 *    `{ maxRows: 0 }`, meaning all rows.
 */

import type {
  TableauColumn,
  TableauDataTableReader,
  TableauRow,
  TableauVisualSpecification,
  TableauWorksheet,
  WorksheetSnapshot,
} from './types';
import { buildIndexMap, remapRow } from './fields';

const ADAPTER = 'tableau';

/**
 * Log an adapter-prefixed warning.
 *
 * @param message - What went wrong, and what the adapter did about it.
 * @param error - The underlying error, when there is one.
 */
function warn(message: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`[MAIDR ${ADAPTER}] ${message}`);
  } else {
    console.warn(`[MAIDR ${ADAPTER}] ${message}`, error);
  }
}

/**
 * Tail of the serial read queue. Always settled-or-pending, never rejected:
 * every task's outcome is absorbed before it becomes the next task's gate.
 */
let readQueue: Promise<unknown> = Promise.resolve();

/**
 * Run a task with exclusive access to Tableau's summary-data reader.
 *
 * Tableau supports only one active `DataTableReader` for summary data, so a
 * filter storm that fires several change events must not open a second one
 * while the first is still paginating. Tasks run in the order they were
 * enqueued, and a task that throws does not stall the ones behind it.
 *
 * Exported so the binder shares this one queue rather than starting a second:
 * its pre-read `clearSelectedMarksAsync` has to land before the reads it is
 * meant to precede.
 *
 * **Not re-entrant.** The queue is a strict serial chain, so calling this from
 * inside a task that is already running on it waits forever. The binder
 * enqueues its clear as its own task and then calls {@link readWorksheet},
 * which enqueues itself — it never wraps the two together.
 *
 * @param task - The work to run while holding the queue.
 * @returns Whatever the task resolves to; rejects with whatever it throws.
 */
export function enqueueTableauRead<T>(task: () => Promise<T>): Promise<T> {
  const run = readQueue.then(task, task);
  readQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Page through a worksheet's summary data and return its rows in view order.
 *
 * Must be called while holding the read queue.
 *
 * @param worksheet - The worksheet to read.
 * @param viewColumns - Its columns in view order.
 * @returns Every row, remapped into view order.
 */
async function readRows(
  worksheet: TableauWorksheet,
  viewColumns: readonly TableauColumn[],
): Promise<TableauRow[]> {
  const reader: TableauDataTableReader = await worksheet.getSummaryDataReaderAsync(
    undefined,
    { maxRows: 0 },
  );

  try {
    const rows: TableauRow[] = [];
    const pageCount = Number.isFinite(reader.pageCount) ? reader.pageCount : 0;
    // Column order is a property of the reader, not of a page, so the map is
    // built once from the first page and reused for the rest.
    let indexMap: number[] | null = null;

    for (let page = 0; page < pageCount; page++) {
      const table = await reader.getPageAsync(page);
      if (indexMap === null) {
        indexMap = buildIndexMap(viewColumns, table.columns);
      }
      for (const row of table.data) {
        rows.push(remapRow(row, indexMap));
      }
    }

    return rows;
  } finally {
    // Never let a release failure replace the error that got us here: a leaked
    // reader blocks every later read, so the failure is reported, not thrown.
    await reader.releaseAsync().catch((error: unknown) => {
      warn(`failed to release the summary data reader for "${worksheet.name}".`, error);
    });
  }
}

/**
 * Read the worksheet's visual specification, when the host has one.
 *
 * `getVisualSpecificationAsync` is declared on **both** public `Worksheet`
 * interfaces — Embedding and Extensions — and is implemented by the Embedding
 * API's own `Worksheet` class, so on a current library it is simply there and
 * mark-type classification is live. It is nonetheless feature-detected, because
 * what the contract declares and what the host loaded are different facts: the
 * page picks its own Embedding build, and an older one predates the method. The
 * Extensions declaration carries `@since 1.11.0 and Tableau 2024.1`; the
 * Embedding declaration carries no `@since` at all, so there is no version
 * floor to test against — only the method's presence.
 *
 * The `catch` below covers the other half: a current library talking to an
 * older Tableau Server can have the method and still be refused at runtime.
 * Either way the extractor falls back to its heuristic ladder.
 *
 * @param worksheet - The worksheet to inspect.
 * @returns The specification, or `undefined` when unavailable or unreadable.
 */
async function readVisualSpecification(
  worksheet: TableauWorksheet,
): Promise<TableauVisualSpecification | undefined> {
  // Always a function as far as the declarations are concerned, and still worth
  // asking at runtime: this is the check that reads an older library build.
  const getSpec = worksheet.getVisualSpecificationAsync;
  if (typeof getSpec !== 'function') {
    return undefined;
  }

  try {
    return await getSpec.call(worksheet);
  } catch (error) {
    // A spec is evidence, not a requirement. Losing it costs the mark type,
    // which the ladder can stand in for; throwing would cost the whole figure.
    warn(
      `could not read the visual specification for "${worksheet.name}"; `
      + `falling back to the heuristics.`,
      error,
    );
    return undefined;
  }
}

/**
 * Read everything one worksheet contributes to the figure.
 *
 * The column info call is made first and outside the queue — it opens no
 * reader — so the view order is known before any pagination starts.
 *
 * @param worksheet - The worksheet to read.
 * @returns A snapshot: name, view-order columns, view-order rows, and the
 * visual specification when the host exposes one.
 * @throws Whatever `getSummaryColumnsInfoAsync` or `getPageAsync` throws. The
 * reader is always released first; the caller decides whether a failed read
 * means keeping the previous figure.
 */
export async function readWorksheet(
  worksheet: TableauWorksheet,
): Promise<WorksheetSnapshot> {
  const columns = await worksheet.getSummaryColumnsInfoAsync();
  const rows = await enqueueTableauRead(() => readRows(worksheet, columns));
  const spec = await readVisualSpecification(worksheet);

  return { name: worksheet.name, columns, rows, spec };
}

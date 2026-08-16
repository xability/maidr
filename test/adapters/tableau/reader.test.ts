import { readWorksheet } from '@adapters/tableau/reader';
import { fakeColumn, fakeWorksheet } from './helpers';

/**
 * A promise a test can settle on demand.
 *
 * Used to hold a worksheet's first page open while a second read is started,
 * which is the only way to observe whether the two overlap.
 *
 * @returns The promise and the function that resolves it.
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((settle) => {
    resolve = (): void => settle();
  });
  return { promise, resolve };
}

/**
 * The columns every worksheet in this file reports, in view order.
 *
 * The names are chosen so that view order and alphabetical order **disagree**:
 * `'SUM(Sales)'` sorts before `'Zone'`, so `fakeDataTable` serves the measure
 * first while `getSummaryColumnsInfoAsync` reports the dimension first. Every
 * assertion below that reads `row[0]` as the zone and `row[1]` as the measure
 * therefore fails unless the reader really applies its index map — with an
 * already-alphabetical fixture the remap would be the identity and prove
 * nothing.
 */
const columns = [
  fakeColumn('Zone', 'string', 0),
  fakeColumn('SUM(Sales)', 'float', 1),
];

describe('tableau worksheet reader', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('concatenates every page in page order, remapped into view order', async () => {
    const worksheet = fakeWorksheet({
      name: 'Sales',
      columns,
      rows: [
        ['Chairs', 1],
        ['Tables', 2],
        ['Phones', 3],
        ['Copiers', 4],
        ['Binders', 5],
      ],
      pageSize: 2,
    });

    const snapshot = await readWorksheet(worksheet);

    expect(snapshot.name).toBe('Sales');
    expect(snapshot.rows).toHaveLength(5);
    // View order, not the alphabetical order the reader's own columns are in:
    // the table serves `SUM(Sales)` first, and these come back as the zones.
    expect(snapshot.rows.map(row => row[0]?.nativeValue)).toEqual([
      'Chairs',
      'Tables',
      'Phones',
      'Copiers',
      'Binders',
    ]);
    expect(snapshot.rows.map(row => row[1]?.nativeValue)).toEqual([1, 2, 3, 4, 5]);
    expect(worksheet.calls.log).toEqual([
      'columns:Sales',
      'open:Sales',
      'page:Sales:0',
      'page:Sales:1',
      'page:Sales:2',
      'release:Sales',
    ]);
  });

  it('asks for all rows and nothing else, leaving the page size at the default', async () => {
    const worksheet = fakeWorksheet({ columns, rows: [['Chairs', 1]] });

    await readWorksheet(worksheet);

    // `ignoreSelection` is documented backwards on both API surfaces, so it is
    // never passed — the binder clears the selection before a read instead.
    expect(worksheet.calls.readers).toEqual([
      { pageRowCount: undefined, options: { maxRows: 0 } },
    ]);
  });

  it('releases the reader even when a page rejects, and reports the page error', async () => {
    const worksheet = fakeWorksheet({
      name: 'Sales',
      columns,
      rows: [['Chairs', 1], ['Tables', 2]],
      pageSize: 1,
      failPage: 1,
      pageError: new Error('boom'),
    });

    await expect(readWorksheet(worksheet)).rejects.toThrow('boom');

    // A leaked reader would block every later read: only one is supported.
    expect(worksheet.calls.releases).toBe(1);
    expect(worksheet.calls.log).toContain('release:Sales');
  });

  it('never lets a release failure replace the error that caused it', async () => {
    const worksheet = fakeWorksheet({
      columns,
      rows: [['Chairs', 1]],
      failPage: 0,
      pageError: new Error('boom'),
      failRelease: true,
    });

    await expect(readWorksheet(worksheet)).rejects.toThrow('boom');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to release'),
      expect.anything(),
    );
  });

  it('still returns the rows when only the release fails', async () => {
    const worksheet = fakeWorksheet({
      columns,
      rows: [['Chairs', 1]],
      failRelease: true,
    });

    const snapshot = await readWorksheet(worksheet);

    expect(snapshot.rows).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent reads, opening the second reader only after the first is released', async () => {
    const log: string[] = [];
    const gate = deferred();
    const first = fakeWorksheet({
      name: 'A',
      columns,
      rows: [['Chairs', 1]],
      log,
      holdFirstPage: gate.promise,
    });
    const second = fakeWorksheet({ name: 'B', columns, rows: [['Tables', 2]], log });

    const both = Promise.all([readWorksheet(first), readWorksheet(second)]);
    gate.resolve();
    await both;

    // Only one active `DataTableReader` for summary data is supported, so B's
    // reader must not exist while A's is still paginating.
    expect(log.filter(entry => /^(?:open|release):/.test(entry))).toEqual([
      'open:A',
      'release:A',
      'open:B',
      'release:B',
    ]);
  });

  it('reports no visual specification when the host has no such method', async () => {
    const worksheet = fakeWorksheet({ columns, rows: [['Chairs', 1]] });

    expect(worksheet.getVisualSpecificationAsync).toBeUndefined();

    const snapshot = await readWorksheet(worksheet);

    expect(snapshot.spec).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('carries the visual specification through when the host does expose one', async () => {
    const worksheet = fakeWorksheet({
      columns,
      rows: [['Chairs', 1]],
      spec: { marksSpecifications: [{ primitiveType: 'bar' }] },
    });

    const snapshot = await readWorksheet(worksheet);

    expect(snapshot.spec).toEqual({ marksSpecifications: [{ primitiveType: 'bar' }] });
  });

  it('degrades to no specification, with one warning, when reading it throws', async () => {
    const worksheet = fakeWorksheet({
      columns,
      rows: [['Chairs', 1]],
      specError: new Error('not supported'),
    });

    const snapshot = await readWorksheet(worksheet);

    // A spec is evidence, not a requirement: losing it costs the mark type,
    // which the heuristic ladder stands in for.
    expect(snapshot.spec).toBeUndefined();
    expect(snapshot.rows).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reads an empty worksheet as no rows, still opening and releasing a reader', async () => {
    const worksheet = fakeWorksheet({ name: 'Empty', columns, rows: [] });

    const snapshot = await readWorksheet(worksheet);

    expect(snapshot.rows).toEqual([]);
    expect(worksheet.calls.log).toEqual(['columns:Empty', 'open:Empty', 'release:Empty']);
  });
});

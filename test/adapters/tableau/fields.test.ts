import {
  buildIndexMap,
  classifyColumns,
  remapRow,
  toCategoryKey,
  toDateValue,
  toFiniteNumber,
} from '@adapters/tableau/fields';
import { fakeColumn, fakeDataTable, fakeValue } from './helpers';

describe('tableau column classification', () => {
  it('reads an aggregated numeric as a measure captioned by the wrapped field', () => {
    const { measures, dimensions } = classifyColumns([
      fakeColumn('SUM(Sales)', 'float', 0),
    ]);

    expect(dimensions).toHaveLength(0);
    expect(measures).toHaveLength(1);
    expect(measures[0]).toMatchObject({
      role: 'measure',
      caption: 'Sales',
      agg: 'SUM',
      numeric: true,
      temporal: false,
      viewIndex: 0,
    });
  });

  it('matches the aggregation wrapper case-insensitively', () => {
    const { measures } = classifyColumns([fakeColumn('Sum(Sales)', 'float', 0)]);

    expect(measures[0].caption).toBe('Sales');
    expect(measures[0].agg).toBe('Sum');
  });

  it('reads a date part as a temporal dimension that keeps its wrapper', () => {
    // `int` on purpose: a date part is a category even though the value Tableau
    // hands back is a number, so this proves the date-part rung is tested
    // before the bare-numeric one.
    const { dimensions, measures } = classifyColumns([
      fakeColumn('YEAR(Order Date)', 'int', 0),
    ]);

    expect(measures).toHaveLength(0);
    expect(dimensions[0]).toMatchObject({
      role: 'dimension',
      caption: 'YEAR(Order Date)',
      temporal: true,
    });
  });

  it('still reads a non-English aggregation as a measure, losing only the caption', () => {
    // `fieldName` is documented as not stable across languages, so `SOMME` is
    // not a wrapper this adapter knows. `dataType` is the backstop: the role
    // survives, the caption keeps the wrapper.
    const { measures } = classifyColumns([fakeColumn('SOMME(Ventes)', 'float', 0)]);

    expect(measures).toHaveLength(1);
    expect(measures[0].caption).toBe('SOMME(Ventes)');
    expect(measures[0].agg).toBeUndefined();
  });

  it('reads a bare numeric column as a measure', () => {
    const { measures } = classifyColumns([fakeColumn('Profit Ratio', 'float', 0)]);

    expect(measures[0]).toMatchObject({ role: 'measure', caption: 'Profit Ratio' });
    expect(measures[0].agg).toBeUndefined();
  });

  it('reads a string column as a dimension', () => {
    const { dimensions } = classifyColumns([fakeColumn('Category', 'string', 0)]);

    expect(dimensions[0]).toMatchObject({
      role: 'dimension',
      caption: 'Category',
      numeric: false,
      temporal: false,
    });
  });

  it('reads an unwrapped date column as a temporal dimension', () => {
    const { dimensions } = classifyColumns([fakeColumn('Order Date', 'date-time', 0)]);

    expect(dimensions[0]).toMatchObject({ role: 'dimension', temporal: true });
  });

  it('drops spatial and unknown columns, which carry nothing sonifiable', () => {
    const { columns } = classifyColumns([
      fakeColumn('Geometry', 'spatial', 0),
      fakeColumn('Mystery', 'unknown', 1),
    ]);

    expect(columns).toHaveLength(0);
  });

  it('drops a column the visualization does not reference', () => {
    const { columns } = classifyColumns([
      fakeColumn('Tooltip Only', 'string', 0, { isReferenced: false }),
      fakeColumn('Category', 'string', 1, { isReferenced: true }),
    ]);

    expect(columns.map(column => column.column.fieldName)).toEqual(['Category']);
  });

  it('keeps viewIndex pointing at the original position when a column is dropped', () => {
    const { dimensions, measures } = classifyColumns([
      fakeColumn('Geometry', 'spatial', 0),
      fakeColumn('Category', 'string', 1),
      fakeColumn('SUM(Sales)', 'float', 2),
    ]);

    expect(dimensions[0].viewIndex).toBe(1);
    expect(measures[0].viewIndex).toBe(2);
  });
});

describe('tableau view↔alphabetical column remap', () => {
  const viewColumns = [
    fakeColumn('Region', 'string', 0),
    fakeColumn('SUM(Sales)', 'float', 1),
    fakeColumn('Category', 'string', 2),
  ];

  it('recovers view order from an alphabetically sorted data table', () => {
    const table = fakeDataTable(viewColumns, [['West', 42, 'Chairs']]);

    // The fake sorts as a real `DataTableReader` does, so the table is nothing
    // like view order until the map is applied.
    expect(table.columns.map(column => column.fieldName)).toEqual([
      'Category',
      'Region',
      'SUM(Sales)',
    ]);

    const indexMap = buildIndexMap(viewColumns, table.columns);
    expect(indexMap).toEqual([1, 2, 0]);

    const row = remapRow(table.data[0], indexMap);
    expect(row.map(cell => cell?.nativeValue)).toEqual(['West', 42, 'Chairs']);
  });

  it('falls back to fieldName when the table reports no matching fieldId', () => {
    const table = fakeDataTable(
      [
        fakeColumn('Region', 'string', 0, { fieldId: 'renamed-region' }),
        fakeColumn('SUM(Sales)', 'float', 1, { fieldId: 'renamed-sales' }),
      ],
      [['West', 42]],
    );

    const indexMap = buildIndexMap(viewColumns.slice(0, 2), table.columns);

    expect(indexMap).toEqual([0, 1]);
  });

  it('reads an unmatched view column as a gap instead of shifting the row', () => {
    const table = fakeDataTable([viewColumns[0], viewColumns[1]], [['West', 42]]);

    const indexMap = buildIndexMap(viewColumns, table.columns);
    expect(indexMap).toEqual([0, 1, -1]);

    const row = remapRow(table.data[0], indexMap);
    expect(row[2]).toBeUndefined();
    expect(row[0]?.nativeValue).toBe('West');
  });
});

describe('tableau value coercion', () => {
  it('reads a numeric cell, and a numeric string, as a number', () => {
    expect(toFiniteNumber(fakeValue(42))).toBe(42);
    expect(toFiniteNumber(fakeValue('42.5'))).toBe(42.5);
  });

  it('reads every kind of gap as null rather than as a zero', () => {
    // A zero is a bar the viz drew at the baseline. Inventing one would put a
    // mark where the view has none.
    expect(toFiniteNumber(fakeValue(null))).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber(fakeValue(Number.NaN))).toBeNull();
    expect(toFiniteNumber(fakeValue('Chairs'))).toBeNull();
  });

  it('does not read a date as its epoch milliseconds', () => {
    expect(toFiniteNumber(fakeValue(new Date('2021-03-04T00:00:00Z')))).toBeNull();
  });

  it('prefers the worksheet formatting for a category key', () => {
    expect(toCategoryKey(fakeValue(1234.5, '$1,234.50'))).toBe('$1,234.50');
    expect(toCategoryKey(fakeValue('Chairs'))).toBe('Chairs');
  });

  it('reads a gap as the empty string, never as the word null', () => {
    expect(toCategoryKey(fakeValue(null))).toBe('');
    expect(toCategoryKey(undefined)).toBe('');
  });

  it('renders an unformatted date as an ISO stamp, not a locale string', () => {
    expect(toCategoryKey(fakeValue(new Date('2021-03-04T00:00:00Z')))).toBe(
      '2021-03-04T00:00:00.000Z',
    );
  });

  it('accepts only a real Date as a date, never a parsed string', () => {
    const date = new Date('2021-03-04T00:00:00Z');

    expect(toDateValue(fakeValue(date))).toBe(date);
    expect(toDateValue(fakeValue('2021-03-04'))).toBeNull();
    expect(toDateValue(fakeValue(new Date('nonsense')))).toBeNull();
  });
});

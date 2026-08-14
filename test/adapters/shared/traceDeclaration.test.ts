import type { MaidrTraceDeclaration } from '@type/declaration';
import {
  FIELD_REF_FALLBACKS,
  isCensoredValue,
  resolveFieldRef,
  validateDeclaration,
} from '@adapters/shared/traceDeclaration';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

/** Context every warning in this suite is raised against. */
const CONTEXT = { adapter: 'Highcharts', seriesRef: 'series "sales"' };

/** Captures `console.warn` so the warning contract can be asserted on. */
let warnings: string[];

beforeEach(() => {
  warnings = [];
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('resolveFieldRef — an explicit ref is used verbatim', () => {
  test('an explicit ref reads the field it names', () => {
    expect(resolveFieldRef({ ciLow: 3, yMin: 9 }, 'ciLow', 'yMin')).toBe(3);
  });

  test('an explicit ref that misses resolves to nothing, with NO fallback', () => {
    // `lower` is a `yMin` fallback and the row carries it, but the author
    // named `ciLow`. Papering over the miss would announce a bound the author
    // did not point at; the caller warns about it instead.
    expect(resolveFieldRef({ lower: 3 }, 'ciLow', 'yMin')).toBeUndefined();
  });

  test('an explicit ref does not fall back to the canonical name either', () => {
    expect(resolveFieldRef({ yMin: 3 }, 'ciLow', 'yMin')).toBeUndefined();
  });
});

describe('resolveFieldRef — the defaulted path walks the fallback chain', () => {
  test('the canonical name wins over every fallback', () => {
    expect(resolveFieldRef({ yMin: 1, lower: 2, lo: 3 }, undefined, 'yMin')).toBe(1);
  });

  test('an earlier fallback wins over a later one', () => {
    // `lower` precedes `min` in the chain.
    expect(resolveFieldRef({ min: 2, lower: 1 }, undefined, 'yMin')).toBe(1);
  });

  test.each(
    Object.entries(FIELD_REF_FALLBACKS).flatMap(([canonical, alternatives]) =>
      alternatives.map(alternative => [canonical, alternative] as const),
    ),
  )('%s resolves from a row carrying only `%s`', (canonical, alternative) => {
    expect(resolveFieldRef({ [alternative]: 'read' }, undefined, canonical)).toBe('read');
  });

  test('a canonical name with no chain resolves under its own name only', () => {
    expect(FIELD_REF_FALLBACKS.width).toBeUndefined();
    expect(resolveFieldRef({ width: 0.25 }, undefined, 'width')).toBe(0.25);
    expect(resolveFieldRef({ share: 0.25 }, undefined, 'width')).toBeUndefined();
  });

  test('nothing resolving yields undefined rather than a placeholder', () => {
    expect(resolveFieldRef({ estimate: 4 }, undefined, 'weight')).toBeUndefined();
  });

  test.each([
    ['zero', 0],
    ['an empty string', ''],
    ['false', false],
    ['null', null],
  ])('%s is a present value and stops the walk', (_label, present) => {
    expect(resolveFieldRef({ weight: present, w: 0.5 }, undefined, 'weight')).toBe(present);
  });

  test('an array is a row, so a d3-hexbin bin reads its own length as the count', () => {
    const bin = Object.assign([{ x: 1 }, { x: 2 }, { x: 3 }], { x: 1, y: 2 });
    expect(resolveFieldRef(bin as unknown as Record<string, unknown>, undefined, 'count')).toBe(3);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not a row'],
    ['a number', 7],
  ])('%s is not a row and resolves to undefined', (_label, row) => {
    const notARow = row as unknown as Record<string, unknown> | undefined;
    expect(resolveFieldRef(notARow, undefined, 'yMin')).toBeUndefined();
    expect(resolveFieldRef(notARow, 'yMin', 'yMin')).toBeUndefined();
  });
});

describe('isCensoredValue — the truth table, read strictly', () => {
  test.each([
    ['the boolean true', true],
    ['the number 1', 1],
    ['the string "1"', '1'],
    ['the string "true"', 'true'],
  ])('%s marks a censored observation', (_label, value) => {
    expect(isCensoredValue(value)).toBe(true);
  });

  test.each([
    ['the boolean false', false],
    ['the number 0', 0],
    // Truthy in JavaScript and censors nobody — the reason for reading
    // strictly rather than by truthiness.
    ['the string "0"', '0'],
    ['the string "yes"', 'yes'],
    ['the string "TRUE"', 'TRUE'],
    ['the string "True"', 'True'],
    ['the number 2', 2],
    ['undefined', undefined],
    ['null', null],
    ['an object', {}],
  ])('%s does not', (_label, value) => {
    expect(isCensoredValue(value)).toBe(false);
  });
});

describe('validateDeclaration — a block that is not one', () => {
  test.each([
    ['undefined', undefined],
    ['null', null],
  ])('%s is no declaration and passes quietly', (_label, raw) => {
    expect(validateDeclaration(raw, CONTEXT)).toBeNull();
    expect(warnings).toEqual([]);
  });

  test.each([
    ['a string', 'survival'],
    ['a number', 3],
    ['an array', [{ type: TraceType.SURVIVAL }]],
  ])('%s is rejected loudly', (_label, raw) => {
    expect(validateDeclaration(raw, CONTEXT)).toBeNull();
    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration on series "sales" is not an object; ignored.',
    ]);
  });
});

describe('validateDeclaration — the type must name a declarable trace', () => {
  test('a block with no type is rejected, naming the series', () => {
    expect(validateDeclaration({ censored: 'cens' }, CONTEXT)).toBeNull();
    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration on series "sales" has unknown type '
      + '"undefined"; reading it as the undeclared chart.',
    ]);
  });

  test('a misspelt type is rejected, quoting what was written', () => {
    expect(validateDeclaration({ type: 'survivl' }, CONTEXT)).toBeNull();
    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration on series "sales" has unknown type '
      + '"survivl"; reading it as the undeclared chart.',
    ]);
  });

  test('a non-string type is rejected rather than coerced', () => {
    expect(validateDeclaration({ type: 3 }, CONTEXT)).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('has unknown type "3"');
  });

  test('a real TraceType with no declaration variant is rejected too', () => {
    // `bar` is a trace type, but there is nothing to declare about one, so it
    // is unknown in the only sense this file has.
    expect(validateDeclaration({ type: TraceType.BAR }, CONTEXT)).toBeNull();
    expect(warnings[0]).toContain('has unknown type "bar"');
  });

  test('the two surprising spellings are the ones that are accepted', () => {
    expect(validateDeclaration({ type: 'point' }, CONTEXT)).not.toBeNull();
    expect(validateDeclaration({ type: 'parallel_coordinates', dimensions: ['mpg'] }, CONTEXT))
      .not
      .toBeNull();
    expect(validateDeclaration({ type: 'scatter' }, CONTEXT)).toBeNull();
    expect(validateDeclaration({ type: 'parallel' }, CONTEXT)).toBeNull();
  });
});

/**
 * One fully-populated block per variant: every key the variant accepts, so a
 * key set that lost a field shows up as a spurious warning rather than as
 * silence.
 */
const FULL_DECLARATIONS: readonly MaidrTraceDeclaration[] = [
  {
    type: TraceType.SURVIVAL,
    title: 'Overall survival',
    name: 'Treated',
    censored: 'cens',
    yMin: 'lo',
    yMax: 'hi',
    stepDirection: 'hv',
    censoredSeries: 'ticks',
    bandSeries: 'band',
  },
  {
    type: TraceType.ERROR_BAR,
    title: 't',
    name: 'n',
    yMin: 'lo',
    yMax: 'hi',
    error: 'se',
    intervalSeries: 'whiskers',
    orientation: Orientation.HORIZONTAL,
  },
  {
    type: TraceType.FOREST,
    title: 't',
    name: 'n',
    yMin: 'lo',
    yMax: 'hi',
    error: 'se',
    intervalSeries: 'whiskers',
    orientation: Orientation.HORIZONTAL,
    weight: 'w',
    pooled: 'isPooled',
    pooledIndex: 12,
    pooledSeries: 'diamond',
    nullValue: 1,
  },
  {
    type: TraceType.MANHATTAN,
    title: 't',
    name: 'n',
    label: 'snp',
    group: 'chr',
    significance: 7.3,
    significanceDirection: 'above',
    effect: 1,
    merge: true,
  },
  {
    type: TraceType.VOLCANO,
    title: 't',
    name: 'n',
    label: 'gene',
    group: 'direction',
    significance: 1.3,
    significanceDirection: 'below',
    effect: 1,
    merge: false,
  },
  { type: TraceType.SCATTER, title: 't', name: 'n', label: 'id', merge: false },
  { type: TraceType.ALLUVIAL, title: 't', name: 'n' },
  { type: TraceType.MOSAIC, title: 't', name: 'n', width: 'share', count: 'n' },
  {
    type: TraceType.CHOROPLETH,
    title: 't',
    name: 'n',
    region: 'state',
    value: 'rate',
    lon: 'longitude',
    lat: 'latitude',
  },
  {
    type: TraceType.PARALLEL,
    title: 't',
    name: 'n',
    dimensions: ['mpg', { label: 'Weight (lb)', key: 'wt' }],
    label: 'car',
  },
  {
    type: TraceType.RIDGELINE,
    title: 't',
    name: 'n',
    group: 'month',
    value: 'temp',
    density: 'kde',
  },
  {
    type: TraceType.HEXBIN,
    title: 't',
    name: 'n',
    x: 'cx',
    y: 'cy',
    count: 'n',
    row: 'lattice',
  },
  {
    type: TraceType.BOXEN,
    title: 't',
    name: 'n',
    x: 'species',
    median: 'q2',
    levels: 'letterValues',
    lowerOutliers: 'lowOut',
    upperOutliers: 'highOut',
    orientation: Orientation.VERTICAL,
  },
];

describe('validateDeclaration — a valid block passes through untouched', () => {
  test('every variant is accepted with every key it documents', () => {
    for (const declaration of FULL_DECLARATIONS) {
      expect(validateDeclaration(declaration, CONTEXT)).toBe(declaration);
    }
    expect(warnings).toEqual([]);
  });

  test('all thirteen variants are covered by the fixtures above', () => {
    expect(new Set(FULL_DECLARATIONS.map(d => d.type)).size).toBe(13);
  });
});

describe('validateDeclaration — the key set of a variant is closed', () => {
  test('a misspelt key is named in a warning, which is all a plain-JS author gets', () => {
    const declaration = validateDeclaration(
      { type: TraceType.VOLCANO, significanse: 7.3 },
      CONTEXT,
    );

    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration for "volcano" on series "sales" has '
      + 'unknown key "significanse"; ignored.',
    ]);
    // Warned about, not fatal: the rest of the declaration still stands.
    expect(declaration).not.toBeNull();
  });

  test('each unknown key is named separately', () => {
    validateDeclaration({ type: TraceType.ALLUVIAL, of: 'x', unit: 'days' }, CONTEXT);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('unknown key "of"');
    expect(warnings[1]).toContain('unknown key "unit"');
  });

  test('a key another variant accepts is still unknown on this one', () => {
    // `weight` belongs to a forest plot; a survival curve has no use for it,
    // which is the whole reason the union beats one flat options bag.
    validateDeclaration({ type: TraceType.SURVIVAL, weight: 'w' }, CONTEXT);

    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration for "survival" on series "sales" has '
      + 'unknown key "weight"; ignored.',
    ]);
  });

  test('the discriminant itself is never reported as unknown', () => {
    validateDeclaration({ type: TraceType.ALLUVIAL }, CONTEXT);
    expect(warnings).toEqual([]);
  });

  test('the warning carries the adapter and series it came from', () => {
    validateDeclaration(
      { type: TraceType.MOSAIC, widht: 'share' },
      { adapter: 'Chart.js', seriesRef: 'dataset 2' },
    );

    expect(warnings).toEqual([
      '[MAIDR Chart.js] maidr declaration for "mosaic" on dataset 2 has unknown '
      + 'key "widht"; ignored.',
    ]);
  });

  test('an inherited key is not reported as unknown on the variant that inherits it', () => {
    // `ForestDeclaration` extends the error-bar fields; a key set that only
    // listed the forest-specific ones would warn about the author's `yMin`.
    validateDeclaration({ type: TraceType.FOREST, yMin: 'lo', error: 'se' }, CONTEXT);
    expect(warnings).toEqual([]);
  });
});

describe('validateDeclaration — a binder that throws takes the page down', () => {
  test.each([
    ['a prototype-less block', Object.assign(Object.create(null), { type: TraceType.ALLUVIAL })],
    ['a block whose type is an object', { type: {} }],
    ['a block whose type is null', { type: null }],
    ['an empty block', {}],
  ])('%s is handled rather than thrown on', (_label, raw) => {
    expect(() => validateDeclaration(raw, CONTEXT)).not.toThrow();
  });
});

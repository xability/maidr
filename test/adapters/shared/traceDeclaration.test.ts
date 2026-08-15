import type { MaidrTraceDeclaration } from '@type/declaration';
import {
  FIELD_REF_FALLBACKS,
  isFlagValue,
  readDeclarationSlot,
  resolveFieldRef,
  validateDeclaration,
  warnUnresolvedRef,
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
    // did not point at; `warnUnresolvedRef` reports it instead.
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
    expect(resolveFieldRef(bin, undefined, 'count')).toBe(3);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not a row'],
    ['a number', 7],
  ])('%s is not a row and resolves to undefined', (_label, row) => {
    // The parameter is `unknown` because that is how the amCharts data
    // context, the Plotly customdatum and the Vega-Lite datum all arrive; an
    // adapter that had to assert its way in would be asserting past the guard
    // below rather than being served by it.
    expect(resolveFieldRef(row, undefined, 'yMin')).toBeUndefined();
    expect(resolveFieldRef(row, 'yMin', 'yMin')).toBeUndefined();
  });
});

describe('warnUnresolvedRef — an explicit name that misses is reported', () => {
  test('the message names the field, the canonical it filled and the series', () => {
    warnUnresolvedRef(CONTEXT, 'cens', 'censored');

    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration on series "sales" names "cens" for '
      + 'censored, which no row carries; censored is left out.',
    ]);
  });

  test('the sentence is the module\'s, so eight adapters print one of them', () => {
    warnUnresolvedRef({ adapter: 'Chart.js', seriesRef: 'dataset 2' }, 'wgt', 'weight');
    expect(warnings[0]).toBe(
      '[MAIDR Chart.js] maidr declaration on dataset 2 names "wgt" for weight, '
      + 'which no row carries; weight is left out.',
    );
  });
});

describe('isFlagValue — the truth table, read strictly', () => {
  test.each([
    ['the boolean true', true],
    ['the number 1', 1],
    ['the string "1"', '1'],
    ['the string "true"', 'true'],
  ])('%s raises the flag', (_label, value) => {
    expect(isFlagValue(value)).toBe(true);
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
    expect(isFlagValue(value)).toBe(false);
  });

  test('one table decides both flags, so `pooled` cannot drift from `censored`', () => {
    // A `pooled` read by truthiness marks every study as the summary the
    // moment a CSV hands over `'0'`, which empties the evidence.
    expect(isFlagValue('0')).toBe(false);
    expect(isFlagValue(1)).toBe(true);
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
    merge: true,
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

  test('a survival curve may say its siblings are further arms of it', () => {
    // Chart.js already folds every line dataset of a survival figure into one
    // layer of arms; `merge` is how the other adapters say the same thing.
    expect(validateDeclaration({ type: TraceType.SURVIVAL, merge: false }, CONTEXT))
      .not
      .toBeNull();
    expect(warnings).toEqual([]);
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

describe('validateDeclaration — a value of the wrong kind is dropped, not passed on', () => {
  test('a direction spelt in title case would invert the finding set', () => {
    // `volcano.ts` reads anything that is not exactly `'below'` as above, so
    // `'Below'` on a raw-p axis would announce precisely the points that
    // failed to reach significance as the result.
    const block = { type: TraceType.VOLCANO, significance: 0.05, significanceDirection: 'Below' };
    const declaration = validateDeclaration(block, CONTEXT);

    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration for "volcano" on series "sales" has '
      + 'significanceDirection "Below"; expected "above" or "below"; ignored.',
    ]);
    expect(declaration).toEqual({ type: TraceType.VOLCANO, significance: 0.05 });
  });

  test('the author\'s own object is never mutated', () => {
    const block = { type: TraceType.VOLCANO, significanceDirection: 'Below' };
    const declaration = validateDeclaration(block, CONTEXT);

    expect(declaration).not.toBe(block);
    expect(block.significanceDirection).toBe('Below');
  });

  test('the words an author writes for an orientation are not the grammar\'s values', () => {
    // `Orientation.HORIZONTAL` is `'horz'`. Left in place, `'horizontal'` is
    // non-nullish and never equal to it, so a horizontal forest plot would
    // navigate and highlight as a vertical one for good.
    const declaration = validateDeclaration(
      { type: TraceType.FOREST, orientation: 'horizontal' },
      CONTEXT,
    );

    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration for "forest" on series "sales" has '
      + 'orientation "horizontal"; expected "horz" or "vert"; ignored.',
    ]);
    expect(declaration).toEqual({ type: TraceType.FOREST });
  });

  /** One wrong-kinded value per value kind the key sets use. */
  const WRONG_VALUES: readonly [string, MaidrTraceDeclaration['type'], string, unknown][] = [
    ['a step direction in caps', TraceType.SURVIVAL, 'stepDirection', 'HV'],
    ['a merge flag as a string', TraceType.SURVIVAL, 'merge', 'false'],
    ['a field ref that is a boolean', TraceType.SURVIVAL, 'censored', true],
    ['an empty field ref', TraceType.SURVIVAL, 'censored', ''],
    ['a series ref that is a number', TraceType.SURVIVAL, 'bandSeries', 2],
    ['a title that is not a string', TraceType.ALLUVIAL, 'title', 7],
    ['an orientation given as a boolean', TraceType.BOXEN, 'orientation', true],
    ['a null value as a string', TraceType.FOREST, 'nullValue', '1'],
    ['a row index as a string', TraceType.FOREST, 'pooledIndex', '2'],
    ['a negative row index', TraceType.FOREST, 'pooledIndex', -1],
    ['a fractional row index', TraceType.FOREST, 'pooledIndex', 2.5],
    ['a significance that is not finite', TraceType.MANHATTAN, 'significance', Number.NaN],
    ['an effect given as a string', TraceType.MANHATTAN, 'effect', '1.5'],
  ];

  test.each(WRONG_VALUES)('%s is warned about and left out', (_label, type, key, value) => {
    const declaration = validateDeclaration({ type, [key]: value }, CONTEXT);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`has ${key} `);
    expect(declaration).toEqual({ type });
  });

  test('a field ref that is `true` does not quietly walk the fallback chain', () => {
    // `censored: true` reads as "this series is censored data" to its author.
    // Left in place it would mean "go and find a `censor` column", so an
    // unrelated column would decide which times are announced as censored.
    const declaration = validateDeclaration({ type: TraceType.SURVIVAL, censored: true }, CONTEXT);

    expect(warnings[0]).toContain('expected a field name; ignored.');
    expect(declaration).toEqual({ type: TraceType.SURVIVAL });
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
  ])('a key written as %s is "not given" rather than an error', (_label, value) => {
    const declaration = validateDeclaration({ type: TraceType.SURVIVAL, censored: value }, CONTEXT);

    expect(warnings).toEqual([]);
    expect(declaration).not.toBeNull();
  });

  test('a wrong value on one key leaves the rest of the declaration standing', () => {
    const declaration = validateDeclaration(
      { type: TraceType.FOREST, nullValue: 1, pooledIndex: '2', weight: 'w' },
      CONTEXT,
    );

    expect(warnings).toHaveLength(1);
    expect(declaration).toEqual({ type: TraceType.FOREST, nullValue: 1, weight: 'w' });
  });
});

describe('validateDeclaration — a variant without its required key is rejected', () => {
  test('a parallel plot with no dimensions is refused rather than typed as if it had them', () => {
    // `dimensions` is non-optional on the type, so a block returned without it
    // makes `declaration.dimensions.map(…)` compile and throw — out of a
    // binder, which takes the host page down.
    expect(validateDeclaration({ type: TraceType.PARALLEL, label: 'model' }, CONTEXT)).toBeNull();
    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration for "parallel_coordinates" on series '
      + '"sales" is missing required key "dimensions"; reading it as the undeclared chart.',
    ]);
  });

  test('a misspelt required key is reported twice: as unknown, and as missing', () => {
    expect(validateDeclaration({ type: TraceType.PARALLEL, dimensons: ['mpg'] }, CONTEXT))
      .toBeNull();
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('unknown key "dimensons"');
    expect(warnings[1]).toContain('missing required key "dimensions"');
  });

  test('a ridgeline with no group is refused, since one curve is a different chart', () => {
    expect(validateDeclaration({ type: TraceType.RIDGELINE, value: 'temp' }, CONTEXT)).toBeNull();
    expect(warnings[0]).toContain('missing required key "group"');
  });

  test('a required key whose value is wrong is dropped and then missing', () => {
    expect(validateDeclaration({ type: TraceType.RIDGELINE, group: 3 }, CONTEXT)).toBeNull();
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('has group 3; expected a field name; ignored.');
    expect(warnings[1]).toContain('missing required key "group"');
  });

  test('the narrowed declaration carries the field the type promises', () => {
    const declaration = validateDeclaration(
      { type: TraceType.PARALLEL, dimensions: ['mpg', { key: 'wt' }] },
      CONTEXT,
    );

    expect(declaration).not.toBeNull();
    if (declaration?.type === TraceType.PARALLEL) {
      // The line eight adapters will write. It type-checks, so it must not
      // throw.
      expect(declaration.dimensions).toHaveLength(2);
    }
  });
});

describe('validateDeclaration — the axes of a parallel plot are checked one by one', () => {
  test.each<[string, unknown]>([
    ['a comma-separated string', 'mpg,hp'],
    ['an empty list', []],
    ['an object', { 0: 'mpg' }],
  ])('%s is not a list of axes', (_label, dimensions) => {
    expect(validateDeclaration({ type: TraceType.PARALLEL, dimensions }, CONTEXT)).toBeNull();
    expect(warnings[0]).toContain('expected a non-empty list of axes; ignored.');
  });

  test('an axis object spelt the Recharts way is named by its index', () => {
    expect(
      validateDeclaration(
        { type: TraceType.PARALLEL, dimensions: ['mpg', { label: 'Weight', dataKey: 'wt' }] },
        CONTEXT,
      ),
    ).toBeNull();

    expect(warnings[0]).toContain('has dimensions[1] with unknown key "dataKey"; ignored.');
    expect(warnings[1]).toContain('has dimensions[1] naming no field');
    expect(warnings[2]).toContain('missing required key "dimensions"');
  });

  test.each<[string, unknown]>([
    ['a number', 3],
    ['null', null],
    ['an empty string', ''],
    ['an object with no key', { label: 'Weight' }],
  ])('an axis given as %s names no field', (_label, entry) => {
    expect(validateDeclaration({ type: TraceType.PARALLEL, dimensions: [entry] }, CONTEXT))
      .toBeNull();
    expect(warnings[0]).toContain('has dimensions[0] naming no field');
  });

  test('an axis label that is not a string refuses the list rather than the type', () => {
    // The label is what a reader hears for that axis, and a declaration typed
    // as if it were a string is the lie this check exists to stop.
    expect(
      validateDeclaration(
        { type: TraceType.PARALLEL, dimensions: [{ label: 7, key: 'wt' }] },
        CONTEXT,
      ),
    ).toBeNull();
    expect(warnings[0]).toContain('has dimensions[0] with label 7; expected a string.');
  });

  test('the object form is accepted with both of its keys', () => {
    expect(
      validateDeclaration(
        { type: TraceType.PARALLEL, dimensions: [{ label: 'Weight (lb)', key: 'wt' }] },
        CONTEXT,
      ),
    ).not.toBeNull();
    expect(warnings).toEqual([]);
  });
});

describe('readDeclarationSlot — the container is narrowed once, here', () => {
  test('a slot carrying a declaration reads it', () => {
    const declaration = { type: TraceType.SURVIVAL, censored: 'cens' };
    expect(readDeclarationSlot({ maidr: declaration }, CONTEXT)).toBe(declaration);
    expect(warnings).toEqual([]);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    // Plotly's `meta` is very often a plain string that has nothing to do
    // with MAIDR.
    ['a string', 'quarterly'],
    ['a number', 3],
    ['an object with no maidr key', { legend: 'right' }],
  ])('%s is no declaration and passes quietly', (_label, container) => {
    expect(readDeclarationSlot(container, CONTEXT)).toBeNull();
    expect(warnings).toEqual([]);
  });

  test('a maidr key that is not a declaration is still reported', () => {
    expect(readDeclarationSlot({ maidr: 'survival' }, CONTEXT)).toBeNull();
    expect(warnings).toEqual([
      '[MAIDR Highcharts] maidr declaration on series "sales" is not an object; ignored.',
    ]);
  });
});

describe('validateDeclaration — a binder that throws takes the page down', () => {
  test.each([
    ['a prototype-less block', Object.assign(Object.create(null), { type: TraceType.ALLUVIAL })],
    ['a block whose type is an object', { type: {} }],
    ['a block whose type is null', { type: null }],
    ['an empty block', {}],
    ['a block whose keys hold functions', { type: TraceType.FOREST, weight: (): number => 1 }],
    ['a block whose dimensions hold themselves', { type: TraceType.PARALLEL, dimensions: [[]] }],
  ])('%s is handled rather than thrown on', (_label, raw) => {
    expect(() => validateDeclaration(raw, CONTEXT)).not.toThrow();
  });
});

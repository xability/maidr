import type { ForestPoint, MaidrLayer } from '@type/grammar';
import type { Locale } from '@util/i18n';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { setLocale } from '@util/i18n';
// Every dictionary but English is a locale pack, so load them all.
import '../../src/locale/all';

/**
 * The language of the columns a forest plot adds to its table.
 *
 * The weight, the verdict against the null and the row kind are columns the
 * forest plot appends to the error bar's table, and their headers were
 * written in English in the model, so a reader in any other language heard
 * "Weight", "Crosses null" and "Row" in the middle of a table whose other
 * headers and cells were in their own.
 */

/** Two studies and a pooled row, with weights, against a null of 1. */
const STUDIES: ForestPoint[] = [
  { x: 'Silva 2018', y: 0.62, yMin: 0.41, yMax: 0.94, weight: 0.4 },
  { x: 'Okafor 2022', y: 1.71, yMin: 1.22, yMax: 2.40, weight: 0.6 },
  { x: 'Pooled', y: 1.28, yMin: 1.02, yMax: 1.61, pooled: true },
];

/**
 * The headers of the forest plot's data table, in the current language.
 *
 * @returns The headers
 */
function headers(): string[] {
  const layer: MaidrLayer = {
    id: 'forest',
    type: TraceType.FOREST,
    axes: { x: { label: 'Study' }, y: { label: 'Odds ratio' } },
    data: STUDIES,
    forestOptions: { nullValue: 1 },
  };
  return (TraceFactory.create(layer) as unknown as { description: { dataTable: { headers: string[] } } })
    .description
    .dataTable
    .headers;
}

afterEach(() => {
  setLocale('en');
});

describe('the columns a forest plot adds to its table', () => {
  test('are named in the reader\'s language', () => {
    setLocale('de');
    expect(headers().slice(4)).toEqual(['Gewicht', 'Schneidet Nulleffekt', 'Zeile']);

    setLocale('ko');
    expect(headers().slice(4)).toEqual(['가중치', '귀무값 포함', '행 종류']);
  });

  test.each<Locale>(['de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'zh'])('carry no English header in %s', (locale) => {
    setLocale(locale);

    expect(headers()).not.toEqual(expect.arrayContaining(['Weight']));
    expect(headers()).not.toEqual(expect.arrayContaining(['Crosses null']));
    expect(headers()).not.toEqual(expect.arrayContaining(['Row']));
  });

  test('read as before in English', () => {
    expect(headers().slice(4)).toEqual(['Weight', 'Crosses null', 'Row']);
  });
});

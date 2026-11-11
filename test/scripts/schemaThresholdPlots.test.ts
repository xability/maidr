import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { SCHEMA } from './schemaTypes';

/**
 * `docs/SCHEMA.md` says what a volcano or Manhattan layer carries.
 *
 * Both types were declarable, listed among the experimental ones and given a
 * row in the selectors table, but no section said what their points hold or
 * what `thresholdOptions` is, so a producer had the grammar's JSDoc and
 * nothing else. The fields are read off the grammar's own interfaces, so a
 * field added to either without a word in the document fails here.
 */

const GRAMMAR = readFileSync(resolve(__dirname, '../../src/type/grammar.ts'), 'utf8');

/**
 * The fields an interface in the grammar declares itself.
 *
 * @param name The interface's name
 * @returns Its fields, in declaration order
 */
function fieldsOf(name: string): string[] {
  const start = GRAMMAR.indexOf(`export interface ${name} `);
  if (start === -1) {
    throw new Error(`src/type/grammar.ts no longer declares ${name}`);
  }
  const body = GRAMMAR.slice(start, GRAMMAR.indexOf('\n}', start));
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map(match => match[1]);
}

/** The document's volcano and Manhattan section, up to the next heading. */
function section(): string {
  const start = SCHEMA.indexOf('### Volcano and Manhattan plots (`volcano`, `manhattan`)');
  if (start === -1) {
    return '';
  }
  const end = SCHEMA.indexOf('\n#', start + 1);
  return end === -1 ? SCHEMA.slice(start) : SCHEMA.slice(start, end);
}

describe('docs/SCHEMA.md volcano and Manhattan plots', () => {
  test('have a section of their own', () => {
    expect(section()).not.toBe('');
  });

  test('name every field the threshold and a point carry', () => {
    // `label` is declared on ScatterPoint, which VolcanoPoint extends, and
    // is the point's identity: the payload of both charts.
    const fields = ['thresholdOptions', ...fieldsOf('ThresholdOptions'), ...fieldsOf('VolcanoPoint'), 'label'];

    expect(fields).toContain('significance');
    expect(fields.filter(field => !section().includes(`\`${field}\``))).toEqual([]);
  });
});

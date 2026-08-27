import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TraceType } from '@type/grammar';

/**
 * Shared by the two checks that keep `docs/SCHEMA.md` in step with the enum:
 * `schemaTraceTypes.test.ts`, which asserts the flat declarable list is
 * complete, and `schemaStability.test.ts`, which asserts the stable /
 * experimental split covers the same set.
 *
 * Extracted once the second caller existed, rather than in anticipation of
 * one. It also settles a divergence the duplication had already produced:
 * the two copies of the backtick pattern disagreed about whether a type name
 * may contain a digit. No trace type does today, so neither was wrong — but
 * one of them would have been, silently, the first time one did.
 */

/** `docs/SCHEMA.md`, read once per importing test file. */
export const SCHEMA = readFileSync(
  resolve(__dirname, '../../docs/SCHEMA.md'),
  'utf8',
);

/**
 * Every trace type a page may declare, per the enum.
 *
 * `candlestick_delta` is excluded: the document names it as built at runtime
 * from a candlestick and a reference line, so it is not a type a producer
 * chooses and carries no documentation or stability promise either way.
 *
 * @returns The declarable `TraceType` values, in enum order.
 */
export function declarableTypes(): string[] {
  return Object.values(TraceType).filter(
    type => type !== TraceType.CANDLESTICK_DELTA,
  );
}

/**
 * The backticked type names in a stretch of the document.
 *
 * @param text - The slice of `docs/SCHEMA.md` to read.
 * @returns Each backticked lower-case token, in the order it appears.
 */
export function typesInBackticks(text: string): string[] {
  return [...text.matchAll(/`([a-z_0-9]+)`/g)].map(match => match[1]);
}

/**
 * The words the Mermaid adapter writes into the chart data, in the language
 * MAIDR speaks to the reader.
 *
 * See `words/en.ts` for what is here and what is not.
 */

import type { MessageParams } from '@util/i18n/interpolate';
import type { Locale } from '@util/i18n/locale';
import { interpolate } from '@util/i18n/interpolate';
import { de } from './words/de';
import { en } from './words/en';
import { es } from './words/es';
import { fr } from './words/fr';
import { hi } from './words/hi';
import { it } from './words/it';
import { ja } from './words/ja';
import { ko } from './words/ko';
import { zh } from './words/zh';

/** Every word the adapter writes, by key. */
export type WordKey = keyof typeof en;

/** One language's words: an entry for every key. */
export type Words = Readonly<Record<WordKey, string>>;

/** Writes one of the adapter's words, its placeholders filled. */
export type Say = (key: WordKey, params?: MessageParams) => string;

/** Every language's words. */
export const WORDS: Readonly<Record<Locale, Words>> = { en, ko, ja, zh, es, de, fr, it, hi };

/**
 * Writes the adapter's words in one language.
 *
 * @param locale - The language
 * @returns The writer
 */
export function sayIn(locale: Locale): Say {
  const words = WORDS[locale] ?? en;
  return (key, params) => interpolate(words[key] ?? en[key], params);
}

/**
 * A value Mermaid takes from a set it knows -- a requirement's risk, a
 * participant's kind -- in the adapter's words for it, or as written when it
 * is not one of the set, so a value Mermaid adds later is still read.
 *
 * @param value - The value, as Mermaid holds it
 * @param words - The set, and the word for each
 * @param say - Writes the adapter's words
 * @returns The words
 */
export function sayKnown(value: string, words: Readonly<Record<string, WordKey>>, say: Say): string {
  return Object.hasOwn(words, value) ? say(words[value]) : value;
}

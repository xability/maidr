import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';

/**
 * Which way Page Up and Page Down move through a chart's layers, as the pages
 * readers follow say it.
 *
 * Page Up is the next layer and Page Down the previous one. The Wardley map
 * and Cynefin example pages, the Mermaid guide and the Google Charts calendar
 * note said Page Down reaches the second layer or the next year. A reader on
 * the first layer who pressed it heard "No additional layer" and the boundary
 * tones, as if the layer they were told about did not exist.
 *
 * A key named alone and followed, within the sentence, by where it goes is
 * checked. A pair ("Page Up / Page Down", "Page Up and Page Down") names no
 * direction and is left alone, and so is the stretch after another page key.
 */

const ROOT = resolve(__dirname, '../..');

/** The pages a reader follows: the guides, the example pages, the Quarto extension. */
const SOURCES = ['docs', 'examples', '_extensions', 'README.md'];
const PAGE = /\.(?:md|qmd|html|tsx)$/;
const SKIP = new Set(['node_modules', 'dist']);

/** A page key named alone: neither preceded nor followed by a slash, "and", "or" or a comma. */
function alone(key: string): string {
  const pairedBefore = '(?<!(?:/|\\band|\\bor|,)\\s*(?:<kbd>)?)';
  const pairedAfter = '(?!\\s*(?:/|and\\b|or\\b|,|</kbd>\\s*(?:/|and\\b|or\\b)))';
  return `${pairedBefore}page[\\s-]*${key}(?:</kbd>)?${pairedAfter}`;
}

/** The rest of the sentence after it, up to a few words, never into another page key. */
const WITHIN = '(?:(?!page)[^.|]){0,80}?';

const DOWN_ONWARD = new RegExp(`${alone('down')}${WITHIN}\\b(?:second|next|following)\\b`, 'gis');
const UP_BACK = new RegExp(`${alone('up')}${WITHIN}\\b(?:previous|back|earlier)\\b`, 'gis');

/**
 * The pages under a path, or the path itself when it is one.
 * @param path - A file or directory, relative to the repository root
 * @returns The absolute path of each page
 */
function pages(path: string): string[] {
  const full = join(ROOT, path);
  if (PAGE.test(path)) {
    return [full];
  }
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIP.has(entry.name) ? [] : pages(join(path, entry.name));
    }
    return PAGE.test(entry.name) ? [join(full, entry.name)] : [];
  });
}

const FILES = SOURCES.flatMap(pages);

/**
 * Where a pattern matches in the pages, as `file:line`.
 * @param pattern - A global pattern run over each page's whole text, so a
 *   sentence wrapped across lines is still one sentence
 * @returns The places it matched
 */
function matches(pattern: RegExp): string[] {
  return FILES.flatMap((file) => {
    const text = readFileSync(file, 'utf-8');
    return [...text.matchAll(pattern)].map((match) => {
      const line = text.slice(0, match.index).split('\n').length;
      return `${relative(ROOT, file)}:${line}`;
    });
  });
}

describe('the pages on switching layers', () => {
  it('should be checking the keymap they describe', () => {
    const keymap = getKeymapForScope(Scope.TRACE);

    expect(keymap.MOVE_TO_NEXT_TRACE.hotkey).toBe('pageup');
    expect(keymap.MOVE_TO_PREV_TRACE.hotkey).toBe('pagedown');
  });

  it('should be reading the pages these mistakes were in', () => {
    // A walk that quietly found nothing would pass both cases below.
    const read = FILES.map(file => relative(ROOT, file).split('\\').join('/'));

    expect(read).toContain('docs/mermaid.md');
    expect(read).toContain('docs/google-charts.md');
    expect(read).toContain('examples/mermaid/wardley.html');
    expect(read).toContain('examples/mermaid/cynefin.html');
    expect(read.length).toBeGreaterThanOrEqual(100);
  });

  it('should not say Page Down moves on to the next layer', () => {
    expect(matches(DOWN_ONWARD)).toEqual([]);
  });

  it('should not say Page Up moves back to the previous layer', () => {
    expect(matches(UP_BACK)).toEqual([]);
  });
});

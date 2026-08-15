/**
 * Fails when a tracked file still contains a merge-conflict marker.
 *
 * **Why this exists.** Three unresolved conflict regions sat on `main` for
 * weeks in `docs/BRAILLE.md` and `docs/SCHEMA.md` (#917). They passed
 * commitlint, eslint, the type check, the build, the whole test suite and
 * every CI job, and shipped to maidr.ai — because none of those read markdown
 * content. One `=======` landed inside a fenced code block, flipped the fence
 * parity, and swallowed the last ninety lines of the document, so two headings
 * stopped existing and an in-page link stopped resolving. Nothing was red.
 *
 * **Why every tracked file rather than markdown.** The same mistake in a `.ts`
 * file would at least fail the type check, but in `.html`, `.json`, `.yml` or
 * a snapshot it would sail through exactly as this one did. The cost of
 * reading every tracked file is a fraction of a second, so there is no reason
 * to narrow it.
 *
 * **Why the markers are built rather than written.** This file, and its test,
 * have to talk about the markers without containing them — a guard that
 * matches its own source is a guard nobody can keep. `'<'.repeat(7)` puts the
 * run of characters in memory instead of on disk, so `git grep` for a marker
 * finds real conflicts and not the check that looks for them. The test proves
 * it by running the check over the repository, which includes this file.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The four lines `git merge` writes into a conflicted file.
 *
 * The separator is anchored at both ends because a bare run of `=` is also a
 * setext heading underline; the other three carry a label after the space, so
 * a trailing space is part of what identifies them. The diff3 base marker only
 * appears under `merge.conflictStyle = diff3`, which is not the default — it
 * is here because a contributor who has set it produces conflicts this would
 * otherwise half-detect.
 *
 * The runs are escaped on the way into the pattern, not just repeated: the
 * base marker's character is regular-expression alternation, and `^||||||| `
 * unescaped is seven empty alternatives, which matches every line of every
 * file. That is not hypothetical — the first run of this check reported all
 * 1120 tracked files as conflicted.
 */
const MARKERS = [
  { name: 'ours', pattern: markerPattern('<', ' ') },
  { name: 'base', pattern: markerPattern('|', ' ') },
  { name: 'separator', pattern: markerPattern('=', '$') },
  { name: 'theirs', pattern: markerPattern('>', ' ') },
];

/**
 * Build the pattern for one marker without writing the marker down.
 *
 * @param {string} character The character git repeats seven times
 * @param {string} tail What follows the run: a literal space, or `$` for the
 * separator, which has nothing after it
 * @returns {RegExp} The anchored pattern
 */
function markerPattern(character, tail) {
  const escaped = character.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
  return new RegExp(`^${escaped.repeat(7)}${tail}`);
}

/**
 * Find the conflict markers in one file's text.
 *
 * @param {string} text The file contents
 * @returns {{ line: number, name: string, text: string }[]} One entry per
 * marker line found, in file order, with 1-based line numbers
 */
export function conflictMarkersIn(text) {
  const found = [];

  for (const [index, line] of text.split('\n').entries()) {
    // `\r` would otherwise stop a CRLF file's separator from matching its
    // end-anchored pattern, which is the one marker with nothing after it.
    const candidate = line.replace(/\r$/, '');
    const marker = MARKERS.find(({ pattern }) => pattern.test(candidate));
    if (marker) {
      found.push({ line: index + 1, name: marker.name, text: candidate });
    }
  }

  return found;
}

/**
 * List the repository's tracked files.
 *
 * `git ls-files` rather than a directory walk: it is the definition of
 * "tracked", so it already excludes `node_modules`, `_site`, `dist` and
 * anything else `.gitignore` covers, without this file having to keep a list
 * of them in step.
 *
 * @param {string} [root] The repository to list, defaulting to this one
 * @returns {string[]} Repository-relative paths
 */
export function trackedFiles(root = ROOT) {
  const listed = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });

  return listed.split('\0').filter(Boolean);
}

/**
 * Scan every tracked file for conflict markers.
 *
 * Binary files are read and skipped rather than filtered by extension: a NUL
 * byte is what makes a file unreadable as lines, and it needs no list of
 * extensions to keep current. A file that is tracked but missing from the
 * working tree is skipped too, so a half-applied checkout reports nothing
 * rather than crashing.
 *
 * @param {string} [root] The repository to scan, defaulting to this one
 * @returns {{ file: string, line: number, name: string, text: string }[]} One
 * entry per marker line found, grouped by file in `git ls-files` order
 */
export function findConflictMarkers(root = ROOT) {
  const found = [];

  for (const file of trackedFiles(root)) {
    let buffer;
    try {
      buffer = readFileSync(resolve(root, file));
    } catch {
      continue;
    }

    if (buffer.includes(0)) {
      continue;
    }

    for (const marker of conflictMarkersIn(buffer.toString('utf-8'))) {
      found.push({ file, ...marker });
    }
  }

  return found;
}

// Run as a script: report every marker and fail, so the whole set is visible
// from one run rather than one per push.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = findConflictMarkers();

  if (found.length > 0) {
    console.error(`Merge-conflict markers in ${new Set(found.map(one => one.file)).size} tracked file(s):\n`);
    for (const { file, line, name, text } of found) {
      console.error(`  ${file}:${line}  ${name}  ${text}`);
    }
    console.error('\nResolve the conflict and commit the resolved file.');
    process.exit(1);
  }

  console.log(`No merge-conflict markers in ${trackedFiles().length} tracked files.`);
}

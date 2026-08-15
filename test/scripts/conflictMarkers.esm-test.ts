import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { conflictMarkersIn, findConflictMarkers, trackedFiles } from '../../scripts/conflictMarkers';

/**
 * Tests for `scripts/conflictMarkers.js` — the check that no tracked file
 * carries a merge-conflict marker.
 *
 * Three conflict regions sat on `main` for weeks (#917) and passed every
 * existing check, because none of them reads file content that is not code.
 * The last case here is the one that matters: it runs the check over this
 * repository and expects nothing, which is the assertion CI makes on every
 * run.
 *
 * The awkward part is that a test for a marker detector has to produce
 * markers, and would then flag itself. Both this file and the module under
 * test build the markers from `repeat` instead of writing them out, so the
 * bytes on disk never contain a run — and the repository-wide case, which
 * covers both files, is what proves it.
 *
 * It runs in the `esm` project because the module under test is ESM, the same
 * arrangement as `siteAnchors.esm-test.ts`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Build a marker line the way git writes it, without writing one here. */
function marker(character: string, label = ''): string {
  const run = character.repeat(7);
  return label === '' ? run : `${run} ${label}`;
}

const OURS = marker('<', 'HEAD');
const BASE = marker('|', 'merged common ancestors');
const SEPARATOR = marker('=');
const THEIRS = marker('>', 'eae4da3f (feat(network): reach every node)');

describe('conflictMarkersIn', () => {
  it('should find each of the four markers git writes', () => {
    const text = `one\n${OURS}\ntwo\n${BASE}\nbase\n${SEPARATOR}\nthree\n${THEIRS}\nfour\n`;

    const found = conflictMarkersIn(text);

    expect(found.map(one => one.name)).toEqual(['ours', 'base', 'separator', 'theirs']);
    expect(found.map(one => one.line)).toEqual([2, 4, 6, 8]);
  });

  it('should report the marker inside a fenced code block', () => {
    // The #917 case exactly: the separator landed between the fences, which is
    // why it flipped the parity and swallowed the rest of the document. A
    // check that understood markdown blocks would have skipped the one line
    // that did the damage.
    const text = `\`\`\`\nStage   Cells\n${SEPARATOR}\nGroup   Cells\n\`\`\`\n`;

    expect(conflictMarkersIn(text)).toEqual([
      { line: 3, name: 'separator', text: SEPARATOR },
    ]);
  });

  it('should find a marker on a CRLF line', () => {
    // The separator is the one marker anchored at its end, so a stray
    // carriage return is all it takes to hide it.
    const text = `one\r\n${SEPARATOR}\r\ntwo\r\n`;

    expect(conflictMarkersIn(text).map(one => one.name)).toEqual(['separator']);
  });

  it('should ignore lines that only look like markers', () => {
    // A setext underline of some other length, a marker with no label, an
    // indented one, and prose about markers — none of which git writes.
    const text = [
      'Heading',
      '='.repeat(6),
      '='.repeat(8),
      marker('<'),
      `  ${OURS}`,
      `A conflict starts with ${OURS}.`,
      '',
    ].join('\n');

    expect(conflictMarkersIn(text)).toEqual([]);
  });

  it('should return nothing for a file with no markers', () => {
    expect(conflictMarkersIn('# Title\n\nSome prose.\n')).toEqual([]);
  });
});

describe('findConflictMarkers', () => {
  let repository: string;

  beforeAll(() => {
    repository = mkdtempSync(join(tmpdir(), 'maidr-conflict-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repository });

    writeFileSync(join(repository, 'clean.md'), '# Title\n\nProse.\n');
    writeFileSync(join(repository, 'untracked.md'), `${OURS}\nstray\n${THEIRS}\n`);
    // Not markdown, and the reason the check is not scoped to markdown: a
    // marker here fails no linter, no type check and no build.
    writeFileSync(join(repository, 'page.html'), `<p>a</p>\n${SEPARATOR}\n<p>b</p>\n`);
    // A NUL byte makes this unreadable as lines; the check skips it rather
    // than keeping a list of binary extensions in step.
    writeFileSync(join(repository, 'logo.bin'), Buffer.from([0x89, 0x00, 0x1A, 0x0A]));

    execFileSync('git', ['add', 'clean.md', 'page.html', 'logo.bin'], { cwd: repository });
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  it('should report a marker in a tracked non-markdown file', () => {
    expect(findConflictMarkers(repository)).toEqual([
      { file: 'page.html', line: 2, name: 'separator', text: SEPARATOR },
    ]);
  });

  it('should look only at tracked files', () => {
    // `untracked.md` is the noisiest file in the fixture and is deliberately
    // not added: an editor's `.orig` leftover or a local scratch file is not
    // something CI should fail on.
    expect(trackedFiles(repository)).toEqual(['clean.md', 'logo.bin', 'page.html']);
    expect(findConflictMarkers(repository).map(one => one.file)).not.toContain('untracked.md');
  });
});

describe('this repository', () => {
  it('should track the files the check is meant to cover', () => {
    // A `git ls-files` that returned nothing would turn the case below green
    // while reading no files at all, which is the one failure this guard
    // cannot afford.
    const tracked = trackedFiles();

    expect(tracked).toContain('docs/BRAILLE.md');
    expect(tracked).toContain('docs/SCHEMA.md');
    expect(tracked).toContain('scripts/conflictMarkers.js');
    expect(tracked).toContain('test/scripts/conflictMarkers.esm-test.ts');
    expect(tracked.length).toBeGreaterThan(100);
  });

  it('should contain no merge-conflict markers in any tracked file', () => {
    // Covers the check's own source and this file with everything else, which
    // is what proves neither of them contains the runs it looks for.
    expect(findConflictMarkers(ROOT)).toEqual([]);
  });
});

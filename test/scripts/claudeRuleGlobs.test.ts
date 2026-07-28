import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guards the rule globs themselves, rather than the generator.
 *
 * A glob with a typo parses fine, generates a plausible-looking `applyTo`, and
 * passes the sync check while matching nothing — the rule is simply never
 * loaded, by either tool, with nothing to indicate it. These cases were
 * verified by hand once; this keeps them verified.
 *
 * The patterns are read from the generated instruction files rather than
 * re-parsed out of the rules, so this does not duplicate the generator's
 * parser. The `copilot-sync` check already guarantees the two agree.
 */

const ROOT = resolve(__dirname, '../..');
const INSTRUCTIONS = join(ROOT, '.github/instructions');

/** Every generated instruction file, recursively. */
function instructionFiles(): string[] {
  return readdirSync(INSTRUCTIONS, { recursive: true })
    .map(entry => String(entry).split('\\').join('/'))
    .filter(entry => entry.endsWith('.instructions.md'))
    .sort();
}

/** The comma-separated `applyTo` patterns declared by one instruction file. */
function applyToPatterns(file: string): string[] {
  const contents = readFileSync(join(INSTRUCTIONS, file), 'utf8');
  const match = contents.match(/^applyTo:\s*"(.*)"$/m);
  if (!match) {
    throw new Error(`${file} has no applyTo frontmatter`);
  }
  return match[1].split(',').filter(Boolean);
}

/** Number of tracked files a pathspec matches. */
function trackedMatches(pattern: string): number {
  const stdout = execFileSync('git', ['ls-files', '--', pattern], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return stdout.split('\n').filter(Boolean).length;
}

describe('rule globs', () => {
  const cases = instructionFiles().flatMap(file =>
    applyToPatterns(file)
      // "**" is how an unscoped rule is mirrored; it matches everything by
      // definition and needs no check.
      .filter(pattern => pattern !== '**')
      .map(pattern => [file, pattern] as const),
  );

  it('should find at least one instruction file to check', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('%s: "%s" should match at least one tracked file', (_file, pattern) => {
    expect(trackedMatches(pattern)).toBeGreaterThan(0);
  });

  it.each(cases)('%s: "%s" should have no unexpanded brace group', (_file, pattern) => {
    // applyTo documents comma-separated globs but not braces, so the generator
    // expands them. A surviving brace would match nothing on Copilot's side.
    expect(pattern).not.toMatch(/[{}]/);
  });
});

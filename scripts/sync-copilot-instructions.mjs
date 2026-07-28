#!/usr/bin/env node
/**
 * Generates GitHub Copilot's instruction files from the Claude Code sources,
 * so the two tool configurations cannot drift.
 *
 *   CLAUDE.md            →  .github/copilot-instructions.md
 *   .claude/rules/*.md   →  .github/instructions/*.instructions.md
 *
 * The formats differ only in frontmatter: Claude scopes a rule with a `paths:`
 * YAML list, Copilot with a comma-separated `applyTo:` string. A rule with no
 * `paths:` loads every session in Claude Code, which is `applyTo: "**"` for
 * Copilot.
 *
 * Run `node scripts/sync-copilot-instructions.mjs` after editing CLAUDE.md or
 * any rule. CI runs it with `--check`, which fails if the generated files are
 * stale instead of rewriting them.
 *
 * Uses only Node built-ins so CI can run the check without installing
 * dependencies.
 *
 * @see https://code.claude.com/docs/en/memory
 * @see https://docs.github.com/en/copilot/how-tos/configure-custom-instructions
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULES_DIR = join(ROOT, '.claude/rules');
const INSTRUCTIONS_DIR = join(ROOT, '.github/instructions');

/**
 * Builds the "do not edit" banner stamped onto every generated file.
 *
 * @param {string} source Repo-relative path of the authored source file.
 * @returns {string} An HTML comment naming the source and this generator.
 */
function banner(source) {
  return `<!-- Generated from ${source} by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->`;
}

/**
 * Splits a markdown file into its YAML frontmatter and body.
 *
 * @param {string} text Raw file contents.
 * @returns {{ frontmatter: string | null, body: string }} The frontmatter
 *   block with its `---` fences stripped, or null when absent, plus the
 *   remaining markdown body.
 */
function splitFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return { frontmatter: null, body: text };
  }
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) {
    throw new Error('unterminated YAML frontmatter');
  }
  return { frontmatter: text.slice(4, end), body: text.slice(end + 5) };
}

/**
 * Reads the glob patterns out of a rule's `paths:` frontmatter list.
 *
 * @param {string | null} frontmatter Frontmatter block, or null if absent.
 * @returns {string[]} Globs, empty when the rule is unscoped.
 */
function readPaths(frontmatter) {
  if (frontmatter === null) {
    return [];
  }
  if (!/^paths:/m.test(frontmatter)) {
    throw new Error('frontmatter present but has no `paths:` key');
  }
  return frontmatter
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim().slice(2).trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Expands brace groups into separate patterns: `a/*.{ts,tsx}` becomes
 * `a/*.ts` and `a/*.tsx`.
 *
 * Claude Code documents brace expansion in `paths:`; Copilot's `applyTo`
 * documents comma-separated globs but not braces. Expanding here keeps the
 * generated files on the syntax both sides definitely support.
 *
 * @param {string} glob A single glob pattern.
 * @returns {string[]} One or more brace-free patterns.
 */
function expandBraces(glob) {
  const match = glob.match(/\{([^{}]*)\}/);
  if (!match) {
    return [glob];
  }
  return match[1]
    .split(',')
    .flatMap(option => expandBraces(glob.replace(match[0], option.trim())));
}

/**
 * Lists markdown files under a directory, recursing into subdirectories.
 *
 * Both tools discover nested files — Claude Code reads `.claude/rules/`
 * recursively, and Copilot allows subdirectories of `.github/instructions/` —
 * so the mirror has to recurse as well. A non-recursive listing would drop a
 * nested rule silently and still report the mirror as in sync.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {string} suffix Only entries ending with this are returned.
 * @returns {string[]} Paths relative to `dir`, using forward slashes, sorted.
 */
function listMarkdown(dir, suffix) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true })
    .map(entry => entry.split('\\').join('/'))
    .filter(entry => entry.endsWith(suffix))
    .sort();
}

/**
 * Repoints a rule's cross-references at the generated Copilot filenames, so a
 * reader working only from `.github/instructions/` does not follow a pointer
 * to a file that does not exist on their side.
 *
 * @param {string} body Markdown body of a rule.
 * @returns {string} The body with `rules/<name>.md` rewritten.
 */
function rewriteRuleLinks(body) {
  return body.replace(/\brules\/([\w./-]+)\.md\b/g, '$1.instructions.md');
}

/**
 * Takes the first level-1 markdown heading as the instruction description.
 *
 * @param {string} body Markdown body.
 * @param {string} fallback Used when the body has no heading.
 * @returns {string} The heading text, or the fallback.
 */
function readTitle(body, fallback) {
  // The capture starts at a non-space so it cannot overlap the preceding
  // `\s+`, which would otherwise allow super-linear backtracking.
  const match = body.match(/^#\s+(\S.*)$/m);
  return match ? match[1].trim() : fallback;
}

/**
 * Escapes a value for a double-quoted YAML scalar.
 *
 * @param {string} value Raw value.
 * @returns {string} The value wrapped in double quotes, backslashes and
 *   quotes escaped.
 */
function yamlString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Builds every file Copilot should have, keyed by repo-relative path.
 *
 * @returns {Map<string, string>} Repo-relative path to intended file contents.
 */
function render() {
  const out = new Map();

  const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  out.set(
    '.github/copilot-instructions.md',
    `${banner('CLAUDE.md')}\n\n${claudeMd.trimEnd()}\n`,
  );

  for (const file of listMarkdown(RULES_DIR, '.md')) {
    const source = `.claude/rules/${file}`;
    let frontmatter, body, globs;
    try {
      ({ frontmatter, body } = splitFrontmatter(readFileSync(join(RULES_DIR, file), 'utf8')));
      globs = readPaths(frontmatter);
    } catch (error) {
      throw new Error(`${source}: ${error.message}`);
    }

    // Nested rules keep their subdirectory: .claude/rules/frontend/react.md
    // mirrors to .github/instructions/frontend/react.instructions.md.
    const stem = file.replace(/\.md$/, '');
    // An unscoped Claude rule loads every session; "**" is Copilot's equivalent.
    const applyTo = globs.length > 0 ? globs.flatMap(expandBraces).join(',') : '**';

    out.set(
      `.github/instructions/${stem}.instructions.md`,
      [
        '---',
        `description: ${yamlString(readTitle(body, basename(stem)))}`,
        `applyTo: ${yamlString(applyTo)}`,
        '---',
        '',
        banner(source),
        '',
        rewriteRuleLinks(body.trimStart().trimEnd()),
        '',
      ].join('\n'),
    );
  }

  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const expected = render();

  mkdirSync(INSTRUCTIONS_DIR, { recursive: true });

  const existing = listMarkdown(INSTRUCTIONS_DIR, '.instructions.md')
    .map(f => `.github/instructions/${f}`);
  const stale = existing.filter(p => !expected.has(p));

  const changed = [];
  for (const [relative, content] of expected) {
    let current = null;
    try {
      current = readFileSync(join(ROOT, relative), 'utf8');
    } catch {
      // Missing file counts as changed.
    }
    if (current !== content) {
      changed.push(relative);
      if (!check) {
        mkdirSync(dirname(join(ROOT, relative)), { recursive: true });
        writeFileSync(join(ROOT, relative), content);
      }
    }
  }

  if (check) {
    if (changed.length === 0 && stale.length === 0) {
      console.log(`Copilot instructions are in sync (${expected.size} files).`);
      return;
    }
    for (const p of changed) {
      console.error(`out of date: ${p}`);
    }
    for (const p of stale) {
      console.error(`orphaned (no matching rule): ${p}`);
    }
    console.error('\nRun `npm run sync:copilot` and commit the result.');
    process.exit(1);
  }

  console.log(
    changed.length > 0
      ? `Wrote ${changed.length} file(s):\n${changed.map(p => `  ${p}`).join('\n')}`
      : `Already in sync (${expected.size} files).`,
  );
  for (const p of stale) {
    console.log(`note: ${p} has no matching rule — delete it if the rule is gone.`);
  }
}

try {
  main();
} catch (error) {
  console.error(`sync-copilot-instructions: ${error.message}`);
  process.exit(1);
}

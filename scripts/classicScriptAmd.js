/**
 * Post-build guard: `maidr.js` and the locale packs must run on a page with an
 * AMD loader.
 *
 * Both are side-effect entries with no exports. As UMD they handed themselves
 * to any AMD `define` on the page as an anonymous module instead of running,
 * and require.js -- which Quarto loads on every page a Jupyter render writes
 * HTML into -- then threw "Mismatched anonymous define()" at the page's next
 * `require()`. maidr never booted, a pack never translated anything, and the
 * page's own AMD code broke with it. `vite build` exits 0 either way, so this
 * reads the output.
 *
 * Each of those classic scripts must:
 * - be an IIFE, starting `(function(){`. That also rules out an IIFE that
 *   assigns a global (`var maidr=...`), which would overwrite the chart data a
 *   page may still hand over as `window.maidr`;
 * - make no anonymous `define` call;
 * - register itself under its AMD name (`scripts/vite-plugin-amd-name.js`), so
 *   d3-require and require.js module loads keep resolving.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `classicScriptAmd.d.ts`. Keep both files in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The classic scripts this checks: the core and every locale pack. */
const CLASSIC_SCRIPT = /^(?:maidr|locale-([\w-]+))\.js$/;

const IIFE_START = /^\(function\(\)\s*\{/;

/** A bare `define(` whose first argument is not a string literal. */
const ANONYMOUS_DEFINE = /(?<![\w$.])define\s*\((?!\s*["'`])/;

/** A bare `define(` named by a string literal, capturing the name. */
const NAMED_DEFINE = /(?<![\w$.])define\s*\(\s*(["'`])([^"'`]*)\1/g;

/**
 * The AMD name a classic script registers itself under.
 *
 * @param fileName - `maidr.js` or `locale-<code>.js`
 * @returns `maidr`, or `maidr/locale/<code>` for a pack
 */
export function amdNameOf(fileName) {
  const [, locale] = fileName.match(CLASSIC_SCRIPT) ?? [];
  return locale ? `maidr/locale/${locale}` : 'maidr';
}

/**
 * Find what is wrong with the classic scripts in `distDir`.
 *
 * @param distDir - The build output directory
 * @returns One entry per problem, naming the file; empty when every script
 *   passes
 */
export function findClassicScriptAmdProblems(distDir) {
  const problems = [];
  const files = fs.readdirSync(distDir).filter(name => CLASSIC_SCRIPT.test(name)).sort();
  for (const file of files) {
    const source = fs.readFileSync(path.join(distDir, file), 'utf8');
    if (!IIFE_START.test(source))
      problems.push({ file, problem: 'is not an IIFE starting `(function(){`' });
    if (ANONYMOUS_DEFINE.test(source))
      problems.push({ file, problem: 'makes an anonymous `define` call' });
    const name = amdNameOf(file);
    const named = Array.from(source.matchAll(NAMED_DEFINE), match => match[2]);
    if (!named.includes(name))
      problems.push({ file, problem: `does not register itself as the AMD module "${name}"` });
  }
  return problems;
}

/**
 * Throw when a classic script in `distDir` would not run under an AMD loader.
 *
 * @param distDir - The build output directory
 */
export function assertClassicScriptsRunWithoutAmd(distDir) {
  const problems = findClassicScriptAmdProblems(distDir);
  if (problems.length === 0)
    return;
  const lines = problems.map(({ file, problem }) => `  ${file} ${problem}`);
  throw new Error(
    'These classic scripts would not run on a page with an AMD loader such as '
    + 'require.js:\n'
    + `${lines.join('\n')}\n`
    + 'Build them with `formats: [\'iife\']` (a pack with `[\'es\', \'iife\']`) and an '
    + '`amdName` in scripts/build.js. A copy left over from an older build is '
    + 'replaced by `node scripts/build.js core locales`.',
  );
}

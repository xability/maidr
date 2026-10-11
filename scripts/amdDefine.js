/**
 * Post-build guard: no classic script makes an anonymous AMD `define` that a
 * script tag would reach, and each one registers itself under its AMD name.
 *
 * An anonymous `define` is what require.js -- which Quarto adds to every page
 * a Jupyter render writes HTML into -- takes as a module to run later, when
 * something asks for it. A script loaded by a plain script tag is never asked
 * for, so it never ran, its page global was never set, and require.js threw
 * "Mismatched anonymous define()" at the page's next `require()`. Every build
 * that names an `amdName` in scripts/build.js promises the opposite: it runs
 * as soon as it loads, and then registers under that name, so a loader that
 * asks for it still gets it. `vite build` exits 0 either way, so this reads
 * the output.
 *
 * The one anonymous `define` allowed is the one the registration makes when
 * require.js itself is loading the script, behind the test for the
 * `data-requiremodule` attribute require.js marks its script elements with:
 * require.js names that one after the module it asked for, so it never
 * mismatches (see vite-plugin-umd-without-amd.js).
 *
 * Only the builds of this run are read: a selective build leaves the rest of
 * dist as an older build wrote it.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `amdDefine.d.ts`. Keep both files in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

/** A bare `define(` whose first argument is not a string literal. */
const ANONYMOUS_DEFINE = /(?<![\w$.])define\s*\((?!\s*["'`])/;

/**
 * An anonymous `define(` made only while require.js is loading the script:
 * the branch of a conditional on its `data-requiremodule` attribute.
 */
const REQUIREJS_LOAD_DEFINE = /getAttribute\(\s*(["'`])data-requiremodule\1\s*\)\s*\?\s*define\s*\(/g;

/** A bare `define(` named by a string literal, capturing the name. */
const NAMED_DEFINE = /(?<![\w$.])define\s*\(\s*(["'`])([^"'`]*)\1/g;

/**
 * The classic scripts a set of builds writes, each with its AMD name.
 *
 * `fileName` is called the way Vite calls it, `(format, entryName)`, as in
 * `assertUniqueOutputFilenames`.
 *
 * @param {Array<{ entry: string, formats?: string[], fileName: unknown, amdName?: string }>} configs
 *   Build configurations from scripts/build.js
 * @returns {Array<{ file: string, amdName: string }>} One entry per classic
 *   (non-ES) output of every build that names an `amdName`
 */
export function classicScripts(configs) {
  return configs
    .filter(config => config.amdName)
    .flatMap((config) => {
      const entryName = path.basename(config.entry, path.extname(config.entry));
      return (config.formats ?? ['es', 'umd'])
        .filter(format => format !== 'es')
        .map(format => ({
          file: typeof config.fileName === 'function'
            ? config.fileName(format, entryName)
            : config.fileName,
          amdName: config.amdName,
        }));
    });
}

/**
 * Find what is wrong with the given classic scripts in `distDir`.
 *
 * @param {string} distDir - The build output directory
 * @param {Array<{ file: string, amdName: string }>} scripts - What to read,
 *   from {@link classicScripts}
 * @returns {Array<{ file: string, problem: string }>} One entry per problem;
 *   empty when every script passes
 */
export function findAmdDefineProblems(distDir, scripts) {
  const problems = [];
  for (const { file, amdName } of scripts) {
    const target = path.join(distDir, file);
    if (!fs.existsSync(target)) {
      problems.push({ file, problem: 'was not written' });
      continue;
    }
    const source = fs.readFileSync(target, 'utf8');
    if (ANONYMOUS_DEFINE.test(source.replace(REQUIREJS_LOAD_DEFINE, '')))
      problems.push({ file, problem: 'makes an anonymous `define` call' });
    const named = Array.from(source.matchAll(NAMED_DEFINE), match => match[2]);
    if (!named.includes(amdName))
      problems.push({ file, problem: `does not register itself as the AMD module "${amdName}"` });
  }
  return problems;
}

/**
 * Throw when a classic script in `distDir` would wait on an AMD loader.
 *
 * @param {string} distDir - The build output directory
 * @param {Array<{ file: string, amdName: string }>} scripts - What to read,
 *   from {@link classicScripts}
 */
export function assertNoAnonymousDefine(distDir, scripts) {
  const problems = findAmdDefineProblems(distDir, scripts);
  if (problems.length === 0)
    return;
  const lines = problems.map(({ file, problem }) => `  ${file} ${problem}`);
  throw new Error(
    'These classic scripts would not run on a page with an AMD loader such as '
    + 'require.js:\n'
    + `${lines.join('\n')}\n`
    + 'A UMD bundle gets its AMD branch replaced by scripts/vite-plugin-umd-without-amd.js; '
    + 'if rolldown changed its wrapper, that plugin says so first.',
  );
}

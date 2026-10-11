/**
 * Post-build guard: every classic script a build writes -- `maidr.js`, the
 * locale packs and the adapter bundles -- runs on a page with an AMD loader,
 * and only then registers itself with it.
 *
 * Built as UMD, each handed itself to any AMD `define` on the page as an
 * anonymous module, which runs only when something asks the loader for it.
 * Nothing did: maidr.js, a pack and an adapter are all loaded by script tags.
 * So under require.js -- which Quarto loads on every page a Jupyter render
 * writes HTML into -- maidr never booted, a pack never translated anything,
 * an adapter's page global was never set, and require.js threw "Mismatched
 * anonymous define()" at the page's next `require()`, breaking the page's own
 * AMD code with it. `vite build` exits 0 either way, so this reads the output.
 *
 * Each classic script of the builds this run made must:
 * - have been written;
 * - when it is an IIFE (maidr.js, a locale pack), start `(function(){`. That
 *   also rules out an IIFE that assigns a global (`var maidr=...`), which
 *   would overwrite the chart data a page may still hand over as
 *   `window.maidr`;
 * - make no anonymous `define` call, other than one behind the test for
 *   require.js loading the script (the `data-requiremodule` attribute
 *   require.js puts on the script elements it adds): require.js names that one
 *   after the module it asked for, so it never mismatches;
 * - register itself both ways: under its `amdName`, its import path, and
 *   anonymously behind that test, so require.js loading it under any id or
 *   URL resolves, `enforceDefine` included.
 * `scripts/vite-plugin-amd-registration.js` writes the registration.
 *
 * Only the builds of this run are read: a selective build leaves the rest of
 * dist as an older build wrote it. Which files those are comes from each
 * build's formats, not from its `amdName`, so a build that drops its name is
 * reported rather than skipped.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `classicScriptAmd.d.ts`. Keep both files in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

const IIFE_START = /^\(function\(\)\s*\{/;

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
 * The classic scripts a set of builds writes: every output that is not an ES
 * module.
 *
 * `fileName` is called the way Vite calls it, `(format, entryName)`, as in
 * `assertUniqueOutputFilenames`.
 *
 * @param {Array<{ entry: string, formats?: string[], fileName: unknown, amdName?: string }>} configs
 *   Build configurations from scripts/build.js
 * @returns {Array<{ file: string, format: string, amdName: string | null }>}
 *   One entry per classic output, with the name its build registers it under
 */
export function classicScripts(configs) {
  return configs.flatMap((config) => {
    const entryName = path.basename(config.entry, path.extname(config.entry));
    return (config.formats ?? ['es', 'umd'])
      .filter(format => format !== 'es')
      .map(format => ({
        file: typeof config.fileName === 'function'
          ? config.fileName(format, entryName)
          : config.fileName,
        format,
        amdName: config.amdName ?? null,
      }));
  });
}

/**
 * Find what is wrong with the given classic scripts in `distDir`.
 *
 * @param {string} distDir - The build output directory
 * @param {Array<{ file: string, format: string, amdName: string | null }>} scripts
 *   What to read, from {@link classicScripts}
 * @returns {Array<{ file: string, problem: string }>} One entry per problem,
 *   naming the file; empty when every script passes
 */
export function findClassicScriptAmdProblems(distDir, scripts) {
  const problems = [];
  for (const { file, format, amdName } of scripts) {
    const target = path.join(distDir, file);
    if (!fs.existsSync(target)) {
      problems.push({ file, problem: 'was not written' });
      continue;
    }
    const source = fs.readFileSync(target, 'utf8');
    const outsideRequireJsLoad = source.replace(REQUIREJS_LOAD_DEFINE, '');
    if (format === 'iife' && !IIFE_START.test(source))
      problems.push({ file, problem: 'is not an IIFE starting `(function(){`' });
    if (ANONYMOUS_DEFINE.test(outsideRequireJsLoad))
      problems.push({ file, problem: 'makes an anonymous `define` call' });
    if (!amdName) {
      problems.push({ file, problem: 'has no `amdName` to register under' });
      continue;
    }
    const named = Array.from(source.matchAll(NAMED_DEFINE), match => match[2]);
    if (!named.includes(amdName))
      problems.push({ file, problem: `does not register itself as the AMD module "${amdName}"` });
    if (outsideRequireJsLoad === source)
      problems.push({ file, problem: 'does not register anonymously when require.js loads it' });
  }
  return problems;
}

/**
 * Throw when a classic script in `distDir` would not run on a page with an
 * AMD loader.
 *
 * @param {string} distDir - The build output directory
 * @param {Array<{ file: string, format: string, amdName: string | null }>} scripts
 *   What to read, from {@link classicScripts}
 */
export function assertClassicScriptsRunWithoutAmd(distDir, scripts) {
  const problems = findClassicScriptAmdProblems(distDir, scripts);
  if (problems.length === 0)
    return;
  const lines = problems.map(({ file, problem }) => `  ${file} ${problem}`);
  throw new Error(
    'These classic scripts would not run on a page with an AMD loader such as '
    + 'require.js:\n'
    + `${lines.join('\n')}\n`
    + 'Each build in scripts/build.js needs an `amdName`, and an entry with no exports '
    + 'is built as `iife` (a pack as `[\'es\', \'iife\']`), never `umd`. '
    + 'scripts/vite-plugin-amd-registration.js writes the registration; if rolldown '
    + 'changed its UMD wrapper, that plugin says so first.',
  );
}

/**
 * Keep maidr's classic scripts out of a page's AMD loader: each one runs as
 * soon as it loads, and only then registers itself with the loader.
 *
 * The classic scripts are `maidr.js`, the locale packs (`locale-<code>.js`)
 * and every adapter bundle (`observable.js`, `echarts.js` and the rest). All
 * were UMD, and a UMD wrapper, on a page with an AMD `define`, hands the
 * bundle to it as an anonymous module, which runs only when something asks
 * the loader for it. Nothing does: each is loaded by a plain script tag --
 * maidr's Quarto extension writes maidr.js and observable.js into every page
 * it renders, maidr.js adds a reader's pack beside itself, r-maidr reads
 * `window.maidrECharts` -- and every guide uses the page global. So on a page
 * with require.js, which Quarto adds to every page a Jupyter render writes
 * HTML into, maidr never booted, a pack never registered, an adapter's global
 * was never set, and require.js threw "Mismatched anonymous define()" at the
 * page's next `require()`, taking the page's own AMD code down with it.
 *
 * So the bundle runs first, and then makes this registration:
 *
 *   typeof define === 'function' && define.amd && (
 *     <require.js is loading this script>
 *       ? define([], value)
 *       : define("maidr/echarts", [], value))
 *
 * - A script tag, or any loader but require.js, gets the registration named by
 *   the bundle's import path (`maidr`, `maidr/locale/ko`, `maidr/echarts`).
 *   require.js raises the mismatch only for anonymous defines, so the page's
 *   AMD code keeps working, and `require(['maidr/echarts'])` resolves.
 *   d3-require, which Observable and Quarto `{ojs}` cells call `require`,
 *   ignores the name and resolves a load by any URL; it rejects a script that
 *   defines nothing with "invalid module", so even maidr.js, which has nothing
 *   to export, registers.
 * - require.js loading the script itself, under whatever module id or URL the
 *   page asked for, gets an anonymous define, as from the UMD wrapper.
 *   require.js names it after the module it is loading, so that load resolves,
 *   `enforceDefine` included, where a define named for another module would
 *   leave it `undefined`, or fail "No define call". It is told apart by the
 *   `data-requiremodule` attribute require.js puts on the script element it
 *   adds, which `document.currentScript` is while the script runs.
 *
 * `value` is the module: `undefined` for maidr.js and a pack, which have no
 * exports, and the page global for an adapter.
 *
 * How the registration gets there depends on the format:
 * - maidr.js and the packs are side-effect entries with no exports, built as
 *   IIFE (scripts/build.js says why not UMD), so it is appended to the chunk.
 * - An adapter's UMD keeps rolldown's CommonJS branch, and the page global with
 *   the object it hands each entry (the entries merge their window aliases into
 *   it, test/entry/umdGlobals.test.ts). Its AMD branch is removed and the
 *   registration added to the global branch, after the factory. On the
 *   CommonJS branch the bundle belongs to the bundler that took it, and there
 *   is no page global for a registration to hand back.
 * The `.mjs` beside a bundle is an ES module and has no use for AMD.
 * `scripts/classicScriptAmd.js` checks the result after every build.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `vite-plugin-amd-registration.d.ts`. Keep both files in sync.
 */

/**
 * The registration a classic script makes once it has run.
 *
 * @param {string} amdName - The AMD module name, the bundle's import path
 * @param {string} value - A function expression returning the module
 * @returns {string} The expression, guarded so it does nothing without AMD
 */
export function registration(amdName, value) {
  const requireJsLoading = 'typeof document !== \'undefined\' && document.currentScript && document.currentScript.getAttribute(\'data-requiremodule\')';
  return `typeof define === 'function' && define.amd && (${requireJsLoading} ? define([], ${value}) : define(${JSON.stringify(amdName)}, [], ${value}))`;
}

/**
 * The first five lines of rolldown's UMD output for an entry with exports and
 * no external dependency, before minification. Matched whole, so a rolldown
 * that words its wrapper differently, or a bundle that gains an external,
 * fails the build here instead of shipping an AMD branch. This is rolldown
 * 1.2.3's text, double space and all: a Vite upgrade that brings a rolldown
 * wording it otherwise fails every adapter build with the message below, and
 * this is what to update.
 *
 * @param {string} globalName - The page global, `build.lib.name`
 * @returns {string} The wrapper's opening, up to the factory's body
 */
function rolldownUmdHeader(globalName) {
  return [
    '(function(global, factory) {',
    '  typeof exports === \'object\' && typeof module !== \'undefined\' ?  factory(exports) :',
    '  typeof define === \'function\' && define.amd ? define([\'exports\'], factory) :',
    `  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory((global.${globalName} = {})));`,
    '})(this, function(exports) {',
    '',
  ].join('\n');
}

/**
 * The same opening with no AMD branch, making the {@link registration} once
 * the factory has run. It keeps the line count, so the source map rolldown
 * made for the body still lines up.
 *
 * @param {string} globalName - The page global, `build.lib.name`
 * @param {string} amdName - The AMD module name, the bundle's import path
 * @returns {string} The replacement opening
 */
function amdSafeHeader(globalName, amdName) {
  return [
    '(function(global, factory) {',
    '  typeof exports === \'object\' && typeof module !== \'undefined\' ?  factory(exports) :',
    `  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory((global.${globalName} = {})),`,
    `  ${registration(amdName, `function() { return global.${globalName}; }`)});`,
    '})(this, function(exports) {',
    '',
  ].join('\n');
}

/**
 * Rewrite rolldown's UMD wrapper so the bundle never waits on an AMD loader.
 *
 * @param {string} code - The UMD chunk as rolldown rendered it
 * @param {string} globalName - The page global, `build.lib.name`
 * @param {string} amdName - The AMD module name, the bundle's import path
 * @returns {string} The chunk with no AMD branch, registering once it has run
 * @throws {Error} When the chunk does not open with the wrapper expected
 */
export function withoutAmdBranch(code, globalName, amdName) {
  const header = rolldownUmdHeader(globalName);
  if (!code.startsWith(header)) {
    throw new Error(
      `The UMD bundle for "${globalName}" does not open with the wrapper `
      + 'scripts/vite-plugin-amd-registration.js rewrites, so its AMD branch would '
      + 'ship. Read the wrapper in the renderChunk output and update '
      + `rolldownUmdHeader to match. It opens:\n${code.slice(0, header.length + 80)}`,
    );
  }
  return amdSafeHeader(globalName, amdName) + code.slice(header.length);
}

/**
 * Append the {@link registration} to an IIFE with no exports.
 *
 * @param {string} code - The IIFE chunk as rolldown rendered it
 * @param {string} amdName - The AMD module name, the script's import path
 * @returns {string} The chunk, registering once it has run
 */
export function withRegistration(code, amdName) {
  return `${code};${registration(amdName, 'function() {}')};\n`;
}

/**
 * @param {string | undefined} amdName - The AMD module name, the bundle's
 *   import path (`maidr`, `maidr/locale/ko`, `maidr/echarts`); required for
 *   every build with a classic script
 * @returns {import('vite').Plugin} A plugin that registers the entry chunk of
 *   an `iife` output, and of a `umd` output with exports, with an AMD loader
 */
export function amdRegistration(amdName) {
  return {
    name: 'maidr:amd-registration',
    apply: 'build',

    renderChunk(code, chunk, outputOptions) {
      const { format } = outputOptions;
      if (!chunk.isEntry || (format !== 'iife' && format !== 'umd'))
        return null;
      // An entry with no exports gets rolldown's other UMD wrapper,
      // `define([], factory)`, with no global branch to keep. None is built:
      // it ships as IIFE, and the post-build check flags one that is not.
      if (format === 'umd' && chunk.exports.length === 0)
        return null;
      if (!amdName) {
        this.error(
          `${chunk.fileName} is a classic script with no \`amdName\`. Give its build in `
          + 'scripts/build.js the import path it is published under (`amdName: \'maidr/<name>\'`), '
          + 'so it can register with an AMD loader without waiting on one.',
        );
      }
      // The IIFE gains a line at its end, and the UMD wrapper changes line for
      // line, so every mapping in the chunk's source map still holds.
      const rewritten = format === 'iife'
        ? withRegistration(code, amdName)
        : withoutAmdBranch(code, outputOptions.name, amdName);
      return { code: rewritten, map: null };
    },
  };
}

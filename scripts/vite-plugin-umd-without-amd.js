/**
 * Keep a UMD bundle out of a page's AMD loader: it always runs, and sets its
 * page global, and only then registers itself with the loader by name.
 *
 * Rolldown's UMD wrapper has three branches: CommonJS, then AMD, then the page
 * global. With an AMD `define` on the page it takes the AMD branch and hands
 * the bundle over as an anonymous module, which runs only when something asks
 * the loader for it. Nothing does: `observable.js` is loaded by a plain script
 * tag (maidr's own Quarto extension writes two), r-maidr reads
 * `window.maidrECharts` and `window.maidrHighcharts`, and every guide says to
 * use the global. So on a page with require.js -- which Quarto adds to every
 * page a Jupyter render writes HTML into -- the bundle never ran, the global
 * was never set, and require.js threw "Mismatched anonymous define()" at the
 * page's next `require()`, breaking the page's own AMD code as well.
 *
 * This removes the AMD branch and adds a named registration to the global
 * branch, after the bundle has run:
 *
 *   typeof define === 'function' && define.amd &&
 *     define("maidr/echarts", [], function() { return global.maidrECharts; })
 *
 * require.js raises the mismatch only for anonymous defines. A module load
 * still resolves to the bundle's exports: in require.js under `maidr/echarts`,
 * the package's import path, and in d3-require -- what Observable and Quarto
 * `{ojs}` cells call `require` -- from any URL, since it ignores the name. A
 * require.js load under any other module name now resolves to `undefined`; a
 * page that wants one maps the global with require.js's `shim` `exports`.
 *
 * The CommonJS branch, and the page global with the object it hands each
 * entry, are rolldown's own, unchanged: the entries merge their window
 * aliases into that object (test/entry/umdGlobals.test.ts). The registration
 * sits in the global branch, after the factory: on the CommonJS branch the
 * bundle belongs to the bundler that took it, and there is no page global for
 * a registration to hand back.
 *
 * Only the `umd` output of an entry with exports is touched. An entry with no
 * exports gets rolldown's other wrapper, `define([], factory)`, which has no
 * CommonJS or global branch to keep. The `.mjs` beside each bundle is an ES
 * module and has no use for AMD. `scripts/amdDefine.js` checks the result
 * after every build.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `vite-plugin-umd-without-amd.d.ts`. Keep both files in sync.
 */

/**
 * The first five lines of rolldown's UMD output for an entry with exports and
 * no external dependency, before minification. Matched whole, so a rolldown
 * that words its wrapper differently, or a bundle that gains an external,
 * fails the build here instead of shipping an AMD branch.
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
 * The same opening with no AMD branch, registering the bundle by name once it
 * has run. It keeps the line count, so the source map rolldown made for the
 * body still lines up.
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
    `  typeof define === 'function' && define.amd && define(${JSON.stringify(amdName)}, [], function() { return global.${globalName}; }));`,
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
 * @returns {string} The chunk with no AMD branch and a named registration
 * @throws {Error} When the chunk does not open with the wrapper expected
 */
export function withoutAmdBranch(code, globalName, amdName) {
  const header = rolldownUmdHeader(globalName);
  if (!code.startsWith(header)) {
    throw new Error(
      `The UMD bundle for "${globalName}" does not open with the wrapper `
      + 'scripts/vite-plugin-umd-without-amd.js rewrites, so its AMD branch would '
      + 'ship. Read the wrapper in the renderChunk output and update '
      + `rolldownUmdHeader to match. It opens:\n${code.slice(0, header.length + 80)}`,
    );
  }
  return amdSafeHeader(globalName, amdName) + code.slice(header.length);
}

/**
 * @param {string | undefined} amdName - The AMD module name, the bundle's
 *   import path (`maidr/echarts`); required for a UMD bundle with exports
 * @returns {import('vite').Plugin} A plugin that applies
 *   {@link withoutAmdBranch} to the entry chunk of a `umd` output
 */
export function umdWithoutAmd(amdName) {
  return {
    name: 'maidr:umd-without-amd',
    apply: 'build',

    renderChunk(code, chunk, outputOptions) {
      if (outputOptions.format !== 'umd' || !chunk.isEntry || chunk.exports.length === 0)
        return null;
      if (!amdName) {
        this.error(
          `${chunk.fileName} is a UMD bundle with exports and no \`amdName\`. Give its `
          + 'build in scripts/build.js the import path it is published under '
          + '(`amdName: \'maidr/<name>\'`), so it can register with an AMD loader '
          + 'without waiting on one.',
        );
      }
      // Only the wrapper changes, line for line, so every mapping holds.
      return { code: withoutAmdBranch(code, outputOptions.name, amdName), map: null };
    },
  };
}

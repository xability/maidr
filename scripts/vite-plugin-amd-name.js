/**
 * Register a classic script under a fixed AMD module name, after it has run.
 *
 * `maidr.js` and the locale packs are side-effect entries with no exports, so
 * they ship as IIFE: a UMD wrapper hands such an entry to any AMD `define` on
 * the page as an anonymous module, and require.js -- which Quarto loads on
 * every page a Jupyter render writes HTML into -- never runs it and throws
 * "Mismatched anonymous define()" at the page's next `require()`.
 *
 * An IIFE calls no `define` at all, though, and a loader that loads one as a
 * module may expect it to. d3-require, which Observable and Quarto `{ojs}`
 * cells use, rejects `require("maidr")` with "invalid module" when the script
 * defined nothing, where it resolved the UMD to `undefined`. So this appends
 * one named registration to the IIFE output:
 *
 *   ;typeof define=="function"&&define.amd&&define("maidr",[],function(){});
 *
 * The bundle has already run by then, so maidr never waits on a loader, and
 * require.js raises the mismatch only for anonymous defines. The module value
 * is `undefined`, which is what the UMD wrapper resolved to.
 *
 * One load the UMD served still fails. require.js under `enforceDefine`
 * accepts the script only when it is loaded under the name it registers
 * (`maidr`, or `maidr/locale/<code>` for a pack): loaded by its URL or under
 * another id, it fails "No define call for ...", where the UMD's anonymous
 * define took whatever id it was loaded as. Without `enforceDefine`, which
 * Quarto and Shiny do not set, every form resolves.
 *
 * Only the `iife` output is touched; the `.mjs` pack beside it is an ES module
 * and has no use for AMD. `scripts/classicScriptAmd.js` checks the result after
 * every build.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `vite-plugin-amd-name.d.ts`. Keep both files in sync.
 */

/**
 * The line appended to a classic script, registering it as `name`.
 *
 * @param {string} name - The AMD module name, the script's npm import path
 * @returns {string} The registration, guarded so it does nothing without AMD
 */
export function amdRegistration(name) {
  return `;typeof define=="function"&&define.amd&&define(${JSON.stringify(name)},[],function(){});\n`;
}

/**
 * @param {string} name - The AMD module name: `maidr` for the core, and
 *   `maidr/locale/<code>` for a pack, as in package.json's `exports`
 * @returns {import('vite').Plugin} A plugin that appends {@link amdRegistration}
 *   to the entry chunk of an `iife` output
 */
export function amdModuleName(name) {
  const registration = amdRegistration(name);
  return {
    name: 'maidr:amd-module-name',
    apply: 'build',

    renderChunk(code, chunk, outputOptions) {
      if (outputOptions.format !== 'iife' || !chunk.isEntry)
        return null;
      // Appended, so every mapping in the chunk's source map still holds.
      return { code: code + registration, map: null };
    },
  };
}

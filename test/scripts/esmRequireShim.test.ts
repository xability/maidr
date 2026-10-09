import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Guards the React ESM bundles against rolldown's CommonJS `require` shim
 * (#1370).
 *
 * `use-sync-external-store` (CommonJS, reached through `react-redux`) calls
 * `require("react")`. With `react` external, rolldown answered that with a shim
 * that throws in a browser, so `maidr/react`, `maidr/recharts`,
 * `maidr/victory`, `maidr/nivo` and `maidr/mui-x-charts` rendered a blank page
 * in every bundler app -- while `vite build` exited 0 and every test passed.
 *
 * Two halves are pinned here. The config: the React runtime is handed to
 * `esmExternalRequirePlugin` and kept out of `rollupOptions.external`, since
 * the plugin skips an external listed in both. And the post-build check that
 * `scripts/build.js` runs on dist, which is what catches the next CommonJS
 * dependency that does the same with some other external.
 *
 * `scripts/` is plain ESM JavaScript and `allowJs` is false, so each case runs
 * in a node subprocess, as in buildDefineNodeEnv.test.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const SHIM_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/esmRequireShim.js')).href;

function runModule<T>(source: string): T {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  );
  return JSON.parse(stdout.trim()) as T;
}

interface BundleConfig {
  name: string;
  external: unknown[];
  requireExternal: unknown[] | null;
}

function bundleConfigs(): BundleConfig[] {
  return runModule<BundleConfig[]>(`
    import { builds, createViteConfig } from '${BUILD_SCRIPT}';
    const out = builds.map((b) => {
      const config = createViteConfig(b);
      const plugin = config.plugins.flat().find(p => p && p.name === 'builtin:esm-external-require');
      return {
        name: b.name,
        external: config.build.rollupOptions.external.map(String),
        requireExternal: plugin ? plugin._options.external.map(String) : null,
      };
    });
    console.log(JSON.stringify(out));
  `);
}

describe('react runtime externals', () => {
  const configs = bundleConfigs();
  const reactBundles = ['react', 'recharts', 'victory', 'mui-x-charts', 'nivo'];

  it.each(reactBundles)('should hand the React runtime of %s to esmExternalRequirePlugin', (name) => {
    const config = configs.find(c => c.name === name);

    expect(config?.requireExternal).toEqual(['react', 'react-dom', 'react/jsx-runtime']);
  });

  it.each(reactBundles)('should keep the React runtime of %s out of rollupOptions.external', (name) => {
    const config = configs.find(c => c.name === name);

    // The plugin skips an external that is also listed here, and the raw
    // require survives.
    expect(config?.external).not.toContain('react');
    expect(config?.external).not.toContain('react-dom');
    expect(config?.external).not.toContain('react/jsx-runtime');
  });

  it('should leave a peer such as @nivo to rollupOptions.external', () => {
    const nivo = configs.find(c => c.name === 'nivo');

    // Handed to the plugin, the whole of nivo is loaded into the graph.
    expect(nivo?.external).toContain(String(/^@nivo\//));
    expect(nivo?.requireExternal).not.toContain(String(/^@nivo\//));
  });

  it('should not register the plugin for bundles that externalise no React', () => {
    const core = configs.find(c => c.name === 'core');

    expect(core?.requireExternal).toBeNull();
  });
});

describe('post-build require shim check', () => {
  const SHIM = 'throw Error("Calling `require` for \\"" + e + "\\" in an environment that doesn\'t expose the `require` function.");';
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'maidr-shim-'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  function find(): Array<{ bundle: string; chunk: string }> {
    return runModule(`
      import { findRequireShimBundles } from '${SHIM_SCRIPT}';
      console.log(JSON.stringify(findRequireShimBundles(${JSON.stringify(dist)})));
    `);
  }

  it('should flag a bundle that imports a chunk carrying the shim', () => {
    writeFileSync(join(dist, 'rolldown-runtime-abc.js'), `var u = function(e) { ${SHIM} };\nexport { u as r };\n`);
    writeFileSync(join(dist, 'react.mjs'), 'import { r as n } from "./rolldown-runtime-abc.js";\nvar t = n("react");\n');

    expect(find()).toEqual([{ bundle: 'react.mjs', chunk: 'rolldown-runtime-abc.js' }]);
  });

  it('should follow chunks through other chunks and dynamic imports', () => {
    mkdirSync(join(dist, 'chunks'));
    writeFileSync(join(dist, 'chunks', 'runtime.js'), `export const r = (e) => { ${SHIM} };\n`);
    writeFileSync(join(dist, 'lib.js'), 'export * from "./chunks/runtime.js";\n');
    writeFileSync(join(dist, 'nivo.mjs'), 'const lib = import("./lib.js");\n');

    expect(find()).toEqual([{ bundle: 'nivo.mjs', chunk: join('chunks', 'runtime.js') }]);
  });

  it('should flag a bundle that inlines the shim', () => {
    writeFileSync(join(dist, 'victory.mjs'), `var u = function(e) { ${SHIM} };\n`);

    expect(find()).toEqual([{ bundle: 'victory.mjs', chunk: 'victory.mjs' }]);
  });

  it('should pass bundles that import the external as ESM', () => {
    writeFileSync(join(dist, 'rolldown-runtime-def.js'), 'export const t = (e, t) => () => t;\n');
    writeFileSync(join(dist, 'react.mjs'), 'import * as React from "react";\nimport { t } from "./rolldown-runtime-def.js";\n');
    // A UMD bundle may carry the shim legitimately: a script tag has no ESM.
    writeFileSync(join(dist, 'maidr.js'), `var u = function(e) { ${SHIM} };\n`);

    expect(find()).toEqual([]);
  });
});

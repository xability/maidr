import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

/**
 * Keeps the adapter bundles out of a page's AMD loader.
 *
 * Rolldown's UMD wrapper takes its AMD branch whenever the page has a
 * `define` with `define.amd`, and hands the bundle over as an anonymous module
 * that runs only when something asks the loader for it. Nothing asks: every
 * consumer loads `observable.js`, `echarts.js` and the rest by a script tag
 * and reads the page global. So under require.js -- on every Quarto page a
 * Jupyter render writes HTML into -- the bundle never ran, and require.js
 * threw "Mismatched anonymous define()" at the page's next `require()`.
 *
 * `scripts/vite-plugin-umd-without-amd.js` removes that branch and registers
 * the bundle once it has run: by name from a script tag, and anonymously when
 * require.js itself loads it, so that load resolves under whatever name the
 * page asked for, as before. `scripts/amdDefine.js` checks the output after
 * every build. The halves pinned here: the config, which names every UMD
 * bundle with exports; a real build of `observable.js` (what maidr's Quarto
 * extension loads) run against each kind of loader it meets; and the guard.
 *
 * `scripts/` is plain ESM JavaScript and `allowJs` is false, so the scripts
 * run in a node subprocess, as in esmRequireShim.test.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const PLUGIN_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/vite-plugin-umd-without-amd.js')).href;
const GUARD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/amdDefine.js')).href;

function runModule<T>(source: string, env: Record<string, string> = {}): T {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } },
  );
  // A build prints its own lines first; the answer is the last one.
  const lines = stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]) as T;
}

type Globals = Record<string, unknown>;

/** One `define` call: the name, when it has one, and what the module resolves to. */
interface DefineCall {
  name: string | null;
  value: unknown;
}

/**
 * Evaluate a classic script the way a script tag does, against a page whose
 * globals are `page`.
 * @param source - The script
 * @param page - The page's globals before it loads
 * @returns The page's globals after it has run
 */
function load(source: string, page: Globals = {}): Globals {
  const context = vm.createContext({ ...page });
  vm.runInContext('globalThis.window = globalThis; globalThis.self = globalThis;', context);
  vm.runInContext(source, context);
  return context as Globals;
}

/**
 * A page with require.js's side of AMD: `define` records each call and what
 * its factory returns. An anonymous call is what require.js answers with
 * "Mismatched anonymous define()" -- unless require.js is loading the script
 * itself, when it names the call after the module it asked for.
 * @param loading - The module require.js is loading the script as, which it
 *   writes on the script element as `data-requiremodule`; `null` for a script
 *   tag of the page's own. Omitted, there is no `document`.
 * @returns The page's globals, and the calls made so far
 */
function requireJsPage(loading?: string | null): { page: Globals; calls: DefineCall[] } {
  const calls: DefineCall[] = [];
  const define = (...args: unknown[]): void => {
    const name = typeof args[0] === 'string' ? args[0] : null;
    const factory = args[args.length - 1];
    calls.push({ name, value: typeof factory === 'function' ? factory() : undefined });
  };
  define.amd = { jQuery: true };
  if (loading === undefined)
    return { page: { define }, calls };
  const currentScript = {
    getAttribute: (attribute: string) => attribute === 'data-requiremodule' ? loading : null,
  };
  return { page: { define, document: { currentScript } }, calls };
}

/**
 * A page with d3-require's side of AMD, as Quarto's OJS runtime bundles it:
 * `define` queues a resolver whatever the name, and the loader pops it when
 * the script has loaded. Nothing queued is "invalid module".
 * @returns The page's globals, and the queue
 */
function d3RequirePage(): { page: Globals; queue: Array<() => unknown> } {
  const queue: Array<() => unknown> = [];
  const define = (...args: unknown[]): void => {
    let [, dependencies, factory] = args;
    if (args.length < 2) {
      factory = args[0];
      dependencies = [];
    } else if (args.length < 3) {
      factory = args[1];
      dependencies = typeof args[0] === 'string' ? [] : args[0];
    }
    const deps = dependencies as string[];
    queue.push(() => {
      if (deps.includes('exports')) {
        const exports = {};
        (factory as (...a: unknown[]) => void)(...deps.map(d => d === 'exports' ? exports : undefined));
        return exports;
      }
      return typeof factory === 'function' ? factory() : factory;
    });
  };
  define.amd = {};
  return { page: { define }, queue };
}

interface BuildConfig {
  name: string;
  entry: string;
  formats: string[];
  amdName: string | null;
}

describe('the UMD bundles with exports', () => {
  const configs = runModule<BuildConfig[]>(`
    import { builds } from '${BUILD_SCRIPT}';
    console.log(JSON.stringify(builds.map(b => ({
      name: b.name,
      entry: b.entry,
      formats: b.formats ?? ['es', 'umd'],
      amdName: b.amdName ?? null,
    }))));
  `);
  const exportsMap = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  }).exports;
  // The build also refuses one with no name, from the chunk's own exports;
  // this says which bundles that is before anything is built.
  const withExports = configs.filter(c => c.formats.includes('umd')
    && /^export\b/m.test(readFileSync(resolve(ROOT, c.entry), 'utf8')));

  it('should include every adapter a page loads by a script tag', () => {
    const names = withExports.map(c => c.name);

    expect(names).toEqual(expect.arrayContaining(['observable', 'echarts', 'highcharts']));
  });

  it.each(withExports.map(c => [c.name, c] as const))('should name %s by its import path', (name, config) => {
    expect(config.amdName).toBe(`maidr/${name}`);
    expect(exportsMap).toHaveProperty([`./${name}`]);
  });

  it('should refuse to build one with no name', () => {
    const dist = mkdtempSync(join(tmpdir(), 'maidr-umd-unnamed-'));
    try {
      const outcome = runModule<{ built?: true; error?: string }>(`
        import { build } from 'vite';
        import { builds, createViteConfig } from '${BUILD_SCRIPT}';
        const frappe = builds.find(b => b.name === 'frappe');
        const config = createViteConfig({ ...frappe, amdName: undefined, useDts: false, emptyOutDir: false });
        try {
          await build({ ...config, logLevel: 'silent' });
          console.log(JSON.stringify({ built: true }));
        } catch (error) {
          console.log(JSON.stringify({ error: error.message }));
        }
      `, { MAIDR_BUILD_OUTDIR: dist });

      expect(outcome.error).toMatch(/frappe\.js is a UMD bundle with exports and no `amdName`/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('observable.js on a page with an AMD loader', () => {
  let dist: string;
  let source: string;

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'maidr-umd-amd-'));
    runModule(`
      import { build } from 'vite';
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      const observable = builds.find(b => b.name === 'observable');
      const config = createViteConfig({ ...observable, useDts: false, emptyOutDir: false });
      await build({ ...config, logLevel: 'silent' });
      console.log('true');
    `, { MAIDR_BUILD_OUTDIR: dist });
    source = readFileSync(join(dist, 'observable.js'), 'utf8');
  }, 120_000);

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  /** What maidr's Quarto extension and the guide promise on the page global. */
  function expectPageGlobal(page: Globals): void {
    const api = page.maidrObservable as Globals;

    expect(typeof api.initObservablePlots).toBe('function');
    // The aliases the entry merges into the wrapper's object, and an export
    // only the wrapper writes there.
    expect(api.initQuartoObservable).toBe(api.initObservablePlots);
    expect(api.stopQuartoObservable).toBe(api.stopObservablePlots);
    expect(api.TraceType).toEqual(expect.objectContaining({ BAR: 'bar' }));
  }

  it('should run and set its global under require.js, registering only by name', () => {
    const { page, calls } = requireJsPage();

    const after = load(source, page);

    expectPageGlobal(after);
    expect(calls).toEqual([{ name: 'maidr/observable', value: after.maidrObservable }]);
  });

  it('should register by name from the page\'s own script tag', () => {
    const { page, calls } = requireJsPage(null);

    const after = load(source, page);

    expectPageGlobal(after);
    expect(calls).toEqual([{ name: 'maidr/observable', value: after.maidrObservable }]);
  });

  it('should register anonymously when require.js loads it, under any name', () => {
    // A `paths` alias, or a URL: require.js names an anonymous define after
    // the module it is loading, and a named one for another module would
    // leave that load `undefined`.
    const { page, calls } = requireJsPage('maidrObs');

    const after = load(source, page);

    expectPageGlobal(after);
    expect(calls).toEqual([{ name: null, value: after.maidrObservable }]);
  });

  it('should resolve a d3-require load to its global', () => {
    const { page, queue } = d3RequirePage();

    const after = load(source, page);

    expectPageGlobal(after);
    expect(queue).toHaveLength(1);
    expect(queue[0]()).toBe(after.maidrObservable);
  });

  it('should set its global with no loader on the page', () => {
    expectPageGlobal(load(source));
  });

  it('should replace a global left by an earlier copy, as before', () => {
    const earlier = { stale: true };

    const after = load(source, { maidrObservable: earlier });

    expect(after.maidrObservable).not.toBe(earlier);
    expectPageGlobal(after);
  });

  it('should fill module.exports for CommonJS and register nothing', () => {
    const { page, calls } = requireJsPage();
    const module = { exports: {} as Globals };

    load(source, { ...page, module, exports: module.exports });

    expect(typeof module.exports.initObservablePlots).toBe('function');
    expect(module.exports.TraceType).toEqual(expect.objectContaining({ BAR: 'bar' }));
    expect(calls).toEqual([]);
  });

  it('should pass the post-build check', () => {
    const problems = runModule<unknown[]>(`
      import { findAmdDefineProblems } from '${GUARD_SCRIPT}';
      console.log(JSON.stringify(findAmdDefineProblems(${JSON.stringify(dist)}, [
        { file: 'observable.js', amdName: 'maidr/observable' },
      ])));
    `);

    expect(problems).toEqual([]);
  });

  it('should leave the ES module alone', () => {
    const esm = readFileSync(join(dist, 'observable.mjs'), 'utf8');

    expect(esm).not.toMatch(/\bdefine\b/);
  });
});

describe('the wrapper rewrite', () => {
  const ROLLDOWN_UMD = [
    '(function(global, factory) {',
    '  typeof exports === \'object\' && typeof module !== \'undefined\' ?  factory(exports) :',
    '  typeof define === \'function\' && define.amd ? define([\'exports\'], factory) :',
    '  (global = typeof globalThis !== \'undefined\' ? globalThis : global || self, factory((global.maidrX = {})));',
    '})(this, function(exports) {',
    'exports.answer = 42;',
    '});',
  ].join('\n');

  function rewrite(code: string): { code: string; error?: undefined } | { code?: undefined; error: string } {
    return runModule(`
      import { withoutAmdBranch } from '${PLUGIN_SCRIPT}';
      try {
        console.log(JSON.stringify({ code: withoutAmdBranch(${JSON.stringify(code)}, 'maidrX', 'maidr/x') }));
      } catch (error) {
        console.log(JSON.stringify({ error: error.message }));
      }
    `);
  }

  it('should keep the line count, so the source map still lines up', () => {
    const lines = String(rewrite(ROLLDOWN_UMD).code).split('\n');

    expect(lines).toHaveLength(ROLLDOWN_UMD.split('\n').length);
    expect(lines.slice(4)).toEqual(ROLLDOWN_UMD.split('\n').slice(4));
  });

  it('should run the factory before registering', () => {
    const { page, calls } = requireJsPage();

    const after = load(String(rewrite(ROLLDOWN_UMD).code), page);

    expect(after.maidrX).toEqual({ answer: 42 });
    expect(calls).toEqual([{ name: 'maidr/x', value: { answer: 42 } }]);
  });

  it('should run the factory before registering with require.js loading it', () => {
    const { page, calls } = requireJsPage('https://example.org/x.js');

    const after = load(String(rewrite(ROLLDOWN_UMD).code), page);

    expect(after.maidrX).toEqual({ answer: 42 });
    expect(calls).toEqual([{ name: null, value: { answer: 42 } }]);
  });

  it('should refuse a wrapper it does not know', () => {
    // What rolldown writes for a bundle that imports an external.
    const withExternal = ROLLDOWN_UMD
      .replace('factory(exports) :', 'factory(exports, require(\'chart.js\')) :')
      .replace('define([\'exports\'], factory)', 'define([\'exports\', \'chart.js\'], factory)');

    expect(rewrite(withExternal).error).toMatch(/does not open with the wrapper/);
  });
});

describe('post-build AMD define check', () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'maidr-amd-define-'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  function find(scripts: Array<{ file: string; amdName: string }>): Array<{ file: string; problem: string }> {
    return runModule(`
      import { findAmdDefineProblems } from '${GUARD_SCRIPT}';
      console.log(JSON.stringify(findAmdDefineProblems(${JSON.stringify(dist)}, ${JSON.stringify(scripts)})));
    `);
  }

  const ECHARTS = [{ file: 'echarts.js', amdName: 'maidr/echarts' }];

  it('should flag the AMD branch rolldown writes', () => {
    writeFileSync(join(dist, 'echarts.js'), '(function(e,t){typeof exports==`object`&&typeof module<`u`?t(exports):typeof define==`function`&&define.amd?define([`exports`],t):(e=typeof globalThis<`u`?globalThis:e||self,t(e.maidrECharts={}))})(this,function(e){});');

    expect(find(ECHARTS)).toEqual([
      { file: 'echarts.js', problem: 'makes an anonymous `define` call' },
      { file: 'echarts.js', problem: 'does not register itself as the AMD module "maidr/echarts"' },
    ]);
  });

  it('should pass a script that registers after running, anonymously only for require.js', () => {
    writeFileSync(join(dist, 'echarts.js'), '(function(e,t){typeof exports==`object`&&typeof module<`u`?t(exports):(e=typeof globalThis<`u`?globalThis:e||self,t(e.maidrECharts={}),typeof define==`function`&&define.amd&&(typeof document<`u`&&document.currentScript&&document.currentScript.getAttribute(`data-requiremodule`)?define([],function(){return e.maidrECharts}):define(`maidr/echarts`,[],function(){return e.maidrECharts})))})(this,function(e){});');

    expect(find(ECHARTS)).toEqual([]);
  });

  it('should flag an anonymous define outside the require.js branch', () => {
    writeFileSync(join(dist, 'echarts.js'), 'document.currentScript.getAttribute(`data-requiremodule`)?define([],t):define(`maidr/echarts`,[],t);define([],t);');

    expect(find(ECHARTS)).toEqual([
      { file: 'echarts.js', problem: 'makes an anonymous `define` call' },
    ]);
  });

  it('should flag a registration under another name', () => {
    writeFileSync(join(dist, 'echarts.js'), 'typeof define=="function"&&define.amd&&define("maidr/highcharts",[],function(){});');

    expect(find(ECHARTS)).toEqual([
      { file: 'echarts.js', problem: 'does not register itself as the AMD module "maidr/echarts"' },
    ]);
  });

  it('should flag a script the build did not write', () => {
    expect(find(ECHARTS)).toEqual([{ file: 'echarts.js', problem: 'was not written' }]);
  });

  it('should read the classic scripts of the builds that name an amdName', () => {
    const scripts = runModule(`
      import { builds } from '${BUILD_SCRIPT}';
      import { classicScripts } from '${GUARD_SCRIPT}';
      console.log(JSON.stringify(classicScripts(builds.filter(b => ['echarts', 'react'].includes(b.name)))));
    `);

    expect(scripts).toEqual(ECHARTS);
  });
});

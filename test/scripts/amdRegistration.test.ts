import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

/**
 * Keeps maidr's classic scripts out of a page's AMD loader.
 *
 * `scripts/vite-plugin-amd-registration.js` has `maidr.js`, the locale packs
 * and the adapter bundles run as soon as they load and register afterwards:
 * by name from a script tag, and anonymously when require.js itself loads
 * one, so that load resolves under whatever name or URL the page asked for.
 * Its header says why. Pinned here: the plugin, a real build of a pack (an
 * IIFE, as maidr.js is) and of `observable.js` (a UMD adapter, which maidr's
 * Quarto extension loads beside maidr.js) run against each kind of loader
 * they meet, and the UMD wrapper rewrite. The config and the post-build check
 * are in test/scripts/classicScriptAmd.test.ts.
 *
 * `scripts/` is plain ESM JavaScript and `allowJs` is false, so the scripts
 * run in a node subprocess, as in esmRequireShim.test.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const PLUGIN_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/vite-plugin-amd-registration.js')).href;
const GUARD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/classicScriptAmd.js')).href;

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

/**
 * Build one bundle for real, by the real config, into a directory of its own.
 * @param name - The build's name in scripts/build.js
 * @param overrides - What to change in its config first, as JSON
 * @returns The directory, and the message the build failed with, if it did
 */
function buildBundle(name: string, overrides: Record<string, unknown> = {}): { dist: string; error?: string } {
  const dist = mkdtempSync(join(tmpdir(), `maidr-amd-${name}-`));
  const outcome = runModule<{ error?: string }>(`
    import { build } from 'vite';
    import { builds, createViteConfig } from '${BUILD_SCRIPT}';
    const config = builds.find(b => b.name === ${JSON.stringify(name)});
    const overrides = JSON.parse(${JSON.stringify(JSON.stringify(overrides))});
    try {
      await build({
        ...createViteConfig({ ...config, useDts: false, emptyOutDir: false, ...overrides }),
        logLevel: 'silent',
      });
      console.log(JSON.stringify({}));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  `, { MAIDR_BUILD_OUTDIR: dist });
  return { dist, ...outcome };
}

/**
 * Run the plugin's `renderChunk` on a chunk, the way Vite calls it.
 * @param amdName - The name the plugin is made with
 * @param code - The chunk
 * @param format - The output format
 * @param chunk - What else Vite says about the chunk
 * @param chunk.isEntry - Whether it is an entry chunk
 * @param chunk.exports - The names it exports
 * @returns The rewritten code, null when the chunk is left alone, or the
 *   message the plugin failed the build with
 */
function renderChunk(
  amdName: string | null,
  code: string,
  format: string,
  chunk: { isEntry: boolean; exports: string[] } = { isEntry: true, exports: [] },
): { code?: string | null; error?: string } {
  return runModule(`
    import { amdRegistration } from '${PLUGIN_SCRIPT}';
    const plugin = amdRegistration(${JSON.stringify(amdName ?? undefined)});
    const context = { error(message) { throw new Error(message); } };
    try {
      const result = plugin.renderChunk.call(
        context,
        ${JSON.stringify(code)},
        { ...${JSON.stringify(chunk)}, fileName: 'x.js' },
        { format: ${JSON.stringify(format)}, name: 'maidrX' },
      );
      console.log(JSON.stringify({ code: result === null ? null : result.code }));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  `);
}

describe('the registration plugin', () => {
  const IIFE = '(function(){globalThis.ran=(globalThis.ran||0)+1})();\n';

  it('should register an IIFE after it has run, by name from a script tag', () => {
    const { page, calls } = requireJsPage(null);

    const after = load(String(renderChunk('maidr', IIFE, 'iife').code), page);

    expect(after.ran).toBe(1);
    expect(calls).toEqual([{ name: 'maidr', value: undefined }]);
  });

  it('should register an IIFE anonymously when require.js loads it', () => {
    const { page, calls } = requireJsPage('../dist/maidr.js');

    const after = load(String(renderChunk('maidr', IIFE, 'iife').code), page);

    expect(after.ran).toBe(1);
    expect(calls).toEqual([{ name: null, value: undefined }]);
  });

  it('should leave ES output, and chunks that are not entries, alone', () => {
    expect(renderChunk('maidr/x', 'export {};', 'es').code).toBeNull();
    expect(renderChunk('maidr', IIFE, 'iife', { isEntry: false, exports: [] }).code).toBeNull();
  });

  it('should refuse a classic script with no amdName', () => {
    expect(renderChunk(null, IIFE, 'iife').error).toMatch(/x\.js is a classic script with no `amdName`/);
    expect(renderChunk(null, 'exports.a=1;', 'umd', { isEntry: true, exports: ['a'] }).error)
      .toMatch(/x\.js is a classic script with no `amdName`/);
  });

  it.each(['frappe', 'locale-ko'])('should fail a real build of %s with no amdName', (name) => {
    const { dist, error } = buildBundle(name, { amdName: null });
    rmSync(dist, { recursive: true, force: true });

    expect(error).toMatch(/is a classic script with no `amdName`/);
  }, 120_000);
});

describe('a built locale pack on a page with an AMD loader', () => {
  let dist: string;
  let pack: string;

  beforeAll(() => {
    const built = buildBundle('locale-ko');
    dist = built.dist;
    if (built.error)
      throw new Error(built.error);
    pack = readFileSync(join(dist, 'locale-ko.js'), 'utf8');
  }, 120_000);

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  function queuedLocales(page: Globals): string[] {
    const queue = (page.maidrLocales ?? []) as Array<[string, unknown]>;
    return queue.map(([code]) => code);
  }

  it('should be an IIFE that assigns no global', () => {
    expect(pack.startsWith('(function(){')).toBe(true);
  });

  it('should run, and register by name, from a script tag on a require.js page', () => {
    // Anonymous is what require.js rejects with "Mismatched anonymous define()".
    const { page, calls } = requireJsPage(null);

    const after = load(pack, page);

    expect(queuedLocales(after)).toEqual(['ko']);
    expect(calls).toEqual([{ name: 'maidr/locale/ko', value: undefined }]);
  });

  it('should register by name where there is no document', () => {
    const { page, calls } = requireJsPage();

    const after = load(pack, page);

    expect(queuedLocales(after)).toEqual(['ko']);
    expect(calls).toEqual([{ name: 'maidr/locale/ko', value: undefined }]);
  });

  it('should run, and register anonymously, when require.js loads it by URL', () => {
    // require.js names an anonymous define after the module it is loading;
    // one named `maidr/locale/ko` would leave a load by URL `undefined`, and
    // fail "No define call" under enforceDefine.
    const { page, calls } = requireJsPage('../../dist/locale-ko.js');

    const after = load(pack, page);

    expect(queuedLocales(after)).toEqual(['ko']);
    expect(calls).toEqual([{ name: null, value: undefined }]);
  });

  it('should resolve when d3-require loads it as a module', () => {
    // d3-require rejects a script that defines nothing with "invalid module".
    const { page, queue } = d3RequirePage();

    const after = load(pack, page);

    expect(queuedLocales(after)).toEqual(['ko']);
    expect(queue).toHaveLength(1);
    expect(queue[0]()).toBeUndefined();
  });

  it('should run where there is no define at all', () => {
    expect(queuedLocales(load(pack))).toEqual(['ko']);
  });

  it('should pass the post-build check', () => {
    const problems = runModule<unknown[]>(`
      import { builds } from '${BUILD_SCRIPT}';
      import { classicScripts, findClassicScriptAmdProblems } from '${GUARD_SCRIPT}';
      const scripts = classicScripts(builds.filter(b => b.name === 'locale-ko'));
      console.log(JSON.stringify(findClassicScriptAmdProblems(${JSON.stringify(dist)}, scripts)));
    `);

    expect(problems).toEqual([]);
  });

  it('should leave the ES pack alone', () => {
    expect(readFileSync(join(dist, 'locale-ko.mjs'), 'utf8')).not.toMatch(/\bdefine\b/);
  });
});

describe('observable.js on a page with an AMD loader', () => {
  let dist: string;
  let source: string;

  beforeAll(() => {
    const built = buildBundle('observable');
    dist = built.dist;
    if (built.error)
      throw new Error(built.error);
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

  it('should run and set its global, registering by name where there is no document', () => {
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
      import { builds } from '${BUILD_SCRIPT}';
      import { classicScripts, findClassicScriptAmdProblems } from '${GUARD_SCRIPT}';
      const scripts = classicScripts(builds.filter(b => b.name === 'observable'));
      console.log(JSON.stringify(findClassicScriptAmdProblems(${JSON.stringify(dist)}, scripts)));
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

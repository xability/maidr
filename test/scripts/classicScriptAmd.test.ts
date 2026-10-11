import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

/**
 * Guards `maidr.js` and the locale packs against an AMD loader on the page,
 * and holds the post-build check every classic script passes.
 *
 * Both were UMD. An entry with no exports gets a wrapper that hands it to any
 * AMD `define` as an anonymous module instead of running it, so under the
 * require.js Quarto loads on every page a Jupyter render writes HTML into,
 * maidr never booted, a pack never registered, and require.js threw
 * "Mismatched anonymous define()" at the page's next `require()`.
 *
 * They are IIFEs now, and each registers itself under its import path once it
 * has run, so a loader that loads one as a module -- d3-require in Observable
 * and Quarto `{ojs}` cells rejects a script that defines nothing -- still
 * resolves. Pinned here: the config, a real pack evaluated the way each kind
 * of page runs it, and the post-build check that `scripts/build.js` runs on
 * the classic scripts of every build, the adapter bundles' among them.
 *
 * `scripts/` is plain ESM JavaScript and `allowJs` is false, so the config and
 * the check are read in a node subprocess, as in esmRequireShim.test.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const GUARD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/classicScriptAmd.js')).href;

function runNode(source: string, env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env },
  );
}

function runModule<T>(source: string): T {
  return JSON.parse(runNode(source).trim()) as T;
}

interface Problem {
  file: string;
  problem: string;
}

/** A classic script the check reads, as `classicScripts` lists it. */
interface ClassicScript {
  file: string;
  format: string;
  amdName: string | null;
}

function findProblems(dir: string, scripts: ClassicScript[]): Problem[] {
  return runModule<Problem[]>(`
    import { findClassicScriptAmdProblems } from '${GUARD_SCRIPT}';
    console.log(JSON.stringify(findClassicScriptAmdProblems(${JSON.stringify(dir)}, ${JSON.stringify(scripts)})));
  `);
}

/**
 * The classic scripts the real config writes for the named builds.
 * @param names - Build names from scripts/build.js
 * @returns What the post-build check reads for them
 */
function classicScriptsOf(names: string[]): ClassicScript[] {
  return runModule<ClassicScript[]>(`
    import { builds } from '${BUILD_SCRIPT}';
    import { classicScripts } from '${GUARD_SCRIPT}';
    console.log(JSON.stringify(classicScripts(builds.filter(b => ${JSON.stringify(names)}.includes(b.name)))));
  `);
}

interface BundleConfig {
  name: string;
  entry: string;
  formats: string[];
  /** What the AMD-name plugin appends to an `iife` entry chunk, if registered. */
  iifeTail: string | null;
  /** What it does to an `es` chunk: null leaves the chunk alone. */
  esResult: unknown;
}

/** A top-level `export` statement in an entry's source. */
const ENTRY_EXPORT = /^export\s/m;

function bundleConfigs(): BundleConfig[] {
  return runModule<BundleConfig[]>(`
    import { builds, createViteConfig } from '${BUILD_SCRIPT}';
    const out = builds.map((b) => {
      const plugin = createViteConfig(b).plugins.flat()
        .find(p => p && p.name === 'maidr:amd-module-name');
      return {
        name: b.name,
        entry: b.entry,
        formats: b.formats,
        iifeTail: plugin ? plugin.renderChunk('', { isEntry: true }, { format: 'iife' }).code : null,
        esResult: plugin ? plugin.renderChunk('', { isEntry: true }, { format: 'es' }) : null,
      };
    });
    console.log(JSON.stringify(out));
  `);
}

describe('classic script build config', () => {
  const configs = bundleConfigs();
  const packs = configs.filter(c => c.name.startsWith('locale-'));

  it('should build maidr.js as an IIFE only', () => {
    const core = configs.find(c => c.name === 'core');

    expect(core?.formats).toEqual(['iife']);
  });

  it('should build every locale pack as an ES module and an IIFE', () => {
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs)
      expect(pack.formats).toEqual(['es', 'iife']);
  });

  it('should register the core and every pack under its import path', () => {
    const core = configs.find(c => c.name === 'core');

    expect(core?.iifeTail).toBe(';typeof define=="function"&&define.amd&&define("maidr",[],function(){});\n');
    for (const pack of packs) {
      const locale = pack.name.slice('locale-'.length);
      expect(pack.iifeTail).toContain(`define("maidr/locale/${locale}",[],function(){})`);
    }
  });

  it('should build no entry without exports as UMD', () => {
    // A UMD wrapper hands an entry with no exports to an AMD define instead of
    // running it. The post-build check flags the bundle that comes out; this
    // says which one it would be before anything is built.
    const exportless = configs.filter(c =>
      !ENTRY_EXPORT.test(readFileSync(resolve(ROOT, c.entry), 'utf8')));

    expect(exportless.map(c => c.name)).toEqual(expect.arrayContaining(['core', 'locale-ko']));
    expect(exportless.filter(c => c.formats.includes('umd')).map(c => c.name)).toEqual([]);
  });

  it('should register no other bundle', () => {
    const registered = configs.filter(c => c.iifeTail !== null).map(c => c.name);

    expect(registered).toEqual(['core', ...packs.map(p => p.name)]);
  });

  it('should leave the ES output alone', () => {
    for (const config of configs.filter(c => c.iifeTail !== null))
      expect(config.esResult).toBeNull();
  });
});

/** A `define` that records its calls, shaped like require.js's. */
interface RecordingDefine {
  (...args: unknown[]): void;
  amd: object;
  calls: unknown[][];
}

function recordingDefine(): RecordingDefine {
  const calls: unknown[][] = [];
  const define = ((...args: unknown[]) => {
    calls.push(args);
  }) as RecordingDefine;
  define.amd = { jQuery: true };
  define.calls = calls;
  return define;
}

type Require = (name: unknown) => unknown;

/**
 * d3-require's `define`, as bundled in Quarto's OJS runtime: each call queues a
 * loader, and `require` pops the last one once the script's `load` fires. A
 * script that defines nothing leaves the queue empty, and the pop then throws
 * -- which d3-require reports as "invalid module".
 * @param queue - Where each `define` call queues its loader
 * @returns The `define` d3-require installs while a script loads
 */
function d3RequireDefine(queue: Array<(require: Require) => Promise<unknown>>) {
  const define = (...args: unknown[]): void => {
    let [name, dependencies, factory] = args;
    if (args.length < 2) {
      factory = name;
      dependencies = [];
    } else if (args.length < 3) {
      factory = dependencies;
      dependencies = typeof name === 'string' ? [] : name;
    }
    queue.push(require => Promise.all((dependencies as unknown[]).map(require)).then(deps =>
      typeof factory === 'function' ? factory(...deps) : factory));
  };
  define.amd = {};
  return define;
}

describe('a built locale pack', () => {
  let dir: string;
  let pack: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'maidr-pack-'));
    // The real pack, built by the real config into a directory of its own.
    runNode(`
      import { build } from 'vite';
      import { builds, createViteConfig } from '${BUILD_SCRIPT}';
      const config = builds.find(b => b.name === 'locale-ko');
      await build({ ...createViteConfig({ ...config, emptyOutDir: false }), logLevel: 'silent' });
    `, { ...process.env, MAIDR_BUILD_OUTDIR: dir });
    pack = readFileSync(join(dir, 'locale-ko.js'), 'utf8');
  }, 60_000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(globals: Record<string, unknown>): vm.Context {
    const context = vm.createContext({ ...globals });
    vm.runInContext(pack, context);
    return context;
  }

  function queuedLocales(context: vm.Context): string[] {
    const queue = (context.maidrLocales ?? []) as Array<[string, unknown]>;
    return queue.map(([code]) => code);
  }

  it('should be an IIFE that assigns no global', () => {
    expect(pack.startsWith('(function(){')).toBe(true);
  });

  it('should run, and register by name, where require.js has defined define', () => {
    const define = recordingDefine();

    const context = run({ define });

    // Anonymous is what require.js rejects with "Mismatched anonymous define()".
    expect(define.calls.filter(args => typeof args[0] !== 'string')).toHaveLength(0);
    expect(define.calls.map(([name, deps, factory]) => [name, Array.from(deps as unknown[]), typeof factory]))
      .toEqual([['maidr/locale/ko', [], 'function']]);
    expect(queuedLocales(context)).toEqual(['ko']);
  });

  it('should resolve when d3-require loads it as a module', async () => {
    const queue: Array<(require: Require) => Promise<unknown>> = [];

    const context = run({ define: d3RequireDefine(queue) });

    expect(queuedLocales(context)).toEqual(['ko']);
    expect(queue).toHaveLength(1);
    await expect(queue.pop()?.(name => name)).resolves.toBeUndefined();
  });

  it('should run where there is no define at all', () => {
    const context = run({});

    expect(queuedLocales(context)).toEqual(['ko']);
  });

  it('should pass the post-build check', () => {
    expect(findProblems(dir, classicScriptsOf(['locale-ko']))).toEqual([]);
  });
});

describe('post-build classic script check', () => {
  const BODY = 'var e=1;globalThis.maidrLocales??=[];';
  const UMD = `(function(e){typeof define==\`function\`&&define.amd?define([],e):e()})(function(){${BODY}});\n`;
  const iife = (name: string): string =>
    `(function(){${BODY}})(),typeof define==\`function\`&&define.amd&&define(\`${name}\`,[],function(){});\n`;
  const CORE: ClassicScript = { file: 'maidr.js', format: 'iife', amdName: 'maidr' };
  const pack = (locale: string): ClassicScript =>
    ({ file: `locale-${locale}.js`, format: 'iife', amdName: `maidr/locale/${locale}` });
  const ECHARTS: ClassicScript = { file: 'echarts.js', format: 'umd', amdName: 'maidr/echarts' };
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'maidr-classic-'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('should list the classic outputs of the builds it is given, not their ES ones', () => {
    expect(classicScriptsOf(['core', 'locale-ko', 'echarts', 'react'])).toEqual([
      CORE,
      ECHARTS,
      pack('ko'),
    ]);
  });

  it('should pass an IIFE core and pack that register their names', () => {
    writeFileSync(join(dist, 'maidr.js'), iife('maidr'));
    writeFileSync(join(dist, 'locale-ko.js'), iife('maidr/locale/ko'));
    writeFileSync(join(dist, 'locale-pt-BR.js'), iife('maidr/locale/pt-BR'));

    expect(findProblems(dist, [CORE, pack('ko'), pack('pt-BR')])).toEqual([]);
  });

  it('should flag a UMD core as both not an IIFE and an anonymous define', () => {
    writeFileSync(join(dist, 'maidr.js'), UMD);

    expect(findProblems(dist, [CORE]).map(p => p.problem)).toEqual([
      'is not an IIFE starting `(function(){`',
      'makes an anonymous `define` call',
      'does not register itself as the AMD module "maidr"',
    ]);
  });

  it('should flag an IIFE that assigns a global', () => {
    // A classic script's top-level var replaces the chart data a page may
    // still hand over as window.maidr.
    writeFileSync(join(dist, 'maidr.js'), `var maidr=${iife('maidr')}`);

    expect(findProblems(dist, [CORE])).toEqual([
      { file: 'maidr.js', problem: 'is not an IIFE starting `(function(){`' },
    ]);
  });

  it('should flag an anonymous define inside an IIFE', () => {
    writeFileSync(join(dist, 'locale-ko.js'), `(function(){define(function(){});${BODY}})();${iife('maidr/locale/ko')}`);

    expect(findProblems(dist, [pack('ko')])).toEqual([
      { file: 'locale-ko.js', problem: 'makes an anonymous `define` call' },
    ]);
  });

  it('should flag a pack registered under the wrong name', () => {
    writeFileSync(join(dist, 'locale-ja.js'), iife('maidr/locale/ko'));

    expect(findProblems(dist, [pack('ja')])).toEqual([
      { file: 'locale-ja.js', problem: 'does not register itself as the AMD module "maidr/locale/ja"' },
    ]);
  });

  it('should flag a classic script whose build names no amdName', () => {
    writeFileSync(join(dist, 'maidr.js'), iife('maidr'));

    expect(findProblems(dist, [{ ...CORE, amdName: null }])).toEqual([
      { file: 'maidr.js', problem: 'has no `amdName` to register under' },
    ]);
  });

  it('should ignore member calls and properties named define', () => {
    writeFileSync(join(dist, 'maidr.js'), `(function(){o.define(x);Object.defineProperty(a,b,c);${BODY}})();${iife('maidr')}`);

    expect(findProblems(dist, [CORE])).toEqual([]);
  });

  it('should flag the AMD branch rolldown writes into a UMD bundle', () => {
    writeFileSync(join(dist, 'echarts.js'), '(function(e,t){typeof exports==`object`&&typeof module<`u`?t(exports):typeof define==`function`&&define.amd?define([`exports`],t):(e=typeof globalThis<`u`?globalThis:e||self,t(e.maidrECharts={}))})(this,function(e){});');

    expect(findProblems(dist, [ECHARTS])).toEqual([
      { file: 'echarts.js', problem: 'makes an anonymous `define` call' },
      { file: 'echarts.js', problem: 'does not register itself as the AMD module "maidr/echarts"' },
    ]);
  });

  it('should pass a UMD bundle that registers after running, anonymously only for require.js', () => {
    writeFileSync(join(dist, 'echarts.js'), '(function(e,t){typeof exports==`object`&&typeof module<`u`?t(exports):(e=typeof globalThis<`u`?globalThis:e||self,t(e.maidrECharts={}),typeof define==`function`&&define.amd&&(typeof document<`u`&&document.currentScript&&document.currentScript.getAttribute(`data-requiremodule`)?define([],function(){return e.maidrECharts}):define(`maidr/echarts`,[],function(){return e.maidrECharts})))})(this,function(e){});');

    expect(findProblems(dist, [ECHARTS])).toEqual([]);
  });

  it('should flag an anonymous define outside the require.js branch', () => {
    writeFileSync(join(dist, 'echarts.js'), 'document.currentScript.getAttribute(`data-requiremodule`)?define([],t):define(`maidr/echarts`,[],t);define([],t);');

    expect(findProblems(dist, [ECHARTS])).toEqual([
      { file: 'echarts.js', problem: 'makes an anonymous `define` call' },
    ]);
  });

  it('should flag a script the build did not write', () => {
    expect(findProblems(dist, [ECHARTS])).toEqual([{ file: 'echarts.js', problem: 'was not written' }]);
  });

  it('should read only the scripts it is given', () => {
    // A selective build leaves the rest of dist as an older build wrote it.
    writeFileSync(join(dist, 'highcharts.js'), UMD);
    writeFileSync(join(dist, 'locale-ko.mjs'), 'export {};\n');

    expect(findProblems(dist, [])).toEqual([]);
  });

  it('should throw from the assertion, naming each file', () => {
    writeFileSync(join(dist, 'maidr.js'), UMD);
    writeFileSync(join(dist, 'locale-ko.js'), iife('maidr/locale/ko'));

    const message = runModule<string>(`
      import { assertClassicScriptsRunWithoutAmd } from '${GUARD_SCRIPT}';
      try {
        assertClassicScriptsRunWithoutAmd(${JSON.stringify(dist)}, ${JSON.stringify([CORE, pack('ko')])});
        console.log(JSON.stringify('no error'));
      } catch (error) {
        console.log(JSON.stringify(error.message));
      }
    `);

    expect(message).toContain('maidr.js makes an anonymous `define` call');
    expect(message).not.toContain('locale-ko.js');
  });
});

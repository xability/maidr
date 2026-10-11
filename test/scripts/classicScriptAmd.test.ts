import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The build config and the post-build check that keep maidr's classic scripts
 * -- `maidr.js`, the locale packs and the adapter bundles -- out of a page's
 * AMD loader.
 *
 * Built as UMD, each was handed to any AMD `define` on the page as an
 * anonymous module instead of running, so under the require.js Quarto loads on
 * every page a Jupyter render writes HTML into, maidr never booted, a pack
 * never registered, an adapter's global was never set, and require.js threw
 * "Mismatched anonymous define()" at the page's next `require()`. Now each
 * runs first and then registers itself
 * (`scripts/vite-plugin-amd-registration.js`, test/scripts/amdRegistration.test.ts).
 * Pinned here: what the config builds and names, and the check
 * `scripts/build.js` runs on the classic scripts of every build.
 *
 * `scripts/` is plain ESM JavaScript and `allowJs` is false, so the config and
 * the check are read in a node subprocess, as in esmRequireShim.test.
 */

const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;
const GUARD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/classicScriptAmd.js')).href;

function runModule<T>(source: string): T {
  return JSON.parse(execFileSync(
    process.execPath,
    ['--input-type=module', '-e', source],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  ).trim()) as T;
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
  amdName: string | null;
}

/** A top-level `export` statement in an entry's source. */
const ENTRY_EXPORT = /^export\s/m;

function bundleConfigs(): BundleConfig[] {
  return runModule<BundleConfig[]>(`
    import { builds } from '${BUILD_SCRIPT}';
    console.log(JSON.stringify(builds.map(b => ({
      name: b.name,
      entry: b.entry,
      formats: b.formats,
      amdName: b.amdName ?? null,
    }))));
  `);
}

/**
 * The subpath of package.json's `exports` an AMD name stands for.
 * @param amdName - `maidr`, `maidr/locale/<code>` or `maidr/<adapter>`
 * @returns `.`, `./locale/*` or `./<adapter>`
 */
function exportsSubpath(amdName: string): string {
  if (amdName === 'maidr')
    return '.';
  return amdName.startsWith('maidr/locale/') ? './locale/*' : `./${amdName.slice('maidr/'.length)}`;
}

describe('classic script build config', () => {
  const configs = bundleConfigs();
  const packs = configs.filter(c => c.name.startsWith('locale-'));
  const classic = configs.filter(c => c.formats.some(format => format !== 'es'));
  const exportsMap = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  }).exports;

  it('should build maidr.js as an IIFE only', () => {
    const core = configs.find(c => c.name === 'core');

    expect(core?.formats).toEqual(['iife']);
  });

  it('should build every locale pack as an ES module and an IIFE', () => {
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs)
      expect(pack.formats).toEqual(['es', 'iife']);
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

  it('should build the adapters a page loads by a script tag as UMD', () => {
    const umd = classic.filter(c => c.formats.includes('umd')).map(c => c.name);

    expect(umd).toEqual(expect.arrayContaining(['observable', 'echarts', 'highcharts']));
  });

  it.each(classic.map(c => [c.name, c] as const))('should name %s by its import path', (name, config) => {
    const expected = name === 'core'
      ? 'maidr'
      : name.startsWith('locale-') ? `maidr/locale/${name.slice('locale-'.length)}` : `maidr/${name}`;

    expect(config.amdName).toBe(expected);
    expect(exportsMap).toHaveProperty([exportsSubpath(expected)]);
  });
});

describe('post-build classic script check', () => {
  const BODY = 'var e=1;globalThis.maidrLocales??=[];';
  const UMD = `(function(e){typeof define==\`function\`&&define.amd?define([],e):e()})(function(){${BODY}});\n`;
  // The registration as the minifier leaves it: anonymous while require.js
  // loads the script, named otherwise.
  const registration = (name: string, value: string): string =>
    `typeof define==\`function\`&&define.amd&&(typeof document<\`u\`&&document.currentScript&&document.currentScript.getAttribute(\`data-requiremodule\`)?define([],${value}):define(\`${name}\`,[],${value}))`;
  const iife = (name: string): string =>
    `(function(){${BODY}})(),${registration(name, 'function(){}')};\n`;
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
      'does not register anonymously when require.js loads it',
    ]);
  });

  it('should flag a script that registers only by name', () => {
    // require.js loading it by URL, or under any id but its import path,
    // would then resolve to undefined, or fail "No define call" under
    // enforceDefine.
    writeFileSync(join(dist, 'maidr.js'), `(function(){${BODY}})(),typeof define==\`function\`&&define.amd&&define(\`maidr\`,[],function(){});\n`);

    expect(findProblems(dist, [CORE])).toEqual([
      { file: 'maidr.js', problem: 'does not register anonymously when require.js loads it' },
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
      { file: 'echarts.js', problem: 'does not register anonymously when require.js loads it' },
    ]);
  });

  it('should pass a UMD bundle that registers after running, anonymously only for require.js', () => {
    writeFileSync(join(dist, 'echarts.js'), `(function(e,t){typeof exports==\`object\`&&typeof module<\`u\`?t(exports):(e=typeof globalThis<\`u\`?globalThis:e||self,t(e.maidrECharts={}),${registration('maidr/echarts', 'function(){return e.maidrECharts}')})})(this,function(e){});`);

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

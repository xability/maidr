import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Tests for scripts/vite-plugin-math-stylesheet.js.
 *
 * The plugin lifts KaTeX's stylesheet out of `dist/maidr.css` and republishes
 * it as `dist/maidr-math.css`, which `src/util/katex.ts` links on demand. Two
 * properties make that safe, and both are pinned here:
 *
 * - **Every relative `url()` is inlined.** The stylesheet is emitted into
 *   `dist`, nowhere near the `node_modules` directory it was read from, so a
 *   surviving `url(fonts/…)` would resolve to nothing. Sandboxed embedding
 *   contexts also routinely allow a CDN for `style-src` but not for `font-src`,
 *   which is why the fonts have to travel inside the file rather than beside it.
 * - **A face without a woff2 alternative still ships.** The trim step leaves it
 *   alone, and the inline step then has to carry its legacy sources across —
 *   otherwise trimming conservatively would produce a broken stylesheet.
 *
 * The plugin is plain ESM JS (scripts/build.js imports it directly from node)
 * and `tsconfig.json` sets `allowJs: false`, so it is exercised through a node
 * subprocess rather than imported, mirroring test/scripts/woff2OnlyFonts.
 */

const MODULE = pathToFileURL(
  resolve(__dirname, '../../scripts/vite-plugin-math-stylesheet.js'),
).href;

/**
 * Runs `buildMathStylesheet` in a child node process, with the font files
 * faked by a plain path -> contents map.
 */
const RUNNER = `
import { buildMathStylesheet } from ${JSON.stringify(MODULE)};
const fonts = JSON.parse(process.env.FIXTURE_FONTS);
try {
  const result = buildMathStylesheet(
    process.env.FIXTURE_CSS,
    specifier => (specifier in fonts ? Buffer.from(fonts[specifier], 'utf8') : null),
  );
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message }));
}
`;

interface Result {
  css?: string;
  inlined?: number;
  rewritten?: number;
  skipped?: number;
  error?: string;
}

/** Builds the stylesheet from `css`, resolving fonts out of `fonts`. */
function build(css: string, fonts: Record<string, string> = {}): Result {
  const stdout = execFileSync('node', ['--input-type=module', '-e', RUNNER], {
    env: { ...process.env, FIXTURE_CSS: css, FIXTURE_FONTS: JSON.stringify(fonts) },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return JSON.parse(stdout) as Result;
}

/** Base64 of "woff2!", short enough to assert on in full. */
const WOFF2_BYTES = 'woff2!';
const WOFF2_BASE64 = Buffer.from(WOFF2_BYTES, 'utf8').toString('base64');

/** A face in the exact shape KaTeX ships: woff2, then woff, then ttf. */
function katexFace(family: string): string {
  return `@font-face{font-display:block;font-family:${family};font-style:normal;font-weight:400;`
    + `src:url(fonts/${family}-Regular.woff2) format("woff2"),`
    + `url(fonts/${family}-Regular.woff) format("woff"),`
    + `url(fonts/${family}-Regular.ttf) format("truetype")}`;
}

/** The font files `katexFace(family)` refers to, with the woff2 one present. */
function katexFonts(family: string): Record<string, string> {
  return {
    [`fonts/${family}-Regular.woff2`]: WOFF2_BYTES,
    [`fonts/${family}-Regular.woff`]: 'woff',
    [`fonts/${family}-Regular.ttf`]: 'ttf',
  };
}

describe('buildMathStylesheet', () => {
  it('should inline the woff2 source of a KaTeX face and drop the rest', () => {
    const result = build(katexFace('KaTeX_AMS'), katexFonts('KaTeX_AMS'));

    expect(result.error).toBeUndefined();
    expect(result.css).toBe(
      '@font-face{font-display:block;font-family:KaTeX_AMS;font-style:normal;font-weight:400;'
      + `src:url(data:font/woff2;base64,${WOFF2_BASE64}) format("woff2")}`,
    );
    expect(result.inlined).toBe(1);
    expect(result.rewritten).toBe(1);
  });

  it('should inline every face in a stylesheet with many', () => {
    const css = ['KaTeX_AMS', 'KaTeX_Main', 'KaTeX_Math'].map(katexFace).join('');
    const fonts = Object.assign({}, ...['KaTeX_AMS', 'KaTeX_Main', 'KaTeX_Math'].map(katexFonts));

    const result = build(css, fonts);

    expect(result.inlined).toBe(3);
    expect(result.rewritten).toBe(3);
    expect(result.css).not.toContain('url(fonts/');
  });

  it('should carry the legacy sources of a face that offers no woff2', () => {
    // The trim step leaves this face alone rather than emptying its src, so the
    // inline step is the only thing standing between it and a dead `url()`.
    const css = '@font-face{font-family:Legacy;'
      + 'src:url(fonts/Legacy.woff) format("woff"),url(fonts/Legacy.ttf) format("truetype")}';

    const result = build(css, { 'fonts/Legacy.woff': 'w', 'fonts/Legacy.ttf': 't' });

    expect(result.skipped).toBe(1);
    expect(result.inlined).toBe(2);
    expect(result.css).toContain('url(data:font/woff;base64,');
    expect(result.css).toContain('url(data:font/ttf;base64,');
  });

  it('should leave absolute and data URLs alone', () => {
    // None of these move when the stylesheet does, so rewriting them would only
    // risk breaking a reference that already resolves.
    const css = '@font-face{font-family:Kept;'
      + 'src:url(data:font/woff2;base64,AAA) format("woff2")}'
      + '.a{background:url(https://example.test/a.svg)}'
      + '.b{background:url(//example.test/b.svg)}'
      + '.c{background:url(/c.svg)}';

    const result = build(css);

    expect(result.error).toBeUndefined();
    expect(result.inlined).toBe(0);
    expect(result.css).toBe(css);
  });

  it('should read the file behind a url() carrying a query or fragment', () => {
    // `?#iefix` is the conventional suffix on an .eot source; a cache buster
    // shows up the same way. Neither is part of the filename on disk.
    const css = '@font-face{font-family:Legacy;src:url(fonts/Legacy.eot?#iefix) '
      + 'format("embedded-opentype")}';

    const result = build(css, { 'fonts/Legacy.eot': 'e' });

    expect(result.error).toBeUndefined();
    expect(result.css).toContain('url(data:application/vnd.ms-fontobject;base64,');
  });

  it('should fail the build when a referenced font is missing', () => {
    // Emitting the stylesheet anyway would ship a `url()` resolving to nothing,
    // and maths would render in a fallback face with no sign anything is wrong.
    const result = build(katexFace('KaTeX_AMS'), {});

    expect(result.error).toContain('KaTeX_AMS-Regular.woff2');
    expect(result.css).toBeUndefined();
  });

  it('should fail the build on a relative url() of an unknown type', () => {
    const result = build('.a{background:url(images/logo.png)}', { 'images/logo.png': 'p' });

    expect(result.error).toContain('no known MIME type');
  });

  it('should honour the quotes around a url() target', () => {
    const css = '@font-face{font-family:Quoted;src:url("fonts/Quoted.woff2") format("woff2")}';

    const result = build(css, { 'fonts/Quoted.woff2': WOFF2_BYTES });

    expect(result.inlined).toBe(1);
    expect(result.css).toContain(`url(data:font/woff2;base64,${WOFF2_BASE64})`);
  });
});

/**
 * Runs `readMathStylesheet` against the real `katex` package in node_modules.
 * This is the case that actually ships, so it is worth asserting on directly
 * rather than only through fixtures.
 */
const REAL_RUNNER = `
import { readMathStylesheet, CORE_STYLESHEET_PLACEHOLDER } from ${JSON.stringify(MODULE)};
try {
  const result = readMathStylesheet();
  process.stdout.write(JSON.stringify({
    ...result,
    // The stylesheet is ~360 kB of base64; only its shape matters here.
    css: undefined,
    bytes: Buffer.byteLength(result.css),
    hasRelativeUrl: /url\\(\\s*['"]?(?!data:|https?:|\\/)[^'")]+\\)/.test(result.css),
    hasLegacyFormat: /format\\(\\s*['"]?(?:woff|truetype)['"]?\\s*\\)/i.test(result.css),
    placeholder: CORE_STYLESHEET_PLACEHOLDER,
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message }));
}
`;

describe('readMathStylesheet', () => {
  let result: {
    bytes?: number;
    inlined?: number;
    skipped?: number;
    hasRelativeUrl?: boolean;
    hasLegacyFormat?: boolean;
    placeholder?: string;
    error?: string;
  };

  beforeAll(() => {
    const stdout = execFileSync('node', ['--input-type=module', '-e', REAL_RUNNER], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    result = JSON.parse(stdout);
  });

  it('should inline every font KaTeX ships, with none skipped', () => {
    expect(result.error).toBeUndefined();
    expect(result.skipped).toBe(0);
    // KaTeX has shipped 20 faces for many versions; assert it is not zero and
    // not wildly off rather than pinning a number an upgrade would break.
    expect(result.inlined).toBeGreaterThanOrEqual(15);
  });

  it('should emit a self-contained stylesheet with no legacy font formats', () => {
    expect(result.hasRelativeUrl).toBe(false);
    expect(result.hasLegacyFormat).toBe(false);
  });

  it('should weigh what the on-demand payload is meant to weigh', () => {
    // ~360 kB. A collapse to a few kB would mean the fonts stopped being
    // inlined, which is exactly the regression that breaks sandboxed embeds.
    expect(result.bytes).toBeGreaterThan(250_000);
    expect(result.bytes).toBeLessThan(600_000);
  });

  it('should explain itself in the placeholder maidr.css', () => {
    // The file is published empty of rules; without this it reads as a broken
    // asset to anyone who opens it.
    expect(result.placeholder).toContain('maidr-math.css');
  });
});

/**
 * Exercises the plugin's `generateBundle` hook against a faked bundle.
 *
 * The pure functions above cover what the stylesheet ends up containing. What
 * they cannot cover is the wiring, and two parts of it are load-bearing:
 *
 * - **The placeholder is emitted only when the bundle has no `maidr.css`.**
 *   That guard is what stops the placeholder overwriting real CSS the day MAIDR
 *   grows some, and nothing but this test would notice it inverting.
 * - **The stylesheet is prepared once per plugin instance.** A bundle built for
 *   both `es` and `umd` runs the hook twice; re-reading and re-base64ing ~360 kB
 *   of fonts for a byte-identical result would be pure waste.
 */
const PLUGIN_RUNNER = `
import { mathStylesheet, CORE_STYLESHEET_FILENAME, MATH_STYLESHEET_FILENAME }
  from ${JSON.stringify(MODULE)};
import { Buffer } from 'node:buffer';

const scenarios = JSON.parse(process.env.FIXTURE_SCENARIOS);
const results = {};

for (const scenario of scenarios) {
  const plugin = mathStylesheet();
  const emitted = [];
  const warns = [];
  const infos = [];
  const context = {
    emitFile: file => emitted.push(file),
    warn: m => warns.push(String(m)),
    info: m => infos.push(String(m)),
  };

  let error = null;
  try {
    // Run the hook once per output, as vite does for a dual-format bundle.
    for (let i = 0; i < scenario.outputs; i++) {
      plugin.generateBundle.call(context, {}, { ...scenario.bundle });
    }
  } catch (e) {
    error = e.message;
  }

  results[scenario.name] = {
    // The maths stylesheet is ~360 kB of base64; only its shape matters here.
    emitted: emitted.map(f => ({
      type: f.type,
      fileName: f.fileName,
      bytes: Buffer.byteLength(f.source),
      isPlaceholder: f.fileName === CORE_STYLESHEET_FILENAME,
      hasFontFace: f.source.includes('@font-face'),
    })),
    mathCount: emitted.filter(f => f.fileName === MATH_STYLESHEET_FILENAME).length,
    placeholderCount: emitted.filter(f => f.fileName === CORE_STYLESHEET_FILENAME).length,
    infos,
    warns,
    error,
    meta: { name: plugin.name, enforce: plugin.enforce, apply: plugin.apply },
  };
}

process.stdout.write(JSON.stringify(results));
`;

interface ScenarioResult {
  emitted: {
    type: string;
    fileName: string;
    bytes: number;
    isPlaceholder: boolean;
    hasFontFace: boolean;
  }[];
  mathCount: number;
  placeholderCount: number;
  infos: string[];
  warns: string[];
  error: string | null;
  meta: { name: string; enforce?: string; apply?: string };
}

const SCENARIOS = [
  // Every bundle today: the module graph carries no CSS, so vite emits none.
  { name: 'no-css-in-bundle', outputs: 1, bundle: {} },
  // The day MAIDR ships real static CSS again — the placeholder must stand down.
  {
    name: 'bundle-already-has-css',
    outputs: 1,
    bundle: { 'maidr.css': { type: 'asset', source: '.maidr{color:red}' } },
  },
  // A dual-format bundle (google-charts, vegalite, chartjs, …): one plugin
  // instance, two outputs, each of which needs its own copy of the asset.
  { name: 'es-and-umd', outputs: 2, bundle: {} },
];

describe('mathStylesheet generateBundle', () => {
  let results: Record<string, ScenarioResult>;

  beforeAll(() => {
    const stdout = execFileSync('node', ['--input-type=module', '-e', PLUGIN_RUNNER], {
      env: { ...process.env, FIXTURE_SCENARIOS: JSON.stringify(SCENARIOS) },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    results = JSON.parse(stdout) as Record<string, ScenarioResult>;
  });

  it('should run after vite:css-post, on build only', () => {
    // enforce:'post' is load-bearing: the bundle's own CSS asset does not exist
    // yet when a normal-order plugin runs, so the placeholder check would always
    // see an empty bundle and emit over the top of real CSS.
    const { meta } = results['no-css-in-bundle'];

    expect(meta).toEqual({ name: 'maidr:math-stylesheet', enforce: 'post', apply: 'build' });
  });

  it('should emit the maths stylesheet with the fonts inlined', () => {
    const { emitted, error } = results['no-css-in-bundle'];
    const math = emitted.find(f => f.fileName === 'maidr-math.css');

    expect(error).toBeNull();
    expect(math).toMatchObject({ type: 'asset', hasFontFace: true });
    expect(math!.bytes).toBeGreaterThan(250_000);
  });

  it('should emit the placeholder when the bundle produced no stylesheet', () => {
    const { placeholderCount, emitted } = results['no-css-in-bundle'];
    const placeholder = emitted.find(f => f.isPlaceholder);

    expect(placeholderCount).toBe(1);
    // Small and rule-free — the whole point is that nothing ships in it.
    expect(placeholder!.bytes).toBeLessThan(1000);
    expect(placeholder!.hasFontFace).toBe(false);
  });

  it('should leave a real maidr.css alone rather than overwrite it', () => {
    // Emitting over the top would silently drop whatever styling had been
    // added, and the build would report success.
    const { placeholderCount, mathCount } = results['bundle-already-has-css'];

    expect(placeholderCount).toBe(0);
    expect(mathCount).toBe(1);
  });

  it('should give each output its own copy but prepare the stylesheet once', () => {
    // Both outputs write into the same outDir, so each needs the asset emitted;
    // reading and base64-ing the fonts a second time would be pure waste. The
    // single info line is the observable proof it was prepared once.
    const { mathCount, placeholderCount, infos } = results['es-and-umd'];

    expect(mathCount).toBe(2);
    expect(placeholderCount).toBe(2);
    expect(infos).toHaveLength(1);
  });

  it('should report nothing to warn about for the stylesheet KaTeX ships', () => {
    expect(results['no-css-in-bundle'].warns).toEqual([]);
  });
});

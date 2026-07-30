import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Tests for scripts/vite-plugin-woff2-only.js.
 *
 * The plugin trims `@font-face` src lists down to their woff2 alternative,
 * which cuts ~1 MB of duplicated KaTeX font data out of dist/maidr.css. The
 * cases here pin the two things a naive implementation gets wrong — inlined
 * `url(data:font/woff2;base64,...)` values contain both a comma and a
 * semicolon, so splitting a src list needs to be paren-aware — plus the
 * safety rule that a face without a woff2 alternative is left alone rather
 * than emptied.
 *
 * The plugin is plain ESM JS (scripts/build.js imports it directly from node)
 * and `tsconfig.json` sets `allowJs: false`, so it is exercised through a node
 * subprocess rather than imported, mirroring test/scripts/syncCopilotInstructions.
 */

const MODULE = pathToFileURL(
  resolve(__dirname, '../../scripts/vite-plugin-woff2-only.js'),
).href;

const RUNNER = `
import { stripNonWoff2FontSources } from ${JSON.stringify(MODULE)};
try {
  const result = stripNonWoff2FontSources(process.env.FIXTURE_CSS);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message }));
}
`;

interface Result {
  css?: string;
  rewritten?: number;
  skipped?: number;
  error?: string;
}

/** Runs the transform on `css` in a child node process. */
function strip(css: string): Result {
  const stdout = execFileSync('node', ['--input-type=module', '-e', RUNNER], {
    env: { ...process.env, FIXTURE_CSS: css },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return JSON.parse(stdout) as Result;
}

/** A base64 payload, so fixtures exercise the `;base64,` comma/semicolon. */
const DATA = 'd09GMgABAAAAAA';

/** A face in the exact shape KaTeX ships: woff2, then woff, then ttf. */
function katexFace(family: string): string {
  return `@font-face{font-display:block;font-family:${family};font-style:normal;font-weight:400;`
    + `src:url(data:font/woff2;base64,${DATA}) format("woff2"),`
    + `url(data:font/woff;base64,${DATA}) format("woff"),`
    + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
}

describe('stripNonWoff2FontSources', () => {
  it('keeps only the woff2 alternative of an inlined KaTeX face', () => {
    const result = strip(katexFace('KaTeX_AMS'));

    expect(result.error).toBeUndefined();
    expect(result.rewritten).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.css).toBe(
      '@font-face{font-display:block;font-family:KaTeX_AMS;font-style:normal;font-weight:400;'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2")}`,
    );
  });

  it('rewrites every face in a multi-face stylesheet', () => {
    const css = `${katexFace('KaTeX_AMS')}${katexFace('KaTeX_Main')}${katexFace('KaTeX_Math')}`;
    const result = strip(css);

    expect(result.rewritten).toBe(3);
    expect(result.css).not.toContain('font/woff;');
    expect(result.css).not.toContain('font/ttf');
    expect((result.css!.match(/font\/woff2/g) ?? []).length).toBe(3);
  });

  it('leaves declarations other than src untouched', () => {
    const result = strip(katexFace('KaTeX_AMS'));

    expect(result.css).toContain('font-display:block');
    expect(result.css).toContain('font-family:KaTeX_AMS');
    expect(result.css).toContain('font-weight:400');
  });

  it('leaves a face with no woff2 alternative alone rather than emptying it', () => {
    const css = '@font-face{font-family:Legacy;'
      + `src:url(data:font/woff;base64,${DATA}) format("woff"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.error).toBeUndefined();
    expect(result.rewritten).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.css).toBe(css);
  });

  it('strips legacy sources referenced by file url as well as data uri', () => {
    const css = '@font-face{font-family:Rel;'
      + 'src:url(fonts/Rel.woff2) format("woff2"),'
      + 'url(fonts/Rel.woff) format("woff"),'
      + 'url(fonts/Rel.ttf) format("truetype")}';
    const result = strip(css);

    expect(result.rewritten).toBe(1);
    expect(result.css).toBe('@font-face{font-family:Rel;src:url(fonts/Rel.woff2) format("woff2")}');
  });

  it('keeps local() alternatives, which cost no bytes', () => {
    const css = '@font-face{font-family:Mixed;'
      + 'src:local("Mixed Regular"),'
      + `url(data:font/woff2;base64,${DATA}) format("woff2"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.rewritten).toBe(1);
    expect(result.css).toContain('local("Mixed Regular")');
    expect(result.css).not.toContain('font/ttf');
  });

  it('does not touch css without @font-face rules', () => {
    const css = '.maidr{color:red}.maidr-braille{font-family:monospace}';
    const result = strip(css);

    expect(result.rewritten).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.css).toBe(css);
  });
});

/**
 * Minified CSS carries no comments today, so these guard a future change in
 * minifier settings: a `;` or `:` inside a comment must not split a
 * declaration in the wrong place, and the emitted rule must stay parseable.
 */
describe('stripNonWoff2FontSources with comments', () => {
  /** Fails if the transform emits an empty, doubled or dangling src list. */
  function expectWellFormed(css: string): void {
    // Comments are what the browser drops first; check the result after that.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, body] of bare.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const src = /(?:^|;)\s*src\s*:([^;]*(?:;base64,[^;]*)*)/.exec(body);
      expect(src).not.toBeNull();
      const value = src![1].trim();
      expect(value).not.toBe('');
      expect(value.startsWith(',')).toBe(false);
      expect(value.endsWith(',')).toBe(false);
      expect(value).not.toContain(',,');
    }
  }

  it('ignores a semicolon inside a comment in the body', () => {
    const css = '@font-face{font-family:X;/* a; b; c */'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.error).toBeUndefined();
    expect(result.rewritten).toBe(1);
    expect(result.css).toContain('/* a; b; c */');
    expect(result.css).toContain('font-family:X');
    expect(result.css).not.toContain('font/ttf');
    expect((result.css!.match(/font\/woff2/g) ?? []).length).toBe(1);
    expectWellFormed(result.css!);
  });

  it('ignores a colon inside a comment in the body', () => {
    const css = '@font-face{/* src: see below */font-family:X;'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.error).toBeUndefined();
    expect(result.rewritten).toBe(1);
    expect(result.css).toContain('/* src: see below */');
    expect(result.css).not.toContain('font/ttf');
    expectWellFormed(result.css!);
  });

  it('ignores a comment sitting between sources in a src list', () => {
    const css = '@font-face{font-family:X;'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2")/* keep; me: here */,`
      + `url(data:font/woff;base64,${DATA}) format("woff"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.error).toBeUndefined();
    expect(result.rewritten).toBe(1);
    expect(result.css).toBe(
      '@font-face{font-family:X;'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2")/* keep; me: here */}`,
    );
    expectWellFormed(result.css!);
  });

  it('does not let a commented-out format hint rescue a legacy source', () => {
    const css = '@font-face{font-family:X;'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2"),`
      + `url(data:font/ttf;base64,${DATA})/* format("woff2") */ format("truetype")}`;
    const result = strip(css);

    expect(result.rewritten).toBe(1);
    expect(result.css).not.toContain('font/ttf');
    expectWellFormed(result.css!);
  });

  it('leaves the rule alone when a comment hides the closing brace', () => {
    // `}` inside a comment truncates the @font-face match. The transform must
    // degrade to "no change" rather than emit half a rule.
    const css = '@font-face{font-family:X;/* } */'
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.error).toBeUndefined();
    expect(result.css).toBe(css);
  });

  it('leaves an unterminated comment alone rather than guessing', () => {
    const css = '@font-face{font-family:X;/* never closed '
      + `src:url(data:font/woff2;base64,${DATA}) format("woff2"),`
      + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;
    const result = strip(css);

    expect(result.error).toBeUndefined();
    expect(result.css).toBe(css);
  });
});

/**
 * Tests for the plugin object itself — the part `scripts/build.js` actually
 * loads. The suite above covers the transform; these cover the `generateBundle`
 * hook wrapped around it: which bundle entries it selects, how it reads a
 * source that Rollup handed over as bytes rather than a string, and when it
 * reassigns `output.source` or reports through the plugin context.
 *
 * Every scenario runs in one child process, not one per case: the transform
 * suite above pays a spawn per assertion, and there is no reason to multiply
 * that here. `beforeAll` collects the results and each `it` reads its own.
 */

/** One bundle entry as handed to the child. */
interface BundleEntrySpec {
  type: 'asset' | 'chunk';
  source: string;
  /** `bytes` makes the child hand the plugin a Uint8Array, as Rollup may. */
  encoding?: 'string' | 'bytes';
}

/** What the child reports back for one entry after the hook ran. */
interface BundleEntryResult {
  type: string;
  /** Whether the hook assigned to `output.source` at all. */
  assigned: boolean;
  isString: boolean;
  text: string;
}

interface ScenarioResult {
  outputs: Record<string, BundleEntryResult>;
  warns: string[];
  infos: string[];
  error: string | null;
  meta: { name: string; enforce?: string; apply?: string };
}

const PLUGIN_RUNNER = `
import { Buffer } from 'node:buffer';
import { woff2OnlyFonts } from ${JSON.stringify(MODULE)};

const scenarios = JSON.parse(process.env.FIXTURE_SCENARIOS);
const results = {};

for (const scenario of scenarios) {
  const bundle = {};
  const assigned = {};

  for (const [fileName, spec] of Object.entries(scenario.bundle)) {
    const output = { type: spec.type };
    if (spec.type === 'asset') {
      // Intercept the setter so "did the hook reassign source?" is observable
      // rather than inferred from the resulting text.
      let current = spec.encoding === 'bytes'
        ? new Uint8Array(Buffer.from(spec.source, 'utf8'))
        : spec.source;
      assigned[fileName] = false;
      Object.defineProperty(output, 'source', {
        get: () => current,
        set: (value) => { current = value; assigned[fileName] = true; },
        configurable: true,
        enumerable: true,
      });
    } else {
      // A chunk has no \`source\` at all, so reading one would throw — which is
      // what makes the type guard, not the extension guard, testable.
      output.code = spec.source;
    }
    bundle[fileName] = output;
  }

  const warns = [];
  const infos = [];
  const plugin = woff2OnlyFonts();
  let error = null;
  try {
    plugin.generateBundle.call(
      { warn: m => warns.push(String(m)), info: m => infos.push(String(m)) },
      {},
      bundle,
    );
  } catch (e) {
    error = e.message;
  }

  const outputs = {};
  for (const [fileName, output] of Object.entries(bundle)) {
    const source = output.type === 'asset' ? output.source : output.code;
    outputs[fileName] = {
      type: output.type,
      assigned: assigned[fileName] ?? false,
      isString: typeof source === 'string',
      text: typeof source === 'string' ? source : Buffer.from(source).toString('utf8'),
    };
  }

  results[scenario.name] = {
    outputs,
    warns,
    infos,
    error,
    meta: { name: plugin.name, enforce: plugin.enforce, apply: plugin.apply },
  };
}

process.stdout.write(JSON.stringify(results));
`;

/** A face offering only pre-woff2 formats, so the skip-and-warn path runs. */
const LEGACY_ONLY_FACE = '@font-face{font-family:Legacy;'
  + `src:url(data:font/woff;base64,${DATA}) format("woff"),`
  + `url(data:font/ttf;base64,${DATA}) format("truetype")}`;

/** Already woff2-only, so there is nothing for the hook to rewrite. */
const ALREADY_TRIMMED = '@font-face{font-family:Trim;'
  + `src:url(data:font/woff2;base64,${DATA}) format("woff2")}`;

const SCENARIOS: { name: string; bundle: Record<string, BundleEntrySpec> }[] = [
  {
    name: 'string-source',
    bundle: { 'maidr.css': { type: 'asset', source: katexFace('KaTeX_Main') } },
  },
  {
    name: 'bytes-source',
    bundle: {
      'maidr.css': { type: 'asset', source: katexFace('KaTeX_Main'), encoding: 'bytes' },
    },
  },
  {
    name: 'mixed-bundle',
    bundle: {
      'maidr.css': { type: 'asset', source: katexFace('KaTeX_Main') },
      'logo.svg': { type: 'asset', source: '<svg role="img"></svg>' },
      'maidr.js': { type: 'chunk', source: 'export const a = 1;' },
      // Named .css but emitted as a chunk: only the `type` check saves it.
      'inlined.css': { type: 'chunk', source: 'export const css = 1;' },
    },
  },
  {
    name: 'no-woff2',
    bundle: { 'maidr.css': { type: 'asset', source: LEGACY_ONLY_FACE } },
  },
  {
    name: 'nothing-to-rewrite',
    bundle: { 'maidr.css': { type: 'asset', source: ALREADY_TRIMMED } },
  },
];

describe('woff2OnlyFonts generateBundle', () => {
  let results: Record<string, ScenarioResult>;

  beforeAll(() => {
    const stdout = execFileSync('node', ['--input-type=module', '-e', PLUGIN_RUNNER], {
      env: { ...process.env, FIXTURE_SCENARIOS: JSON.stringify(SCENARIOS) },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    results = JSON.parse(stdout) as Record<string, ScenarioResult>;
  });

  it('runs after vite:css-post, on build only', () => {
    // enforce:'post' is load-bearing — the CSS asset does not exist in the
    // bundle until vite:css-post has assembled it.
    expect(results['string-source'].meta).toEqual({
      name: 'maidr:woff2-only-fonts',
      enforce: 'post',
      apply: 'build',
    });
  });

  it('rewrites a css asset whose source is a string', () => {
    const { outputs, warns, error } = results['string-source'];
    const css = outputs['maidr.css'];

    expect(error).toBeNull();
    expect(warns).toEqual([]);
    expect(css.assigned).toBe(true);
    expect(css.isString).toBe(true);
    expect(css.text).toContain('font/woff2');
    expect(css.text).not.toContain('font/ttf');
    expect(css.text).not.toContain('font/woff;');
  });

  it('decodes and rewrites a css asset whose source is bytes', () => {
    const { outputs, error } = results['bytes-source'];
    const css = outputs['maidr.css'];

    expect(error).toBeNull();
    expect(css.assigned).toBe(true);
    expect(css.text).toBe(results['string-source'].outputs['maidr.css'].text);
    // Rollup accepts either, and the hook writes back the transformed string.
    expect(css.isString).toBe(true);
  });

  it('leaves non-css assets and chunks alone', () => {
    const { outputs, error } = results['mixed-bundle'];

    expect(error).toBeNull();
    expect(outputs['maidr.css'].assigned).toBe(true);
    expect(outputs['logo.svg'].assigned).toBe(false);
    expect(outputs['logo.svg'].text).toBe('<svg role="img"></svg>');
    expect(outputs['maidr.js'].text).toBe('export const a = 1;');
    expect(outputs['inlined.css'].text).toBe('export const css = 1;');
  });

  it('warns and leaves the source intact when no face offers woff2', () => {
    const { outputs, warns, infos, error } = results['no-woff2'];

    expect(error).toBeNull();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('maidr.css');
    expect(warns[0]).toContain('no woff2 source');
    expect(outputs['maidr.css'].assigned).toBe(false);
    expect(outputs['maidr.css'].text).toBe(LEGACY_ONLY_FACE);
    expect(infos).toEqual([]);
  });

  it('does not touch the asset when there is nothing to rewrite', () => {
    const { outputs, warns, infos, error } = results['nothing-to-rewrite'];

    expect(error).toBeNull();
    expect(outputs['maidr.css'].assigned).toBe(false);
    expect(outputs['maidr.css'].text).toBe(ALREADY_TRIMMED);
    expect(infos).toEqual([]);
    expect(warns).toEqual([]);
  });

  it('reports a saving that matches the actual byte delta', () => {
    const { infos } = results['string-source'];
    const before = Buffer.byteLength(katexFace('KaTeX_Main'));
    const after = Buffer.byteLength(results['string-source'].outputs['maidr.css'].text);

    expect(infos).toHaveLength(1);
    expect(infos[0]).toContain('maidr.css');
    expect(infos[0]).toContain('1 @font-face');
    expect(after).toBeLessThan(before);
    expect(infos[0]).toContain(`saving ${((before - after) / 1024).toFixed(1)} kB`);
  });
});

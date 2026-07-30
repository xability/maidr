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

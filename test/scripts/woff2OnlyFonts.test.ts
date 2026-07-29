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

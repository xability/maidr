import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `scripts/build.js` is plain ESM and `allowJs` is false, so its facts are
 * read out of a node subprocess, as `buildOutputFilenames.test.ts` does.
 */
const ROOT = resolve(__dirname, '../..');
const BUILD_SCRIPT = pathToFileURL(resolve(ROOT, 'scripts/build.js')).href;

function expand(names: string[]): string[] {
  const source = `
    import { expandBuildNames } from ${JSON.stringify(BUILD_SCRIPT)};
    process.stdout.write(JSON.stringify(expandBuildNames(${JSON.stringify(names)})));
  `;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return JSON.parse(stdout) as string[];
}

describe('build name shorthand', () => {
  it('should expand locales to every locale pack build', () => {
    const names = expand(['core', 'locales']);

    expect(names[0]).toBe('core');
    expect(names.slice(1)).toEqual(['ko', 'ja', 'zh', 'es', 'de', 'fr', 'it', 'hi'].map(code => `locale-${code}`));
  });

  it('should pass any other name through', () => {
    expect(expand(['react', 'locale-ko'])).toEqual(['react', 'locale-ko']);
  });
});

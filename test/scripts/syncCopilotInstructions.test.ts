import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * End-to-end tests for scripts/sync-copilot-instructions.mjs.
 *
 * The script is a CLI, so it is driven as one: each case builds a fixture tree,
 * points the generator at it with SYNC_COPILOT_ROOT, and asserts on the exit
 * code and the files it produced. Two real regressions reached review before
 * this existed — nested rules silently dropped, and a scoped rule silently
 * widening to `applyTo: "**"` — so the cases that caught them are pinned here.
 */

const SCRIPT = resolve(__dirname, '../../scripts/sync-copilot-instructions.mjs');

let root: string;

/** Writes a file into the fixture tree, creating parent directories. */
function write(relative: string, contents: string): void {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

/** Reads a generated file out of the fixture tree. */
function read(relative: string): string {
  return readFileSync(join(root, relative), 'utf8');
}

/** Runs the generator against the fixture tree. */
function run(...args: string[]): { status: number; output: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      env: { ...process.env, SYNC_COPILOT_ROOT: root },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Convenience for a rule scoped to a single glob. */
function rule(glob: string, title = 'Rule'): string {
  return `---\npaths:\n  - "${glob}"\n---\n\n# ${title}\n\nBody text.\n`;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sync-copilot-'));
  write('CLAUDE.md', '# Project\n\nInstructions.\n');
  mkdirSync(join(root, '.claude/rules'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('generating the mirror', () => {
  it('should convert a paths: block list into a comma-separated applyTo', () => {
    write('.claude/rules/model.md', `---\npaths:\n  - "src/model/**"\n  - "src/type/grammar.ts"\n---\n\n# Model layer\n`);

    const result = run();

    expect(result.status).toBe(0);
    expect(read('.github/instructions/model.instructions.md'))
      .toContain('applyTo: "src/model/**,src/type/grammar.ts"');
  });

  it('should use the first heading as the description', () => {
    write('.claude/rules/model.md', rule('src/model/**', 'Model layer'));

    run();

    expect(read('.github/instructions/model.instructions.md'))
      .toContain('description: "Model layer"');
  });

  it('should expand brace groups into separate patterns', () => {
    write('.claude/rules/ts.md', rule('src/**/*.{ts,tsx}'));

    run();

    expect(read('.github/instructions/ts.instructions.md'))
      .toContain('applyTo: "src/**/*.ts,src/**/*.tsx"');
  });

  it('should map a rule with no frontmatter to applyTo "**"', () => {
    write('.claude/rules/git.md', '# Git workflow\n\nCommit conventions.\n');

    run();

    expect(read('.github/instructions/git.instructions.md')).toContain('applyTo: "**"');
  });

  it('should repoint cross-references at the generated filenames', () => {
    write('.claude/rules/architecture.md', `---\npaths:\n  - "src/**"\n---\n\n# Architecture\n\nSee \`rules/model.md\` for details.\n`);

    run();

    const generated = read('.github/instructions/architecture.instructions.md');
    expect(generated).toContain('`model.instructions.md`');
    expect(generated).not.toContain('rules/model.md');
  });

  it('should mirror CLAUDE.md into copilot-instructions.md', () => {
    const generated = (run(), read('.github/copilot-instructions.md'));

    expect(generated).toContain('# Project');
    expect(generated).toContain('Do not edit directly');
  });
});

describe('nested rules', () => {
  // Regression: readdirSync without { recursive: true } dropped these silently
  // while --check still reported the mirror as in sync.
  it('should mirror a rule in a subdirectory, preserving the structure', () => {
    write('.claude/rules/frontend/react.md', rule('src/ui/**/*.tsx', 'React'));

    const result = run();

    expect(result.status).toBe(0);
    expect(read('.github/instructions/frontend/react.instructions.md'))
      .toContain('applyTo: "src/ui/**/*.tsx"');
  });

  it('should report a nested rule as out of date rather than passing --check', () => {
    write('.claude/rules/frontend/react.md', rule('src/ui/**/*.tsx'));

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('frontend/react.instructions.md');
  });
});

describe('rejecting malformed input', () => {
  // Regression: these parsed to zero globs and fell through to applyTo: "**",
  // silently widening a scoped rule to the whole repository.
  it.each([
    ['a flow sequence', `---\npaths: ["src/model/**"]\n---\n\n# Flow\n`],
    ['an empty paths: key', `---\npaths:\n---\n\n# Empty\n`],
  ])('should fail on %s instead of widening scope', (_label, contents) => {
    write('.claude/rules/bad.md', contents);

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('no globs were parsed');
  });

  it('should fail when frontmatter has no paths: key', () => {
    write('.claude/rules/bad.md', `---\ntags:\n  - "x"\n---\n\n# No paths\n`);

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('has no `paths:` key');
  });

  it('should fail on unterminated frontmatter', () => {
    write('.claude/rules/bad.md', `---\npaths:\n  - "src/**"\n\n# Never closed\n`);

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('unterminated');
  });

  // Regression: the glob scan read every "- " line in the frontmatter, so a
  // sibling block list was folded into applyTo. The empty-result guard could
  // not catch it, because the result was not empty.
  it('should ignore block lists belonging to other frontmatter keys', () => {
    write('.claude/rules/model.md', `---\npaths:\n  - "src/model/**"\ntags:\n  - "leaked-value"\n---\n\n# Model\n`);

    run();

    const generated = read('.github/instructions/model.instructions.md');
    expect(generated).toContain('applyTo: "src/model/**"');
    expect(generated).not.toContain('leaked-value');
  });
});

describe('--check', () => {
  it('should pass once the mirror is generated', () => {
    write('.claude/rules/model.md', rule('src/model/**'));
    run();

    const result = run('--check');

    expect(result.status).toBe(0);
    expect(result.output).toContain('in sync');
  });

  it('should fail after a rule is edited', () => {
    write('.claude/rules/model.md', rule('src/model/**'));
    run();
    write('.claude/rules/model.md', rule('src/model/**', 'Renamed'));

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('out of date');
  });

  it('should fail when a generated file has no matching rule', () => {
    write('.claude/rules/model.md', rule('src/model/**'));
    run();
    rmSync(join(root, '.claude/rules/model.md'));

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('orphaned');
  });

  it('should detect an orphan nested in a subdirectory', () => {
    write('.claude/rules/frontend/react.md', rule('src/ui/**'));
    run();
    rmSync(join(root, '.claude/rules/frontend'), { recursive: true });

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(result.output).toContain('orphaned');
  });

  it('should not write anything while checking', () => {
    write('.claude/rules/model.md', rule('src/model/**'));

    const result = run('--check');

    expect(result.status).toBe(1);
    expect(() => read('.github/instructions/model.instructions.md')).toThrow();
  });
});

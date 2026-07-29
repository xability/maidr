import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Keeps the two agent directories describing the same set of roles.
 *
 * Unlike rules, agents are not generated: Claude Code and Copilot genuinely
 * disagree on the frontmatter schema (`permissionMode`, `memory`, `skills`,
 * `maxTurns` on one side; `handoffs`, a display `name`, and a different tool
 * vocabulary on the other), so a generator would need a mapping table that is
 * itself a place for bugs to live.
 *
 * What can be checked cheaply is the realistic drift: someone adds, removes,
 * or renames an agent on one side and forgets the other. That leaves a role
 * available in one tool and missing in the other, with nothing to say so.
 */

const ROOT = resolve(__dirname, '../..');

/** Agent names defined for Claude Code. */
function claudeAgents(): string[] {
  return readdirSync(join(ROOT, '.claude/agents'))
    .filter(file => file.endsWith('.md'))
    .map(file => file.replace(/\.md$/, ''))
    .sort();
}

/** Agent names defined for GitHub Copilot. */
function copilotAgents(): string[] {
  return readdirSync(join(ROOT, '.github/agents'))
    .filter(file => file.endsWith('.agent.md'))
    .map(file => file.replace(/\.agent\.md$/, ''))
    .sort();
}

describe('agent definitions', () => {
  it('should define the same roles for both tools', () => {
    expect(copilotAgents()).toEqual(claudeAgents());
  });

  it('should give every Claude agent a name matching its filename', () => {
    for (const agent of claudeAgents()) {
      const contents = readFileSync(join(ROOT, `.claude/agents/${agent}.md`), 'utf8');
      // `name` is the identifier Claude delegates by; a mismatch with the
      // filename makes an agent hard to find without breaking anything loudly.
      expect(contents).toMatch(new RegExp(`^name:\\s*${agent}\\s*$`, 'm'));
    }
  });

  it('should give every Claude agent a description under 250 characters', () => {
    for (const agent of claudeAgents()) {
      const contents = readFileSync(join(ROOT, `.claude/agents/${agent}.md`), 'utf8');
      // Anchoring the capture to \S keeps it from overlapping the preceding
      // \s*, which would allow super-linear backtracking.
      const description = contents.match(/^description:[ \t]*(\S.*)$/m)?.[1];

      // Descriptions load on every request, so they stay short. Two agents
      // here previously carried ~1500 characters of inline examples.
      expect(description).toBeDefined();
      expect(description!.length).toBeLessThan(250);
    }
  });

  it('should only reference skills that exist', () => {
    const skills = readdirSync(join(ROOT, '.claude/skills'));

    for (const agent of claudeAgents()) {
      const contents = readFileSync(join(ROOT, `.claude/agents/${agent}.md`), 'utf8');
      const block = contents.match(/^skills:\n((?:[ \t]+-[ \t]+\S.*\n)+)/m)?.[1];
      if (!block) {
        continue;
      }
      for (const line of block.split('\n').filter(Boolean)) {
        expect(skills).toContain(line.replace(/^\s*-\s*/, '').trim());
      }
    }
  });
});

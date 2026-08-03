import type { UserConfig } from '@commitlint/types';
import conventional from '@commitlint/config-conventional';
import { isBotDependencyBump } from './commitlint.ignores';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: conventional.rules,
  // Let bot dependency bumps through; the rules stay fully enforced for
  // human-authored commits. See commitlint.ignores.ts for why.
  ignores: [isBotDependencyBump],
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
};

export default config;

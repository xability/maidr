import type { UserConfig } from '@commitlint/types';
import conventional from '@commitlint/config-conventional';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: conventional.rules,
  // Bot dependency bumps (Dependabot, Renovate) list every bumped package in
  // the commit body, which routinely exceeds `body-max-line-length`. Failing
  // commitlint on those skips every job that declares `needs: [commitlint]`,
  // so security updates would ship untested. Skip linting for those commits
  // only; the rules stay fully enforced for human-authored commits.
  ignores: [message => /^(?:build|chore)\(deps(?:-dev)?\)/.test(message)],
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
};

export default config;

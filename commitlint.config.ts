import type { UserConfig } from '@commitlint/types';
import conventional from '@commitlint/config-conventional';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: conventional.rules,
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
};

export default config;

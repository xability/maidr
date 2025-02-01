import conventional from '@commitlint/config-conventional';
import { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: conventional.rules,
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
};

export default config;

import antfu from '@antfu/eslint-config';

const config: ReturnType<typeof antfu> = antfu({
  type: 'lib',
  rules: {
    'style/brace-style': ['error', '1tbs'],
  },
  stylistic: {
    semi: true,
  },
  formatters: {
    css: true,
    html: true,
    markdown: 'prettier',
  },
});

export default config;

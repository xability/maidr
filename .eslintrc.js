module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended'
  ],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    '@typescript-eslint/no-inferrable-types': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/restrict-template-expressions': 'warn',
    '@typescript-eslint/strict-boolean-expressions': 'warn',

    // General best practices
    'prettier/prettier': 'error',
    'no-console': 'warn',
    'eqeqeq': ['error', 'always'],
    'curly': 'error',
    'no-implicit-coercion': 'warn',
    'no-multi-spaces': 'error',
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    'prefer-const': 'warn',
    'no-var': 'error',
    'prefer-arrow-callback': 'warn',
    'arrow-spacing': ['error', { before: true, after: true }],
    'no-duplicate-imports': 'error'
  }
};

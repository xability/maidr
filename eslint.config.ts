import eslint from '@eslint/js';
import tsEslint from '@typescript-eslint/eslint-plugin';
// @ts-ignore
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import jestPlugin from 'eslint-plugin-jest';
//@ts-ignore
import importPlugin from 'eslint-plugin-import';

export default [
  /**
   * Base Ignore Patterns
   */
  {
    ignores: ['**/node_modules', '**/build', '**/dist'],
  },

  /**
   * Global Project Configuration
   */
  eslint.configs.recommended,
  tsEslint.configs.recommended,
  prettierPlugin,
  importPlugin.configs.recommended,
  {
    files: [
      'src/**/*.{ts,tsx}',
      '*.config.*',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-undef': 'error', // Prevent usage of undeclared variables
      'import/order': [
        'error',
        {
          'alphabetize': { 'order': 'asc', 'caseInsensitive': true }, // Sort alphabetically
          'groups': [
            'type',
            'builtin', // Node.js built-ins (fs, path)
            'external', // npm packages (react, lodash)
            'internal', // Absolute imports (if using 'paths' in tsconfig.json)
            'parent', // Parent directories ('../')
            'sibling', // Same-level files ('./myModule')
            'index', // Current directory imports ('./')
            'object'
          ],
          'newlines-between': 'always'
        }
      ],
      'import/no-duplicates': [
        'error',
        {
          'prefer-inline': true
        }
      ],
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },

  /**
   * Typescript Configuration
   */
  {
    files: ['src/**/*.{ts,tsx,d.ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error', // Prevent unused variables
    },
  },

  /**
   * Test Files Configuration
   */
  {
    files: ['tests/**/*.spec.{ts,tsx,d.ts}', 'tests/**/*.{tsx,d.ts}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        jest: true,
        describe: true,
        it: true,
        expect: true,
        beforeEach: true,
        afterEach: true,
        beforeAll: true,
        afterAll: true,
        test: true,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
      jest: jestPlugin,
    },
    rules: {
      ...jestPlugin.configs.recommended.rules
    },
  },
];

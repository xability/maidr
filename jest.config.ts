import type { Config } from '@jest/types';
import { pathsToModuleNameMapper } from 'ts-jest';
import { compilerOptions } from './tsconfig.json';

const moduleNameMapper = pathsToModuleNameMapper(compilerOptions.paths, {
  prefix: '<rootDir>/src/',
});

/**
 * Everything that does not need to import an ESM-only package.
 *
 * `testEnvironment: 'node'` is the default so the existing suites — none of
 * which need a DOM — keep their current start-up cost. A component test opts
 * into jsdom per file with a `@jest-environment jsdom` docblock; see test/ui/.
 */
const unit: Config.InitialProjectOptions = {
  displayName: 'unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: [
    '<rootDir>/src',
    '<rootDir>/test',
  ],
  moduleNameMapper,
  // Matches .test.ts and .test.tsx in the test folder; the latter is what
  // carries React component tests. `*.esm-test.ts` does not match — this glob
  // needs a name ending `.test.ts` and that one ends `-test.ts` — which is
  // what stops both projects claiming the same file.
  testMatch: ['**/test/**/*.test.ts', '**/test/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
};

/**
 * Tests that import the unified/remark/rehype stack.
 *
 * That stack is ESM-only, and the preset above compiles to CommonJS, so
 * importing `rehype-sanitize` from a `.test.ts` fails with
 * `SyntaxError: Unexpected token 'export'`. This project compiles to ESM
 * instead and runs under `--experimental-vm-modules`, which `scripts/test.js`
 * supplies.
 *
 * It exists so the sanitisation schema can be checked against
 * `rehype-sanitize` applying it, rather than only against its own contents —
 * the difference between "the allowlist names `table`" and "a table survives".
 *
 * The `tsconfig` override is inline because `tsconfig.json` is shared with the
 * build and the CommonJS project, both of which want CommonJS output here.
 */
const esm: Config.InitialProjectOptions = {
  displayName: 'esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/test'],
  moduleNameMapper,
  testMatch: ['**/test/**/*.esm-test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        verbatimModuleSyntax: false,
      },
    }],
  },
};

const config: Config.InitialOptions = {
  projects: [unit, esm],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: ['src/**/*.ts', 'src/**/*.tsx'],
};

export default config;

import type { Config } from '@jest/types';
import { pathsToModuleNameMapper } from 'ts-jest';
import { compilerOptions } from './tsconfig.json';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  // Kept as the default so the existing suites — none of which need a DOM —
  // keep their current start-up cost. A component test opts into jsdom per
  // file with a `@jest-environment jsdom` docblock; see test/ui/.
  testEnvironment: 'node',
  roots: [
    '<rootDir>/src',
    '<rootDir>/test',
  ],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/src/',
  }),
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: ['src/**/*.ts', 'src/**/*.tsx'],
  // Matches .test.ts and .test.tsx files in the test folder; the latter is
  // what carries React component tests.
  testMatch: ['**/test/**/*.test.ts', '**/test/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
};

export default config;

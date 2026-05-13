import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node', // Electron unit tests run in Node
  roots: ['<rootDir>/electron', '<rootDir>/src', '<rootDir>/common'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  moduleNameMapper: {
    // Stub out Electron and ESM-only native adapters at unit-test level
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
    '^chokidar$': '<rootDir>/tests/__mocks__/chokidar.ts',
  },
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'electron/**/*.{ts,tsx}'],
  // Setup file to configure test environment
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Detect open handles that prevent clean exit
  detectOpenHandles: false,
  // Set a reasonable timeout
  testTimeout: 10000,
};

export default config;

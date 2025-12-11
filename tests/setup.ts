// Jest setup file to configure test environment
import { Logger } from '../src/utils/logger';

// Set up test environment variables
process.env.NODE_ENV = 'test';

// Mock the Logger to prevent console output in tests
jest.mock('../src/utils/logger', () => ({
  Logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Clean up mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Restore all mocks after all tests complete
afterAll(() => {
  jest.restoreAllMocks();
});
/**
 * Jest Global Setup
 * Configures test environment and global mocks
 */

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key-for-testing';

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Date for consistent testing
const MOCK_DATE = new Date('2025-01-01T00:00:00.000Z');
global.Date = class extends Date {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(MOCK_DATE);
    } else {
      super(...args);
    }
  }

  static now() {
    return MOCK_DATE.getTime();
  }
} as DateConstructor;

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

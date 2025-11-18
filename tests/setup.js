// Jest setup file - Consolidated test environment configuration
// Sets up global test environment, mocks, and safety mechanisms

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'testAdmin123!';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.PORT = '3001'; // Different port for tests

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Global safety timeout to prevent hanging tests
const TEST_HARD_TIMEOUT_MS = process.env.TEST_E2E ? 60000 : 60000;
let hardTimeout;

beforeAll(() => {
  hardTimeout = setTimeout(() => {
    console.error('⚠️ TEST HARD TIMEOUT TRIGGERED – possible server freeze. Failing fast.');
    console.error('📊 This is a safety mechanism to prevent hanging.');
    process.exitCode = 1;
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }, TEST_HARD_TIMEOUT_MS);
});

afterAll(() => {
  if (hardTimeout) {
    clearTimeout(hardTimeout);
  }
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Helper to wrap async tests with an internal micro-timeout fallback
global.withSafeAsync = (fn, perTestTimeout = 8000) => {
  return async () => {
    const timer = setTimeout(() => {
      throw new Error('⏱️ Per-test timeout exceeded (safety wrapper) - test took longer than ' + perTestTimeout + 'ms');
    }, perTestTimeout);
    try { 
      await fn(); 
    } finally { 
      clearTimeout(timer); 
    }
  };
};

// Enhanced error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
});

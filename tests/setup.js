// Jest setup file
// Sets up global test environment and mocks

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AUTH_PASSWORD = 'testPassword123!';
process.env.JWT_SECRET = 'test-jwt-secret-key';
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
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

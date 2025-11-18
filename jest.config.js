module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(test).js'],
  testPathIgnorePatterns: ['<rootDir>/tests/tracing.test.js'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'middleware/request-metrics.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 }
  },
  testTimeout: 30000, // 30 seconds - prevent hanging
  maxWorkers: 1,
  bail: false, // Don't stop on first failure
  detectOpenHandles: true, // Detect async operations that prevent Jest from exiting
  forceExit: true, // Force exit after tests complete (safety net)
};



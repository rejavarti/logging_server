module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/'
  ],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'routes/**/*.js',
    'server.js',
    'middleware/**/*.js',
    '!routes/**/backup*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/scripts/**',
    '!**/archive/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/scripts/',
    '/archive/'
  ],
  coverageThreshold: {
    global: {
      statements: 20,
      branches: 10,
      functions: 10,
      lines: 20
    }
  },
  testTimeout: 30000,
  maxWorkers: 1,
  bail: false,
  detectOpenHandles: true,
  forceExit: true
};



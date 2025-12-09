// Jest setup file - Consolidated test environment configuration
// Sets up global test environment, mocks, and safety mechanisms

// CRITICAL FIX: Use in-memory database for CI to avoid file system issues
// This completely bypasses SQLITE_CANTOPEN errors
if (process.env.CI || process.env.GITHUB_ACTIONS) {
  process.env.TEST_DB_PATH = ':memory:';
  process.stderr.write('\n🧪 CI detected: Using in-memory SQLite database for tests\n\n');
} else if (process.env.TEST_DB_PATH && process.env.TEST_DB_PATH !== ':memory:') {
  // For local testing with file-based database, convert to absolute path
  const path = require('path');
  if (!path.isAbsolute(process.env.TEST_DB_PATH)) {
    const originalPath = process.env.TEST_DB_PATH;
    process.env.TEST_DB_PATH = path.resolve(process.cwd(), process.env.TEST_DB_PATH);
    process.stderr.write(`\n🔧 Converted TEST_DB_PATH:\n`);
    process.stderr.write(`   From: ${originalPath}\n`);
    process.stderr.write(`   To:   ${process.env.TEST_DB_PATH}\n\n`);
  }
}

// Set test environment variables
process.env.NODE_ENV = 'test';
if (!process.env.AUTH_PASSWORD) {
  throw new Error('AUTH_PASSWORD environment variable must be set for tests');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.PORT = '3001'; // Different port for tests

// Ensure test database directory exists BEFORE anything else
// This must happen before console mocking so we can see any errors
if (process.env.TEST_DB_PATH && process.env.TEST_DB_PATH !== ':memory:') {
  const path = require('path');
  const fs = require('fs');
  
  // Convert to absolute path to avoid working directory issues in CI
  const absoluteDbPath = path.isAbsolute(process.env.TEST_DB_PATH) 
    ? process.env.TEST_DB_PATH 
    : path.resolve(process.cwd(), process.env.TEST_DB_PATH);
  
  // Update TEST_DB_PATH to use absolute path
  process.env.TEST_DB_PATH = absoluteDbPath;
  
  const dbDir = path.dirname(absoluteDbPath);
  
  console.log(`🔧 Working directory: ${process.cwd()}`);
  console.log(`🔧 Test DB path (relative): ${process.env.TEST_DB_PATH}`);
  console.log(`🔧 Test DB path (absolute): ${absoluteDbPath}`);
  console.log(`🔧 Test DB directory: ${dbDir}`);
  
  try {
    // Create all parent directories
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`✅ Created test database directory: ${dbDir}`);
    } else {
      console.log(`✅ Test database directory exists: ${dbDir}`);
    }
    
    // Verify directory is actually accessible
    const dirStats = fs.statSync(dbDir);
    if (!dirStats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${dbDir}`);
    }
    
    // Verify write permissions
    fs.accessSync(dbDir, fs.constants.W_OK | fs.constants.R_OK);
    console.log(`✅ Test database directory is readable and writable`);
    
    // Try creating a test file to ensure we can actually write
    const testFile = path.join(dbDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✅ Verified write capability in test database directory`);
    
  } catch (error) {
    console.error(`❌ Failed to ensure test database directory: ${error.message}`);
    console.error(`   Full error:`, error);
    throw error;
  }
}

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

beforeAll(async () => {
  // Initialize test database schema before any tests run
  if (process.env.TEST_DB_PATH && process.env.TEST_DB_PATH !== ':memory:') {
    const path = require('path');
    const fs = require('fs');
    const DatabaseMigration = require('../migrations/database-migration');
    const winston = require('winston');
    
    // Use real console for this critical setup phase
    const realConsole = console.constructor.prototype;
    realConsole.log.call(console, `🔧 Initializing test database at: ${process.env.TEST_DB_PATH}`);
    
    const testLogger = winston.createLogger({
      transports: [new winston.transports.Console({ silent: true })]
    });
    
    // Verify directory exists one more time
    const dbDir = path.dirname(process.env.TEST_DB_PATH);
    if (!fs.existsSync(dbDir)) {
      realConsole.error.call(console, `❌ Database directory does not exist: ${dbDir}`);
      throw new Error(`Database directory does not exist: ${dbDir}`);
    }
    
    const migration = new DatabaseMigration(process.env.TEST_DB_PATH, testLogger);
    await migration.runMigration();
    realConsole.log.call(console, '✅ Test database schema initialized');
  }
  
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

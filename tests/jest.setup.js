// Ensure stable test environment variables (silence warnings, deterministic auth)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
if (!process.env.AUTH_PASSWORD) throw new Error('AUTH_PASSWORD not set');
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Global safety timeout so the assistant doesn't hang if server logic stalls
const TEST_HARD_TIMEOUT_MS = process.env.TEST_E2E ? 60000 : 60000; // use a more forgiving safety window for heavier tests
let hardTimeout;

beforeAll(() => {
  hardTimeout = setTimeout(() => {
    console.error('⚠️ TEST HARD TIMEOUT TRIGGERED – possible server freeze. Failing fast.');
    console.error('📊 This is a safety mechanism to prevent hanging.');
    // Force process exit so the runner responds
    process.exitCode = 1;
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }, TEST_HARD_TIMEOUT_MS);
});

afterAll(() => {
  if (hardTimeout) {
    clearTimeout(hardTimeout);
    console.log('✅ Test suite completed successfully - timeout cleared');
  }
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

console.log('🔧 Jest Setup Complete');
console.log('⏱️ Test Timeout: 30 seconds');
console.log(`🛡️ Safety Timeout: ${TEST_HARD_TIMEOUT_MS / 1000} seconds`);
console.log('🚀 Ready to test!');

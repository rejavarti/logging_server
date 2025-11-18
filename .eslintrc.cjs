/**
 * ESLint configuration for Enhanced Logging Platform (Node.js + Jest)
 */
module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  extends: [
    'eslint:recommended',
  ],
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'data/',
    'build/',
    'dist/',
    'deploy-package/',
    'docker-files/',
    '**/*.min.js',
  ],
  rules: {
    // Keep warnings non-blocking initially; we can tighten later
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    'no-console': 'off',
    'no-undef': 'error',
    'no-prototype-builtins': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.js', 'tests/**/*.js'],
      env: { jest: true },
      rules: {
        'no-unused-expressions': 'off',
      },
    },
  ],
};

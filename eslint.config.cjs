// ESLint v9 flat config for Enhanced Logging Platform
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Ignores (replacement for .eslintignore in flat config)
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'data/**',
      'build/**',
      'dist/**',
      'deploy-package/**',
      'docker-files/**',
      'archive/**',
      'engines/**',
      'tests/**',
      'scripts/**',
      'database-tools/**',
      'development/**',
      'setup-tools/**',
      'configs/templates/**',
      '**/*.min.js',
      '**/*.bundle.js',
    ],
  },
  // Targeted linting for stabilized modules
  {
    files: ['middleware/**/*.js', 'routes/api/tracing.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Keep warnings non-blocking initially; we can tighten later
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
      'no-prototype-builtins': 'off',
    },
  },
  // (Optional) Add more files/directories incrementally once they are lint-clean
];

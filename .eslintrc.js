module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    // CRITICAL: Ban console statements in production code
    'no-console': ['error', {
      allow: [] // No console statements allowed
    }],
    
    // Best practices
    'no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    'no-undef': 'error',
    'semi': ['error', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'comma-dangle': ['warn', 'never'],
    'no-trailing-spaces': 'warn',
    'eol-last': ['warn', 'always'],
    
    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // Async/Promises
    'no-async-promise-executor': 'error',
    'no-await-in-loop': 'warn',
    'require-await': 'warn'
  },
  overrides: [
    {
      // Allow console in test files
      files: ['**/*.test.js', '**/*.spec.js', '**/tests/**', '**/scripts/**', '**/utilities/**'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};

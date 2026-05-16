/**
 * Root ESLint configuration for the KK-Kiro-Kit monorepo.
 *
 * Notes:
 * - File uses .cjs extension so it loads as CommonJS even though the workspace
 *   `package.json` declares `"type": "module"`.
 * - This is the baseline; per-package configs (e.g. packages/cli/.eslintrc.cjs)
 *   may extend or override these rules.
 * - Dependencies (`eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`)
 *   are not installed yet; that comes in a later task. The config file is staged
 *   here so that subsequent install steps wire up immediately.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.base.json',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'build', 'coverage', 'node_modules', '*.min.js'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
  overrides: [
    {
      // CommonJS scripts / config files (this file, hooks/*.js, etc.)
      files: ['*.cjs', '*.js'],
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
        project: null,
      },
      env: {
        node: true,
        commonjs: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
    {
      // Test files: relax some rules for ergonomic test writing.
      files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};

// Flat config (ESLint 9). Scope is src/ only — tests are covered by vitest.
//
// Deliberately NOT type-aware: type errors are already caught by `pnpm
// typecheck` (tsc --noEmit), and a second type-aware pass would double CI time
// for no extra signal. This config targets what tsc does not check.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // This is a terminal-UI codebase: measuring and stripping ANSI sequences
      // means matching \x1B in a regex on purpose, which is exactly what this
      // rule flags. No signal here, only noise.
      'no-control-regex': 'off',

      // An `_`-prefixed binding is the codebase's existing convention for a
      // deliberately unused parameter or catch binding.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);

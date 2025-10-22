const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: ['out', 'dist', '**/*.d.ts'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        // Most specific: private static readonly class properties (constants)
        { selector: 'property', modifiers: ['private', 'static', 'readonly'], format: ['UPPER_CASE', 'camelCase'] },
        // Static readonly properties (constants)
        { selector: 'property', modifiers: ['static', 'readonly'], format: ['UPPER_CASE', 'camelCase'] },
        // Types and interfaces use PascalCase
        { selector: 'typeLike', format: ['PascalCase'] },
        // Enum members can be PascalCase (Idle) or UPPER_CASE if desired
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        // Variables/consts: camelCase by default, allow UPPER_CASE for true constants
        { selector: 'variableLike', format: ['camelCase', 'UPPER_CASE'] },
        // Generic member-like fallback
        { selector: 'memberLike', modifiers: ['static', 'readonly'], format: ['UPPER_CASE', 'camelCase'] },
        // Private members allow leading underscore
        { selector: 'memberLike', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'allow' },
      ],
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'warn',
    },
  },
];

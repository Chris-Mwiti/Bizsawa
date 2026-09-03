import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'ios/**', 'android/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Readability: enforce spacing like in the spec — each object field on new line when multiline
      'object-curly-spacing': ['error', 'always'],
      'object-curly-newline': [
        'error',
        {
          ObjectExpression: {
            multiline: true,
            minProperties: 2,
            consistent: true,
          },
          ObjectPattern: { multiline: true },
          ImportDeclaration: { multiline: true, minProperties: 3 },
          ExportDeclaration: { multiline: true, minProperties: 3 },
        },
      ],
      'object-property-newline': [
        'error',
        { allowAllPropertiesOnSameLine: false },
      ],
      'array-bracket-newline': ['error', { multiline: true }],
      'array-element-newline': ['error', { multiline: true, minItems: 2 }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      'prefer-const': 'warn',
    },
  },
  prettierConfig,
]

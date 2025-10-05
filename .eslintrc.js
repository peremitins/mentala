import { eslintPatch } from '@rushstack/eslint-patch/modern-module-resolution';

eslintPatch();

export default {
  root: true,
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-prettier',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/attribute-hyphenation': ['error', 'always'],
  },
  globals: {
    APP_VERSION: 'readonly',
  },
  overrides: [
    {
      files: ['*.ts', '*.vue'],
      rules: {
        // Правила, специфичные для файлов .ts и .vue
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-implicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['*.js'],
      rules: {
        // Правила, специфичные для файлов .js
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-implicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: ['.eslintrc.js', '*.js', '*.vue', '*.ts'],
};

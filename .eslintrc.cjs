require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/attribute-hyphenation': ['error', 'always'],
    'prettier/prettier': 'warn',
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
  ignorePatterns: [
    '.eslintrc.cjs',
    'node_modules',
    '.nuxt',
    'dist',
    '.output',
    'android',
  ],
};

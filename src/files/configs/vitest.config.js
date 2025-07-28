// @ts-nocheck
// This file is ignored by the claude-project build process,
// but is used by the end-user's IDE to provide type-safety.

/** @type {import('vitest/config').UserConfig} */
const config = {
  test: {
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tools/**',
        'test/**',
        'state/**',
        'logs/**',
      ],
    },
  },
};

export default config;
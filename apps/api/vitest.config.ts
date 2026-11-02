import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@tuner/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // env.ts exits the process on a bad config, so the suite supplies the
    // minimum a module under test needs rather than reading a developer's .env.
    env: {
      DATABASE_URL: 'postgres://tuner:tuner@localhost:5432/tuner_test',
      STREAM_SECRET: 'test-secret-at-least-16-chars-long',
      NODE_ENV: 'test',
    },
    include: ['tests/**/*.test.ts'],
    // The suite is deliberately all pure functions: playlist rewriting, M3U
    // parsing, cursors and signing. Anything needing Postgres belongs in an
    // integration run, not in the loop that has to stay fast.
    coverage: { provider: 'v8', include: ['src/lib/**'], reporter: ['text'] },
  },
})

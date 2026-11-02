import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/sync.ts', 'src/cli/health.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // The workspace contract is source-only TypeScript, so it has to be bundled
  // in; everything else resolves from node_modules at runtime.
  noExternal: ['@tuner/shared'],
})

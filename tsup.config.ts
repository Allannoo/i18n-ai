import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
});
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'frameworks/nextjs/index': 'src/frameworks/nextjs/index.ts',
    'frameworks/express/index': 'src/frameworks/express/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'next', 'express'],
});

import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`              -> dist/         (normal multi-file build, relative base: works from any sub-path)
// `vite build --mode single` -> dist-single/  (ONE self-contained index.html, fonts + JS + CSS inlined, no external requests)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 2500,
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
  };
});

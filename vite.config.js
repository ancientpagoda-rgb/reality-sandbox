import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/reality-sandbox/',
  define: {
    'THREE.REVISION': JSON.stringify('184'),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsDir: 'assets',
    rollupOptions: {
      // Minimal demo: build only the single reality-lab entrypoint
      input: {
        realityLab: resolve(process.cwd(), 'reality-lab.html'),
      },
    },
  },
});

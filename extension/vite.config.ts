import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import * as esbuild from 'esbuild';

/**
 * Custom Vite Plugin to bundle content scripts as self-contained IIFE classic scripts.
 *
 * Chromium Manifest V3 executes content_scripts in classic script mode, which does
 * not support ES module `import` statements. Rollup's multi-entry ES build creates
 * code-split shared chunks (e.g. assets/constants-*.js) with `import` statements.
 *
 * This plugin bundles contentScript.ts and injectGuard.ts into pure, self-contained
 * IIFEs with zero top-level imports or exports.
 */
function buildContentScripts(): Plugin {
  return {
    name: 'build-content-scripts',
    buildStart() {
      this.addWatchFile(resolve(__dirname, 'src/content/contentScript.ts'));
      this.addWatchFile(resolve(__dirname, 'src/content/injectGuard.ts'));
      this.addWatchFile(resolve(__dirname, 'src/shared/constants.ts'));
      this.addWatchFile(resolve(__dirname, 'src/shared/types.ts'));
    },
    async writeBundle() {
      const isProduction = process.env.NODE_ENV === 'production';

      // 1. Bundle content.js as an isolated IIFE classic script
      await esbuild.build({
        entryPoints: [resolve(__dirname, 'src/content/contentScript.ts')],
        outfile: resolve(__dirname, 'dist/content.js'),
        bundle: true,
        format: 'iife',
        target: 'chrome110',
        sourcemap: !isProduction,
        minify: isProduction,
      });

      // 2. Bundle injectGuard.js as an isolated IIFE classic script
      await esbuild.build({
        entryPoints: [resolve(__dirname, 'src/content/injectGuard.ts')],
        outfile: resolve(__dirname, 'dist/injectGuard.js'),
        bundle: true,
        format: 'iife',
        target: 'chrome110',
        sourcemap: !isProduction,
        minify: isProduction,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/manifest.json',
          dest: '.',
        },
        {
          src: 'public/icons/*',
          dest: 'icons',
        },
      ],
    }),
    buildContentScripts(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/serviceWorker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});

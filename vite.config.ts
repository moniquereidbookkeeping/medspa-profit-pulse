import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';


/**
 * Put the (small) stylesheet inside index.html so the first paint does not wait for a second download.
 * Build-only: it changes nothing in development.
 */
const inlineCriticalCss = () => ({
  name: 'inline-critical-css',
  enforce: 'post' as const,
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    const page = bundle['index.html'];
    if (!page || page.type !== 'asset') return;
    let html = String(page.source);
    for (const [file, asset] of Object.entries(bundle)) {
      if (asset.type !== 'asset' || !file.endsWith('.css')) continue;
      const name = file.split('/').pop() as string;
      const link = new RegExp(`<link[^>]*rel="stylesheet"[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
      if (link.test(html)) {
        const css = String(asset.source);
        html = html.replace(link, () => `<style>${css}</style>`);
        delete bundle[file];
      }
    }
    page.source = html;
  }
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), inlineCriticalCss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

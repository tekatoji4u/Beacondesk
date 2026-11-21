import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Các máy chủ AI mà người dùng có thể tự bật (chỉ ở bản online).
const AI_HOSTS = 'https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com';

const CSP_ONLINE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: data: ${AI_HOSTS}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// Bản một tệp: chặn mọi kết nối mạng ở mức trình duyệt.
const CSP_SINGLE = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'worker-src blob:',
  'child-src blob:',
  'connect-src blob: data:',
  'media-src blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __SINGLE__: JSON.stringify(single),
    },
    build: single
      ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 100_000, emptyOutDir: true }
      : { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 4000, emptyOutDir: true },
    worker: { format: 'es' },
    plugins: [
      {
        name: 'beacondesk-html',
        transformIndexHtml(html) {
          const csp = `<meta http-equiv="Content-Security-Policy" content="${single ? CSP_SINGLE : CSP_ONLINE}" />`;
          return html
            .replace('<!--CSP-->', csp)
            .replace('<!--MANIFEST-->', single ? '' : '<link rel="manifest" href="./manifest.webmanifest" />');
        },
      },
      ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
    ],
    esbuild: { target: 'es2022' },
  };
});

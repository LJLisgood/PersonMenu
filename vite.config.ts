import { defineConfig } from 'vite';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import { buildContent } from './scripts/build-content.mjs';
let builtBase = '/';
const previewBase = () => {
  try {
    return fs.readFileSync('dist/.base-path', 'utf8').trim();
  } catch {
    return '/';
  }
};
export default defineConfig(({ isPreview }) => ({
  base: process.env.BASE_PATH || (isPreview ? previewBase() : '/'),
  plugins: [
    react(),
    {
      name: 'local-recipes',

      async configureServer(server) {
        await buildContent(process.cwd());
        server.watcher.add('content');
        let timer: ReturnType<typeof setTimeout>;
        let building = false;
        let queued = false;
        const rebuild = async () => {
          if (building) {
            queued = true;
            return;
          }
          building = true;
          try {
            await buildContent(process.cwd());
            server.ws.send({ type: 'full-reload' });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            server.ws.send({ type: 'error', err: { message, stack: message } });
          } finally {
            building = false;
            if (queued) {
              queued = false;
              void rebuild();
            }
          }
        };
        server.watcher.on('all', (_event, file) => {
          if (file.includes('/content/')) {
            clearTimeout(timer);
            timer = setTimeout(rebuild, 300);
          }
        });
      },
    },
    {
      name: 'remember-built-base',
      configResolved(config) {
        builtBase = config.base;
      },
      writeBundle() {
        fs.writeFileSync('dist/.base-path', builtBase);
      },
    },
  ],
}));

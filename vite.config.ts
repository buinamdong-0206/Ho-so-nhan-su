import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/proxy': {
          target: 'https://api.daihoidangtoanquoc.vn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/proxy/, '')
        },
        '/api/proxy-cdn': {
          target: 'https://cdn.daihoidangtoanquoc.vn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/proxy-cdn/, '')
        }
      }
    },
  };
});

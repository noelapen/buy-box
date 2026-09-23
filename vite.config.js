import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        background: 'src/background/background.js',
        content: 'src/content/content.js',
      },
      output: {
        entryFileNames: 'assets/[name].js',
      },
    },
  },
});

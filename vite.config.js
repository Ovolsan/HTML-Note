import { defineConfig } from 'vite';

// Tauri ожидает фиксированный порт в режиме разработки.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'chrome120', outDir: 'dist', chunkSizeWarningLimit: 1500 },
});

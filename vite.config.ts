import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri가 띄우는 개발 서버. 포트가 바뀌면 src-tauri/tauri.conf.json의 devUrl도 같이 바꾼다
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { outDir: 'dist', target: 'safari15', sourcemap: false },
});

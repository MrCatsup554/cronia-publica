import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo, las peticiones a `/api` se redirigen al servidor de OCR, de
 * modo que el navegador siempre habla con un mismo origen y no hace falta CORS.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY ?? 'http://localhost:8787';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // pdf.js y jsPDF son pesados y cambian poco: en su propio bloque
          // aprovechan mejor la caché del navegador entre despliegues.
          manualChunks: {
            pdf: ['pdfjs-dist'],
            export: ['jspdf'],
          },
        },
      },
    },
  };
});

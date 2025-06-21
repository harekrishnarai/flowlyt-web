import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Use root path for custom domain
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Optimize build for production
    target: 'es2015',
    minify: 'esbuild', // Use esbuild instead of terser for better compatibility
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom'],
          pdf: ['jspdf'],
          yaml: ['js-yaml'],
          ui: ['lucide-react']
        }
      }
    },
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 600
  },
  // Add server configuration for development
  server: {
    port: 5173,
    host: true
  }
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: '../server/wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      // Thumbnail galeri operator memakai /f/{id}.
      '^/f/[a-f0-9]{16}$': 'http://localhost:4000',
    },
  },
})

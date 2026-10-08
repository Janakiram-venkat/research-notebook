import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The FastAPI backend (backend/). Same-origin in dev, so no CORS setup.
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
})

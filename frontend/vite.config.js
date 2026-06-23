import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config — dev server port 5173 (tere live-streaming jaisa hi)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})

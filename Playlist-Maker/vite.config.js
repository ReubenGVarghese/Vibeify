import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ADD THIS LINE:
    host: '127.0.0.1', 
    // Keep existing settings
    port: 8888,
    strictPort: true,
    open: true, // This tells Vite to open the browser automatically
  }
})
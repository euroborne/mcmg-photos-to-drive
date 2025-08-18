import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This tells Vite to use relative paths for all assets.
  // It's the most reliable setting for GitHub Pages.
  base: './',
})
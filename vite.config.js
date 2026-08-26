import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the build works at any GitHub Pages sub-path
  // (username.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  plugins: [react()],
  server: { port: 5180 },
})

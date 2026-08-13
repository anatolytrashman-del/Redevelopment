import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages отдаёт сайт из подпапки /Redevelopment/ (по имени репозитория),
// а Vercel — с корня своего домена, поэтому base зависит от платформы сборки.
// Vercel сам выставляет переменную окружения VERCEL=1 во время билда.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VERCEL ? '/' : '/Redevelopment/',
  plugins: [react(), tailwindcss()],
})

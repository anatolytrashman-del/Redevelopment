import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Момент сборки — для карточки агента «Claude Code» в «Команде»
    // (последняя задача = «Релиз на прод», см. data/aiAgents.ts). На Vercel
    // сборка идёт ровно при публикации, так что это и есть время релиза.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // Режим отдельного Vercel-проекта: malls | offices | platform
    // (env VITE_PUBLIC_SITE). Не import.meta — middleware тоже импортирует sites.ts.
    __DEPLOYED_SITE_MODE__: JSON.stringify(process.env.VITE_PUBLIC_SITE || process.env.PUBLIC_SITE || 'platform'),
  },
})

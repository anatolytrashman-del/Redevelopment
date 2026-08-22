// Пререндер публичных лендингов объектов (SEO_PLAN.md, Э2-1) — после
// vite build открывает каждую опубликованную страницу headless-браузером
// и сохраняет реально отрисованный HTML в dist/<slug>/index.html.
//
// Зачем: у SPA один статический index.html на все роуты, а контент
// (title/meta, H1, цены) появляется только после клиентского фетча из
// Supabase. Яндекс рендерит JS нестабильно (официальная рекомендация —
// SSR/пререндер), AI-краулеры (GPTBot, PerplexityBot, ClaudeBot) вообще
// не выполняют JS — без пререндера для них лендинга не существует.
//
// dist/<slug>/index.html Vercel отдаёт как статический файл РАНЬШЕ общего
// rewrite "/(.*)" → "/index.html" из vercel.json (проверено curl-ом после
// первого деплоя, см. журнал SEO_PLAN.md) — тот же принцип, что и у
// dist/tz.html (generate-tz-preview-html.mjs), только там просто другой
// <head> поверх пустого SPA-шелла, а здесь — уже отрисованный контент.
//
// Список слагов — не захардкожен: запрос к Supabase (тот же публичный
// anon-ключ, что и в lib/supabase.ts, доступ регулируется RLS, не
// секретностью ключа) за всеми объектами с непустым landing_slug — новые
// объекты с продающей страницей подхватываются сами, без правки скрипта.
//
// Один HTML-снапшот на слаг не протухнет молча: рабочий процесс — трекнуть
// сборку с Vercel Deploy Hook при сохранении объекта в админке (см.
// lib/objectsApi.ts, api/trigger-rebuild.js), не расписание.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = new URL('..', import.meta.url).pathname;
const DIST_DIR = join(ROOT_DIR, 'dist');
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// Публичный anon-ключ (см. src/lib/supabase.ts) — тот же, что зашит в
// клиентский бандл, отдельного секрета для сборки не требует.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

// Контентные страницы вне сущности "объект" (гиды и т.п., см. App.tsx) — не
// в Supabase, поэтому перечислены явно. Добавлять сюда каждый новый гид
// (Э3-1/Э3-3 в SEO_PLAN.md).
const STATIC_SLUGS = ['rayon-minsk-mir'];

async function fetchLandingSlugs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/objects?select=landing_slug&landing_slug=not.is.null`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase вернул ${res.status} при запросе landing_slug`);
  const rows = await res.json();
  return rows.map((r) => r.landing_slug).filter((slug) => typeof slug === 'string' && slug.trim() !== '');
}

// `vite preview` — тот же сервер, что уже настроен как npm-скрипт
// (package.json → "preview"), отдаёт dist/ с правильными MIME-типами и
// SPA-фолбэком из коробки. Не переизобретаю сервер вручную — самодельный
// без точного MIME для .js/.css рискует сломать загрузку ES-модулей в
// headless-браузере (Chromium требует text/javascript у <script type="module">).
function startPreviewServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
  });
  return proc;
}

async function waitForServer(timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return;
    } catch {
      // сервер ещё не поднялся — подождать и попробовать снова
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('vite preview не поднялся за 20с');
}

// На Vercel обычный playwright-браузер не факт что запустится (минимальный
// build-контейнер, нет гарантии системных библиотек под Chromium) —
// @sparticuz/chromium собран специально под такие serverless/build-среды
// (тот же образ, что используют для Lambda). Локально (эта песочница,
// возможная будущая разработка) используем уже готовый Chromium из
// PLAYWRIGHT_BROWSERS_PATH напрямую по пути — тот же приём, что скилл `run`
// советует для случаев с закреплённой версией браузера в окружении.
async function launchBrowser() {
  if (process.env.VERCEL) {
    const sparticuzChromium = (await import('@sparticuz/chromium')).default;
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
}

async function main() {
  if (!existsSync(DIST_DIR)) throw new Error('dist/ не найден — запускать после vite build');

  const slugs = [...(await fetchLandingSlugs()), ...STATIC_SLUGS];
  if (slugs.length === 0) {
    console.warn('[prerender] пререндерить нечего — нет ни объектов с landing_slug, ни статических страниц');
    return;
  }

  const serverProc = startPreviewServer();
  try {
    await waitForServer();
    const browser = await launchBrowser();
    try {
      for (const slug of slugs) {
        // Одна попытка молча пропала на реальном деплое (первый заход
        // rayon-minsk-mir — build-контейнер Vercel слабее этой песочницы,
        // локально та же страница рендерится мгновенно и без ошибок) — один
        // повтор на случай разовой нестабильности, не только на первый раз.
        for (let attempt = 1; attempt <= 2; attempt++) {
          // Отдельная вкладка на каждую попытку — не переиспользуем одну
          // между слагами/повторами, чтобы состояние предыдущего захода
          // (таймеры, подписки) точно не могло повлиять на следующий.
          const page = await browser.newPage();
          try {
            // ?prerender=1 — сигнал для инлайн-скрипта Яндекс.Метрики в
            // index.html не считать этот заход реальным визитом (см.
            // комментарий там же). В сохранённый HTML параметр не попадает —
            // только управляет тем, что выполнится при заходе именно отсюда.
            await page.goto(`${BASE_URL}/${slug}?prerender=1`, { waitUntil: 'domcontentloaded' });
            // ObjectLandingPage держит спиннер, пока не пришли данные из
            // Supabase (см. состояние loading) — h1 в разметке появляется
            // только у реального контента, это и есть сигнал готовности
            // (для статических страниц вроде DistrictGuidePage h1 есть сразу).
            await page.waitForSelector('h1', { timeout: 20_000 });
            const html = await page.content();
            const dir = join(DIST_DIR, slug);
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, 'index.html'), html);
            console.log(`[prerender] /${slug} → dist/${slug}/index.html (${Math.round(html.length / 1024)} КБ)`);
            break;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (attempt === 2) {
              // Одна проблемная страница не должна ронять сборку остальных —
              // без снапшота роут просто останется на клиентском рендере, как
              // и было раньше, до Э2-1 (не хуже текущего состояния).
              console.error(`[prerender] /${slug} пропущен после 2 попыток:`, message);
            } else {
              console.warn(`[prerender] /${slug}: попытка ${attempt} не удалась (${message}), повтор`);
            }
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error('[prerender] сбой:', err);
  process.exit(1);
});

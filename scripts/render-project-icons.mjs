#!/usr/bin/env node
// Рендерит PNG/ICO из SVG-марок проектов и (опционально) заливает аватары в Vercel.
// Без VERCEL_TOKEN — только локальные файлы.
//
//   node scripts/render-project-icons.mjs
//   VERCEL_TOKEN=… node scripts/render-project-icons.mjs --upload
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const UPLOAD = process.argv.includes('--upload');
const OUT_DIR = 'tmp/project-icons';
const RED = '#e4152b';

/** @type {{ id: string, label: string, svg: string, publicPng?: string, vercelProject: string }[]} */
const MARKS = [
  {
    id: 'redevelopment',
    label: 'R',
    svg: 'public/favicon.svg',
    publicPng: 'public',
    vercelProject: 'redevelopment',
  },
  {
    id: 'officelist',
    label: 'O',
    svg: 'public/offices/favicon.svg',
    vercelProject: 'officelist',
  },
  {
    id: 'malllist',
    label: 'M',
    svg: 'public/malls/favicon.svg',
    vercelProject: 'malllist',
  },
  {
    id: 'casinolist',
    label: '♠',
    svg: 'public/casino/favicon.svg',
    vercelProject: 'casinolist',
  },
];

async function chromiumLaunch() {
  const localPw = '/opt/pw-browsers/chromium';
  if (!process.env.VERCEL && existsSync(localPw)) {
    return chromium.launch({ executablePath: localPw, headless: true });
  }
  const sparticuzChromium = (await import('@sparticuz/chromium')).default;
  return chromium.launch({
    executablePath: await sparticuzChromium.executablePath(),
    args: sparticuzChromium.args.filter((a) => a !== '--single-process'),
    headless: true,
  });
}

function faviconHtml(svg, size) {
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svg}</body></html>`;
}

async function renderPng(page, svgText, size, path) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(faviconHtml(svgText, size), { waitUntil: 'load' });
  await page.screenshot({ path, omitBackground: size < 64 });
}

async function uploadAvatar(projectName, pngPath, token, teamId) {
  const bytes = readFileSync(pngPath);
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const url = `https://api.vercel.com/v1/projects/${encodeURIComponent(projectName)}/avatar${qs}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/png',
    },
    body: bytes,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${projectName}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return text;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let browser;
  try {
    browser = await chromiumLaunch();
    const page = await browser.newPage();

    for (const mark of MARKS) {
      if (!existsSync(mark.svg)) {
        throw new Error(`[render-project-icons] нет ${mark.svg}`);
      }
      const svgText = readFileSync(mark.svg, 'utf8');
      const dir = join(OUT_DIR, mark.id);
      mkdirSync(dir, { recursive: true });

      const avatarPath = join(dir, 'avatar-256.png');
      const fav32 = join(dir, 'favicon-32.png');
      const apple = join(dir, 'apple-touch-icon.png');

      await renderPng(page, svgText, 256, avatarPath);
      await renderPng(page, svgText, 32, fav32);
      await renderPng(page, svgText, 180, apple);

      copyFileSync(mark.svg, join(dir, 'favicon.svg'));
      writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...mark, red: RED }, null, 2));

      if (mark.publicPng === 'public') {
        copyFileSync(fav32, 'public/favicon.png');
        copyFileSync(fav32, 'public/favicon.ico');
        copyFileSync(apple, 'public/apple-touch-icon.png');
      }

      console.log(`[render-project-icons] ${mark.id} (${mark.label}) → ${dir}`);
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }

  if (!UPLOAD) {
    console.log('[render-project-icons] готово (без --upload). Для Vercel: VERCEL_TOKEN=… node scripts/render-project-icons.mjs --upload');
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error('[render-project-icons] --upload требует VERCEL_TOKEN');
  }

  // teamId опционален — если токен на команду, Vercel сам резолвит по имени.
  const teamId = process.env.VERCEL_TEAM_ID || '';
  const results = [];
  for (const mark of MARKS) {
    const png = join(OUT_DIR, mark.id, 'avatar-256.png');
    try {
      const body = await uploadAvatar(mark.vercelProject, png, token, teamId);
      results.push({ project: mark.vercelProject, ok: true, body: body.slice(0, 120) });
      console.log(`[render-project-icons] uploaded avatar → ${mark.vercelProject}`);
    } catch (err) {
      results.push({
        project: mark.vercelProject,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      console.warn(`[render-project-icons] FAIL ${mark.vercelProject}:`, err instanceof Error ? err.message : err);
    }
  }
  writeFileSync(join(OUT_DIR, 'upload-results.json'), JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

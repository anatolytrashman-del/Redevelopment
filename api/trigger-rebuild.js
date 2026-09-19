// Vercel serverless function: отмечает в deploy_debounce, что данные для
// публичных страниц изменились (сохранён объект или бизнес-центр в админке,
// см. lib/objectsApi.ts / lib/businessCentersApi.ts) — иначе пререндеренный
// при сборке HTML (scripts/prerender.mjs, SEO_PLAN.md Э2-1) хранит старые
// title/meta/цену до следующего обычного пуша.
//
// САМУ СБОРКУ ЭТОТ ЭНДПОИНТ НЕ ЗАПУСКАЕТ (2026-09-19). Раньше он дёргал
// Vercel Deploy Hook напрямую, с дебаунсом в 5 минут. Реальный инцидент
// того же дня: непрерывная правка карточек БЦ в админке держала прод в
// режиме «каждые 5-6 минут новая полная пересборка» больше часа — один и
// тот же коммит ad16fdf собран в прод пять раз подряд (18:25, 18:31,
// 18:36, 18:42, 18:48), каждая сборка по 6-7 минут, потому что scope
// business_centers означает полный рендер ~285 страниц. Владелец: «я не
// вношу новые правки и жду старые, а оно продолжает грузить всё новые
// деплои». Дебаунс тут не спасал by design: он ограничивает ЧАСТОТУ, а не
// общее число сборок за долгий сеанс правок.
//
// Теперь сборку запускает почасовой pg_cron (см. миграцию
// 20260919-rebuild-hourly-cron.sql): раз в час он смотрит, есть ли
// непотреблённая отметка, и только тогда дёргает Deploy Hook. Владелец,
// 2026-09-19: «готов запускать перерендер каждый час, если сможем хранить
// данные». Данные и хранятся: scope накапливается (mergeScope), consumed_at
// сбрасывается в null при каждом сохранении, так что ни одна правка не
// теряется — она просто уезжает на публичные страницы в пределах часа.
//
// P0.3 аудита безопасности: требует сессию сотрудника (раньше — вообще без
// проверки, любой мог дёргать реальную пересборку прода). Отметка — в
// таблице deploy_debounce (RLS без единой политики — доступна только
// service_role, как и должно быть для чисто служебной метки).
//
// 2026-09-10 — эта же строка одновременно служит сигналом для prerender.mjs
// («нужен настоящий полный рендер, не быстрое копирование живого прода» —
// см. shouldForceFullPrerender() там же). Реальный баг: раньше это был
// просто временной ОКНОМ (15 минут) — любой билд, случайно попавший в это
// окно (ручной Redeploy из дашборда Vercel, обычный несвязанный пуш кода),
// тоже уходил в полный рендер ~150+ страниц (~9 минут) вместо быстрого
// (~1 минуты), хотя реально это было нужно только ОДНОЙ сборке — той,
// что реально пошла следом за сохранением объекта. Теперь потребление
// одноразовое (атомарный UPDATE ... WHERE consumed_at IS NULL в
// prerender.mjs) — сюда обязательно сбрасывать consumed_at=null при
// каждом новом триггере (см. setLastTriggeredAt), иначе новый триггер
// после уже потреблённого старого молча считался бы «уже обработан».
//
// Владелец, 2026-09-09: "при каждой отправке письма [массовой рассылки] ты
// запускал этот костыль, а после отправки всех писем — останавливал" —
// вместо периодического опроса сессией Claude (не переживает конец сессии,
// не срабатывает мгновенно) настоящий автотриггер: BulkSendModal сразу
// после постановки задания в очередь (insertBulkSendJob) вызывает этот же
// эндпоинт с action:'dispatch-bulk-send' — функция сама дёргает
// workflow_dispatch на process-bulk-send-jobs.yml через GitHub REST API, не
// дожидаясь ни планового крона (тот не срабатывает сам, см. журнал), ни
// ручного вмешательства. Сам воркфлоу разом обрабатывает ВСЕ накопленные
// pending-письма с паузой между ними и завершается сам, когда очередь
// пуста — отдельного "остановить" не требуется, это не постоянный опрос, а
// одноразовый запуск на каждую постановку в очередь. Нужен новый секрет
// GITHUB_ACTIONS_DISPATCH_TOKEN (fine-grained PAT, доступ только к этому
// репозиторию, permission Actions: Read and write) в Vercel env — без него
// (или при сетевой ошибке) просто логируем и отвечаем 200, планового крона
// это не отменяет, только не даёт дополнительного мгновенного триггера.
//
// 2026-09-11: тот же принцип для веб-поиска поставщиков — action
// 'dispatch-supplier-search', дёргает process-supplier-web-search-jobs.yml.
// Владелец: "минуту ждать перед открытой вкладкой не захочется... я
// формирую поиск, система ищет в фоне, я закрываю вкладку, когда найдёт —
// уведомление" — веб-поиск (2 раунда по 40-115с каждый, см. комментарий в
// scripts/process-supplier-web-search-jobs.mjs) переведён с синхронного
// HTTP-запроса на ту же очередь, что и массовая рассылка.
//
// 2026-09-11: обогащение контактов поставщиков (email для заказов/телефон/
// мессенджеры с сайта) своего action здесь НЕ имеет специально — задания
// создаёт сам поисковый скрипт, и тот же прогон воркфлоу их сразу
// обрабатывает (см. .github/workflows/process-supplier-web-search-jobs.yml),
// поэтому дёргать отдельный воркфлоу из админки незачем.
import { requireStaffAuth } from './_auth.js';
import { mergeScope, normalizeScope } from './_rebuildScope.js';

const GITHUB_OWNER = 'anatolytrashman-del';
const GITHUB_REPO = 'redevelopment';
const GITHUB_REF = 'claude/redevelopment-platform-prototype-oodobu';

async function dispatchWorkflow(res, workflowFile) {
  const token = process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;
  if (!token) {
    console.warn(`[trigger-rebuild] GITHUB_ACTIONS_DISPATCH_TOKEN не настроен — воркфлоу ${workflowFile} не запущен, ждём планового крона`);
    res.status(200).json({ triggered: false, reason: 'no github token configured' });
    return;
  }
  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: GITHUB_REF }),
      },
    );
    if (!ghRes.ok) {
      const text = await ghRes.text();
      console.error(`[trigger-rebuild] workflow_dispatch (${workflowFile}) отклонён GitHub:`, ghRes.status, text.slice(0, 300));
    }
    res.status(200).json({ triggered: ghRes.ok });
  } catch (err) {
    console.error(`[trigger-rebuild] не удалось вызвать workflow_dispatch (${workflowFile}):`, err);
    res.status(200).json({ triggered: false, reason: 'fetch failed' });
  }
}

// Строка отметки целиком: когда последний раз менялись данные, забрала ли
// её уже сборка и ЧТО менялось (scope, см. ./_rebuildScope.js) —
// scripts/prerender.mjs по scope решает, рендерить ли все ~286 страниц или
// только лендинги объектов, а почасовой pg_cron по consumed_at решает,
// нужна ли вообще сборка в этот час.
async function getDebounceRow() {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/deploy_debounce?id=eq.default&select=triggered_at,consumed_at,scope`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] ?? null;
}

// consumed_at сбрасывается на null ЯВНО каждый раз — merge-duplicates upsert
// трогает только колонки, реально присутствующие в payload (см. комментарий
// про этот же нюанс PostgREST в CLAUDE.md, «Паттерн работы с данными»).
// Без явного сброса новый триггер после уже потреблённого старого молча
// считался бы «уже обработан» первым же атомарным consume в prerender.mjs
// (см. его же комментарий) — полный рендер для реального изменения данных
// не сработал бы вообще ни разу.
async function setLastTriggeredAt(iso, scope) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/deploy_debounce`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: 'default', triggered_at: iso, consumed_at: null, scope }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;

  const { action, scope: rawScope } = req.body ?? {};
  // Что менялось (см. ./_rebuildScope.js). Старый фронт scope не шлёт → 'all',
  // то есть полный рендер, как и до этой правки.
  const scope = normalizeScope(rawScope);
  if (action === 'dispatch-bulk-send') {
    await dispatchWorkflow(res, 'process-bulk-send-jobs.yml');
    return;
  }
  if (action === 'dispatch-supplier-search') {
    await dispatchWorkflow(res, 'process-supplier-web-search-jobs.yml');
    return;
  }

  // Непотреблённый флаг (сборка его ещё не забрала) — его scope объединяем с
  // новым, чтобы не потерять то, что он должен был отрендерить: два разных
  // scope за один час дают 'all'. Потреблённый — перезаписываем своим.
  const last = await getDebounceRow();
  const pending = Boolean(last && !last.consumed_at);
  await setLastTriggeredAt(new Date().toISOString(), pending ? mergeScope(last.scope, scope) : scope);

  res.status(200).json({ queued: true });
}

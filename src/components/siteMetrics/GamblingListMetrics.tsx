import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card';
import { ToggleGroup } from '../ui/ToggleGroup';
import { cn } from '../../lib/cn';
import {
  fetchGamblingAnalytics,
  fillDailyGaps,
  type GamblingAnalytics,
  type GamblingBreakdownRow,
} from '../../lib/gamblingListAnalytics';
import {
  GAMBLINGLIST_REQUEST_HISTORY,
  GAMBLINGLIST_REQUEST_HISTORY_META,
} from '../../data/gamblingListRequestHistory';
import { classifyReferrerHost } from '../../lib/searchMetrics';

// GamblingList (gamblinglist.pro) в «Показателях» — 2026-10-26, владелец:
// «так же как офис лист и мол лист, так же выводи гэмблинг лист».
// Сайт в другом репозитории и Vercel-проекте, своего счётчика нет — живые
// цифры из Vercel Web Analytics (api/gamblinglist-analytics.js), а до его
// подключения — разовая выгрузка запросов к серверу из Vercel Observability.

type Days = 7 | 30 | 90;
const DAYS_LABELS: Record<Days, string> = { 7: '7 дней', 30: '30 дней', 90: '90 дней' };
const DAYS_ORDER: Days[] = [7, 30, 90];
const LABEL_TO_DAYS = Object.fromEntries(DAYS_ORDER.map((d) => [DAYS_LABELS[d], d])) as Record<string, Days>;
const REFRESH_INTERVAL_MS = 5 * 60_000;

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function total(rows: { value: number }[]): number {
  return rows.reduce((acc, r) => acc + r.value, 0);
}

function Bars({ data }: { data: { date: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-24 items-end gap-px">
      {data.map((d) => (
        <div
          key={d.date}
          className="group relative flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
          style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
        >
          <span
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            role="tooltip"
          >
            {formatDay(d.date)}: {d.value.toLocaleString('ru-RU')}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarsCard({ title, data, note }: { title: string; data: { date: string; value: number }[]; note?: string }) {
  const first = data[0]?.date;
  const last = data[data.length - 1]?.date;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-sm text-ink-muted">
          <strong className="text-ink">{total(data).toLocaleString('ru-RU')}</strong>
        </span>
      </div>
      <Bars data={data} />
      {first && last && (
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{formatDay(first)}</span>
          <span>{formatDay(last)}</span>
        </div>
      )}
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-3xl font-semibold text-ink">{value}</p>
    </Card>
  );
}

function BreakdownCard({ title, rows, emptyLabel }: { title: string; rows: GamblingBreakdownRow[]; emptyLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.pageviews));
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Пока пусто.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.key || '—'} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate text-ink">{row.key || emptyLabel}</span>
                <span className="shrink-0 text-ink-muted">{row.pageviews.toLocaleString('ru-RU')}</span>
              </div>
              <div className="h-1.5 rounded-full bg-primary/10">
                <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(row.pageviews / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// 2026-10-28 — владелец: из рефереров показываем только поисковики и
// ИИ-сервисы, раздельно «Поиск» / «ИИ»; прямые заходы и прочие сайты скрыты.
function SearchAiReferrersCard({ rows }: { rows: GamblingBreakdownRow[] }) {
  const groups = [
    { title: 'Поиск', rows: rows.filter((r) => classifyReferrerHost(r.key) === 'search') },
    { title: 'ИИ', rows: rows.filter((r) => classifyReferrerHost(r.key) === 'ai') },
  ];
  const max = Math.max(1, ...groups.flatMap((g) => g.rows.map((r) => r.pageviews)));
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">Из поиска и ИИ</h3>
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          <div className="flex justify-between text-xs font-medium text-ink-muted">
            <span>{group.title}</span>
            <span>{group.rows.reduce((n, r) => n + r.pageviews, 0).toLocaleString('ru-RU')}</span>
          </div>
          {group.rows.length === 0 ? (
            <p className="text-sm text-ink-muted">Пока пусто.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {group.rows.map((row) => (
                <li key={row.key} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-ink">{row.key.replace(/^www\./, '')}</span>
                    <span className="shrink-0 text-ink-muted">{row.pageviews.toLocaleString('ru-RU')}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-primary/10">
                    <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(row.pageviews / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Card>
  );
}

export function GamblingListMetrics() {
  const [days, setDays] = useState<Days>(30);
  const [data, setData] = useState<GamblingAnalytics | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const result = await fetchGamblingAnalytics(days);
    setData(result);
    setLastCheckedAt(new Date());
    setRefreshing(false);
  }, [days]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const daily = useMemo(
    () => (data?.status === 'ok' ? fillDailyGaps(data.daily, data.since, data.until) : []),
    [data],
  );
  const hasLiveData = data?.status === 'ok' && data.daily.some((d) => d.pageviews > 0 || d.visitors > 0);

  const historyPages = GAMBLINGLIST_REQUEST_HISTORY.map((d) => ({ date: d.day, value: d.pageHits }));
  const historyRequests = GAMBLINGLIST_REQUEST_HISTORY.map((d) => ({ date: d.day, value: d.requests }));
  // null = в этот день хитов не было вовсе — на графике это ноль.
  const historyIps = GAMBLINGLIST_REQUEST_HISTORY.map((d) => ({ date: d.day, value: d.uniqueIps ?? 0 }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          label="Период"
          options={DAYS_ORDER.map((d) => DAYS_LABELS[d])}
          value={DAYS_LABELS[days]}
          onChange={(label) => setDays(LABEL_TO_DAYS[label])}
        />
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
          <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
          {lastCheckedAt
            ? `проверено в ${lastCheckedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · автоматически раз в 5 минут`
            : 'проверка…'}
        </span>
      </div>

      {data === null && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {data?.status === 'not-configured' && (
        <Card className="text-sm text-ink-muted">
          Vercel Web Analytics для gamblinglist.pro ещё не подключён к админке: на сервере не задан
          ключ <code>VERCEL_ANALYTICS_TOKEN</code>. Ниже — история запросов из разовой выгрузки.
        </Card>
      )}

      {data?.status === 'error' && <p className="text-sm text-danger">{data.message}</p>}

      {data?.status === 'ok' && !hasLiveData && (
        <Card className="text-sm text-ink-muted">
          Vercel Web Analytics подключён, но посещений пока нет. Они появятся после релиза gamblinglist.pro со
          скриптом Web Analytics; задним числом Vercel их не считает.
        </Card>
      )}

      {data?.status === 'ok' && hasLiveData && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Tile label="Посетители" value={total(daily.map((d) => ({ value: d.visitors }))).toLocaleString('ru-RU')} />
            <Tile label="Просмотры страниц" value={total(daily.map((d) => ({ value: d.pageviews }))).toLocaleString('ru-RU')} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarsCard title="Посетители по дням" data={daily.map((d) => ({ date: d.day, value: d.visitors }))} />
            <BarsCard title="Просмотры по дням" data={daily.map((d) => ({ date: d.day, value: d.pageviews }))} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BreakdownCard title="Популярные страницы" rows={data.pages} emptyLabel="—" />
            <SearchAiReferrersCard rows={data.referrers} />
            <BreakdownCard title="Страны" rows={data.countries} emptyLabel="Не определена" />
          </div>
          <p className="text-xs text-ink-muted">
            Источник — Vercel Web Analytics проекта gamblinglist (без cookie, ботов отсекает Vercel). Посетитель
            считается за сутки, как в самом Vercel.
          </p>
        </>
      )}

      <Card className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">История до Web Analytics — запросы к серверу</h3>
        <p className="text-xs text-ink-muted">
          Разовая выгрузка из Vercel Observability за {formatDay(GAMBLINGLIST_REQUEST_HISTORY_META.from)} —{' '}
          {formatDay(GAMBLINGLIST_REQUEST_HISTORY_META.to)} (Vercel хранит её {GAMBLINGLIST_REQUEST_HISTORY_META.retentionDays}{' '}
          дней, выгружено {formatDay(GAMBLINGLIST_REQUEST_HISTORY_META.exportedAt)}). Это не посетители: туда попадают
          и боты, которых Vercel не распознал. Цифры — верхняя граница.
        </p>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BarsCard
          title="Открытия страниц"
          data={historyPages}
          note="HTML-ответы gamblinglist.pro без распознанных ботов (≈90% — 200, остальное 404)"
        />
        <BarsCard
          title="Уникальные IP за день"
          data={historyIps}
          note="Те же открытия, разных IP за сутки (сумма по дням, не уникальные за период). С 20 окт почти каждый хит — новый IP: похоже на сканеры, а не людей"
        />
        <BarsCard title="Все запросы" data={historyRequests} note="Включая ботов, картинки, шрифты и редиректы" />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Card } from '../ui/Card';
import { ToggleGroup } from '../ui/ToggleGroup';
import { cn } from '../../lib/cn';
import { searchTotals, type CumulativeDay, type MetricsSite, type MetricsSource, type SearchDay } from '../../lib/searchMetrics';

// 2026-10-28 (28c): общий кумулятив «поиск + ИИ» по всем сайтам и блок
// GSC + Bing + заходы «Поиск»/«ИИ» по выбранному сайту. Источник —
// api/search-metrics.js (живой сбор, запасной вариант — снимок
// data/search-metrics.json), только сотрудникам. Нет снимка — блоки
// просто не рисуются, страница не падает.

const SERIES = [
  { key: 'clicks', label: 'Клики из поиска (GSC + Bing)', color: '#2563eb' },
  { key: 'search', label: 'Заходы: Поиск', color: '#059669' },
  { key: 'ai', label: 'Заходы: ИИ', color: '#9333ea' },
] as const;
const number = (n: number) => n.toLocaleString('ru-RU');
const date = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function SearchAiGrowthChart({ rows }: { rows: CumulativeDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const index = Math.min(active ?? rows.length - 1, rows.length - 1);
  const selected = rows[index];
  const x = (i: number) => 60 + (i / Math.max(1, rows.length - 1)) * 900;
  const y = (v: number) => 250 - (v / max) * 220;
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Рост поиска и ИИ по всем сайтам · нарастающий итог</h2>
        <p className="mt-1 text-xs text-ink-muted">
          GamblingList, Redevelopment, MallList и OfficeList — вся накопленная история, без ботов и ИИ-агентов.
        </p>
      </div>
      <svg
        viewBox="0 0 1000 290"
        className="w-full"
        role="img"
        aria-label="Нарастающий итог: клики из поиска, заходы из поиска и ИИ"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = Math.max(0, Math.min(1, (((e.clientX - r.left) / r.width) * 1000 - 60) / 900));
          setActive(Math.round(t * (rows.length - 1)));
        }}
        onPointerLeave={() => setActive(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1="60" x2="960" y1={y(v * max)} y2={y(v * max)} stroke="currentColor" className="text-border" />
            <text x="52" y={y(v * max) + 4} textAnchor="end" fontSize="12" fill="currentColor" className="text-ink-muted">
              {number(Math.round(v * max))}
            </text>
          </g>
        ))}
        {SERIES.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            points={rows.map((r, i) => `${x(i)},${y(r[s.key])}`).join(' ')}
          />
        ))}
        {SERIES.map((s) => (
          <circle key={s.key} cx={x(index)} cy={y(selected[s.key])} r="4" fill={s.color} />
        ))}
        <text x="60" y="280" fontSize="12" fill="currentColor" className="text-ink-muted">{date(rows[0].day)}</text>
        <text x="960" y="280" textAnchor="end" fontSize="12" fill="currentColor" className="text-ink-muted">
          {date(rows[rows.length - 1].day)}
        </text>
      </svg>
      <p className="text-xs text-ink-muted">На {date(selected.day)}</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {SERIES.map((s) => (
          <div key={s.key}>
            <dt className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="mt-1 text-xl font-semibold text-ink">{number(selected[s.key])}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted">
        Клики — Google Search Console и Bing Webmaster Tools. Заходы «Поиск» и «ИИ» — Vercel Web Analytics, только
        переходы из поисковиков и ИИ-сервисов; прямые заходы не считаются.
      </p>
    </Card>
  );
}

function SearchSource({ title, source, rows, google }: { title: string; source: MetricsSource<SearchDay>; rows: SearchDay[]; google?: boolean }) {
  const total = searchTotals(rows);
  const hasData = rows.length > 0;
  const tiles: [string, string][] = [
    ['Клики', hasData ? number(total.clicks) : '—'],
    ['Показы', hasData ? number(total.impressions) : '—'],
    ...(google
      ? ([
          ['CTR', total.ctr === null ? '—' : `${(total.ctr * 100).toFixed(2)}%`],
          ['Позиция', total.position?.toFixed(1) ?? '—'],
        ] as [string, string][])
      : []),
  ];
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <dl className={cn('grid gap-3', google ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {tiles.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-1 text-xl font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {!hasData && <p className="text-xs text-ink-muted">За выбранный период строк нет.</p>}
      {source.daily.length > 0 && (
        <p className="text-xs text-ink-muted">Последняя дата: {date(source.daily[source.daily.length - 1].day)}</p>
      )}
    </Card>
  );
}

const PERIODS = ['7 дней', '30 дней', '90 дней', 'Вся история'];

export function SiteSearchAiPanel({ site, generatedAt }: { site: MetricsSite; generatedAt: string }) {
  const [period, setPeriod] = useState('30 дней');
  const end = generatedAt.slice(0, 10);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - (Number.parseInt(period, 10) || 1) + 1);
  const start = period === 'Вся история' ? '0000-01-01' : startDate.toISOString().slice(0, 10);
  const inPeriod = (r: { day: string }) => r.day >= start && r.day <= end;
  const gsc = site.gsc.daily.filter(inPeriod);
  const bing = site.bing.daily.filter(inPeriod);
  const traffic = site.analytics.daily.filter(inPeriod);
  const dates = [...new Set([...gsc, ...bing, ...traffic].map((r) => r.day))].sort().reverse();
  const gscDays = new Map(gsc.map((r) => [r.day, r]));
  const bingDays = new Map(bing.map((r) => [r.day, r]));
  const trafficDays = new Map(traffic.map((r) => [r.day, r]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ToggleGroup label="Поиск и ИИ · период" options={PERIODS} value={period} onChange={setPeriod} />
        <p className="text-xs text-ink-muted">
          {site.domain} · {period === 'Вся история' ? 'вся история' : `${date(start)} — ${date(end)}`} · обновлено{' '}
          {new Date(generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SearchSource title="Google Search Console" source={site.gsc} rows={gsc} google />
        <SearchSource title="Bing Webmaster Tools" source={site.bing} rows={bing} />
      </div>
      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">Заходы из поиска и ИИ</h3>
        <dl className="grid grid-cols-2 gap-4">
          {(['search', 'ai'] as const).map((key) => (
            <div key={key}>
              <dt className="text-sm text-ink-muted">{key === 'search' ? 'Поиск' : 'ИИ'}</dt>
              <dd className="mt-1 text-2xl font-semibold text-ink">
                {traffic.length ? number(traffic.reduce((n, r) => n + r[key], 0)) : '—'}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-muted">
          Vercel Web Analytics: только переходы из поисковиков (Google, Яндекс, Bing, DuckDuckGo…) и ИИ-сервисов
          (ChatGPT, Perplexity, Gemini, Copilot, Claude, Grok…). Прямые заходы и прочие сайты не показываются.
          Посетители считаются за сутки; боты и ИИ-агенты (браузеры-роботы, headless, рой без реферера, серверный
          Linux) отсечены.
          {traffic.some((r) => (r.bots ?? 0) > 0) && ` Исключено ботов: ${number(traffic.reduce((n, r) => n + (r.bots ?? 0), 0))}.`}
        </p>
      </Card>
      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">Поиск и ИИ по дням</h3>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full whitespace-nowrap text-right text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-ink-muted">
              <tr>
                {['Дата', 'GSC клики', 'GSC показы', 'CTR', 'Позиция', 'Bing клики', 'Bing показы', 'Поиск', 'ИИ'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((day) => {
                const g = gscDays.get(day);
                const b = bingDays.get(day);
                const t = trafficDays.get(day);
                return (
                  <tr key={day} className="border-t border-border text-ink">
                    {[
                      date(day),
                      g ? number(g.clicks) : '—',
                      g ? number(g.impressions) : '—',
                      g?.ctr === undefined ? '—' : `${(g.ctr * 100).toFixed(2)}%`,
                      g?.position?.toFixed(1) ?? '—',
                      b ? number(b.clicks) : '—',
                      b ? number(b.impressions) : '—',
                      t ? number(t.search) : '—',
                      t ? number(t.ai) : '—',
                    ].map((value, i) => (
                      <td key={i} className="px-3 py-2">{value}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!dates.length && <p className="py-3 text-sm text-ink-muted">Строк за выбранный период нет.</p>}
        </div>
        <p className="text-xs text-ink-muted">«—» — строки нет в источнике, 0 — полученный ноль. CTR = клики / показы, позиция взвешена по показам.</p>
      </Card>
    </div>
  );
}

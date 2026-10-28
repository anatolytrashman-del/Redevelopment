import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { cn } from '../lib/cn';
import { cumulativeMetrics, fetchSearchMetrics, searchTotals, visibleMetricsSites,
  type CumulativeDay, type MetricsSnapshot, type MetricsSource, type SearchDay } from '../lib/searchMetrics';

const SERIES = [
  { key: 'clicks', label: 'Поисковые клики (GSC + Bing)', color: '#2563eb' },
  { key: 'search', label: 'Поиск', color: '#059669' },
  { key: 'ai', label: 'ИИ', color: '#9333ea' },
  { key: 'wg', label: 'WG (история)', color: '#64748b' },
] as const;
const number = (n: number) => n.toLocaleString('ru-RU');
const date = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const status = (s: string) => ({ ok: 'Данные получены', stale: 'Последний успешный снимок', unavailable: 'Источник недоступен', 'not-configured': 'Источник не подключён', 'no-separate-source': 'Отдельный источник отсутствует' }[s] ?? s);

function CumulativeChart({ rows }: { rows: CumulativeDay[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const [active, setActive] = useState<number | null>(null);
  const selected = rows[Math.min(active ?? rows.length - 1, rows.length - 1)];
  const x = (i: number) => 60 + i / Math.max(1, rows.length - 1) * 900;
  const y = (v: number) => 250 - v / max * 220;
  return <Card className="flex flex-col gap-4">
    <div>
      <h2 className="text-base font-semibold text-ink">Рост по всем сайтам · нарастающий итог</h2>
      <p className="mt-1 text-xs text-ink-muted">Вся доступная история. WG включён в поисковые клики; серая линия показывает его вклад отдельно.</p>
    </div>
    {rows.length ? <>
      <svg viewBox="0 0 1000 290" className="w-full" role="img" aria-label="Кумулятив: поисковые клики, Поиск, ИИ и WG (история)"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setActive(Math.round(Math.max(0, Math.min(1, ((e.clientX - r.left) / r.width * 1000 - 60) / 900)) * (rows.length - 1))); }}
        onPointerLeave={() => setActive(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}>
          <line x1="60" x2="960" y1={y(v * max)} y2={y(v * max)} stroke="currentColor" className="text-border" />
          <text x="52" y={y(v * max) + 4} textAnchor="end" fontSize="12" fill="currentColor" className="text-ink-muted">{number(Math.round(v * max))}</text>
        </g>)}
        {SERIES.map((s) => <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.key === 'wg' ? '6 4' : undefined}
          points={rows.map((r, i) => `${x(i)},${y(r[s.key])}`).join(' ')} />)}
        {selected && SERIES.map((s) => <circle key={s.key} cx={x(Math.min(active ?? rows.length - 1, rows.length - 1))} cy={y(selected[s.key])} r="4" fill={s.color} />)}
        <text x="60" y="280" fontSize="12" fill="currentColor" className="text-ink-muted">{date(rows[0].day)}</text>
        <text x="960" y="280" textAnchor="end" fontSize="12" fill="currentColor" className="text-ink-muted">{date(rows[rows.length - 1].day)}</text>
      </svg>
      <p className="text-xs text-ink-muted">{selected && date(selected.day)}</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{SERIES.map((s) => <div key={s.key}>
        <dt className="flex items-center gap-2 text-xs text-ink-muted"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</dt>
        <dd className="mt-1 text-xl font-semibold text-ink">{number(selected?.[s.key] ?? 0)}</dd>
      </div>)}</dl>
    </> : <p className="text-sm text-ink-muted">История ещё не собрана.</p>}
    <p className="text-xs text-ink-muted">Клики и заходы — отдельные показатели, они не складываются между собой. Поиск/ИИ: посетители за сутки в Vercel Web Analytics, не сессии. GSC — календарь Google (Pacific), Bing — даты Bing, трафик — UTC.</p>
  </Card>;
}

function SearchSource({ title, source, rows, google }: { title: string; source: MetricsSource<SearchDay>; rows: SearchDay[]; google?: boolean }) {
  const total = searchTotals(rows);
  const hasData = rows.length > 0;
  return <Card className="flex flex-col gap-3">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold text-ink">{title}</h3><span className="text-xs text-ink-muted">{status(source.status)}</span></div>
    <dl className={cn('grid gap-3', google ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
      {[['Клики', hasData ? number(total.clicks) : '—'], ['Показы', hasData ? number(total.impressions) : '—'],
        ...(google ? [['CTR', total.ctr === null ? '—' : `${(total.ctr * 100).toFixed(2)}%`], ['Позиция', total.position?.toFixed(1) ?? '—']] : [])].map(([label, value]) => <div key={label}>
        <dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 text-xl font-semibold text-ink">{value}</dd>
      </div>)}
    </dl>
    {!hasData && <p className="text-xs text-ink-muted">За выбранный период источник не вернул строк.</p>}
    {source.daily.length > 0 && <p className="text-xs text-ink-muted">Последняя дата в источнике: {date(source.daily[source.daily.length - 1].day)}</p>}
    {source.updatedAt && <p className="text-xs text-ink-muted">Собрано: {new Date(source.updatedAt).toLocaleString('ru-RU')}</p>}
  </Card>;
}

export function SiteMetrics() {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [selected, setSelected] = useState('gamblinglist');
  const [period, setPeriod] = useState('30 дней');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try { setSnapshot(await fetchSearchMetrics()); setError(''); }
    catch { setError('Не удалось прочитать снимок показателей.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 300_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const sites = useMemo(() => visibleMetricsSites(snapshot?.sites ?? []), [snapshot]);
  const cumulative = useMemo(() => cumulativeMetrics(snapshot?.sites ?? []), [snapshot]);
  const site = sites.find((s) => s.id === selected) ?? sites[0];
  // Periods anchored to the snapshot date, so an archived snapshot stays inspectable.
  const end = snapshot?.generatedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - (Number.parseInt(period) || 1) + 1);
  const start = period === 'Вся история' ? '0000-01-01' : startDate.toISOString().slice(0, 10);
  const inPeriod = (r: { day: string }) => r.day >= start && r.day <= end;
  const gsc = site?.gsc.daily.filter(inPeriod) ?? [];
  const bing = site?.bing.daily.filter(inPeriod) ?? [];
  const traffic = site?.analytics.daily.filter(inPeriod) ?? [];
  const dates = [...new Set([...gsc, ...bing, ...traffic].map((r) => r.day))].sort().reverse();
  const gscDays = new Map(gsc.map((r) => [r.day, r]));
  const bingDays = new Map(bing.map((r) => [r.day, r]));
  const trafficDays = new Map(traffic.map((r) => [r.day, r]));
  return <>
    <PageHeader title="Показатели" />
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">{snapshot ? `Снимок: ${new Date(snapshot.generatedAt).toLocaleString('ru-RU')}` : 'Загрузка показателей…'}</p>
        <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"><RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />Перечитать снимок</button>
      </div>
      {error && <p className="text-sm text-ink-muted" role="status">{error}</p>}
      {snapshot && <>
        <CumulativeChart rows={cumulative} />
        <ToggleGroup label="Сайт" options={sites.map((s) => s.label)} value={site?.label ?? ''} onChange={(label) => setSelected(sites.find((s) => s.label === label)!.id)} />
        <ToggleGroup label="Период сайта" options={['7 дней', '30 дней', '90 дней', 'Вся история']} value={period} onChange={setPeriod} />
        {site && <>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold text-ink">{site.label} · {site.domain}</h2><p className="text-xs text-ink-muted">{period === 'Вся история' ? 'Вся доступная история' : `${date(start)} — ${date(end)}`}</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SearchSource title="Google Search Console" source={site.gsc} rows={gsc} google />
            <SearchSource title="Bing Webmaster Tools" source={site.bing} rows={bing} />
          </div>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold text-ink">Заходы из поиска и ИИ · Vercel Web Analytics</h3><span className="text-xs text-ink-muted">{status(site.analytics.status)}</span></div>
            <dl className="grid grid-cols-2 gap-4">{(['search', 'ai'] as const).map((key) => <div key={key}>
              <dt className="text-sm text-ink-muted">{key === 'search' ? 'Поиск' : 'ИИ'}</dt>
              <dd className="mt-1 text-2xl font-semibold text-ink">{traffic.length ? number(traffic.reduce((n, r) => n + r[key], 0)) : '—'}</dd>
            </div>)}</dl>
            <p className="text-xs text-ink-muted">Только поисковые и ИИ-рефереры. Посетители считаются отдельно за каждые сутки; сумма не равна уникальным людям за период.</p>
            {site.analytics.utmStatus === 'unavailable-plan' && <p className="text-xs text-ink-muted">ИИ определён по рефереру. UTM-фильтр недоступен в текущем тарифе Vercel; переходы только с utm_source без ИИ-реферера не учтены.</p>}
            {site.id === 'gamblinglist' && <p className="text-xs text-ink-muted">Трафик Vercel-проекта gamblinglist общий с whitegambling.pro; повторно как WG он не добавляется.</p>}
            {site.id === 'platform' && <p className="text-xs text-ink-muted">Vercel-проект redevelopment общий с lobsters.pro и osnova.redevelopment.pro; API не предоставляет фильтр по домену сайта.</p>}
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink">По дням</h3>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full whitespace-nowrap text-right text-sm">
                <thead className="sticky top-0 bg-surface text-xs text-ink-muted"><tr>{['Дата', 'GSC клики', 'GSC показы', 'CTR', 'Позиция', 'Bing клики', 'Bing показы', 'Поиск', 'ИИ'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>{dates.map((day) => { const g = gscDays.get(day); const b = bingDays.get(day); const t = trafficDays.get(day);
                  return <tr key={day} className="border-t border-border text-ink">
                    {[date(day), g ? number(g.clicks) : '—', g ? number(g.impressions) : '—', g?.ctr === undefined ? '—' : `${(g.ctr * 100).toFixed(2)}%`, g?.position?.toFixed(1) ?? '—', b ? number(b.clicks) : '—', b ? number(b.impressions) : '—', t ? number(t.search) : '—', t ? number(t.ai) : '—'].map((value, i) => <td key={i} className="px-3 py-2">{value}</td>)}
                  </tr>;
                })}</tbody>
              </table>
              {!dates.length && <p className="py-3 text-sm text-ink-muted">Строк за выбранный период нет.</p>}
            </div>
            <p className="text-xs text-ink-muted">«—» — строки нет в источнике; 0 — полученный ноль. GSC: только окончательные данные, CTR = клики / показы, средняя позиция взвешена по показам.</p>
          </Card>
        </>}
        <p className="text-xs text-ink-muted">Источники: Search Console API (web, final), Bing GetRankAndTrafficStats и Vercel Web Analytics API (production). Снимок собирается на машине скриптом scripts/collect-search-metrics.py. Главный график включает GSC/Bing whitegambling.pro как «WG (история)».</p>
      </>}
    </div>
  </>;
}

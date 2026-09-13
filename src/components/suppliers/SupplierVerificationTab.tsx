import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Play, Undo2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { ToggleGroup } from '../ui/ToggleGroup';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { logActivity } from '../../lib/activityLogApi';
import { SUPPLY_CATEGORY_NAMES } from '../../data/supplyCategories';
import { updateSupplierSiteSnapshotCategories } from '../../lib/supplierSiteSnapshotsApi';
import { supplierWebsiteHost, type SupplierOffer } from '../../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';

// Вкладка "Верификация" на странице Закупки — по аналогии с верификацией
// объявлений для Светланы (MarketOffersReview.tsx): карточка с данными +
// отдельное окно с сайтом источника. Встроить сайт поставщика в iframe так
// же нельзя (те же X-Frame-Options/CSP, см. комментарий у openAdWindow в
// MarketOffersReview.tsx) — поэтому тот же приём: позиционированное окно
// (window.open, одно и то же имя — повторный клик переиспользует его, не
// плодит вкладки), а не разбитая на две половины страница.
//
// Единица верификации — СНИМОК САЙТА (supplier_site_snapshots, одна строка
// на домен), не карточка предложения (supplier_research_offers) и не
// категория: у одного поставщика один сайт и один набор категорий на нём
// (categories), а карточек-предложений с этим же сайтом может быть
// несколько (компания заведена под разные категории закупки). Владелец,
// 2026-09-13: "если поставщика апрувнули в одной категории, значит он
// автоматически апрувнулся и во всех" — ровно это тут и происходит
// структурно: "Одобрить" сохраняет и подтверждает ВЕСЬ набор категорий
// снимка одним действием, поэтому очередь и показывает уникальное число
// поставщиков — по числу СНИМКОВ (доменов), не карточек-предложений.
function openSupplierSiteWindow(url: string) {
  const width = Math.round(window.screen.availWidth / 2);
  const height = window.screen.availHeight;
  const left = window.screen.availWidth - width;
  window.open(url, 'supplier-site-verification', `width=${width},height=${height},left=${left},top=0`);
}

const FILTER_OPTIONS = ['Не проверено', 'Проверено', 'Все'] as const;
type Filter = (typeof FILTER_OPTIONS)[number];

function CategoryChecklist({ selected, onToggle }: { selected: string[]; onToggle: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = q ? SUPPLY_CATEGORY_NAMES.filter((n) => n.toLowerCase().includes(q)) : SUPPLY_CATEGORY_NAMES;
  return (
    <div className="flex flex-col gap-2">
      <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Фильтр по списку категорий…" />
      <div className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-0.5 overflow-y-auto rounded-control border border-border p-2 sm:grid-cols-2">
        {visible.map((name) => (
          <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => onToggle(name)}
              className="h-4 w-4 shrink-0 rounded border-border"
            />
            <span className="text-ink">{name}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="col-span-full py-4 text-center text-xs text-ink-faint">Ничего не найдено.</p>}
      </div>
    </div>
  );
}

function SiteLink({ snapshot }: { snapshot: SupplierSiteSnapshot }) {
  return (
    <a
      href={snapshot.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openSupplierSiteWindow(snapshot.websiteUrl);
      }}
      className="flex min-w-0 items-center gap-1 font-medium text-ink hover:underline"
    >
      <span className="truncate">{snapshot.host}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
    </a>
  );
}

export function SupplierVerificationTab({
  snapshots,
  offers,
  onSnapshotUpdated,
}: {
  snapshots: SupplierSiteSnapshot[];
  offers: SupplierOffer[];
  onSnapshotUpdated: (snapshot: SupplierSiteSnapshot) => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [skippedHosts, setSkippedHosts] = useState<Set<string>>(new Set());
  const [editingHost, setEditingHost] = useState<string | null>(null);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('Не проверено');

  // Названия компаний по домену — только для отображения на карточке
  // (человеку нужно видеть, кого он проверяет), сам поиск поставщика в
  // категории по-прежнему решает SupplierCatalog по snapshot.categories.
  const namesByHost = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const o of offers) {
      const host = supplierWebsiteHost(o.websiteUrl);
      if (!host) continue;
      if (!map.has(host)) map.set(host, new Set());
      map.get(host)!.add(o.name);
    }
    return map;
  }, [offers]);

  // Только обработанные снимки — по остальным (pending/processing/error)
  // ещё нечего сверять, они появятся здесь сами, как только Edge Function
  // их обойдёт и классификатор расставит категории.
  const readySnapshots = useMemo(() => snapshots.filter((s) => s.status === 'done'), [snapshots]);

  const pending = useMemo(() => readySnapshots.filter((s) => !s.categoriesVerified), [readySnapshots]);

  const verifyTarget = useMemo(() => {
    if (!verifying) return null;
    return pending.find((s) => !skippedHosts.has(s.host)) ?? null;
  }, [verifying, pending, skippedHosts]);

  const verifyRemaining = pending.filter((s) => !skippedHosts.has(s.host)).length;
  const verifySkippedCount = skippedHosts.size;

  const editingSnapshot = readySnapshots.find((s) => s.host === editingHost) ?? null;

  function openCard(snapshot: SupplierSiteSnapshot) {
    setEditingHost(snapshot.host);
    setDraftCategories(snapshot.categories);
  }

  function closeCard() {
    // Как и в MarketOffersReview: закрытие карточки — без побочных эффектов,
    // не пропускает и не двигает очередь. Явно перейти к следующей можно
    // только кнопкой "Пропустить" в шапке.
    setEditingHost(null);
  }

  function startVerification() {
    setSkippedHosts(new Set());
    lastAutoOpenedHostRef.current = null;
    setVerifying(true);
  }

  function stopVerification() {
    setVerifying(false);
    setEditingHost(null);
  }

  function skipCurrent() {
    if (verifyTarget) setSkippedHosts((prev) => new Set(prev).add(verifyTarget.host));
  }

  function toggleCategory(name: string) {
    setDraftCategories((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  async function handleApprove() {
    if (!editingSnapshot || saving) return;
    setSaving(true);
    try {
      await updateSupplierSiteSnapshotCategories(editingSnapshot.host, draftCategories, true);
      onSnapshotUpdated({
        ...editingSnapshot,
        categories: draftCategories,
        categoriesVerified: true,
        categoriesVerifiedAt: new Date().toISOString(),
      });
      logActivity('supplier_site_categories_verified');
      setEditingHost(null);
    } catch {
      setError('Не удалось сохранить — попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnverify() {
    if (!editingSnapshot || saving) return;
    setSaving(true);
    try {
      await updateSupplierSiteSnapshotCategories(editingSnapshot.host, editingSnapshot.categories, false);
      onSnapshotUpdated({ ...editingSnapshot, categoriesVerified: false, categoriesVerifiedAt: null });
      setEditingHost(null);
    } catch {
      setError('Не удалось сохранить — попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  // Минимум кликов во время верификации — как только цель меняется, сама
  // открывается и карточка, и позиционированное окно с сайтом (см.
  // комментарий у аналогичного эффекта в MarketOffersReview.tsx). Гвард по
  // РЕФУ хоста, не по editingHost — иначе закрытие карточки без смены цели
  // тут же открывало бы её и окно заново на каждый ре-рендер (тот самый баг,
  // словивший бан по IP на Kufar, см. журнал/комментарий в MarketOffersReview.tsx).
  const lastAutoOpenedHostRef = useRef<string | null>(null);
  useEffect(() => {
    if (!verifying || !verifyTarget) return;
    if (lastAutoOpenedHostRef.current === verifyTarget.host) return;
    lastAutoOpenedHostRef.current = verifyTarget.host;
    openCard(verifyTarget);
    openSupplierSiteWindow(verifyTarget.websiteUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifying, verifyTarget]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return readySnapshots
      .filter((s) => {
        if (filter === 'Не проверено' && s.categoriesVerified) return false;
        if (filter === 'Проверено' && !s.categoriesVerified) return false;
        if (!query) return true;
        const names = [...(namesByHost.get(s.host) ?? [])].join(' ').toLowerCase();
        return s.host.toLowerCase().includes(query) || names.includes(query);
      })
      .sort((a, b) => a.host.localeCompare(b.host));
  }, [readySnapshots, filter, search, namesByHost]);

  const card = editingSnapshot && (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <SiteLink snapshot={editingSnapshot} />
          {editingSnapshot.pageTitle && <span className="truncate text-xs text-ink-faint">{editingSnapshot.pageTitle}</span>}
          {namesByHost.has(editingSnapshot.host) && (
            <span className="text-sm text-ink-muted">{[...namesByHost.get(editingSnapshot.host)!].join(', ')}</span>
          )}
        </div>
        {editingSnapshot.categoriesVerified && (
          <Badge tone="success">
            Проверено{editingSnapshot.categoriesVerifiedAt ? ` ${new Date(editingSnapshot.categoriesVerifiedAt).toLocaleDateString('ru-RU')}` : ''}
          </Badge>
        )}
      </div>
      {editingSnapshot.categoriesNote && (
        <p className="rounded-control bg-info-bg/60 p-2 text-xs text-info-text">
          Заметка классификатора: {editingSnapshot.categoriesNote}
        </p>
      )}
      <CategoryChecklist selected={draftCategories} onToggle={toggleCategory} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {verifying && (
            <button type="button" onClick={stopVerification} className="text-xs text-ink-faint underline hover:text-ink">
              Завершить проверку
            </button>
          )}
          {editingSnapshot.categoriesVerified && (
            <button
              type="button"
              onClick={handleUnverify}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-ink-faint underline hover:text-ink"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Снять отметку
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={closeCard}>
            Отмена
          </Button>
          <Button type="button" onClick={handleApprove} disabled={saving}>
            {saving ? 'Сохраняем…' : 'Одобрить'}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Обработано сайтов {readySnapshots.length} · проверено {readySnapshots.length - pending.length} из{' '}
          {readySnapshots.length}
        </p>
        {!verifying && (
          <Button icon={<Play className="h-4 w-4" />} disabled={pending.length === 0} onClick={startVerification}>
            Начать верификацию
          </Button>
        )}
      </div>

      {verifying ? (
        <div className="flex flex-col gap-3">
          <div className={cn('flex flex-wrap items-center justify-between gap-3 p-4', glassCardClass)} style={glassCardShadow}>
            <p className="text-sm font-semibold text-ink">Верификация — осталось {verifyRemaining}</p>
            <div className="flex gap-2">
              {verifyTarget && (
                <Button variant="secondary" onClick={skipCurrent}>
                  Пропустить
                </Button>
              )}
              <Button variant="ghost" onClick={stopVerification}>
                Завершить проверку
              </Button>
            </div>
          </div>

          {verifyTarget && card ? (
            <div className={cn('flex flex-col gap-3 p-4', glassCardClass)} style={glassCardShadow}>
              {card}
            </div>
          ) : (
            <div className={cn('flex flex-col items-center gap-2 p-8 text-center', glassCardClass)} style={glassCardShadow}>
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm font-semibold text-ink">Всё проверено!</p>
              {verifySkippedCount > 0 && (
                <p className="text-xs text-ink-faint">Пропущено {verifySkippedCount} — найдёте их в списке ниже.</p>
              )}
              <Button className="mt-2" onClick={stopVerification}>
                Вернуться к списку
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={cn('flex flex-wrap gap-3 p-4', glassCardClass)} style={glassCardShadow}>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по домену или названию…"
              wrapperClassName="w-full max-w-xs"
            />
            <ToggleGroup options={[...FILTER_OPTIONS]} value={filter} onChange={(v) => setFilter(v as Filter)} />
          </div>

          <div className="flex flex-col gap-2">
            {filtered.map((s) => (
              <div key={s.host} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-4 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <SiteLink snapshot={s} />
                  {namesByHost.has(s.host) && (
                    <span className="truncate text-xs text-ink-faint">{[...namesByHost.get(s.host)!].join(', ')}</span>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {s.categories.slice(0, 4).map((c) => (
                      <span key={c} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted">{c}</span>
                    ))}
                    {s.categories.length > 4 && <span className="text-xs text-ink-faint">+{s.categories.length - 4}</span>}
                    {s.categories.length === 0 && <span className="text-xs text-ink-faint">категорий не найдено</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.categoriesVerified ? <Badge tone="success">Проверено</Badge> : <Badge tone="warning">Не проверено</Badge>}
                  <Button type="button" variant="secondary" onClick={() => openCard(s)}>
                    Открыть карточку
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">Ничего не найдено.</p>}
          </div>
        </>
      )}

      {!verifying && (
        <Modal open={!!editingSnapshot} onClose={closeCard} title="Верификация поставщика">
          {card}
        </Modal>
      )}
    </div>
  );
}

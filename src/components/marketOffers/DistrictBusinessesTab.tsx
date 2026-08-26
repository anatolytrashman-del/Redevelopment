import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { SearchInput } from '../ui/SearchInput';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { DISTRICT_QUARTERS, getDeliveredHouses } from '../../data/districtQuarters';
import type { DeliveredHouse } from '../../data/districtQuarters';
import type { DistrictBusinessPoint } from '../../data/districtBusinessPoints';
import {
  fetchDistrictBusinessPoints,
  parseBusinessListText,
  diffHouseBusinesses,
  applyHouseDiff,
  insertDistrictBusinessPoint,
  deleteDistrictBusinessPoint,
} from '../../lib/districtBusinessPointsApi';
import type { HouseDiff } from '../../lib/districtBusinessPointsApi';
import { parseWebarchiveOrgList, looksLikeBplist } from '../../lib/webarchiveOrgParser';

// Вкладка "Дома" на /admin/market-offers — список организаций по каждому
// сданному дому Минск Мира. Заменяет ручную пересылку списков от Светланы
// (см. журнал CLAUDE.md, 2026-08-26): она выгружает список организаций
// дома с Яндекс.Карт (панель "Организации внутри") в текстовый файл и
// загружает его сюда — дальше система сама разбирает файл и обновляет
// список дома: новые организации добавляются, пропавшие из выгрузки
// считаются закрывшимися и удаляются. Автоматический сбор через
// scripts/sync-district-business-points.mjs сейчас не работает (IP с
// GitHub Actions банится Яндексом), это и есть рабочий путь до тех пор.

function houseKey(street: string, house: string): string {
  return `${street.trim().toLowerCase()}|${house.trim().toLowerCase()}`;
}

function titleCase(street: string): string {
  return street.replace(/(^|[\s-])([а-яё])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

const QUARTER_LABELS: Record<string, string> = Object.fromEntries(DISTRICT_QUARTERS.map((q) => [q.id, q.label]));
const QUARTER_ORDER: Record<string, number> = Object.fromEntries(
  DISTRICT_QUARTERS.map((q) => [q.id, Math.min(...(q.numbers.length ? q.numbers : [999]))]),
);

export function DistrictBusinessesTab() {
  const [points, setPoints] = useState<DistrictBusinessPoint[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openHouse, setOpenHouse] = useState<DeliveredHouse | null>(null);

  useEffect(() => {
    fetchDistrictBusinessPoints()
      .then(setPoints)
      .catch(() => setError('Не удалось загрузить список организаций.'));
  }, []);

  const pointsByHouse = useMemo(() => {
    const map = new Map<string, DistrictBusinessPoint[]>();
    for (const p of points ?? []) {
      const key = houseKey(p.street, p.house);
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [points]);

  const houses = useMemo(() => getDeliveredHouses(), []);

  const filteredHouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return houses;
    return houses.filter((h) => `${h.street} ${h.house}`.toLowerCase().includes(q));
  }, [houses, search]);

  const housesByQuarter = useMemo(() => {
    const map = new Map<string, DeliveredHouse[]>();
    for (const h of filteredHouses) {
      const arr = map.get(h.quarterId) ?? [];
      arr.push(h);
      map.set(h.quarterId, arr);
    }
    const entries = [...map.entries()];
    entries.sort((a, b) => (QUARTER_ORDER[a[0]] ?? 999) - (QUARTER_ORDER[b[0]] ?? 999));
    for (const [, hs] of entries) {
      hs.sort((a, b) => titleCase(a.street).localeCompare(titleCase(b.street)) || Number(a.house) - Number(b.house));
    }
    return entries;
  }, [filteredHouses]);

  function refreshPointsLocal(update: (prev: DistrictBusinessPoint[]) => DistrictBusinessPoint[]) {
    setPoints((prev) => (prev ? update(prev) : prev));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-faint">
        Список организаций по каждому сданному дому — Светлана выгружает список с Яндекс.Карт (панель «Организации
        внутри» карточки дома) в текстовый файл и загружает его в карточке дома ниже. Система сама сравнивает с уже
        сохранённым списком: новые организации добавляет, пропавшие из выгрузки — считает закрывшимися и убирает.
      </p>

      <SearchInput
        placeholder="Поиск по улице или номеру дома..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {points === null && !error && (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {points !== null && (
        <div className="flex flex-col gap-4">
          {housesByQuarter.map(([quarterId, hs]) => (
            <div key={quarterId} className={cn('flex flex-col divide-y divide-border', glassCardClass)} style={glassCardShadow}>
              <div className="flex items-center gap-2 px-4 py-3">
                <Building2 className="h-4 w-4 shrink-0 text-ink-faint" />
                <h3 className="text-sm font-bold text-ink">{QUARTER_LABELS[quarterId] ?? quarterId}</h3>
                <span className="text-xs text-ink-faint">{hs.length} домов</span>
              </div>
              {hs.map((h) => {
                const list = pointsByHouse.get(houseKey(h.street, h.house)) ?? [];
                return (
                  <button
                    key={houseKey(h.street, h.house)}
                    type="button"
                    onClick={() => setOpenHouse(h)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                  >
                    <span className="text-ink">
                      {titleCase(h.street)}, {h.house}
                    </span>
                    <span className={cn('shrink-0 text-xs font-semibold', list.length > 0 ? 'text-ink-muted' : 'text-ink-faint')}>
                      {list.length > 0 ? `${list.length} организаций` : 'ещё не собрано'}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {openHouse && (
        <HouseModal
          house={openHouse}
          current={pointsByHouse.get(houseKey(openHouse.street, openHouse.house)) ?? []}
          onClose={() => setOpenHouse(null)}
          onAdded={(point) => refreshPointsLocal((prev) => [...prev, point])}
          onRemoved={(id) => refreshPointsLocal((prev) => prev.filter((p) => p.id !== id))}
          onDiffApplied={(removedIds, added) =>
            refreshPointsLocal((prev) => [...prev.filter((p) => !removedIds.includes(p.id)), ...added])
          }
        />
      )}
    </div>
  );
}

function HouseModal({
  house,
  current,
  onClose,
  onAdded,
  onRemoved,
  onDiffApplied,
}: {
  house: DeliveredHouse;
  current: DistrictBusinessPoint[];
  onClose: () => void;
  onAdded: (point: DistrictBusinessPoint) => void;
  onRemoved: (id: string) => void;
  onDiffApplied: (removedIds: string[], added: DistrictBusinessPoint[]) => void;
}) {
  const [addTitle, setAddTitle] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<HouseDiff | null>(null);
  // Названия из toAdd, которые человек снял галочкой перед применением —
  // владелец: "у меня в выгрузке два типа мест — полноценный бизнес... и
  // точки самих жителей об их услугах" (пример — "Seo", "Механизированная
  // шпаклевка", ни у одной нет блока оценок на Яндекс.Картах). Число оценок
  // само по себе не идеальный сигнал (у реальной сети ПВЗ Ozon в этой же
  // точке тоже 0), поэтому не исключаем автоматически — только подсвечиваем
  // "нет оценок" и даём снять галочку вручную.
  const [excludedTitles, setExcludedTitles] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [fileError, setFileError] = useState('');

  async function handleFile(file: File) {
    setFileError('');
    setPendingDiff(null);
    setExcludedTitles(new Set());
    try {
      const buffer = await file.arrayBuffer();
      const parsed = looksLikeBplist(buffer) ? parseWebarchiveOrgList(buffer) : parseBusinessListText(new TextDecoder('utf-8').decode(buffer));
      if (parsed.length === 0) {
        setFileError('Не нашёл в файле ни одной организации — проверьте, что сохранили страницу целиком (со списком организаций).');
        return;
      }
      setPendingDiff(diffHouseBusinesses(current, parsed));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Не удалось разобрать файл.');
    }
  }

  async function confirmDiff() {
    if (!pendingDiff) return;
    const toAdd = pendingDiff.toAdd.filter((e) => !excludedTitles.has(e.title));
    const diffToApply: HouseDiff = { ...pendingDiff, toAdd };
    setApplying(true);
    try {
      await applyHouseDiff(house, diffToApply);
      onDiffApplied(
        pendingDiff.toRemove.map((r) => r.id),
        toAdd.map((entry, i) => ({
          id: `pending-${i}-${entry.title}`,
          externalId: null,
          title: entry.title,
          rawCategory: entry.rawCategory,
          address: null,
          street: house.street,
          house: house.house,
          quarterId: house.quarterId,
          lat: null,
          lon: null,
          status: null,
          reviewCount: entry.reviewCount,
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })),
      );
      setPendingDiff(null);
    } catch {
      setFileError('Не удалось сохранить изменения — попробуйте ещё раз.');
    } finally {
      setApplying(false);
    }
  }

  async function handleAdd() {
    if (!addTitle.trim()) return;
    setAdding(true);
    try {
      const point = await insertDistrictBusinessPoint({
        title: addTitle.trim(),
        rawCategory: addCategory.trim() || null,
        street: house.street,
        house: house.house,
        quarterId: house.quarterId,
      });
      onAdded(point);
      setAddTitle('');
      setAddCategory('');
    } catch {
      setFileError('Не удалось добавить организацию — попробуйте ещё раз.');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDistrictBusinessPoint(id);
      onRemoved(id);
    } catch {
      setFileError('Не удалось удалить — попробуйте ещё раз.');
    }
  }

  return (
    <Modal open onClose={onClose} title={`${titleCase(house.street)}, ${house.house}`}>
      <div className="flex flex-col gap-4">
        {fileError && <p className="text-sm text-danger">{fileError}</p>}

        {pendingDiff ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              В файле {pendingDiff.toAdd.length + pendingDiff.unchanged.length} организаций. Новых —{' '}
              <span className="font-semibold text-success">{pendingDiff.toAdd.length}</span>, пропало (считаем
              закрывшимися) — <span className="font-semibold text-danger">{pendingDiff.toRemove.length}</span>, без
              изменений — {pendingDiff.unchanged.length}.
            </p>
            {pendingDiff.toAdd.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-control bg-success-bg/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-success">
                  Добавятся — сними галочку у тех, что не похожи на настоящий бизнес (например, услуги жителя со
                  своей квартиры)
                </p>
                {pendingDiff.toAdd.map((e) => {
                  const excluded = excludedTitles.has(e.title);
                  const noReviews = e.reviewCount === null;
                  return (
                    <label key={e.title} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={!excluded}
                        onChange={() =>
                          setExcludedTitles((prev) => {
                            const next = new Set(prev);
                            if (next.has(e.title)) next.delete(e.title);
                            else next.add(e.title);
                            return next;
                          })
                        }
                      />
                      <span className={cn(excluded && 'text-ink-faint line-through')}>
                        {e.title}
                        {e.rawCategory && <span className="text-ink-faint"> — {e.rawCategory}</span>}
                        {noReviews ? (
                          <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-semibold text-warning">
                            нет оценок
                          </span>
                        ) : (
                          <span className="text-ink-faint"> · {e.reviewCount} оценок</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {pendingDiff.toRemove.length > 0 && (
              <div className="flex flex-col gap-1 rounded-control border border-dashed border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Уберутся (не найдены в файле)</p>
                {pendingDiff.toRemove.map((e) => (
                  <p key={e.id} className="text-sm text-ink-muted line-through">
                    {e.title}
                  </p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setPendingDiff(null)} disabled={applying}>
                Отмена
              </Button>
              <Button type="button" onClick={confirmDiff} disabled={applying}>
                {applying
                  ? 'Применяем…'
                  : `Применить (добавится ${pendingDiff.toAdd.length - excludedTitles.size})`}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-border px-4 py-6 text-center hover:border-primary">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-ink">
                <Upload className="h-4 w-4 shrink-0" />
                Загрузить файл выгрузки
              </span>
              <span className="text-xs text-ink-faint">
                Карточка дома на Яндекс.Картах, вкладка «Организации внутри» → Cmd+S → веб-архив (.webarchive)
              </span>
              <input
                type="file"
                accept=".webarchive,.txt,.md,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Сейчас в списке — {current.length}
              </p>
              {current.length === 0 ? (
                <p className="text-sm text-ink-faint">Пока ничего не собрано.</p>
              ) : (
                <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-control border border-border">
                  {current.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-sm text-ink">
                        {p.title}
                        {p.rawCategory && <span className="text-ink-faint"> — {p.rawCategory}</span>}
                        {p.reviewCount === null ? (
                          <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-semibold text-warning">
                            нет оценок
                          </span>
                        ) : (
                          <span className="text-ink-faint"> · {p.reviewCount} оценок</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="shrink-0 text-ink-faint hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Добавить одну вручную</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="Название" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
                <Input placeholder="Категория" value={addCategory} onChange={(e) => setAddCategory(e.target.value)} />
                <Button type="button" variant="secondary" onClick={handleAdd} disabled={!addTitle.trim() || adding}>
                  {adding ? '…' : 'Добавить'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

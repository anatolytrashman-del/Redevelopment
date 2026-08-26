import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Trash2, Upload, Ban, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { SearchInput } from '../ui/SearchInput';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ToggleGroup } from '../ui/ToggleGroup';
import { DISTRICT_QUARTERS, getDeliveredHouses, getNotDeliveredHouses } from '../../data/districtQuarters';
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
import { parseWebarchiveOrgList, parseHtmlSnapshotOrgList, looksLikeBplist } from '../../lib/webarchiveOrgParser';
import type { DistrictHouseFlag } from '../../data/districtHouseFlags';
import {
  fetchDistrictHouseFlags,
  insertDistrictHouseFlag,
  deleteDistrictHouseFlag,
} from '../../lib/districtHouseFlagsApi';

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

const SUB_TABS = ['Дома', 'Несданные'] as const;
type SubTab = (typeof SUB_TABS)[number];

export function DistrictBusinessesTab() {
  const [subTab, setSubTab] = useState<SubTab>('Дома');
  const [points, setPoints] = useState<DistrictBusinessPoint[] | null>(null);
  const [flags, setFlags] = useState<DistrictHouseFlag[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openHouse, setOpenHouse] = useState<DeliveredHouse | null>(null);

  useEffect(() => {
    fetchDistrictBusinessPoints()
      .then(setPoints)
      .catch(() => setError('Не удалось загрузить список организаций.'));
    fetchDistrictHouseFlags()
      .then(setFlags)
      .catch(() => {});
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

  const flagByHouse = useMemo(() => {
    const map = new Map<string, DistrictHouseFlag>();
    for (const f of flags) map.set(houseKey(f.street, f.house), f);
    return map;
  }, [flags]);

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

  // Несданные — две отдельные причины (см. комментарий у getNotDeliveredHouses
  // в districtQuarters.ts): целиком несданные кварталы (структурно, из
  // справочника застройщика) и дома, отмеченные вручную (district_house_flags,
  // включая те, что владелец называл раньше, но которых нет в справочнике
  // вовсе — у них quarterId пустой).
  const notDeliveredHouses = useMemo(() => getNotDeliveredHouses(), []);

  const filteredNotDeliveredHouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notDeliveredHouses;
    return notDeliveredHouses.filter((h) => `${h.street} ${h.house}`.toLowerCase().includes(q));
  }, [notDeliveredHouses, search]);

  const notDeliveredByQuarter = useMemo(() => {
    const map = new Map<string, DeliveredHouse[]>();
    for (const h of filteredNotDeliveredHouses) {
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
  }, [filteredNotDeliveredHouses]);

  const filteredFlags = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...flags].sort(
      (a, b) => titleCase(a.street).localeCompare(titleCase(b.street)) || Number(a.house) - Number(b.house),
    );
    if (!q) return sorted;
    return sorted.filter((f) => `${f.street} ${f.house}`.toLowerCase().includes(q));
  }, [flags, search]);

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

      <ToggleGroup options={[...SUB_TABS]} value={subTab} onChange={(v) => setSubTab(v as SubTab)} />

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

      {subTab === 'Дома' && points !== null && (
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
                const flagged = flagByHouse.has(houseKey(h.street, h.house));
                return (
                  <button
                    key={houseKey(h.street, h.house)}
                    type="button"
                    onClick={() => setOpenHouse(h)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                  >
                    <span className={cn('text-ink', flagged && 'text-ink-faint')}>
                      {titleCase(h.street)}, {h.house}
                    </span>
                    {flagged ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                        <Ban className="h-3 w-3 shrink-0" />
                        не введён в эксплуатацию
                      </span>
                    ) : (
                      <span className={cn('shrink-0 text-xs font-semibold', list.length > 0 ? 'text-ink-muted' : 'text-ink-faint')}>
                        {list.length > 0 ? `${list.length} организаций` : 'ещё не собрано'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {subTab === 'Несданные' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink">Кварталы не сданы целиком</h3>
            <p className="text-xs text-ink-faint">
              Из справочника застройщика — организации по ним не собираем, пока не сдадут весь квартал.
            </p>
            {notDeliveredByQuarter.length === 0 ? (
              <p className="text-sm text-ink-faint">Ничего не найдено.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {notDeliveredByQuarter.map(([quarterId, hs]) => (
                  <div key={quarterId} className={cn('flex flex-col divide-y divide-border', glassCardClass)} style={glassCardShadow}>
                    <div className="flex items-center gap-2 px-4 py-3">
                      <Building2 className="h-4 w-4 shrink-0 text-ink-faint" />
                      <h3 className="text-sm font-bold text-ink">{QUARTER_LABELS[quarterId] ?? quarterId}</h3>
                      <span className="text-xs text-ink-faint">{hs.length} домов</span>
                    </div>
                    {hs.map((h) => (
                      <button
                        key={houseKey(h.street, h.house)}
                        type="button"
                        onClick={() => setOpenHouse(h)}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                      >
                        <span className="text-ink">
                          {titleCase(h.street)}, {h.house}
                        </span>
                        <span className="shrink-0 text-xs text-ink-faint">проверить</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink">Отмечены вручную</h3>
            <p className="text-xs text-ink-faint">
              Дома, отмеченные «не введён в эксплуатацию» из карточки дома — в т.ч. те, что пока вообще не попали в
              справочник застройщика.
            </p>
            {filteredFlags.length === 0 ? (
              <p className="text-sm text-ink-faint">Ничего не найдено.</p>
            ) : (
              <div className={cn('flex flex-col divide-y divide-border', glassCardClass)} style={glassCardShadow}>
                {filteredFlags.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOpenHouse({ street: f.street, house: f.house, quarterId: f.quarterId })}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                  >
                    <span className="text-ink">
                      {titleCase(f.street)}, {f.house}
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {QUARTER_LABELS[f.quarterId] ?? (f.quarterId || 'нет в справочнике')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {openHouse && (
        <HouseModal
          house={openHouse}
          current={pointsByHouse.get(houseKey(openHouse.street, openHouse.house)) ?? []}
          flag={flagByHouse.get(houseKey(openHouse.street, openHouse.house)) ?? null}
          onClose={() => setOpenHouse(null)}
          onAdded={(point) => refreshPointsLocal((prev) => [...prev, point])}
          onRemoved={(id) => refreshPointsLocal((prev) => prev.filter((p) => p.id !== id))}
          onDiffApplied={(removedIds, added) =>
            refreshPointsLocal((prev) => [...prev.filter((p) => !removedIds.includes(p.id)), ...added])
          }
          onFlagAdded={(flag) => setFlags((prev) => [...prev, flag])}
          onFlagRemoved={(id) => setFlags((prev) => prev.filter((f) => f.id !== id))}
        />
      )}
    </div>
  );
}

function HouseModal({
  house,
  current,
  flag,
  onClose,
  onAdded,
  onRemoved,
  onDiffApplied,
  onFlagAdded,
  onFlagRemoved,
}: {
  house: DeliveredHouse;
  current: DistrictBusinessPoint[];
  flag: DistrictHouseFlag | null;
  onClose: () => void;
  onAdded: (point: DistrictBusinessPoint) => void;
  onRemoved: (id: string) => void;
  onDiffApplied: (removedIds: string[], added: DistrictBusinessPoint[]) => void;
  onFlagAdded: (flag: DistrictHouseFlag) => void;
  onFlagRemoved: (id: string) => void;
}) {
  const [flagSaving, setFlagSaving] = useState(false);
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
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setFileError('');
    setPendingDiff(null);
    setExcludedTitles(new Set());
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(buffer);
      // .webarchive (Safari, Mac) — бинарный plist; обычный сохранённый
      // HTML (Chrome/Edge/Firefox, "Страница целиком"/"Только HTML") —
      // текст, начинающийся с <!doctype/<html; иначе — просто список
      // текстом (ручной .txt-разбор). Не знаем заранее, чем будет
      // пользоваться фрилансер, поддерживаем все три.
      let parsed;
      if (looksLikeBplist(buffer)) {
        parsed = parseWebarchiveOrgList(buffer);
      } else if (/^\s*<(!doctype|html)/i.test(text)) {
        parsed = parseHtmlSnapshotOrgList(text);
      } else {
        parsed = parseBusinessListText(text);
      }
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
      onClose();
    } catch {
      setFileError('Не удалось сохранить изменения — попробуйте ещё раз.');
    } finally {
      setApplying(false);
    }
  }

  async function handleFlagOn() {
    setFlagSaving(true);
    setFileError('');
    try {
      const created = await insertDistrictHouseFlag({ street: house.street, house: house.house, quarterId: house.quarterId });
      onFlagAdded(created);
    } catch {
      setFileError('Не удалось поставить отметку — попробуйте ещё раз.');
    } finally {
      setFlagSaving(false);
    }
  }

  async function handleFlagOff() {
    if (!flag) return;
    setFlagSaving(true);
    setFileError('');
    try {
      await deleteDistrictHouseFlag(flag.id);
      onFlagRemoved(flag.id);
    } catch {
      setFileError('Не удалось снять отметку — попробуйте ещё раз.');
    } finally {
      setFlagSaving(false);
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

        {flag ? (
          <div className="flex flex-col gap-3 rounded-control bg-warning-bg p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
              <Ban className="h-4 w-4 shrink-0" />
              Дом не введён в эксплуатацию
            </p>
            <p className="text-sm text-ink-muted">
              Отмечено сознательно — дом ещё пустует, поэтому организаций пока нет. Когда дом заселят, снимите
              отметку и загрузите список организаций как обычно.
            </p>
            <Button
              type="button"
              variant="secondary"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={handleFlagOff}
              disabled={flagSaving}
              className="w-fit"
            >
              {flagSaving ? 'Снимаем...' : 'Снять отметку'}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleFlagOn}
            disabled={flagSaving}
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-warning disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5 shrink-0" />
            {flagSaving ? 'Отмечаем...' : 'Отметить: дом не введён в эксплуатацию'}
          </button>
        )}

        {!flag && (pendingDiff ? (
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
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed px-4 py-6 text-center',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary',
              )}
              onDragOver={(e) => {
                // Без preventDefault браузер по умолчанию не разрешает drop
                // на произвольный элемент — событие drop вообще не приходит.
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                // <input type="file"> у нас скрыт (hidden) специально —
                // скрытый элемент не может быть целью drag-and-drop
                // (браузер не показывает его как drop-зону), поэтому файл
                // из DataTransfer передаём в handleFile напрямую, а не
                // полагаемся на нативное поведение инпута.
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-ink">
                <Upload className="h-4 w-4 shrink-0" />
                Загрузить файл выгрузки — выберите или перетащите сюда
              </span>
              <span className="text-xs text-ink-faint">
                Карточка дома на Яндекс.Картах, вкладка «Организации внутри» → сохранить страницу (Cmd/Ctrl+S) —
                .webarchive (Safari) или .html (Chrome/Edge/Firefox)
              </span>
              <input
                type="file"
                accept=".webarchive,.html,.htm,.txt,.md,text/plain,text/html"
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
        ))}
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Loader2, X, ImageOff, Link as LinkIcon, Eye, Phone, Heart, Flame, Film, KeyRound } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { ObjectFormModal } from '../components/objects/ObjectFormModal';
import { BuildingSpecsModal } from '../components/objects/BuildingSpecsModal';
import { ImageLightbox, type LightboxState } from '../components/objects/ImageLightbox';
import { BuildingPlanWidget } from '../components/objects/BuildingPlanWidget';
import {
  pricePerMeter,
  objectImages,
  demandSources,
  extractAdId,
  type RealtyObject,
  type DemandSource,
  type DemandLink,
  type BuildingSpecs,
} from '../data/objects';
import type { Lead } from '../data/leads';
import type { BuildingPlanZone } from '../data/buildingPlans';
import { fetchObject, updateObject } from '../lib/objectsApi';
import { fetchDemandStats, type DemandStat } from '../lib/demandStatsApi';
import { fetchLeadsForObject } from '../lib/leadsApi';
import { fetchBookedZones } from '../lib/buildingPlansApi';
import { badgeColor } from '../lib/badgeColor';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatNum(value: number) {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
}

export function ObjectDetail() {
  const { id } = useParams();
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [specsModalOpen, setSpecsModalOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const [editingConcept, setEditingConcept] = useState(false);
  const [conceptDraft, setConceptDraft] = useState('');
  const [savingConcept, setSavingConcept] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [editingInspectionMedia, setEditingInspectionMedia] = useState(false);
  const [inspectionMediaDraft, setInspectionMediaDraft] = useState('');
  const [savingInspectionMedia, setSavingInspectionMedia] = useState(false);
  const [inspectionMediaError, setInspectionMediaError] = useState<string | null>(null);

  const [newLinkSource, setNewLinkSource] = useState<DemandSource>(demandSources[0]);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [removingLinkIndex, setRemovingLinkIndex] = useState<number | null>(null);

  const [demandStats, setDemandStats] = useState<DemandStat[]>([]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [bookedZones, setBookedZones] = useState<BuildingPlanZone[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchObject(id)
      .then(setObject)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить объект')))
      .finally(() => setLoading(false));

    setLeadsLoading(true);
    fetchLeadsForObject(id)
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLeadsLoading(false));

    fetchBookedZones()
      .then(setBookedZones)
      .catch(() => setBookedZones([]));
  }, [id]);

  useEffect(() => {
    if (!object) return;
    const adIds = object.demandLinks
      .map((link) => extractAdId(link.url))
      .filter((adId): adId is string => adId !== null);
    if (adIds.length === 0) {
      setDemandStats([]);
      return;
    }
    fetchDemandStats(adIds)
      .then(setDemandStats)
      .catch(() => setDemandStats([]));
  }, [object]);

  function statFor(link: DemandLink): DemandStat | undefined {
    const adId = extractAdId(link.url);
    if (!adId) return undefined;
    return demandStats.find((s) => s.adId === adId && s.source === link.source);
  }

  async function saveObjectPatch(patch: Partial<Omit<RealtyObject, 'id'>>) {
    if (!object) throw new Error('Объект не загружен');
    const { id: objectId, ...rest } = object;
    const updated = await updateObject(objectId, { ...rest, ...patch });
    setObject(updated);
    return updated;
  }

  function startEditConcept() {
    setConceptDraft(object?.concept ?? '');
    setConceptError(null);
    setEditingConcept(true);
  }

  async function saveConcept() {
    setSavingConcept(true);
    setConceptError(null);
    try {
      await saveObjectPatch({ concept: conceptDraft });
      setEditingConcept(false);
    } catch (err) {
      setConceptError(errorMessage(err, 'Не удалось сохранить концепцию'));
    } finally {
      setSavingConcept(false);
    }
  }

  async function addDemandLink() {
    if (!object || !newLinkUrl.trim()) return;
    setSavingLink(true);
    setLinkError(null);
    try {
      await saveObjectPatch({ demandLinks: [...object.demandLinks, { source: newLinkSource, url: newLinkUrl.trim() }] });
      setNewLinkUrl('');
    } catch (err) {
      setLinkError(errorMessage(err, 'Не удалось добавить ссылку'));
    } finally {
      setSavingLink(false);
    }
  }

  async function removeDemandLink(index: number) {
    if (!object) return;
    setRemovingLinkIndex(index);
    setLinkError(null);
    try {
      await saveObjectPatch({ demandLinks: object.demandLinks.filter((_, i) => i !== index) });
    } catch (err) {
      setLinkError(errorMessage(err, 'Не удалось удалить ссылку'));
    } finally {
      setRemovingLinkIndex(null);
    }
  }

  function startEditNotes() {
    setNotesDraft(object?.notes ?? '');
    setNotesError(null);
    setEditingNotes(true);
  }

  async function saveNotes() {
    setSavingNotes(true);
    setNotesError(null);
    try {
      await saveObjectPatch({ notes: notesDraft });
      setEditingNotes(false);
    } catch (err) {
      setNotesError(errorMessage(err, 'Не удалось сохранить заметки'));
    } finally {
      setSavingNotes(false);
    }
  }

  function startEditInspectionMedia() {
    setInspectionMediaDraft(object?.inspectionMediaUrl ?? '');
    setInspectionMediaError(null);
    setEditingInspectionMedia(true);
  }

  async function saveInspectionMedia() {
    setSavingInspectionMedia(true);
    setInspectionMediaError(null);
    try {
      await saveObjectPatch({ inspectionMediaUrl: inspectionMediaDraft.trim() });
      setEditingInspectionMedia(false);
    } catch (err) {
      setInspectionMediaError(errorMessage(err, 'Не удалось сохранить ссылку'));
    } finally {
      setSavingInspectionMedia(false);
    }
  }

  async function attachBuildingPlan(planId: string) {
    if (!object || object.buildingPlanIds.includes(planId)) return;
    await saveObjectPatch({ buildingPlanIds: [...object.buildingPlanIds, planId] });
  }

  async function detachBuildingPlan(planId: string) {
    if (!object) return;
    await saveObjectPatch({ buildingPlanIds: object.buildingPlanIds.filter((id) => id !== planId) });
  }

  const perMeter = object ? pricePerMeter(object.area, object.startPrice) : null;
  const images = object ? objectImages(object) : [];
  const missingSources = object
    ? demandSources.filter((s) => !object.demandLinks.some((l) => l.source === s))
    : [...demandSources];
  const objectBookedZones = object
    ? bookedZones.filter((z) => object.buildingPlanIds.includes(z.buildingPlanId))
    : [];
  const bookedLeadIds = new Set(objectBookedZones.map((z) => z.leadId).filter(Boolean));
  const warmLeads = leads.filter((l) => l.isWarm && !bookedLeadIds.has(l.id));
  const regularLeads = leads.filter((l) => !l.isWarm && !bookedLeadIds.has(l.id));
  const lastStatsUpdate = demandStats.reduce<string | null>(
    (latest, s) => (!latest || s.checkedAt > latest ? s.checkedAt : latest),
    null,
  );

  const specs = object?.buildingSpecs ?? null;
  const specBlocks = specs
    ? [
        {
          title: 'Общие сведения',
          rows: [
            ['Наименование', specs.buildingName || null],
            ['Назначение', specs.buildingPurpose || null],
            ['Год постройки', specs.yearBuilt],
            ['Год реконструкции', specs.yearRenovated],
            ['Этажность', specs.floorsCount],
          ],
        },
        {
          title: 'Площади и помещения',
          rows: [
            ['Общая площадь', specs.totalArea != null ? `${formatNum(specs.totalArea)} м²` : null],
            ['Нормируемая площадь', specs.normativeArea != null ? `${formatNum(specs.normativeArea)} м²` : null],
            ['Всего помещений', specs.roomsCount],
            ['Кабинетов', specs.officesCount],
            ['Санузлов', specs.bathroomsCount],
            ['Прочие помещения', specs.otherRooms || null],
          ],
        },
        {
          title: 'Конструктив',
          rows: [
            ['Фундамент', specs.foundation || null],
            ['Стены', specs.walls || null],
            ['Перекрытия', specs.ceilings || null],
            ['Конструкция здания', specs.structure || null],
            ['Крыша', specs.roof || null],
            ['Полы', specs.flooring || null],
            ['Окна', specs.windows || null],
          ],
        },
        {
          title: 'Инженерные сети',
          rows: [
            ['Электроснабжение', specs.electricity || null],
            ['Водопровод', specs.water || null],
            ['Канализация', specs.sewerage || null],
            ['Отопление', specs.heating || null],
            ['Телефонизация', specs.phone || null],
          ],
        },
        {
          title: 'Земельный участок',
          rows: [
            ['Площадь участка', specs.landArea != null ? `${formatNum(specs.landArea)} га` : null],
            ['Назначение участка', specs.landPurpose || null],
          ],
        },
      ]
        .map((block) => ({ ...block, rows: block.rows.filter(([, v]) => v !== null) as [string, string | number][] }))
        .filter((block) => block.rows.length > 0)
    : [];

  async function saveBuildingSpecs(nextSpecs: BuildingSpecs) {
    await saveObjectPatch({ buildingSpecs: nextSpecs });
  }

  return (
    <>
      <PageHeader
        title={object?.address ?? 'Объект'}
        action={
          object && (
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
              Редактировать
            </Button>
          )
        }
      />

      <Link to="/objects" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Все объекты
      </Link>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем объект...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && object && (
        <div className="grid grid-cols-[380px_minmax(0,1fr)] items-start gap-6">
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="flex flex-col gap-3 p-5">
              <button
                type="button"
                onClick={() => object.photoUrl && setLightbox({ urls: images, index: 0 })}
                className="aspect-[4/3] w-full overflow-hidden rounded-control bg-surface-muted"
                disabled={!object.photoUrl}
              >
                {object.photoUrl ? (
                  <img src={object.photoUrl} alt={object.address} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-6 w-6 text-ink-faint" />
                  </div>
                )}
              </button>
              {object.floorPlanUrls.length > 0 && (
                <div className="flex gap-2">
                  {object.floorPlanUrls.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setLightbox({ urls: images, index: images.indexOf(url) })}
                      title="Планировка"
                      className="aspect-square flex-1 overflow-hidden rounded-control border border-border bg-surface-muted"
                    >
                      <img src={url} alt={`Планировка ${i + 1}`} className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {specBlocks.length > 0 ? (
              specBlocks.map((block, i) => (
                <Card key={block.title} className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-ink">{block.title}</div>
                    {i === 0 && (
                      <button
                        type="button"
                        onClick={() => setSpecsModalOpen(true)}
                        aria-label="Редактировать характеристики"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {block.rows.map(([label, value]) => (
                    <div key={label}>
                      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
                      <div className="font-semibold text-ink">{value}</div>
                    </div>
                  ))}
                </Card>
              ))
            ) : (
              <Card className="flex flex-col gap-3 p-5">
                <div className="font-bold text-ink">Характеристики здания</div>
                <p className="text-sm text-ink-muted">Характеристики ещё не добавлены.</p>
                <Button type="button" variant="secondary" className="w-fit" onClick={() => setSpecsModalOpen(true)}>
                  Добавить характеристики
                </Button>
              </Card>
            )}

            <Card className="flex flex-col gap-4 p-5">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Цена</div>
                <div className="text-2xl font-extrabold text-ink">{formatMoney(object.startPrice)}</div>
              </div>
              <div className="flex justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Цена/м²</div>
                  <div className="text-lg font-bold text-ink">{perMeter ? formatMoney(perMeter) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Площадь</div>
                  <div className="text-lg font-bold text-ink">{object.area} м²</div>
                </div>
              </div>
              {object.listingUrl && (
                <a
                  href={object.listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <LinkIcon className="h-4 w-4" />
                  Открыть объявление
                </a>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Собственник</div>
                <div className="font-semibold text-ink">{object.owner}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Контакт</div>
                <div className="font-semibold text-ink">{object.ownerContact}</div>
              </div>
              {object.contactName && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Имя</div>
                  <div className="font-semibold text-ink">{object.contactName}</div>
                </div>
              )}
              {object.contactPosition && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Должность</div>
                  <div className="font-semibold text-ink">{object.contactPosition}</div>
                </div>
              )}
              {object.contactChannel && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Где общаемся</div>
                  <div className="font-semibold text-ink">{object.contactChannel}</div>
                </div>
              )}
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-ink">Концепция</div>
                {!editingConcept && (
                  <button
                    type="button"
                    onClick={startEditConcept}
                    aria-label="Редактировать концепцию"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingConcept ? (
                <div className="flex flex-col gap-3">
                  <Textarea
                    value={conceptDraft}
                    onChange={(e) => setConceptDraft(e.target.value)}
                    placeholder="2–3 предложения о концепции объекта..."
                    rows={4}
                    autoFocus
                  />
                  {conceptError && <p className="text-sm text-danger">{conceptError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setEditingConcept(false)}>
                      Отмена
                    </Button>
                    <Button type="button" onClick={saveConcept} disabled={savingConcept}>
                      {savingConcept ? 'Сохраняем...' : 'Сохранить'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                  {object.concept || 'Концепция ещё не добавлена'}
                </p>
              )}
            </Card>

            <BuildingPlanWidget object={object} onAttachPlan={attachBuildingPlan} onDetachPlan={detachBuildingPlan} />

            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-bold text-ink">Проверка спроса</div>
                {lastStatsUpdate && (
                  <span className="text-xs text-ink-faint">Обновлено: {formatDate(lastStatsUpdate)}</span>
                )}
              </div>

              {object.demandLinks.length === 0 ? (
                <p className="text-sm text-ink-muted">Ссылок пока нет</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {object.demandLinks.map((link, i) => {
                    const colors = badgeColor(link.source);
                    const stat = statFor(link);
                    return (
                      <div key={`${link.url}-${i}`} className="flex items-center gap-3 rounded-control border border-border px-4 py-3">
                        <span
                          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {link.source}
                        </span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-sm font-medium text-info-text hover:underline"
                        >
                          Открыть объявление
                        </a>
                        {stat && (
                          <span
                            className="flex shrink-0 items-center gap-3 text-xs text-ink-muted"
                            title={`Обновлено: ${formatDate(stat.checkedAt)}`}
                          >
                            <span className="flex items-center gap-1" title="Просмотры">
                              <Eye className="h-3.5 w-3.5" />
                              {stat.views}
                            </span>
                            <span className="flex items-center gap-1" title="Звонки">
                              <Phone className="h-3.5 w-3.5" />
                              {stat.calls}
                            </span>
                            <span className="flex items-center gap-1" title="В избранном">
                              <Heart className="h-3.5 w-3.5" />
                              {stat.favorites}
                            </span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeDemandLink(i)}
                          disabled={removingLinkIndex === i}
                          aria-label="Удалить ссылку"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {missingSources.length > 0 && (
                <div className="flex items-end gap-3">
                  <div className="w-32 shrink-0">
                    <Select
                      label="Источник"
                      options={missingSources}
                      value={missingSources.includes(newLinkSource) ? newLinkSource : missingSources[0]}
                      onChange={(v) => setNewLinkSource(v as DemandSource)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Input
                      label="Ссылка на объявление"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                    />
                  </div>
                  <Button type="button" onClick={addDemandLink} disabled={!newLinkUrl.trim() || savingLink}>
                    {savingLink ? 'Добавляем...' : 'Добавить'}
                  </Button>
                </div>
              )}
              {linkError && <p className="text-sm text-danger">{linkError}</p>}

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                {leadsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Загружаем лиды...
                  </div>
                ) : (
                  <div className="flex gap-8">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-ink-muted" />
                      <span className="text-sm text-ink-muted">Брони</span>
                      <span className="text-xl font-extrabold text-ink">{objectBookedZones.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 fill-warning text-warning" />
                      <span className="text-sm text-ink-muted">Горячие лиды</span>
                      <span className="text-xl font-extrabold text-ink">{warmLeads.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-muted">Обычные лиды</span>
                      <span className="text-xl font-extrabold text-ink">{regularLeads.length}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-ink">Фото и видео с осмотра</div>
                {!editingInspectionMedia && (
                  <button
                    type="button"
                    onClick={startEditInspectionMedia}
                    aria-label="Редактировать ссылку"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingInspectionMedia ? (
                <div className="flex flex-col gap-3">
                  <Input
                    placeholder="Ссылка на папку Google Диска..."
                    value={inspectionMediaDraft}
                    onChange={(e) => setInspectionMediaDraft(e.target.value)}
                    autoFocus
                  />
                  {inspectionMediaError && <p className="text-sm text-danger">{inspectionMediaError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setEditingInspectionMedia(false)}>
                      Отмена
                    </Button>
                    <Button type="button" onClick={saveInspectionMedia} disabled={savingInspectionMedia}>
                      {savingInspectionMedia ? 'Сохраняем...' : 'Сохранить'}
                    </Button>
                  </div>
                </div>
              ) : object.inspectionMediaUrl ? (
                <a
                  href={object.inspectionMediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                >
                  <Film className="h-4 w-4" />
                  Посмотреть
                </a>
              ) : (
                <p className="text-sm text-ink-muted">Ссылка ещё не добавлена</p>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-ink">Заметки по объекту</div>
                {!editingNotes && (
                  <button
                    type="button"
                    onClick={startEditNotes}
                    aria-label="Редактировать заметки"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="flex flex-col gap-3">
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Свободные заметки по объекту..."
                    rows={4}
                    autoFocus
                  />
                  {notesError && <p className="text-sm text-danger">{notesError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setEditingNotes(false)}>
                      Отмена
                    </Button>
                    <Button type="button" onClick={saveNotes} disabled={savingNotes}>
                      {savingNotes ? 'Сохраняем...' : 'Сохранить'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                  {object.notes || 'Заметок пока нет'}
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      <ObjectFormModal open={editOpen} onClose={() => setEditOpen(false)} editing={object} onSaved={setObject} />
      <BuildingSpecsModal
        open={specsModalOpen}
        onClose={() => setSpecsModalOpen(false)}
        specs={specs}
        onSave={saveBuildingSpecs}
      />
      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </>
  );
}

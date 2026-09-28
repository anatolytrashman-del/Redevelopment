import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Loader2, Search, Send, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { countryFlag, SUPPLIER_COUNTRIES, type SupplierOffer, type SupplierRequest } from '../../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';
import type { MaterialLedger } from '../../data/materialLedgers';
import type { LegalEntity } from '../../data/legalEntities';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import { insertSupplierOffer, insertSupplierRequest } from '../../lib/supplierResearchApi';
import { insertBulkSendJob } from '../../lib/bulkSendJobsApi';
import { fetchBlockedSupplierIds } from '../../lib/suppliersApi';
import { buildMaterialLedgerXlsx } from '../../lib/materialLedgerXlsx';
import { DEFAULT_MATERIALS_SUBJECT } from '../../lib/emailTemplates';
import { defaultBulkBody } from './BulkSendModal';
import { matchOfferProduct, normalizeSearch } from './productSearch';

// «Запросить цены» — рассылка от ведомости, а не от категории (владелец,
// 2026-09-28: «нужно перепридумать отправку. А что, если я не знаю, в какой
// позиции будет керамзит? А что, если у меня товаров в ведомости несколько?»).
//
// Выбрали ведомость → по каждой позиции ищем поставщиков по всему каталогу
// (разделы сайта, заголовок и описание со снимка — productSearch.ts) →
// один список компаний, сверху те, у кого больше позиций → отправить.
// Ведомость уходит каждому целиком (решение владельца того же дня): сайт
// видит не всё, а лишний запрос ничего не стоит.
//
// Отправка заводит «закупку» — строку supplier_research_requests с
// ledger_id: сравнение цен берёт её позиции из ведомости (Suppliers.tsx,
// requestPositions), а каждому получателю в ней заводится своя карточка —
// копия его карточки из каталога. Так письма, счета и сравнение живут на
// той же механике, что у категорий, и ничего переделывать не пришлось.

const NO_LEGAL_ENTITY = 'Без карточки организации';
// Сколько поставщиков на позицию отмечаем по умолчанию: жадно, от самых
// полных по покрытию. Всех подряд — это сотни писем на ходовой товар.
const DEFAULT_PER_POSITION = 10;
const FIRST_PAGE = 40;

const ADJECTIVE_ENDING = /(ая|яя|ый|ий|ой|ое|ее|ые|ие|ую|юю)$/;
const STOP_WORDS = new Set(['для', 'под', 'без', 'или', 'цвет', 'тип', 'марка', 'шт', 'упак']);

// Слово для поиска из названия позиции: первое существительное без
// окончания («Керамзит фракция 10–20» → «керамз», «Штукатурка гипсовая» →
// «штукатур»), чтобы ловить и «керамзитобетон», и «штукатурки». Угадывает не
// всегда — поэтому слово у позиции правится руками.
export function keywordForItem(name: string): string {
  const lower = normalizeSearch(name);
  const cyr = lower.match(/[а-я]+/g) ?? [];
  const noun =
    cyr.find((w) => w.length >= 4 && !STOP_WORDS.has(w) && !ADJECTIVE_ENDING.test(w)) ??
    cyr.find((w) => w.length >= 4 && !STOP_WORDS.has(w));
  if (noun) return noun.length > 6 ? noun.slice(0, -2) : noun;
  return lower.match(/[a-z]{4,}/)?.[0] ?? '';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

interface Company {
  key: string;
  offer: SupplierOffer;
  // Индексы позиций ведомости, которые нашлись у компании.
  covers: number[];
  lastWrittenAt: string | null;
}

export function RequestPricesModal({
  ledgers,
  offers,
  requests,
  emails,
  snapshotByHost,
  legalEntities,
  onClose,
  onCreated,
}: {
  ledgers: MaterialLedger[];
  offers: SupplierOffer[];
  requests: SupplierRequest[];
  emails: SupplierOfferEmail[];
  snapshotByHost: Map<string, SupplierSiteSnapshot>;
  legalEntities: LegalEntity[];
  onClose: () => void;
  onCreated: (request: SupplierRequest, added: SupplierOffer[]) => void;
}) {
  const sortedLedgers = useMemo(
    () => [...ledgers].filter((l) => l.items.length > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [ledgers],
  );
  const [ledgerId, setLedgerId] = useState('');
  const ledger = sortedLedgers.find((l) => l.id === ledgerId) ?? null;
  const ledgerLabel = (l: MaterialLedger) => `${l.name} · ${l.items.length} поз.`;

  const [keywords, setKeywords] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ledger) return;
    setKeywords(Object.fromEntries(ledger.items.map((it) => [it.id, keywordForItem(it.name)])));
    // Только при смене ведомости: правки слов человеком не перетираем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId]);

  const [legalEntityId, setLegalEntityId] = useState('');
  const legalEntity = legalEntities.find((e) => e.id === legalEntityId) ?? null;
  const [country, setCountry] = useState<string>(SUPPLIER_COUNTRIES[0]);
  useEffect(() => {
    if (legalEntity?.country) setCountry(legalEntity.country);
  }, [legalEntity?.country]);

  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetchBlockedSupplierIds()
      .then(setBlocked)
      .catch(() => {});
  }, []);

  // Последнее исходящее письмо компании — просто подпись «писали 17.09»:
  // по НОВОЙ закупке ей ещё никто не писал, поэтому отметку это не снимает.
  const lastOutByOffer = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of emails) {
      if (e.direction !== 'out') continue;
      const prev = map.get(e.offerId);
      if (!prev || e.createdAt > prev) map.set(e.offerId, e.createdAt);
    }
    return map;
  }, [emails]);

  const purchaseRequestIds = useMemo(() => new Set(requests.filter((r) => r.ledgerId).map((r) => r.id)), [requests]);

  // Кандидаты: верифицированные с живым адресом, не в стоп-листе, нужной
  // страны. Одна компания — одна строка (карточки в разных категориях),
  // копии из прошлых закупок не в счёт — у компании есть своя карточка.
  const pool = useMemo(() => {
    const map = new Map<string, { offer: SupplierOffer; lastWrittenAt: string | null }>();
    for (const o of offers) {
      if (!o.verified || !o.email || o.emailInvalidAt || purchaseRequestIds.has(o.requestId)) continue;
      if (o.supplierId && blocked.has(o.supplierId)) continue;
      if ((o.country || SUPPLIER_COUNTRIES[0]) !== country) continue;
      const key = o.supplierId ?? normalizeEmail(o.email);
      const written = lastOutByOffer.get(o.id) ?? null;
      const prev = map.get(key);
      if (!prev) map.set(key, { offer: o, lastWrittenAt: written });
      else if (written && (!prev.lastWrittenAt || written > prev.lastWrittenAt)) prev.lastWrittenAt = written;
    }
    return map;
  }, [offers, purchaseRequestIds, blocked, country, lastOutByOffer]);

  const items = useMemo(() => ledger?.items ?? [], [ledger]);

  const { companies, countByItem } = useMemo(() => {
    const counts = items.map(() => 0);
    const list: Company[] = [];
    for (const [key, { offer, lastWrittenAt }] of pool) {
      const covers: number[] = [];
      items.forEach((it, i) => {
        const kw = normalizeSearch((keywords[it.id] ?? '').trim());
        if (kw.length >= 3 && matchOfferProduct(offer, snapshotByHost, kw).matched) covers.push(i);
      });
      if (covers.length === 0) continue;
      for (const i of covers) counts[i] += 1;
      list.push({ key, offer, covers, lastWrittenAt });
    }
    list.sort((a, b) => b.covers.length - a.covers.length || a.offer.name.localeCompare(b.offer.name, 'ru'));
    return { companies: list, countByItem: counts };
  }, [pool, items, keywords, snapshotByHost]);

  // Отметка по умолчанию: идём от самых полных и берём компанию, если хоть
  // по одной её позиции ещё нет DEFAULT_PER_POSITION отмеченных.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    const perItem = items.map(() => 0);
    const next = new Set<string>();
    for (const c of companies) {
      if (!c.covers.some((i) => perItem[i] < DEFAULT_PER_POSITION)) continue;
      next.add(c.key);
      for (const i of c.covers) perItem[i] += 1;
    }
    setSelected(next);
  }, [companies, items]);

  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? companies : companies.slice(0, FIRST_PAGE);

  const [subject, setSubject] = useState(DEFAULT_MATERIALS_SUBJECT);
  const [body, setBody] = useState(defaultBulkBody);
  useEffect(() => {
    if (ledger) setSubject(`Запрос цен: ${ledger.name.toLowerCase()}`);
  }, [ledger]);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; count: number } | null>(null);

  const recipients = companies.filter((c) => selected.has(c.key));
  const purchaseTitle = ledger ? `${ledger.name}, ${shortDay(new Date().toISOString())}` : '';

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function send() {
    if (!ledger || sending || recipients.length === 0 || !legalEntityId || !subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      setProgress('Готовим ведомость');
      const attachment = await buildMaterialLedgerXlsx(ledger.name, ledger.items);
      setProgress('Заводим закупку');
      const request = await insertSupplierRequest({
        title: purchaseTitle,
        group: 'materials',
        estimateId: ledger.estimateId,
        sectionId: null,
        sectionTitle: '',
        legalEntityId: legalEntity?.id ?? null,
        comparisonMode: 'material',
        replyDueDays: 3,
        ledgerId: ledger.id,
      });
      // Карточка в закупке — копия карточки из каталога: контакты и сайт те
      // же, позиции и КП пустые. Компанию (supplier_id) привяжет триггер
      // supplier_offer_attach_company_trg.
      const added: SupplierOffer[] = [];
      for (const c of recipients) {
        setProgress(`Заводим поставщиков: ${added.length + 1} из ${recipients.length}`);
        added.push(
          await insertSupplierOffer({
            ...c.offer,
            requestId: request.id,
            catalogModelName: '',
            catalogModelPhoto: null,
            price: 0,
            items: [],
            files: [],
            verified: true,
            termsNote: undefined,
          }),
        );
      }
      setProgress('Ставим письма в очередь');
      await insertBulkSendJob({
        requestId: request.id,
        legalEntityId: legalEntity?.id ?? null,
        subject,
        body,
        attachment,
        offerIds: added.map((o) => o.id),
      });
      onCreated(request, added);
      setDone({ title: request.title, count: added.length });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось отправить запрос цен'));
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  const legalEntityOptions = [NO_LEGAL_ENTITY, ...legalEntities.map((e) => e.shortName || e.name)];
  const legalEntityValue =
    legalEntityId === '' ? '' : legalEntityId === 'none' ? NO_LEGAL_ENTITY : legalEntity?.shortName || legalEntity?.name || '';

  const sectionClass = 'rounded-2xl border border-border bg-white p-4 sm:p-5';
  const captionClass = 'mb-2.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint';

  return (
    <Modal open onClose={onClose} size="wide" title="Запросить цены">
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-success">
            Готово: {done.count} {plural(done.count, 'письмо', 'письма', 'писем')} в очереди, уходят в фоне с паузами.
            Заведена закупка «{done.title}» — ответы, счета и сравнение цен собираются в ней.
          </p>
          <div>
            <Button type="button" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : (
        <div className="-mt-3 flex flex-col gap-4">
          <p className="text-sm text-ink-muted">Выберите ведомость — поставщиков подберём по её позициям из всего каталога.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Ведомость"
              placeholder="Выберите ведомость"
              options={sortedLedgers.map(ledgerLabel)}
              value={ledger ? ledgerLabel(ledger) : ''}
              onChange={(label) => setLedgerId(sortedLedgers.find((l) => ledgerLabel(l) === label)?.id ?? '')}
            />
            <Select
              label="От кого"
              placeholder="Выберите юрлицо"
              options={legalEntityOptions}
              value={legalEntityValue}
              onChange={(label) => {
                if (label === NO_LEGAL_ENTITY) setLegalEntityId('none');
                else setLegalEntityId(legalEntities.find((e) => (e.shortName || e.name) === label)?.id ?? '');
              }}
            />
            <Select
              label="Страна поставщиков"
              options={[...SUPPLIER_COUNTRIES]}
              value={country}
              onChange={(label) => setCountry(label)}
            />
          </div>

          {ledger && (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-w-0 flex-col gap-4">
                <section className={sectionClass}>
                  <div className={captionClass}>
                    <span>Позиции и кто их продаёт</span>
                    <span className="font-medium normal-case tracking-normal">слово для поиска можно поправить</span>
                  </div>
                  <div className="flex flex-col divide-y divide-border">
                    {items.map((it, i) => {
                      const count = countByItem[i] ?? 0;
                      return (
                        <div key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                          <div className="min-w-0 flex-1 basis-56">
                            <div className="text-sm font-semibold text-ink">{it.name}</div>
                            <div className="text-xs text-ink-muted">
                              {it.quantity ?? '—'} {it.unit}
                            </div>
                          </div>
                          <label className="flex items-center gap-1.5 rounded-full border border-dashed border-ink-faint/60 bg-surface-muted px-3 py-1">
                            <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                            <input
                              value={keywords[it.id] ?? ''}
                              onChange={(e) => setKeywords((prev) => ({ ...prev, [it.id]: e.target.value }))}
                              className="w-32 bg-transparent text-[13px] text-ink outline-none"
                              aria-label={`Слово для поиска: ${it.name}`}
                            />
                          </label>
                          <span
                            className={cn(
                              'w-36 text-right text-sm font-bold tabular-nums',
                              count === 0 ? 'text-warning' : 'text-ink',
                            )}
                          >
                            {count === 0 ? 'никого — поправьте слово' : `${count} ${plural(count, 'поставщик', 'поставщика', 'поставщиков')}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={sectionClass}>
                  <div className={captionClass}>
                    <span>
                      Кому пишем · отмечено {recipients.length} из {companies.length}
                    </span>
                    {companies.length > 0 && (
                      <button
                        type="button"
                        className="font-medium normal-case tracking-normal text-ink-muted hover:text-ink"
                        onClick={() => setSelected(recipients.length === companies.length ? new Set() : new Set(companies.map((c) => c.key)))}
                      >
                        {recipients.length === companies.length ? 'снять все' : 'отметить всех'}
                      </button>
                    )}
                  </div>
                  {companies.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      Ни у одного проверенного поставщика с email ({country}) эти позиции на сайте не нашлись. Поправьте слова для поиска.
                    </p>
                  ) : (
                    <>
                      <p className="mb-1.5 text-xs text-ink-muted">
                        Сверху — у кого больше позиций из ведомости. Ведомость уходит каждому целиком: просим цены на то, что есть.
                      </p>
                      <div className="flex flex-col">
                        {shown.map((c) => {
                          const full = c.covers.length === items.length;
                          const missing = items.filter((_, i) => !c.covers.includes(i));
                          // Позиция коротко — первые два слова названия, а не
                          // обрезанное слово поиска («мембра» читалось как опечатка).
                          const short = (name: string) => name.split(/\s+/).slice(0, 2).join(' ');
                          const note = full
                            ? ''
                            : c.covers.length <= missing.length
                              ? `есть: ${c.covers.map((i) => short(items[i].name)).join(', ')}`
                              : `нет: ${missing.map((it) => short(it.name)).join(', ')}`;
                          return (
                            <label key={c.key} className="flex items-center gap-2.5 border-b border-border px-1 py-2 text-sm last:border-b-0">
                              <input
                                type="checkbox"
                                checked={selected.has(c.key)}
                                onChange={() => toggle(c.key)}
                                className="h-4 w-4 shrink-0 accent-primary"
                              />
                              <span className="min-w-0 truncate font-semibold text-ink">
                                {countryFlag(c.offer.country || SUPPLIER_COUNTRIES[0])} {c.offer.name}
                              </span>
                              <span
                                className={cn(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                                  full ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                                )}
                              >
                                {c.covers.length} из {items.length}
                              </span>
                              {note && <span className="hidden min-w-0 truncate text-xs text-ink-muted sm:inline">{note}</span>}
                              {c.lastWrittenAt && (
                                <span className="ml-auto shrink-0 text-xs text-ink-faint">писали {shortDay(c.lastWrittenAt)}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {companies.length > shown.length && (
                        <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-left text-xs text-ink-muted hover:text-ink">
                          и ещё {companies.length - shown.length} · показать всех
                        </button>
                      )}
                    </>
                  )}
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <section className={sectionClass}>
                  <div className={captionClass}>
                    <span>Письмо</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Input label="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    <Textarea label="Текст" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted p-3">
                      <FileSpreadsheet className="h-6 w-6 shrink-0 text-success" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{ledger.name}.xlsx</div>
                        <div className="text-xs text-ink-muted">
                          {items.length} {plural(items.length, 'позиция', 'позиции', 'позиций')}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section className={sectionClass}>
                  <div className={captionClass}>
                    <span>Куда придут ответы</span>
                  </div>
                  <p className="text-sm text-ink">
                    Заведётся закупка <b>«{purchaseTitle}»</b>. Письма, счета и сравнение цен — в ней, дальше как сейчас: «кому что
                    заказать» → согласование → заказы.
                  </p>
                  {items.some((it) => !it.sourceMaterialId) && (
                    <p className="mt-2 flex gap-1.5 text-xs text-warning">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                      Позиции, добавленные в ведомость руками, а не из сметы, в сравнении цен не появятся.
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <span className="mr-auto text-xs text-ink-muted">
              {progress ?? (legalEntityId ? 'Письма уйдут в фоне, с паузами между ними' : 'Выберите, от кого пишем')}
            </span>
            <Button
              type="button"
              icon={sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              disabled={!ledger || !legalEntityId || recipients.length === 0 || sending || !subject.trim() || !body.trim()}
              onClick={() => void send()}
            >
              {recipients.length > 0
                ? `Отправить ${recipients.length} ${plural(recipients.length, 'поставщику', 'поставщикам', 'поставщикам')}`
                : 'Отправить'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

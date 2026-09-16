import { useMemo, useState, type ReactNode } from 'react';
import { Check, FileDown, Link2, Pencil, Send, Sparkles } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Textarea } from '../ui/Textarea';
import { ToggleGroup } from '../ui/ToggleGroup';
import { cn } from '../../lib/cn';
import type { Estimate, EstimateMaterial } from '../../data/estimates';
import type { ExchangeRate } from '../../data/exchangeRates';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import type { SupplierQuote } from '../../data/supplierQuotes';
import {
  PROPOSAL_REVIEW_STATUS_LABELS,
  SUPPLIER_COUNTRIES,
  offerCommunicationStatus,
  followupCounts,
  type SupplierOffer,
  type SupplierProposal,
  type SupplierProposalReview,
  type SupplierRequest,
} from '../../data/supplierResearch';
import { PURCHASE_ITEM_MATCH_KIND_LABELS, type PurchaseItem, type PurchaseItemMatchKind } from '../../data/purchases';
import type { QuoteTerms } from '../../data/supplierQuotes';
import {
  updateSupplierOfferItems,
  updateSupplierRequestProposal,
  updateSupplierRequestReview,
  updateSupplierRequestSection,
} from '../../lib/supplierResearchApi';
import { updateSupplierQuoteItems } from '../../lib/supplierQuotesApi';
import { getCurrentProfile } from '../../lib/accessProfile';
import { authFetch } from '../../lib/authFetch';
import { emailSignature } from './SupplierCorrespondenceTab';
import { errorMessage } from '../../lib/errorMessage';
import { sameUnit } from '../../lib/units';
import { guessUnitPrice } from '../../lib/unitPriceGuess';
import { grossUp, vatRateForCountry } from '../../data/vat';
import {
  STALE_QUOTE_DAYS,
  buildColumns,
  buildSnapshot,
  deltaToPicked,
  formatDate,
  formatDelta,
  formatMoney,
  formatUnit,
  pickLines,
  quoteAgeDays,
  sectionCandidates,
  sumMoney,
  type Cell,
  type CellVat,
  type Column,
  type MoneyPart,
  type UnmatchedLine,
} from './priceComparisonModel';
import { buildPrintHtml, buildProposalEmailHtml, hostOf, hrefOf, type ComparisonDoc } from './priceComparisonPrint';

// Владелец, 2026-09-15: «Пришла пора разобраться со сравнением цен... исходя
// из этой страницы я ничего не понимаю». Старое сравнение группировало
// строки счетов по НАЗВАНИЮ позиции у поставщика — у каждого своя
// формулировка, поэтому в каждой группе оказывался один поставщик, один и
// тот же поставщик повторялся по числу присланных счетов, а сравнивались
// суммы строк (количество × цена в таре поставщика), несопоставимые между
// собой. Здесь единица сравнения — ПОЗИЦИЯ ВЕДОМОСТИ (материал раздела
// сметы, к которому привязан запрос), а не строка счёта:
//
//   строка счёта → sourceMaterialId (форма сопоставления в переписке или
//   привязка прямо из ячейки этой таблицы)
//   цена за единицу сметы (unitPrice, с НДС) × объём ведомости = стоимость
//   покрытия — одинаковый объём у всех, суммы сопоставимы.
//
// Таблица: строки — позиции ведомости, столбцы — поставщики, приславшие КП.
// На пару «позиция × поставщик» берётся ПОСЛЕДНЯЯ по времени строка с ценой
// из его счетов (обновлённый счёт вытесняет старый сам собой; наша же
// ведомость, распознанная как счёт без цен, ничего не вытесняет). Расчёт —
// priceComparisonModel.ts, печать и письмо — priceComparisonPrint.ts.
//
// Минимума цены здесь нет намеренно (владелец, тем же днём: «минимальную
// цену не показывай, он считает по аналогам, которые не подойдут. Я отберу
// позиции на утверждение и уже от них посчитаешь сумму поставки») —
// зелёным подсвечено только то, что человек отобрал кнопкой «Выбрать»
// (SupplierRequest.proposal), сумма считается только по отобранному, и
// именно это уходит в лист согласования, PDF и письмо руководителю стройки.
// Вместо минимума — разница к ОТОБРАННОМУ («+36 %»): это сравнение с тем,
// что человек уже выбрал сам, а не автоматический победитель.
//
// Владелец, 2026-09-15 (вечер, «делай всё и на прод» по списку идей):
//  • «не предложено» больше не врёт — счёт без привязки виден в шапке
//    столбца и в ячейках, привязать строку можно прямо из ячейки, а ИИ
//    предлагает сопоставление всех строк разом (человек подтверждает);
//  • условия, дата счёта и доставка — в шапке столбца, рядом с решением;
//  • «всё у одного» в футере — полный заказ у поставщика с доставкой;
//  • стадия согласования: отправить письмом руководителю, утверждено /
//    возвращено, снимок цен на момент отправки;
//  • вид «по позициям» (раскладка PDF) как альтернатива матрице.

const KIND_TONE: Record<PurchaseItemMatchKind, string> = {
  exact: 'bg-success-bg text-success',
  alternative: 'bg-warning-bg text-warning',
  check: 'bg-danger-bg text-danger',
  delivery: 'bg-surface-muted text-ink-muted',
};

const KIND_CYCLE: PurchaseItemMatchKind[] = ['exact', 'alternative', 'check'];

// Ниже этого порога автосопоставление (шаг 5 плана закупок) просит человека
// взглянуть. 0.8 выбрано по живому прогону на счёте КраскиТорг 2026-09-16:
// уверенность там разложилась от 0.3 до 0.7, и каждая строка в этом диапазоне
// действительно требовала решения человека (другой бренд, фасадная краска
// вместо потолочной, колеровка без своей позиции). Единицу и 0.9 модель
// ставит, только когда совпали бренд, размер и объём.
const MATCH_CONFIDENCE_THRESHOLD = 0.8;

// Ячейку помечаем «проверить», только когда есть за что: либо модель сама
// разметила строку как расхождение, либо уверенность низкая. У строк,
// сопоставленных человеком, confidence нет вовсе — они не «непроверенные».
function needsReview(cell: { kind: PurchaseItemMatchKind; matchConfidence: number | null }): boolean {
  if (cell.kind === 'check') return true;
  return cell.matchConfidence != null && cell.matchConfidence < MATCH_CONFIDENCE_THRESHOLD;
}

// Условия поставки как отдельные значения. Показываем только то, что реально
// извлеклось: пустой чип «срок не указан» рядом с четырьмя другими
// превратил бы шапку в кашу — отсутствие условия и так видно по тому, что
// его нет.
function TermChips({ terms }: { terms: QuoteTerms | null }) {
  if (!terms) return null;
  const chips: string[] = [];
  if (terms.leadTimeDays != null) chips.push(`срок ${terms.leadTimeDays} дн.`);
  if (terms.availability === 'in_stock') chips.push('в наличии');
  if (terms.availability === 'on_order') chips.push('под заказ');
  if (terms.prepaymentPercent != null) {
    chips.push(terms.prepaymentPercent === 0 ? 'оплата по факту' : `предоплата ${terms.prepaymentPercent}%`);
  }
  // Доставку числом уже показывает соседний чип (он считается и из строки
  // счёта), здесь — только словесное условие вроде «бесплатно от 50 000».
  if (terms.deliveryTerms) chips.push(terms.deliveryTerms);
  if (terms.vatIncluded === false) chips.push('цены без НДС');
  if (terms.minOrder) chips.push(`мин. заказ: ${terms.minOrder}`);
  if (terms.validUntil) chips.push(`цена до ${terms.validUntil}`);
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-primary-soft px-1.5 py-px text-primary">
          {c}
        </span>
      ))}
    </>
  );
}

// Пометка про НДС у цены (шаг 7 плана закупок). Показываем только там, где
// это меняет решение: цена без налога (поставщик выглядит дешевле, чем есть)
// и цена, пересчитанная кодом (число в ячейке не равно числу в документе, и
// человек должен понимать почему). «Про НДС не сказано» не помечаем — это
// состояние почти всех счетов, и чип превратился бы в фон.
function VatTag({ vat, rate }: { vat: CellVat; rate: number | null }) {
  if (vat === 'converted') {
    return (
      <span
        className="inline-block rounded-full bg-primary-soft px-1.5 py-px text-[10.5px] font-semibold leading-relaxed text-primary"
        title={`В счёте цены без НДС. Цена за единицу приведена к цене с НДС по ставке ${rate}%.`}
      >
        +{rate}% НДС
      </span>
    );
  }
  if (vat === 'net') {
    return (
      <span
        className="inline-block rounded-full bg-danger-bg px-1.5 py-px text-[10.5px] font-semibold leading-relaxed text-danger"
        title={
          rate != null
            ? `В счёте цены без НДС (${rate}%), а цена за единицу не пересчитана — сравнение занижает этого поставщика. Пересчитайте её в форме сопоставления.`
            : 'В счёте цены без НДС, ставка не названа — цена за единицу не пересчитана, сравнение занижает этого поставщика.'
        }
      >
        без НДС
      </span>
    );
  }
  return null;
}

function ReviewTag({ confidence }: { confidence: number | null }) {
  return (
    <span
      className="inline-block rounded-full bg-warning-bg px-1.5 py-px text-[10.5px] font-semibold leading-relaxed text-warning"
      title={
        confidence != null
          ? `Сопоставлено автоматически, уверенность ${Math.round(confidence * 100)}%. Проверьте строку счёта.`
          : 'Есть расхождение — стоит уточнить у поставщика.'
      }
    >
      проверить
    </span>
  );
}

const SENT_TO_STORAGE_KEY = 'priceComparison.proposalSentTo';

// Кто готовит предложение: вошедший сотрудник + отдел (владелец, 2026-09-15:
// «не отдел снабжения, а бэкофис»). emailSignature() — тот же разворот
// рабочего никнейма в полное имя, что и в подписи писем поставщикам.
export function preparedBy(): string {
  // getCurrentProfile() возвращает undefined, пока справочник профилей не
  // загрузился (типы этого не отражают, а emailSignature читает displayName
  // без проверки) — подпись не должна ронять всю карточку сравнения.
  const name = getCurrentProfile() ? emailSignature() : '';
  return name ? `${name}, бэкофис` : 'Бэкофис';
}

function KindTag({ kind, onClick, title }: { kind: PurchaseItemMatchKind; onClick?: () => void; title?: string }) {
  const label = kind === 'exact' ? 'ровно' : PURCHASE_ITEM_MATCH_KIND_LABELS[kind];
  const className = cn('inline-block rounded-full px-1.5 py-px text-[10.5px] font-semibold leading-relaxed', KIND_TONE[kind], onClick && 'cursor-pointer hover:ring-1 hover:ring-current');
  if (!onClick) return <span className={className}>{label}</span>;
  return (
    <button type="button" onClick={onClick} className={className} title={title}>
      {label}
    </button>
  );
}

// Текст с URL внутри → текст со ссылками-доменами (владелец: в примечании
// позиции лежит ссылка на образец целиком, полстроки URL).
function NoteWithLinks({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>;
        const url = part.replace(/[).,;]+$/, '');
        const tail = part.slice(url.length);
        return (
          <span key={i}>
            <a href={hrefOf(url)} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid">
              {hostOf(url)}
            </a>
            {tail}
          </span>
        );
      })}
    </span>
  );
}

function ProductLink({ url, label = 'карточка товара' }: { url: string; label?: string }) {
  return (
    <a
      href={hrefOf(url)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
    >
      <Link2 className="h-3 w-3" /> {label}
    </a>
  );
}

interface ItemPatch {
  sourceMaterialId?: string | null;
  matchKind?: PurchaseItemMatchKind;
  unitPrice?: number | null;
  matchNote?: string;
  productUrl?: string;
  // Чем считали НДС, когда получали цену за единицу (шаг 7 плана закупок):
  // строка запоминает основание, иначе сравнение не отличит «пересчитано»
  // от «забыли пересчитать» и пометит цену как заниженную.
  vatIncluded?: boolean | null;
  vatRate?: number | null;
}

interface SuggestionRow {
  lineId: string;
  offerId: string;
  supplierName: string;
  item: PurchaseItem;
  // Основание НДС строки — то же, с которым считалась цена (см. vatOf).
  vat: { vatIncluded: boolean | null; vatRate: number | null; countryRate: number | null };
  positionId: string;
  kind: 'exact' | 'alternative' | 'check' | 'delivery' | 'none';
  unitPrice: string;
  note: string;
  accepted: boolean;
}

export function PriceComparisonCard({
  request,
  positions,
  offers,
  emails,
  quotes,
  rate,
  estimates,
  legalEntityCountry,
  onOpenDetail,
  onRequestSaved,
  onQuotesChange,
  onOfferUpdated,
  onExportBestPrices,
  renderBadges,
}: {
  request: SupplierRequest;
  // Материалы раздела сметы, к которому привязан запрос, — то, что реально
  // рассылалось поставщикам как ведомость (см. lib/ledgerSync.ts).
  positions: EstimateMaterial[];
  offers: SupplierOffer[];
  emails: SupplierOfferEmail[];
  quotes: SupplierQuote[];
  rate: ExchangeRate | undefined;
  // Все сметы — чтобы предложить раздел категории без привязки.
  estimates: Estimate[];
  // Страна юрлица, от которого идёт закупка (SupplierRequest.legalEntityId →
  // LegalEntity.country). Нужна ровно для одного: если счёт сказал «цены без
  // НДС», но ставку не назвал, — взять ставку по стране (шаг 7 плана
  // закупок). Пусто — пересчёта не будет, цена останется как в документе с
  // пометкой «без НДС».
  legalEntityCountry: string | null;
  onOpenDetail: (o: SupplierOffer) => void;
  onRequestSaved: (r: SupplierRequest) => void;
  onQuotesChange: (update: (prev: SupplierQuote[]) => SupplierQuote[]) => void;
  onOfferUpdated: (o: SupplierOffer) => void;
  // Открыть выгрузку «лучшие цены: оригинал и аналог» уже на этой поставке.
  // Сам диалог живёт на странице: он умеет и охват «все поставки».
  onExportBestPrices?: () => void;
  // Бейджи верификации/благонадёжности живут в Suppliers.tsx вместе со своим
  // состоянием — сюда приходят готовыми.
  renderBadges: (o: SupplierOffer) => ReactNode;
}) {
  const [country, setCountry] = useState<string>(SUPPLIER_COUNTRIES[0]);
  const [view, setView] = useState<'Таблица' | 'По позициям'>('Таблица');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickMatch, setQuickMatch] = useState<{ offerId: string; positionId: string } | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[] | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sectionPick, setSectionPick] = useState('');

  const offersInCountry = offers.filter((o) => (o.country || SUPPLIER_COUNTRIES[0]) === country);
  const confirmed = offersInCountry.filter((o) => offerCommunicationStatus(o, emails) === 'confirmed');

  const quotesByOffer = useMemo(() => {
    const map = new Map<string, SupplierQuote[]>();
    [...quotes]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((q) => map.set(q.offerId, [...(map.get(q.offerId) ?? []), q]));
    return map;
  }, [quotes]);

  const columns = useMemo(() => {
    const cols = buildColumns(confirmed, quotesByOffer, positions, rate);
    // Порядок столбцов — по числу закрытых позиций, потом по имени; от цены
    // не зависит (см. шапку файла про минимум).
    return cols.sort((a, b) => b.cells.size - a.cells.size || a.offer.name.localeCompare(b.offer.name, 'ru'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed.map((o) => o.id + o.items.length).join(','), quotesByOffer, positions, rate]);

  // Воронка запроса — по всем поставщикам выбранной страны, не только по
  // приславшим КП (владелец: «сколько отправлено — главная отправная точка»).
  const funnel = useMemo(() => {
    const ids = new Set(offersInCountry.map((o) => o.id));
    const mine = emails.filter((e) => ids.has(e.offerId));
    const out = mine.filter((e) => e.direction === 'out');
    const inbound = mine.filter((e) => e.direction === 'in');
    const sentIds = new Set(out.map((e) => e.offerId));
    const repliedIds = new Set(inbound.map((e) => e.offerId));
    const dates = mine.map((e) => e.createdAt).sort();
    const quotesCount = confirmed.reduce((a, o) => a + (quotesByOffer.get(o.id)?.length ?? 0), 0);
    const pricedPositions = positions.filter((p) => columns.some((c) => c.cells.has(p.id))).length;
    // Дожим (шаг 8 плана закупок): из тех, кому написали, кого ещё
    // дожимаем, кто отказался и кто так и не ответил. Без этих трёх чисел
    // разрыв между «отправлено» и «ответили» ничего не объясняет.
    const followup = followupCounts(offersInCountry, emails, request.replyDueDays);
    return {
      followup,
      sent: sentIds.size,
      letters: out.length,
      replied: repliedIds.size,
      repliedNoQuote: [...repliedIds].filter((id) => !confirmed.some((o) => o.id === id)).length,
      confirmed: confirmed.length,
      quotesCount,
      pricedPositions,
      first: dates[0] ?? null,
      last: dates.length > 0 ? dates[dates.length - 1] : null,
    };
  }, [offersInCountry, emails, confirmed, quotesByOffer, positions, columns, request.replyDueDays]);

  const proposal = request.proposal ?? {};
  const review = request.review;
  const columnById = new Map(columns.map((c) => [c.offer.id, c]));

  const picked = pickLines(positions, proposal, columnById);
  const pickedCells = picked.filter((x): x is { position: EstimateMaterial; cell: Cell } => !!x.cell);
  const pickedOfferIds = new Set(pickedCells.map((x) => x.cell.offerId));
  const pickedParts: MoneyPart[] = pickedCells.map((x) => ({ amount: x.cell.unitPrice * (x.position.quantity ?? 0), currency: x.cell.currency }));
  const pickedDelivery: MoneyPart[] = [...pickedOfferIds]
    .map((id) => columnById.get(id))
    .filter((c): c is Column => !!c && c.delivery != null)
    .map((c) => ({ amount: c.delivery!, currency: c.offer.currency }));
  const kinds = pickedCells.reduce(
    (acc, x) => ({ ...acc, [x.cell.kind]: (acc[x.cell.kind] ?? 0) + 1 }),
    {} as Partial<Record<PurchaseItemMatchKind, number>>,
  );
  const total = sumMoney([...pickedParts, ...pickedDelivery], rate);
  const pickedCellByPosition = new Map(pickedCells.map((x) => [x.position.id, x.cell]));

  const unmatchedAll: { line: UnmatchedLine; offer: SupplierOffer }[] = columns.flatMap((c) => c.unmatched.map((line) => ({ line, offer: c.offer })));
  const unmatchedSuppliers = columns.filter((c) => c.unmatched.length > 0);

  // Сумма после отправки разошлась со снимком — новый счёт поставщика
  // поменял цены, руководитель утверждал другое.
  const snapshotDrift = review?.snapshot && review.status !== 'draft' && review.snapshot.total !== total ? review.snapshot.total : null;

  const doc = (): ComparisonDoc => ({
    request,
    positions,
    country,
    columns,
    columnById,
    picked,
    pickedCells,
    pickedOfferIds,
    pickedParts,
    pickedDelivery,
    kinds,
    funnel,
    rate,
    preparedBy: preparedBy(),
    total,
  });

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setSaving(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err, label));
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  async function saveProposal(next: SupplierProposal) {
    await run('Не удалось сохранить отбор', async () => onRequestSaved(await updateSupplierRequestProposal(request.id, next)));
  }

  function togglePick(positionId: string, cell: Cell) {
    const next = { ...proposal };
    if (next[positionId]?.offerId === cell.offerId) delete next[positionId];
    else next[positionId] = { offerId: cell.offerId, itemId: cell.itemId };
    void saveProposal(next);
  }

  function toggleColumn(col: Column) {
    const all = [...col.cells.keys()].every((pid) => proposal[pid]?.offerId === col.offer.id);
    const next = { ...proposal };
    col.cells.forEach((cell, pid) => {
      if (all) delete next[pid];
      else next[pid] = { offerId: col.offer.id, itemId: cell.itemId };
    });
    void saveProposal(next);
  }

  // Правка строки счёта из таблицы: и в КП, и в позициях карточки — это
  // одни и те же объекты с теми же id (их пишет одним списком
  // api/_invoiceApply.js), править нужно оба списка.
  async function applyPatches(patches: { offerId: string; itemId: string; patch: ItemPatch }[]) {
    const byOffer = new Map<string, Map<string, ItemPatch>>();
    for (const p of patches) {
      if (!byOffer.has(p.offerId)) byOffer.set(p.offerId, new Map());
      byOffer.get(p.offerId)!.set(p.itemId, { ...(byOffer.get(p.offerId)!.get(p.itemId) ?? {}), ...p.patch });
    }
    const apply = (items: PurchaseItem[], map: Map<string, ItemPatch>) =>
      items.map((it) => (map.has(it.id) ? { ...it, ...map.get(it.id)! } : it));
    for (const [offerId, map] of byOffer) {
      const offer = offers.find((o) => o.id === offerId);
      if (!offer) continue;
      for (const quote of quotesByOffer.get(offerId) ?? []) {
        if (!quote.items.some((it) => map.has(it.id))) continue;
        const items = apply(quote.items, map);
        await updateSupplierQuoteItems(quote.id, items);
        onQuotesChange((prev) => prev.map((q) => (q.id === quote.id ? { ...q, items } : q)));
      }
      if (offer.items.some((it) => map.has(it.id))) {
        const items = apply(offer.items, map);
        await updateSupplierOfferItems(offer.id, items);
        onOfferUpdated({ ...offer, items });
      }
    }
  }

  function cycleKind(cell: Cell) {
    const next = KIND_CYCLE[(KIND_CYCLE.indexOf(cell.kind) + 1) % KIND_CYCLE.length];
    void run('Не удалось изменить вид соответствия', () => applyPatches([{ offerId: cell.offerId, itemId: cell.itemId, patch: { matchKind: next } }]));
  }

  // Что известно про НДС в строке счёта: сначала сама строка (её проставляет
  // запись счёта), потом условия КП, потом условия карточки. Нужно, чтобы
  // цена за единицу сметы всегда получалась «с НДС» — по этому соглашению
  // живёт всё сравнение цен.
  function vatOf(line: UnmatchedLine, o: SupplierOffer) {
    const quote = line.quoteId ? quotes.find((q) => q.id === line.quoteId) : undefined;
    const terms = quote?.terms ?? o.terms ?? null;
    return {
      vatIncluded: line.item.vatIncluded ?? terms?.vatIncluded ?? null,
      vatRate: line.item.vatRate ?? terms?.vatRate ?? null,
      countryRate: vatRateForCountry(legalEntityCountry),
    };
  }

  async function suggestMatches() {
    if (unmatchedAll.length === 0) return;
    setSuggesting(true);
    setError(null);
    try {
      // action внутри supplier-web-search — лимит 12 функций Vercel Hobby.
      const resp = await authFetch('/api/supplier-web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest-matches',
          positions: positions.map((p) => ({ id: p.id, name: p.name, unit: p.unit, quantity: p.quantity, note: p.note, consumption: p.consumption ?? null, consumptionUnit: p.consumptionUnit ?? '' })),
          lines: unmatchedAll.map(({ line, offer }) => ({
            id: line.item.id,
            supplier: offer.name,
            name: line.item.name,
            unit: line.item.unit,
            quantity: line.item.quantity,
            price: line.item.price,
            // Тара строки, если её распознал счёт (шаг 7 плана закупок):
            // без неё модели остаётся выковыривать объём из названия.
            packQty: line.item.packQty ?? null,
            packUnit: line.item.packUnit ?? '',
            context: [line.quoteTitle, offer.termsNote].filter(Boolean).join(' · '),
          })),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string; matches?: { lineId: string; positionId: string | null; kind: SuggestionRow['kind']; unitPrice: number | null; note: string }[] };
      if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);
      const byLine = new Map((data.matches ?? []).map((m) => [m.lineId, m]));
      setSuggestions(
        unmatchedAll.map(({ line, offer }) => {
          const m = byLine.get(line.item.id);
          const positionId = m?.positionId ?? line.item.sourceMaterialId ?? '';
          const position = positions.find((p) => p.id === positionId);
          // Модель считает цену в той же базе НДС, в какой дан счёт (так ей
          // и сказано в промпте), а приведение к цене с НДС — дело кода:
          // налог по документу считается, а не угадывается.
          const vat = vatOf(line, offer);
          const guessed = position ? guessUnitPrice(line.item, position, vat) : null;
          const fromModel = m?.unitPrice != null ? grossUp(m.unitPrice, vat, vat.countryRate).price : null;
          const unitPrice = fromModel ?? guessed?.unitPrice ?? null;
          const kind: SuggestionRow['kind'] = m ? m.kind : positionId ? 'check' : 'none';
          return {
            lineId: line.item.id,
            offerId: offer.id,
            supplierName: offer.name,
            item: line.item,
            vat,
            positionId: kind === 'delivery' || kind === 'none' ? '' : positionId,
            kind,
            unitPrice: unitPrice != null ? String(unitPrice) : '',
            note: m?.note ?? '',
            accepted: kind !== 'none',
          };
        }),
      );
      setShowUnmatched(true);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось получить подсказку сопоставления'));
    } finally {
      setSuggesting(false);
    }
  }

  async function applySuggestions() {
    if (!suggestions) return;
    const rows = suggestions.filter((r) => r.accepted && (r.kind === 'delivery' || (r.positionId && r.kind !== 'none')));
    const patches = rows.map((r) => {
      const unitPrice = r.unitPrice ? Number(r.unitPrice) : NaN;
      const patch: ItemPatch =
        r.kind === 'delivery'
          ? { sourceMaterialId: null, matchKind: 'delivery', unitPrice: null, matchNote: r.note || undefined }
          : {
              sourceMaterialId: r.positionId,
              matchKind: r.kind as PurchaseItemMatchKind,
              unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
              matchNote: r.note || undefined,
              ...(r.vat.vatIncluded != null || r.vat.vatRate != null
                ? { vatIncluded: r.vat.vatIncluded, vatRate: r.vat.vatRate ?? (r.vat.vatIncluded === false ? r.vat.countryRate : null) }
                : {}),
            };
      return { offerId: r.offerId, itemId: r.lineId, patch };
    });
    const ok = await run('Не удалось сохранить сопоставление', () => applyPatches(patches).then(() => true));
    if (ok) setSuggestions(null);
  }

  async function setReview(next: SupplierProposalReview | null) {
    await run('Не удалось сохранить статус согласования', async () => onRequestSaved(await updateSupplierRequestReview(request.id, next)));
  }

  async function bindSection(sectionId: string) {
    const candidate = sectionCandidates(request, estimates).find((c) => c.section.id === sectionId);
    if (!candidate) return;
    await run('Не удалось привязать раздел сметы', async () =>
      onRequestSaved(
        await updateSupplierRequestSection(request.id, { estimateId: candidate.estimate.id, sectionId: candidate.section.id, sectionTitle: candidate.section.title }),
      ),
    );
  }

  function exportPdf() {
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
      setError('Браузер заблокировал окно печати — разрешите всплывающие окна для этого сайта.');
      return;
    }
    win.document.write(buildPrintHtml(doc()));
    win.document.close();
    win.focus();
    // Ждём подгрузку шрифта: без паузы Safari печатает системным.
    setTimeout(() => win.print(), 500);
  }

  const emptyPositions = positions.length === 0;
  const candidates = emptyPositions ? sectionCandidates(request, estimates) : [];
  const suggestedCandidate = candidates.find((c) => c.suggested);

  // Сводка по строке: сколько «ровно / аналог / уточнить» и предупреждение,
  // когда ровно по ведомости не дал никто (Estima rw10: фабрика держит
  // защиту проекта, все прислали замены).
  function rowSummary(p: EstimateMaterial) {
    const cells = columns.map((c) => c.cells.get(p.id)).filter((c): c is Cell => !!c);
    const count = (k: PurchaseItemMatchKind) => cells.filter((c) => c.kind === k).length;
    return { offered: cells.length, exact: count('exact'), alternative: count('alternative'), check: count('check') };
  }

  function RowSummary({ p }: { p: EstimateMaterial }) {
    const s = rowSummary(p);
    if (s.offered === 0) return <span className="mt-1 block text-[11px] text-ink-faint">цен пока нет</span>;
    return (
      <span className={cn('mt-1 block text-[11px]', s.exact === 0 ? 'font-semibold text-warning' : 'text-ink-muted')}>
        {s.exact === 0 ? '«ровно» нет ни у кого · ' : ''}
        {s.exact ? `ровно ${s.exact}` : ''}
        {s.exact && (s.alternative || s.check) ? ' · ' : ''}
        {s.alternative ? `аналог ${s.alternative}` : ''}
        {s.alternative && s.check ? ' · ' : ''}
        {s.check ? `уточнить ${s.check}` : ''}
      </span>
    );
  }

  function DeltaLabel({ cell, p }: { cell: Cell; p: EstimateMaterial }) {
    const pickedCell = pickedCellByPosition.get(p.id);
    if (!pickedCell || pickedCell.offerId === cell.offerId) return null;
    const delta = deltaToPicked(cell, pickedCell);
    if (delta == null) return null;
    return (
      <span className={cn('block text-[11px] font-semibold tabular-nums', delta > 0.005 ? 'text-ink-muted' : delta < -0.005 ? 'text-success' : 'text-ink-faint')}>
        {formatDelta(delta)} к отобранному
      </span>
    );
  }

  function ShortfallLabel({ cell, p }: { cell: Cell; p: EstimateMaterial }) {
    if (cell.quotedQuantity == null || p.quantity == null || !sameUnit(cell.quotedUnit, p.unit)) return null;
    if (cell.quotedQuantity >= p.quantity * 0.9) return null;
    return (
      <span className="block text-[11px] font-semibold text-warning">
        в счёте {cell.quotedQuantity.toLocaleString('ru-RU')} из {p.quantity.toLocaleString('ru-RU')} {p.unit}
      </span>
    );
  }

  function PickButton({ cell, p, className }: { cell: Cell; p: EstimateMaterial; className?: string }) {
    const isPicked = proposal[p.id]?.offerId === cell.offerId;
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => togglePick(p.id, cell)}
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
          isPicked ? 'border-success bg-success text-white' : 'border-border-strong bg-surface text-ink hover:border-success hover:text-success',
          className,
        )}
      >
        {isPicked ? '✓ Отобрано' : 'Выбрать'}
      </button>
    );
  }

  function CellBody({ cell, p, col }: { cell: Cell; p: EstimateMaterial; col: Column }) {
    const isPicked = proposal[p.id]?.offerId === col.offer.id;
    return (
      <>
        <button
          type="button"
          onClick={() => onOpenDetail(col.offer)}
          title={`Открыть счёт: ${cell.quoteTitle}`}
          className={cn('block text-left font-semibold hover:underline', isPicked ? 'text-success' : 'text-ink')}
        >
          {formatUnit(cell.unitPrice, cell.currency)}
          <span className="text-[11px] font-medium text-ink-faint"> / {p.unit || 'ед.'}</span>
        </button>
        {p.quantity != null && <span className="block text-xs text-ink-muted">{formatMoney(cell.unitPrice * p.quantity, cell.currency)} на объём</span>}
        <DeltaLabel cell={cell} p={p} />
        <ShortfallLabel cell={cell} p={p} />
        <span className="mt-1 block text-[11.5px] leading-snug text-ink">
          <KindTag kind={cell.kind} onClick={() => cycleKind(cell)} title="Нажмите, чтобы сменить вид: ровно → аналог → уточнить" />{' '}
          {needsReview(cell) && cell.kind !== 'check' && <ReviewTag confidence={cell.matchConfidence} />}{' '}
          <VatTag vat={cell.vat} rate={cell.vatRate} /> {cell.note}
        </span>
        {cell.productUrl && (
          <span className="mt-1 block">
            <ProductLink url={cell.productUrl} />
          </span>
        )}
      </>
    );
  }

  // Привязка строки счёта прямо из пустой ячейки (владелец: Грес-дизайн дал
  // самые низкие цены на все четыре позиции, а таблица показывала шесть
  // «не предложено», потому что строки никто не сопоставил).
  function QuickMatch({ col, p }: { col: Column; p: EstimateMaterial }) {
    const [lineId, setLineId] = useState(col.unmatched.find((l) => l.item.sourceMaterialId === p.id)?.item.id ?? col.unmatched[0]?.item.id ?? '');
    const line = col.unmatched.find((l) => l.item.id === lineId) ?? null;
    const guess = line ? guessUnitPrice(line.item, p) : null;
    const [unitPrice, setUnitPrice] = useState(guess ? String(guess.unitPrice) : line?.item.unitPrice ? String(line.item.unitPrice) : '');
    const [kind, setKind] = useState<PurchaseItemMatchKind>(line?.item.matchKind && line.item.matchKind !== 'delivery' ? line.item.matchKind : 'exact');
    const [note, setNote] = useState(line?.item.matchNote ?? '');
    const price = Number(unitPrice);
    const canSave = !!line && Number.isFinite(price) && price > 0;

    function pickLine(id: string) {
      setLineId(id);
      const l = col.unmatched.find((x) => x.item.id === id);
      const g = l ? guessUnitPrice(l.item, p) : null;
      setUnitPrice(g ? String(g.unitPrice) : l?.item.unitPrice ? String(l.item.unitPrice) : '');
    }

    async function save() {
      if (!line) return;
      const ok = await run('Не удалось привязать строку', () =>
        applyPatches([{ offerId: col.offer.id, itemId: line.item.id, patch: { sourceMaterialId: p.id, matchKind: kind, unitPrice: price, matchNote: note.trim() || undefined } }]).then(() => true),
      );
      if (ok) setQuickMatch(null);
    }

    return (
      <div className="flex flex-col gap-1.5 rounded-control border border-border-strong bg-surface p-2 text-xs">
        <select value={lineId} onChange={(e) => pickLine(e.target.value)} className="rounded-control border border-border bg-surface-muted px-2 py-1 text-xs text-ink outline-none focus:border-primary">
          {col.unmatched.map((l) => (
            <option key={l.item.id} value={l.item.id}>
              {l.item.name} · {l.item.quantity ?? '—'} {l.item.unit} · {l.item.price != null ? formatUnit(l.item.price, col.offer.currency) : ''}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            step="any"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0"
            className="w-24 rounded-control border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <span className="text-ink-muted">за {p.unit || 'ед.'} сметы, с НДС</span>
        </div>
        {guess ? (
          <span className="text-ink-faint">подсказка: {guess.explanation}</span>
        ) : line && !sameUnit(line.item.unit, p.unit) ? (
          <span className="text-warning">единицы разные ({line.item.unit || '?'} → {p.unit || '?'}): цену за единицу сметы посчитайте руками или задайте расход у материала сметы</span>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={kind} onChange={(e) => setKind(e.target.value as PurchaseItemMatchKind)} className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary">
            {KIND_CYCLE.map((k) => (
              <option key={k} value={k}>
                {PURCHASE_ITEM_MATCH_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="чем отличается"
            className="min-w-0 flex-1 rounded-control border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={!canSave || saving} onClick={() => void save()} className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40">
            Сохранить
          </button>
          <button type="button" onClick={() => setQuickMatch(null)} className="text-[11px] font-medium text-ink-muted hover:text-ink">
            Отмена
          </button>
        </div>
      </div>
    );
  }

  function EmptyCell({ col, p }: { col: Column; p: EstimateMaterial }) {
    if (quickMatch?.offerId === col.offer.id && quickMatch.positionId === p.id) return <QuickMatch col={col} p={p} />;
    if (col.unmatched.length === 0) {
      return (
        <span className="text-ink-faint">
          —<span className="block text-xs">нет в счёте</span>
        </span>
      );
    }
    return (
      <span className="block">
        <span className="block text-xs text-ink-muted">
          в счёте {col.unmatched.length} {col.unmatched.length === 1 ? 'строка' : col.unmatched.length < 5 ? 'строки' : 'строк'} без привязки
        </span>
        <button
          type="button"
          onClick={() => setQuickMatch({ offerId: col.offer.id, positionId: p.id })}
          className="mt-1 rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:border-ink"
        >
          Привязать строку
        </button>
      </span>
    );
  }

  function ColumnHeader({ col }: { col: Column }) {
    const mine = [...col.cells.keys()].filter((pid) => proposal[pid]?.offerId === col.offer.id).length;
    const all = col.cells.size;
    const age = quoteAgeDays(col.lastQuoteAt);
    return (
      <>
        <span className="block text-[13px] font-bold text-ink">{col.offer.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1">{renderBadges(col.offer)}</span>
        <span className="mt-1 flex flex-wrap gap-1 text-[10.5px] font-medium">
          {col.lastQuoteAt && (
            <span className={cn('rounded-full px-1.5 py-px', age != null && age > STALE_QUOTE_DAYS ? 'bg-warning-bg text-warning' : 'bg-surface text-ink-muted')}>
              счёт от {formatDate(col.lastQuoteAt)}
              {age != null && age > STALE_QUOTE_DAYS ? `, ${age} дн.` : ''}
            </span>
          )}
          {col.quotesCount > 1 && <span className="rounded-full bg-surface px-1.5 py-px text-ink-muted">{col.quotesCount} {col.quotesCount < 5 ? 'счёта' : 'счетов'}, последние цены</span>}
          <span className={cn('rounded-full px-1.5 py-px', col.delivery != null ? 'bg-surface text-ink' : 'bg-surface text-ink-faint')}>
            {col.delivery != null ? `доставка ${formatMoney(col.delivery, col.offer.currency)}` : 'доставка не названа'}
          </span>
          {col.unmatched.length > 0 && (
            <span className="rounded-full bg-warning-bg px-1.5 py-px text-warning">
              {col.unmatched.length} {col.unmatched.length === 1 ? 'строка' : col.unmatched.length < 5 ? 'строки' : 'строк'} без привязки
            </span>
          )}
          {/* Условия поставки числами (шаг 6 плана закупок): их извлекает
              распознавание из счёта и текста письма. Раньше всё это жило одной
              строкой свободного текста ниже — прочитать можно, сравнить два
              предложения по сроку нельзя. */}
          <TermChips terms={col.terms} />
        </span>
        <span className="mt-1 block text-[11px] font-normal leading-snug text-ink" title={col.offer.termsNote || 'Условия не записаны — правятся в карточке поставщика'}>
          {col.offer.termsNote ? <NoteWithLinks text={col.offer.termsNote} className="line-clamp-3" /> : <span className="text-ink-faint">условия не записаны</span>}
          <button type="button" onClick={() => onOpenDetail(col.offer)} className="ml-1 inline-flex align-middle text-ink-faint hover:text-ink" title="Изменить условия в карточке">
            <Pencil className="h-3 w-3" />
          </button>
        </span>
        {all > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={() => toggleColumn(col)}
            className={cn(
              'mt-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
              mine === all ? 'border-success bg-success text-white' : 'border-border-strong bg-surface text-ink hover:border-success hover:text-success',
            )}
          >
            {mine === all ? `✓ Выбраны все ${all}` : `Выбрать все ${all}`}
          </button>
        )}
      </>
    );
  }

  function columnTotals(col: Column) {
    const mine = positions.filter((p) => proposal[p.id]?.offerId === col.offer.id && col.cells.has(p.id));
    const partsPicked: MoneyPart[] = mine.map((p) => ({ amount: col.cells.get(p.id)!.unitPrice * (p.quantity ?? 0), currency: col.cells.get(p.id)!.currency }));
    const covered = positions.filter((p) => col.cells.has(p.id));
    const partsAll: MoneyPart[] = covered.map((p) => ({ amount: col.cells.get(p.id)!.unitPrice * (p.quantity ?? 0), currency: col.cells.get(p.id)!.currency }));
    const delivery: MoneyPart[] = col.delivery != null ? [{ amount: col.delivery, currency: col.offer.currency }] : [];
    return { mine, partsPicked, covered, partsAll, delivery };
  }

  const reviewStatus = review?.status ?? 'draft';

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-ink">{request.title}</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {request.sectionTitle ? `Раздел сметы «${request.sectionTitle}», ` : ''}
            {positions.length} поз.
            {positions.length > 0 && ` · цены за единицу сметы с НДС × объём ведомости`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup options={[...SUPPLIER_COUNTRIES]} value={country} onChange={setCountry} />
          {columns.length > 0 && <ToggleGroup options={['Таблица', 'По позициям']} value={view} onChange={(v) => setView(v as typeof view)} />}
          {Object.keys(proposal).length > 0 && reviewStatus === 'draft' && (
            <Button type="button" variant="ghost" onClick={() => void saveProposal({})} disabled={saving}>
              Очистить отбор
            </Button>
          )}
          {onExportBestPrices && (
            <Button type="button" variant="secondary" icon={<FileDown className="h-4 w-4" />} onClick={onExportBestPrices}>
              Лучшие цены
            </Button>
          )}
          <Button type="button" variant="secondary" icon={<FileDown className="h-4 w-4" />} onClick={exportPdf}>
            На утверждение
          </Button>
        </div>
      </div>

      {/* Воронка запроса */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border md:grid-cols-5">
        {[
          {
            n: funnel.sent,
            sub: funnel.letters
              ? `${funnel.letters} писем${funnel.followup.reminders ? `, из них ${funnel.followup.reminders} напоминаний` : ''}`
              : 'писем ещё не было',
            label: 'Запрос отправлен',
          },
          { n: funnel.replied, sub: `${funnel.repliedNoQuote} без КП`, label: 'Ответили' },
          {
            n: funnel.followup.followingUp,
            sub:
              funnel.followup.declined || funnel.followup.noAnswer
                ? `${funnel.followup.declined} отказались, ${funnel.followup.noAnswer} без ответа`
                : `срок ответа — ${request.replyDueDays} дн.`,
            label: 'Дожимаем',
          },
          { n: funnel.confirmed, sub: `${funnel.quotesCount} счетов`, label: 'КП получено' },
          {
            n: `${funnel.pricedPositions} из ${positions.length}`,
            sub: positions.length ? (unmatchedAll.length ? `${unmatchedAll.length} строк счетов ещё не привязаны` : 'позиций ведомости с ценой') : 'раздел сметы не привязан',
            label: 'Позиций с ценой',
            final: true,
          },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
            <span className={cn('text-2xl font-bold tabular-nums leading-tight', s.final ? 'text-success' : 'text-ink')}>{s.n}</span>
            <span className="text-sm font-semibold text-ink">{s.label}</span>
            <span className="text-xs text-ink-muted">{s.sub}</span>
          </div>
        ))}
      </div>
      {funnel.first && funnel.last && (
        <p className="-mt-2 text-xs text-ink-faint">
          Первое письмо {formatDate(funnel.first)}, последнее {formatDate(funnel.last)}
        </p>
      )}

      {/* Плашки — только про отобранное */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={cn('flex flex-col gap-0.5 rounded-control border px-4 py-3', pickedCells.length > 0 ? 'border-success/30 bg-success-bg' : 'border-border bg-surface-muted')}>
          <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            На утверждение
            {reviewStatus !== 'draft' && (
              <span
                className={cn(
                  'rounded-full px-2 py-px text-[10.5px] normal-case tracking-normal',
                  reviewStatus === 'approved' ? 'bg-success text-white' : reviewStatus === 'returned' ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning',
                )}
              >
                {PROPOSAL_REVIEW_STATUS_LABELS[reviewStatus]}
              </span>
            )}
          </span>
          <span className={cn('text-xl font-bold tabular-nums', pickedCells.length > 0 ? 'text-success' : 'text-ink-faint')}>{pickedCells.length > 0 ? total : '—'}</span>
          <span className="text-xs text-ink-muted">
            {pickedCells.length > 0
              ? `${pickedCells.length} из ${positions.length} позиций, поставщиков: ${pickedOfferIds.size}${pickedDelivery.length ? `, ${pickedDelivery.length === 1 ? 'доставка включена' : `${pickedDelivery.length} доставки включены`}` : ''}`
              : 'нажмите «Выбрать» у нужной цены в таблице'}
          </span>
          {snapshotDrift && <span className="text-xs font-semibold text-danger">Сумма изменилась после отправки: было {snapshotDrift}</span>}
        </div>
        <div className="flex flex-col gap-0.5 rounded-control border border-border bg-surface-muted px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Соответствие ведомости</span>
          <span className="text-xl font-bold tabular-nums text-ink">
            {kinds.exact ?? 0} <span className="text-xs font-medium text-ink-muted">ровно</span> · {kinds.alternative ?? 0}{' '}
            <span className="text-xs font-medium text-ink-muted">аналог</span> · {kinds.check ?? 0} <span className="text-xs font-medium text-ink-muted">уточнить</span>
          </span>
          <span className="text-xs text-ink-muted">
            {kinds.check ? 'по позициям «уточнить» нужен ответ поставщика до заказа' : kinds.alternative ? 'аналоги согласовать по карточкам товара' : 'среди отобранного всё ровно по ведомости'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-control border border-border bg-surface-muted px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Без выбора</span>
          <span className="text-xl font-bold tabular-nums text-ink">
            {positions.length - pickedCells.length} <span className="text-xs font-medium text-ink-muted">из {positions.length}</span>
          </span>
          <span className="truncate text-xs text-ink-muted">
            {positions.length - pickedCells.length > 0 ? picked.filter((x) => !x.cell).map((x) => x.position.name).join('; ') : 'по каждой позиции выбран поставщик'}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Строки счетов без привязки — заметно и сверху, а не свёрнуто внизу:
          у красок 10 КП и 53 строки лежали тут, а таблица показывала 50 ячеек
          «не предложено». */}
      {!emptyPositions && unmatchedAll.length > 0 && (
        <div className="flex flex-col gap-2 rounded-control border border-warning/40 bg-warning-bg/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-ink">
              <span className="font-semibold">
                {unmatchedAll.length} {unmatchedAll.length === 1 ? 'строка' : unmatchedAll.length < 5 ? 'строки' : 'строк'} счетов
              </span>{' '}
              у {unmatchedSuppliers.length} {unmatchedSuppliers.length === 1 ? 'поставщика' : 'поставщиков'} не привязаны к ведомости и не участвуют в сравнении:{' '}
              {unmatchedSuppliers.map((c) => `${c.offer.name} (${c.unmatched.length})`).join(', ')}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => void suggestMatches()} disabled={suggesting || saving}>
                {suggesting ? 'Думаю…' : suggestions ? 'Предложить заново' : 'Предложить сопоставление'}
              </Button>
              <button type="button" onClick={() => setShowUnmatched((v) => !v)} className="text-xs font-medium text-ink-muted hover:text-ink">
                {showUnmatched ? 'Скрыть строки' : 'Показать строки'}
              </button>
            </span>
          </div>
          {suggestions && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-muted">
                Подсказка модели — проверьте позицию, вид и цену за единицу сметы, снимите галочку с лишнего и нажмите «Применить». В базу ничего не пишется без подтверждения.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                      <th className="py-1 pr-2 font-medium" />
                      <th className="py-1 pr-2 font-medium">Строка счёта</th>
                      <th className="py-1 pr-2 font-medium">Позиция ведомости</th>
                      <th className="py-1 pr-2 font-medium">Вид</th>
                      <th className="py-1 pr-2 font-medium">Цена за ед. сметы</th>
                      <th className="py-1 font-medium">Пометка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((r, idx) => {
                      const position = positions.find((p) => p.id === r.positionId);
                      const unitMismatch = !!position && !sameUnit(r.item.unit, position.unit);
                      const update = (patch: Partial<SuggestionRow>) => setSuggestions((prev) => prev!.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
                      return (
                        <tr key={r.lineId} className={cn('border-t border-border align-top', !r.accepted && 'opacity-50')}>
                          <td className="py-1.5 pr-2">
                            <input type="checkbox" checked={r.accepted} onChange={(e) => update({ accepted: e.target.checked })} />
                          </td>
                          <td className="py-1.5 pr-2 text-ink">
                            <span className="font-medium">{r.supplierName}:</span> {r.item.name}
                            <span className="block text-ink-muted">
                              {r.item.quantity ?? '—'} {r.item.unit} · {r.item.price != null ? formatUnit(r.item.price, offers.find((o) => o.id === r.offerId)?.currency ?? 'RUB') : ''}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2">
                            <select
                              value={r.kind === 'delivery' ? '__delivery' : r.kind === 'none' ? '' : r.positionId}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '__delivery') update({ kind: 'delivery', positionId: '', accepted: true });
                                else if (!v) update({ kind: 'none', positionId: '', accepted: false });
                                else {
                                  const pos = positions.find((p) => p.id === v);
                                  const g = pos ? guessUnitPrice(r.item, pos) : null;
                                  update({ positionId: v, kind: r.kind === 'none' || r.kind === 'delivery' ? 'check' : r.kind, unitPrice: g ? String(g.unitPrice) : r.unitPrice, accepted: true });
                                }
                              }}
                              className="w-full rounded-control border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary"
                            >
                              <option value="">не материал ведомости</option>
                              <option value="__delivery">доставка / транспорт</option>
                              {positions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 pr-2">
                            {r.kind !== 'delivery' && r.kind !== 'none' && (
                              <select value={r.kind} onChange={(e) => update({ kind: e.target.value as SuggestionRow['kind'] })} className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-primary">
                                {KIND_CYCLE.map((k) => (
                                  <option key={k} value={k}>
                                    {PURCHASE_ITEM_MATCH_KIND_LABELS[k]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            {r.kind !== 'delivery' && r.kind !== 'none' && (
                              <>
                                <input
                                  type="number"
                                  step="any"
                                  value={r.unitPrice}
                                  onChange={(e) => update({ unitPrice: e.target.value })}
                                  placeholder="0"
                                  className={cn('w-24 rounded-control border bg-surface px-2 py-1 text-xs outline-none focus:border-primary', !r.unitPrice ? 'border-warning' : 'border-border')}
                                />
                                <span className="ml-1 text-ink-muted">за {position?.unit || 'ед.'}</span>
                                {!r.unitPrice && <span className="block text-warning">{unitMismatch ? `единицы разные (${r.item.unit || '?'} → ${position?.unit || '?'}), без цены в таблицу не попадёт` : 'нужна цена'}</span>}
                              </>
                            )}
                          </td>
                          <td className="py-1.5">
                            {r.kind !== 'delivery' && r.kind !== 'none' && (
                              <input type="text" value={r.note} onChange={(e) => update({ note: e.target.value })} placeholder="чем отличается" className="w-full rounded-control border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void applySuggestions()} disabled={saving || !suggestions.some((r) => r.accepted && (r.kind === 'delivery' || (r.positionId && r.kind !== 'none')))}>
                  Применить {suggestions.filter((r) => r.accepted && (r.kind === 'delivery' || (r.positionId && r.kind !== 'none'))).length}
                </Button>
                <button type="button" onClick={() => setSuggestions(null)} className="text-xs font-medium text-ink-muted hover:text-ink">
                  Отменить
                </button>
              </div>
            </div>
          )}
          {showUnmatched && !suggestions && (
            <div className="flex flex-col gap-1">
              {unmatchedAll.map(({ line, offer }) => (
                <div key={line.item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    <span className="font-medium">{offer.name}:</span> {line.item.name}
                    {line.item.quantity != null && ` · ${line.item.quantity} ${line.item.unit}`}
                    {line.item.sourceMaterialId && <span className="text-warning"> · привязана, но без цены за единицу сметы</span>}
                  </span>
                  <span className="tabular-nums text-ink-muted">{line.item.price != null ? formatUnit(line.item.price, offer.currency) : ''}</span>
                  <button type="button" onClick={() => onOpenDetail(offer)} className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid">
                    <Check className="h-3 w-3" /> В переписке
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {emptyPositions ? (
        <div className="flex flex-col gap-2 text-sm text-ink-muted">
          <p>
            У категории не выбран раздел сметы (или в нём нет материалов) — сравнение строится по позициям ведомости.
            {columns.length > 0 && ` КП уже прислали ${columns.length}: ${columns.map((c) => c.offer.name).join(', ')}.`}
          </p>
          {candidates.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {suggestedCandidate && (
                <span className="text-ink">
                  Похоже, подходит раздел «{suggestedCandidate.section.title}» ({suggestedCandidate.section.materials.length}{' '}
                  {suggestedCandidate.section.materials.length === 1 ? 'материал' : 'материалов'}, {suggestedCandidate.estimate.title || 'смета'}):
                </span>
              )}
              <select value={sectionPick || suggestedCandidate?.section.id || ''} onChange={(e) => setSectionPick(e.target.value)} className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-primary">
                <option value="">— выбрать раздел —</option>
                {candidates.map((c) => (
                  <option key={c.section.id} value={c.section.id}>
                    {c.estimate.title || 'Смета'} · {c.section.title} ({c.section.materials.length})
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" disabled={saving || !(sectionPick || suggestedCandidate)} onClick={() => void bindSection(sectionPick || suggestedCandidate!.section.id)}>
                Привязать
              </Button>
            </div>
          ) : (
            <p className="text-ink-faint">Укажите смету и раздел в настройках категории на вкладке «Поставщики».</p>
          )}
        </div>
      ) : columns.length === 0 ? (
        <p className="text-sm text-ink-faint">Пока никто из «{country}» не прислал КП — переключите страну выше.</p>
      ) : view === 'По позициям' ? (
        // Раскладка PDF на экране: позиция, под ней поставщики строками по
        // возрастанию цены. Ширина не зависит от числа поставщиков.
        <div className="flex flex-col gap-4">
          {positions.map((p) => {
            const offered = columns.filter((c) => c.cells.has(p.id)).sort((a, b) => (a.cells.get(p.id)!.usdUnit ?? a.cells.get(p.id)!.unitPrice) - (b.cells.get(p.id)!.usdUnit ?? b.cells.get(p.id)!.unitPrice));
            const missing = columns.filter((c) => !c.cells.has(p.id));
            return (
              <div key={p.id} className="rounded-control border border-border">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-ink">{p.name}</span>
                    <span className="ml-2 inline-block rounded-full border border-border bg-surface px-2 py-px text-xs font-semibold text-ink">
                      {p.quantity != null ? p.quantity.toLocaleString('ru-RU') : '—'} {p.unit}
                    </span>
                    {p.note && <NoteWithLinks text={p.note} className="block text-xs text-ink-muted" />}
                    <RowSummary p={p} />
                  </div>
                </div>
                {offered.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-ink-faint">Цену на эту позицию не дал никто из приславших КП.</p>
                ) : (
                  <table className="w-full border-collapse text-sm tabular-nums">
                    <tbody>
                      {offered.map((col) => {
                        const cell = col.cells.get(p.id)!;
                        const isPicked = proposal[p.id]?.offerId === col.offer.id;
                        return (
                          <tr key={col.offer.id} className={cn('border-t border-border align-top first:border-t-0', isPicked && 'bg-success-bg shadow-[inset_3px_0_0_var(--color-success)]')}>
                            <td className="w-[26%] px-3 py-2">
                              <button type="button" onClick={() => onOpenDetail(col.offer)} className={cn('text-left font-semibold hover:underline', isPicked ? 'text-success' : 'text-ink')}>
                                {col.offer.name}
                              </button>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1">{renderBadges(col.offer)}</span>
                              <span className="block text-[11px] text-ink-muted">{col.delivery != null ? `доставка ${formatMoney(col.delivery, col.offer.currency)}` : 'доставка не названа'}</span>
                            </td>
                            <td className="px-3 py-2 text-[12px] leading-snug text-ink">
                              <KindTag kind={cell.kind} onClick={() => cycleKind(cell)} title="Нажмите, чтобы сменить вид" />{' '}
                              {needsReview(cell) && cell.kind !== 'check' && <ReviewTag confidence={cell.matchConfidence} />}{' '}
                              <VatTag vat={cell.vat} rate={cell.vatRate} /> {cell.note}
                              {cell.productUrl && (
                                <span className="block">
                                  <ProductLink url={cell.productUrl} />
                                </span>
                              )}
                              <ShortfallLabel cell={cell} p={p} />
                              {col.offer.termsNote && <NoteWithLinks text={col.offer.termsNote} className="mt-0.5 line-clamp-2 block text-[11px] text-ink-muted" />}
                            </td>
                            <td className="w-[18%] whitespace-nowrap px-3 py-2 text-right">
                              <span className={cn('font-semibold', isPicked ? 'text-success' : 'text-ink')}>{formatUnit(cell.unitPrice, cell.currency)}</span>
                              <span className="text-[11px] text-ink-faint"> / {p.unit || 'ед.'}</span>
                              <DeltaLabel cell={cell} p={p} />
                            </td>
                            <td className="w-[16%] whitespace-nowrap px-3 py-2 text-right text-ink-muted">{p.quantity != null ? formatMoney(cell.unitPrice * p.quantity, cell.currency) : '—'}</td>
                            <td className="w-[12%] px-3 py-2 text-right">
                              <PickButton cell={cell} p={p} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {missing.length > 0 && (
                  <p className="border-t border-border px-3 py-1.5 text-xs text-ink-muted">
                    Не предложили:{' '}
                    {missing.map((c, i) => (
                      <span key={c.offer.id}>
                        {i > 0 && ', '}
                        {c.offer.name}
                        {c.unmatched.length > 0 && (
                          <>
                            {' '}
                            <button type="button" onClick={() => { setView('Таблица'); setQuickMatch({ offerId: c.offer.id, positionId: p.id }); }} className="font-semibold text-warning hover:underline">
                              ({c.unmatched.length} строк без привязки — привязать)
                            </button>
                          </>
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="bg-surface-muted text-left text-xs text-ink-muted">
                <th className="sticky left-0 z-10 min-w-[240px] bg-surface-muted px-3 py-2 font-medium">Позиция ведомости</th>
                {columns.map((col) => {
                  const mine = [...col.cells.keys()].filter((pid) => proposal[pid]?.offerId === col.offer.id).length;
                  return (
                    <th key={col.offer.id} className={cn('min-w-[190px] max-w-[260px] px-3 py-2 align-top font-medium', mine > 0 && 'bg-success-bg shadow-[inset_0_3px_0_var(--color-success)]')}>
                      <ColumnHeader col={col} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2.5 shadow-[inset_-1px_0_0_var(--color-border)]">
                    <span className="block font-semibold text-ink">{p.name}</span>
                    {p.note && <NoteWithLinks text={p.note} className="line-clamp-2 block text-xs text-ink-muted" />}
                    <span className="mt-1 inline-block rounded-full border border-border bg-surface-muted px-2 py-px text-xs font-semibold text-ink">
                      {p.quantity != null ? p.quantity.toLocaleString('ru-RU') : '—'} {p.unit}
                    </span>
                    <RowSummary p={p} />
                  </td>
                  {columns.map((col) => {
                    const cell = col.cells.get(p.id);
                    if (!cell) {
                      return (
                        <td key={col.offer.id} className="px-3 py-2.5">
                          <EmptyCell col={col} p={p} />
                        </td>
                      );
                    }
                    const isPicked = proposal[p.id]?.offerId === col.offer.id;
                    return (
                      <td key={col.offer.id} className={cn('px-3 py-2.5', isPicked && 'bg-success-bg shadow-[inset_3px_0_0_var(--color-success)]')}>
                        <CellBody cell={cell} p={p} col={col} />
                        <PickButton cell={cell} p={p} className="mt-1.5 block" />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-muted text-xs">
              <tr className="border-t-2 border-border-strong align-top text-sm">
                <td className="sticky left-0 z-10 bg-surface-muted px-3 py-2 font-bold text-ink">
                  Отобрано у поставщика
                  <span className="block text-xs font-normal text-ink-muted">объём ведомости × цена, с НДС</span>
                </td>
                {columns.map((col) => {
                  const t = columnTotals(col);
                  if (t.mine.length === 0) {
                    return (
                      <td key={col.offer.id} className="px-3 py-2 text-ink-faint">
                        —<span className="block text-xs">ничего не отобрано</span>
                      </td>
                    );
                  }
                  return (
                    <td key={col.offer.id} className="bg-success-bg px-3 py-2 font-bold text-success shadow-[inset_3px_0_0_var(--color-success)]">
                      {sumMoney([...t.partsPicked, ...t.delivery], rate)}
                      <span className="block text-xs font-normal text-ink-muted">
                        {t.mine.length} из {positions.length} позиций{col.delivery != null ? ', с доставкой' : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
              {/* «Всё у одного»: сколько стоил бы полный заказ у поставщика — чтобы
                  сравнить дробление на двоих с двумя доставками и одного на всё. */}
              <tr className="border-t border-border align-top">
                <td className="sticky left-0 z-10 bg-surface-muted px-3 py-2 font-semibold text-ink">
                  Всё у одного
                  <span className="block text-xs font-normal text-ink-muted">все его позиции + доставка</span>
                </td>
                {columns.map((col) => {
                  const t = columnTotals(col);
                  if (t.covered.length === 0) {
                    return (
                      <td key={col.offer.id} className="px-3 py-2 text-ink-faint">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={col.offer.id} className="px-3 py-2 text-ink">
                      <span className="font-semibold">{sumMoney([...t.partsAll, ...t.delivery], rate)}</span>
                      <span className="block text-ink-muted">
                        {t.covered.length === positions.length ? 'все позиции' : `${t.covered.length} из ${positions.length} позиций`}
                        {col.delivery != null ? ', с доставкой' : ', доставка не названа'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!emptyPositions && columns.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-sm border border-border bg-success-bg shadow-[inset_2px_0_0_var(--color-success)]" /> отобрано на утверждение
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KindTag kind="exact" /> та же позиция, что в ведомости
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KindTag kind="alternative" /> другой артикул или бренд
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KindTag kind="check" /> расхождение, нужен ответ поставщика
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ReviewTag confidence={null} /> сопоставил ИИ-закупщик, уверенность ниже {Math.round(MATCH_CONFIDENCE_THRESHOLD * 100)}%
          </span>
          <span className="inline-flex items-center gap-1">
            <VatTag vat="converted" rate={22} /> цена приведена к цене с НДС
          </span>
          <span className="inline-flex items-center gap-1">
            <VatTag vat="net" rate={null} /> счёт без НДС, цена не пересчитана — поставщик выглядит дешевле, чем есть
          </span>
          <span>«+36 %» — разница к цене, отобранной в той же строке. Вид меняется кликом по метке, цена ведёт в карточку поставщика.</span>
        </div>
      )}

      {/* Лист согласования — только когда есть что согласовывать */}
      {pickedCells.length > 0 && (
        <div className="flex flex-col gap-3 rounded-control border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Лист согласования</span>
              <span className="text-base font-bold text-ink">{request.title}: предложение на утверждение</span>
            </div>
            <span className="text-xl font-bold tabular-nums text-success">{total}</span>
          </div>

          {/* Стадия согласования */}
          <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-control px-3 py-2 text-xs', reviewStatus === 'approved' ? 'bg-success-bg' : reviewStatus === 'returned' ? 'bg-danger-bg' : reviewStatus === 'sent' ? 'bg-warning-bg' : 'bg-surface-muted')}>
            <span className="text-ink">
              <span className="font-semibold">{PROPOSAL_REVIEW_STATUS_LABELS[reviewStatus]}</span>
              {review?.sentAt && ` · отправлено ${new Date(review.sentAt).toLocaleDateString('ru-RU')}${review.sentTo ? ` на ${review.sentTo}` : ''}${review.sentBy ? ` (${review.sentBy})` : ''}`}
              {review?.decidedAt && ` · решение ${new Date(review.decidedAt).toLocaleDateString('ru-RU')}`}
              {review?.comment && ` · «${review.comment}»`}
              {snapshotDrift && <span className="block font-semibold text-danger">Сумма изменилась после отправки: было {snapshotDrift}, сейчас {total} — отправьте заново или снимите статус.</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {(reviewStatus === 'draft' || reviewStatus === 'returned') && (
                <Button type="button" icon={<Send className="h-4 w-4" />} onClick={() => setSendOpen(true)} disabled={saving}>
                  Отправить на утверждение
                </Button>
              )}
              {reviewStatus === 'sent' && (
                <>
                  <Button type="button" variant="secondary" onClick={() => setSendOpen(true)} disabled={saving}>
                    Отправить ещё раз
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void setReview({ ...(review ?? { status: 'sent' }), status: 'approved', decidedAt: new Date().toISOString(), comment: undefined })}
                    disabled={saving}
                  >
                    Утверждено
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const comment = window.prompt('Что нужно уточнить (комментарий руководителя)?', review?.comment ?? '') ?? null;
                      if (comment === null) return;
                      void setReview({ ...(review ?? { status: 'sent' }), status: 'returned', decidedAt: new Date().toISOString(), comment: comment.trim() || undefined });
                    }}
                    disabled={saving}
                  >
                    Вернуть на уточнение
                  </Button>
                </>
              )}
              {reviewStatus === 'draft' && (
                <button
                  type="button"
                  onClick={() => void setReview({ status: 'approved', decidedAt: new Date().toISOString(), snapshot: buildSnapshot(picked, columnById, total, pickedDelivery.length ? sumMoney(pickedDelivery, rate) : null) })}
                  disabled={saving}
                  className="text-xs font-medium text-ink-muted hover:text-ink"
                  title="Если руководитель утвердил устно или в мессенджере"
                >
                  Утверждено без письма
                </button>
              )}
              {reviewStatus !== 'draft' && (
                <button type="button" onClick={() => void setReview(null)} disabled={saving} className="text-xs font-medium text-ink-muted hover:text-ink">
                  Снова черновик
                </button>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <table className="w-full border-collapse text-xs tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="py-1 pr-2 font-medium">Позиция</th>
                  <th className="py-1 pr-2 font-medium">Поставщик</th>
                  <th className="py-1 pr-2 text-right font-medium">Цена</th>
                  <th className="py-1 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {picked.map(({ position, cell }) => (
                  <tr key={position.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-ink">{position.name}</span>
                      {cell?.note && <span className="block text-ink-muted">{cell.note}</span>}
                      {cell?.productUrl && <ProductLink url={cell.productUrl} label="карточка" />}
                    </td>
                    {cell ? (
                      <>
                        <td className="py-1.5 pr-2 text-ink">
                          {columnById.get(cell.offerId)?.offer.name}
                          <span className="block">
                            <KindTag kind={cell.kind} />
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-right text-ink">{formatUnit(cell.unitPrice, cell.currency)}</td>
                        <td className="whitespace-nowrap py-1.5 text-right font-semibold text-ink">{formatMoney(cell.unitPrice * (position.quantity ?? 0), cell.currency)}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="py-1.5 text-ink-faint">
                        не отобрано
                      </td>
                    )}
                  </tr>
                ))}
                {pickedDelivery.length > 0 && (
                  <tr className="border-t border-border">
                    <td className="py-1.5 pr-2 text-ink" colSpan={3}>
                      Доставка ({[...pickedOfferIds].filter((id) => columnById.get(id)?.delivery != null).map((id) => columnById.get(id)!.offer.name).join(', ')})
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right font-semibold text-ink">{sumMoney(pickedDelivery, rate)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{preparedBy()}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Подготовил</div>
              </div>
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{new Date().toLocaleDateString('ru-RU')}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Дата</div>
              </div>
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{reviewStatus === 'approved' ? 'утверждено' : ''}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Руководитель стройки, подпись</div>
              </div>
              <div>
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{review?.decidedAt ? new Date(review.decidedAt).toLocaleDateString('ru-RU') : ''}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Дата</div>
              </div>
              <div className="col-span-2">
                <div className="min-h-[30px] border-b border-border-strong pb-1 text-ink">{review?.comment ?? ''}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-wide text-ink-faint">Решение: утвердить / вернуть на уточнение, комментарий</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {sendOpen && (
        <SendProposalModal
          request={request}
          total={total}
          review={review}
          onClose={() => setSendOpen(false)}
          onSend={async (to, subject, message) => {
            const { html, text } = buildProposalEmailHtml(doc(), message);
            // kind внутри purchase-send-email — лимит 12 функций Vercel Hobby.
            const resp = await authFetch('/api/purchase-send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'proposal', to, subject, html, text }),
            });
            const data = (await resp.json().catch(() => ({}))) as { error?: string };
            if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);
            try {
              localStorage.setItem(SENT_TO_STORAGE_KEY, to);
            } catch {
              /* приватный режим — не страшно */
            }
            onRequestSaved(
              await updateSupplierRequestReview(request.id, {
                status: 'sent',
                sentAt: new Date().toISOString(),
                sentTo: to,
                sentBy: preparedBy(),
                snapshot: buildSnapshot(picked, columnById, total, pickedDelivery.length ? sumMoney(pickedDelivery, rate) : null),
              }),
            );
          }}
        />
      )}
    </Card>
  );
}

function SendProposalModal({
  request,
  total,
  review,
  onClose,
  onSend,
}: {
  request: SupplierRequest;
  total: string;
  review: SupplierProposalReview | null;
  onClose: () => void;
  onSend: (to: string, subject: string, message: string) => Promise<void>;
}) {
  const remembered = (() => {
    try {
      return localStorage.getItem(SENT_TO_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  })();
  const [to, setTo] = useState(review?.sentTo || remembered);
  const [subject, setSubject] = useState(`${request.title}: предложение на утверждение, ${total}`);
  const [message, setMessage] = useState('Добрый день! Прошу утвердить предложение по закупке — состав и суммы ниже. Ответьте на это письмо: «утверждаю» или что нужно уточнить.');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await onSend(to.trim(), subject.trim(), message);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось отправить'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Отправить на утверждение">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Письмо с листом согласования (состав, суммы, по каждой позиции — кто ещё предлагал и почём) уйдёт руководителю стройки. Копия — на почту владельца, ответ придёт туда же.
          После отправки состав и цены запоминаются: если поставщик пришлёт новый счёт, карточка покажет, что сумма изменилась.
        </p>
        <Input label="Кому (email руководителя стройки)" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="ivan@example.com" />
        <Input label="Тема" required value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Сообщение" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
            Отмена
          </Button>
          <Button type="submit" icon={<Send className="h-4 w-4" />} disabled={sending || !to.trim()}>
            {sending ? 'Отправляем…' : 'Отправить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

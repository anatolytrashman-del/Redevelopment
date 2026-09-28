import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, FileDown, Link2, MoreHorizontal, Package, Pencil, Send, Sparkles } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { ToggleGroup } from '../ui/ToggleGroup';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
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
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_LABELS,
  buildPurchaseOrderDrafts,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '../../data/purchaseOrders';
import { fetchPurchaseOrdersByRequest, insertPurchaseOrders, updatePurchaseOrderStatus } from '../../lib/purchaseOrdersApi';
import type { QuoteTerms } from '../../data/supplierQuotes';
import {
  updateSupplierOfferItems,
  updateSupplierRequestProposal,
  updateSupplierRequestReview,
  updateSupplierRequestSection,
} from '../../lib/supplierResearchApi';
import { updateSupplierQuoteItems } from '../../lib/supplierQuotesApi';
import { getCurrentProfile } from '../../lib/accessProfile';
import { riskSummary, shouldFlag, type SupplierReliability } from '../../data/supplierReliability';
import { authFetch } from '../../lib/authFetch';
import { emailSignature } from './SupplierCorrespondenceTab';
import { errorMessage } from '../../lib/errorMessage';
import { downloadBlob, downloadHtmlAsPdf, pdfFileName, renderHtmlToPdfBlob } from '../../lib/htmlToPdf';
import { uploadObjectDocument } from '../../lib/objectsApi';
import { insertPurchaseDocument } from '../../lib/purchaseDocumentsApi';
import { sameUnit } from '../../lib/units';
import { guessUnitPrice } from '../../lib/unitPriceGuess';
import { grossUp, vatRateForCountry } from '../../data/vat';
import {
  STALE_QUOTE_DAYS,
  buildColumns,
  buildRecommendations,
  moneyTotal,
  positionOffers,
  sameProposal,
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
import { approvalPrintTitle, buildPrintHtml, buildProposalEmailHtml, hostOf, hrefOf, type ComparisonDoc } from './priceComparisonPrint';
import { SingleSupplierPanel } from './SingleSupplierPanel';

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
  none: 'bg-surface-muted text-ink-faint',
};

const KIND_CYCLE: PurchaseItemMatchKind[] = ['exact', 'alternative', 'check'];

// Подсказку модели есть что записать, если человек её принял И у строки есть
// исход: позиция ведомости, доставка либо явное «это не позиция ведомости»
// (колеровка в цене краски, товар не из ведомости). Последнее с 2026-09-17
// тоже пишется в базу — раньше выбор «не материал ведомости» не сохранялся
// никак, и строка возвращалась в «не привязаны» при следующем открытии.
function applicableSuggestion(r: SuggestionRow): boolean {
  if (!r.accepted) return false;
  return r.kind === 'delivery' || r.kind === 'none' || !!r.positionId;
}

// Ниже этого порога автосопоставление (шаг 5 плана закупок) просит человека
// взглянуть. 0.8 выбрано по живому прогону на счёте КраскиТорг 2026-09-16:
// уверенность там разложилась от 0.3 до 0.7, и каждая строка в этом диапазоне
// действительно требовала решения человека (другой бренд, фасадная краска
// вместо потолочной, колеровка без своей позиции). Единицу и 0.9 модель
// ставит, только когда совпали бренд, размер и объём.
const MATCH_CONFIDENCE_THRESHOLD = 0.8;

// Ячейку помечаем «проверить», только когда есть за что: либо модель сама
// разметила строку как расхождение, либо низка уверенность — в привязке к
// позиции ведомости ИЛИ в чтении самого счёта. У строк, сопоставленных
// человеком, confidence нет вовсе — они не «непроверенные».
//
// Второе (recognitionConfidence) появилось вместе с записью счёта без
// порога (шаг 10, владелец 2026-09-16: «записывай по умолчанию»): раз
// неуверенное распознавание больше не ждёт человека в переписке, единственное
// место, где о нём можно узнать, — вот эта пометка.
function needsReview(cell: {
  kind: PurchaseItemMatchKind;
  matchConfidence: number | null;
  recognitionConfidence?: number | null;
}): boolean {
  if (cell.kind === 'check') return true;
  if (cell.recognitionConfidence != null && cell.recognitionConfidence < MATCH_CONFIDENCE_THRESHOLD) return true;
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

function ReviewTag({ confidence, recognition }: { confidence: number | null; recognition?: number | null }) {
  // Две разные причины — и подсказка должна говорить, какая именно: «строка
  // не туда привязана» и «цену прочитали неуверенно» проверяются по-разному.
  const lowRecognition = recognition != null && recognition < MATCH_CONFIDENCE_THRESHOLD;
  const title = lowRecognition
    ? `Счёт распознан автоматически, уверенность ${Math.round(recognition * 100)}%. Сверьте цену с самим счётом или письмом.`
    : confidence != null
      ? `Сопоставлено автоматически, уверенность ${Math.round(confidence * 100)}%. Проверьте строку счёта.`
      : 'Есть расхождение — стоит уточнить у поставщика.';
  return (
    <span
      className="inline-block rounded-full bg-warning-bg px-1.5 py-px text-[10.5px] font-semibold leading-relaxed text-warning"
      title={title}
    >
      проверить
    </span>
  );
}

const SENT_TO_STORAGE_KEY = 'priceComparison.proposalSentTo';

// Владелец, 2026-09-28: «давай пока вообще уберем функционал отправки на
// согласование, я его не продумал». Весь поток (письмо руководителю,
// «утверждено / вернули», лист согласования, снимок цен) выключен этим
// флагом, а не удалён: данные в базе (request.review) не трогаются, и
// вернуть поток — поменять одно значение. Пока false — статусы согласования
// нигде не показываются и отбор не блокируется.
const APPROVAL_FLOW_ENABLED = false;

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
  const label = PURCHASE_ITEM_MATCH_KIND_LABELS[kind];
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
  excludedFromSupply?: boolean;
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
  renderBadges,
  reliabilityByInn,
  layout = 'old',
  onShowOldView,
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
  // Бейджи верификации/благонадёжности живут в Suppliers.tsx вместе со своим
  // состоянием — сюда приходят готовыми.
  renderBadges: (o: SupplierOffer, actions?: { onRiskClick?: () => void }) => ReactNode;
  // Проверка по ИНН (Checko) — та же карта, что и у RiskBadge выше по дереву.
  // Нужна панели «Заказать всё у одного»: владелец, 2026-09-17, «мы никогда
  // не ставим на первое место поставщика с красными флагами».
  reliabilityByInn: Map<string, SupplierReliability>;
  // 'new' — вид по макету 2026-09-28 (см. блок «Новый вид» ниже), 'old' —
  // прежняя матрица, сохранена по просьбе владельца «на всякий случай».
  layout?: 'decide' | 'new' | 'old';
  onShowOldView?: () => void;
}) {
  // Страна по умолчанию — первая, где кто-то уже прислал КП: у категорий,
  // где все поставщики российские, иначе открывался пустой экран.
  const [country, setCountry] = useState<string>(
    () => SUPPLIER_COUNTRIES.find((c) => offers.some((o) => (o.country || SUPPLIER_COUNTRIES[0]) === c && offerCommunicationStatus(o, emails) === 'confirmed')) ?? SUPPLIER_COUNTRIES[0],
  );
  const [view, setView] = useState<'Таблица' | 'По позициям'>('Таблица');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickMatch, setQuickMatch] = useState<{ offerId: string; positionId: string } | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showAside, setShowAside] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[] | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sectionPick, setSectionPick] = useState('');
  // Заказы поставщикам по этой категории (шаг 11 плана закупок). Грузятся
  // отдельно от остального: карточка и так тянет счета, письма и снимки, а
  // заказов на категорию — единицы.
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [fixOpen, setFixOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<'Все' | 'Решить' | 'Готово'>('Все');
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  useEffect(() => {
    let cancelled = false;
    setOrdersError(null);
    fetchPurchaseOrdersByRequest(request.id)
      .then((rows) => {
        if (!cancelled) setOrders(rows);
      })
      .catch((e) => {
        if (!cancelled) setOrdersError(errorMessage(e, 'Не удалось загрузить заказы по этой категории'));
      });
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const offersInCountry = offers.filter((o) => (o.country || SUPPLIER_COUNTRIES[0]) === country);
  const confirmed = offersInCountry.filter((o) => offerCommunicationStatus(o, emails) === 'confirmed');

  const quotesByOffer = useMemo(() => {
    const map = new Map<string, SupplierQuote[]>();
    [...quotes]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((q) => map.set(q.offerId, [...(map.get(q.offerId) ?? []), q]));
    return map;
  }, [quotes]);

  // Поставщик, у которого уже выбрана хоть одна позиция (лежит в
  // request.proposal), — всегда вперёд остальных, даже если по числу
  // закрытых позиций он не лидирует. Владелец, 2026-09-17: закупка теперь
  // идёт по частям ведомости у разных поставщиков (Банапал — свои позиции,
  // Альбия — свои, ООО «СтройТерминал Центр Красок» — свои), и поставщик с
  // 2 закрытыми, но выбранными позициями не должен уезжать в конец таблицы
  // только потому, что у него меньше позиций, чем у никем не выбранного.
  const proposalOfferIds = useMemo(() => new Set(Object.values(request.proposal ?? {}).map((p) => p.offerId)), [request.proposal]);

  const columns = useMemo(() => {
    const cols = buildColumns(confirmed, quotesByOffer, positions, rate);
    // Порядок столбцов: сначала выбранные поставщики, среди них и среди
    // остальных — по числу закрытых позиций, потом по имени; от цены не
    // зависит (см. шапку файла про минимум).
    return cols.sort((a, b) => {
      const aPicked = proposalOfferIds.has(a.offer.id);
      const bPicked = proposalOfferIds.has(b.offer.id);
      if (aPicked !== bPicked) return aPicked ? -1 : 1;
      return b.currentCells.size - a.currentCells.size || a.offer.name.localeCompare(b.offer.name, 'ru');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed.map((o) => o.id + o.items.length).join(','), quotesByOffer, positions, rate, proposalOfferIds]);

  // Воронка запроса — по всем поставщикам выбранной страны, не только по
  // приславшим КП (владелец: «сколько отправлено — главная отправная точка»).
  const funnel = useMemo(() => {
    const ids = new Set(offersInCountry.map((o) => o.id));
    const mine = emails.filter((e) => ids.has(e.offerId));
    const out = mine.filter((e) => e.direction === 'out');
    const inbound = mine.filter((e) => e.direction === 'in');
    const sentIds = new Set(out.map((e) => e.offerId));
    // Поставщик, приславший КП, ответил по определению — даже если самого
    // ответа в переписке нет: счёт бывает залит руками, а договорённость —
    // по телефону. Без объединения в отчёте выходило «ответили 10» рядом с
    // «прислали КП 12» (владелец, 2026-09-17).
    const confirmedIds = new Set(confirmed.map((o) => o.id));
    const repliedIds = new Set([...inbound.map((e) => e.offerId), ...confirmedIds]);
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
      repliedNoQuote: [...repliedIds].filter((id) => !confirmedIds.has(id)).length,
      confirmed: confirmed.length,
      quotesCount,
      pricedPositions,
      first: dates[0] ?? null,
      last: dates.length > 0 ? dates[dates.length - 1] : null,
    };
  }, [offersInCountry, emails, confirmed, quotesByOffer, positions, columns, request.replyDueDays]);

  const recos = useMemo(() => buildRecommendations(positions, columns), [positions, columns]);

  const proposal = request.proposal ?? {};
  const review = request.review;
  const columnById = new Map(columns.map((c) => [c.offer.id, c]));

  const picked = pickLines(positions, proposal, columnById);
  const pickedCells = picked.filter((x): x is { position: EstimateMaterial; cell: Cell } => !!x.cell);
  const pickedOfferIds = new Set(pickedCells.map((x) => x.cell.offerId));
  // Уже заказанное: позиция у этого поставщика лежит в живом (не отменённом)
  // заказе категории. Второй раз на согласование её не отправляем —
  // владелец, 2026-09-28: «я уже отправил Плинтус на согласование, а кнопка
  // отправки всё равно висит».
  const orderedKeys = new Set(
    orders
      .filter((o) => o.status !== 'cancelled')
      .flatMap((o) => o.items.map((it) => `${o.offerId}|${it.sourceMaterialId ?? it.id}`)),
  );
  const isOrdered = (x: { position: EstimateMaterial; cell: Cell }) => orderedKeys.has(`${x.cell.offerId}|${x.position.id}`);
  const unorderedCells = pickedCells.filter((x) => !isOrdered(x));
  const pickedParts: MoneyPart[] = pickedCells.map((x) => ({ amount: x.cell.unitPrice * (x.position.quantity ?? 0), currency: x.cell.currency }));
  const pickedDelivery: MoneyPart[] = [...pickedOfferIds]
    .map((id) => columnById.get(id))
    .filter((c): c is Column => !!c && c.delivery != null)
    .map((c) => ({ amount: c.delivery!, currency: c.deliveryCurrency }));
  const kinds = pickedCells.reduce(
    (acc, x) => ({ ...acc, [x.cell.kind]: (acc[x.cell.kind] ?? 0) + 1 }),
    {} as Partial<Record<PurchaseItemMatchKind, number>>,
  );
  const total = sumMoney([...pickedParts, ...pickedDelivery], rate);
  const pickedCellByPosition = new Map(pickedCells.map((x) => [x.position.id, x.cell]));

  const unmatchedAll: { line: UnmatchedLine; offer: SupplierOffer }[] = columns.flatMap((c) => c.unmatched.map((line) => ({ line, offer: c.offer })));
  // «Не привязаны» и «привязаны, но без цены» — разные ситуации: у первых
  // нет sourceMaterialId вовсе, у вторых позиция уже выбрана (например,
  // подсказкой модели), просто цену за единицу сметы никто не посчитал —
  // единицы счёта и позиции не совпадают буквально, а перевод (тара в кг при
  // расходе в литрах и т.п.) без выдумывания не сделать. Раньше обе группы
  // считались вместе под шапкой «не привязаны к ведомости и не участвуют в
  // сравнении» — владелец, 2026-09-17: строка с уже выбранной позицией это
  // сообщение не заслуживает, оно про другое.
  const unmatchedUnlinked = unmatchedAll.filter(({ line }) => !line.item.sourceMaterialId);
  const unmatchedLinkedNoPrice = unmatchedAll.filter(({ line }) => !!line.item.sourceMaterialId);
  const unmatchedSuppliers = columns
    .map((c) => ({ offer: c.offer, count: c.unmatched.filter((l) => !l.item.sourceMaterialId).length }))
    .filter((x) => x.count > 0);
  const linkedNoPriceSuppliers = columns
    .map((c) => ({ offer: c.offer, count: c.unmatched.filter((l) => !!l.item.sourceMaterialId).length }))
    .filter((x) => x.count > 0);
  // Разобранные строки «не позиция ведомости» — отдельно от «не привязаны»:
  // по ним решение принято, и требовать внимания они не должны.
  const asideSuppliers = columns.filter((c) => c.aside.length > 0);
  const asideCount = asideSuppliers.reduce((n, c) => n + c.aside.length, 0);

  // Сумма после отправки разошлась со снимком — новый счёт поставщика
  // поменял цены, руководитель утверждал другое.
  const snapshotDrift = APPROVAL_FLOW_ENABLED && review?.snapshot && review.status !== 'draft' && review.snapshot.total !== total ? review.snapshot.total : null;

  const doc = (): ComparisonDoc => ({
    request,
    estimateTitle: estimates.find((estimate) => estimate.id === request.estimateId)?.title,
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
    reliabilityByInn,
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

  // 1-клик «не покупаем у этого поставщика» (владелец, 2026-09-17): цена и
  // позиция остаются в сравнении и в отчёте руководителю — просто выходят
  // из заказа. Если строка была отобрана («✓ Отобрано»), выключение из
  // поставки снимает и отбор — иначе позиция «не покупаем» продолжила бы
  // считаться в сумме к утверждению.
  async function toggleExclude(cell: Cell, p: EstimateMaterial) {
    const next = !cell.excludedFromSupply;
    const ok = await run('Не удалось изменить статус позиции', () =>
      applyPatches([{ offerId: cell.offerId, itemId: cell.itemId, patch: { excludedFromSupply: next } }]).then(() => true),
    );
    if (ok && next && proposal[p.id]?.offerId === cell.offerId) {
      const nextProposal = { ...proposal };
      delete nextProposal[p.id];
      void saveProposal(nextProposal);
    }
  }

  // «Сформировать поставку» (владелец, 2026-09-17): после того как отбор
  // кнопками «Выбрать» закончен, одним действием доводит решение до конца —
  // всё, что НЕ отобрано и ещё не помечено «Не покупаем», переводится в «Не
  // покупаем». Цена и позиция никуда не деваются — остаются в сравнении и
  // пойдут в отчёт руководителю стройки — просто явно исключены из заказа,
  // а не молча висят непонятым остатком. Заказы поставщикам эта кнопка не
  // создаёт — для этого соседняя «Сформировать заказы».
  async function formSupply() {
    const patches: { offerId: string; itemId: string; patch: ItemPatch }[] = [];
    for (const col of columns) {
      col.cells.forEach((cell, positionId) => {
        if (cell.excludedFromSupply) return;
        if (proposal[positionId]?.offerId === cell.offerId) return;
        patches.push({ offerId: cell.offerId, itemId: cell.itemId, patch: { excludedFromSupply: true } });
      });
    }
    if (patches.length === 0) return;
    const word = patches.length === 1 ? 'предложение' : patches.length < 5 ? 'предложения' : 'предложений';
    const ok = window.confirm(`Отклонить ${patches.length} ${word}, которые не отобраны? Цены останутся в сравнении и в отчёте — просто выйдут из поставки.`);
    if (!ok) return;
    await run('Не удалось сформировать поставку', () => applyPatches(patches));
  }

  function toggleColumn(col: Column) {
    // Массовое «Выбрать все» — только по реально покрытым позициям: архивные
    // и «не покупаем» цены отбором не трогает (см. Column.currentCells).
    const all = [...col.currentCells.keys()].every((pid) => proposal[pid]?.offerId === col.offer.id);
    const next = { ...proposal };
    col.currentCells.forEach((cell, pid) => {
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

  // «Уточнить» в виде «кому что заказать»: человек сам решает, что это за
  // строка счёта — ровно то, аналог или вообще не то (тогда строка уходит
  // в тихий список «не позиции ведомости»).
  function resolveCheck(cell: Cell, kind: 'exact' | 'alternative' | 'none') {
    const patch: ItemPatch = kind === 'none' ? { sourceMaterialId: null, matchKind: 'none', unitPrice: null } : { matchKind: kind };
    void run('Не удалось изменить вид соответствия', () => applyPatches([{ offerId: cell.offerId, itemId: cell.itemId, patch }]));
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
    const rows = suggestions.filter((r) => applicableSuggestion(r));
    const patches = rows.map((r) => {
      const unitPrice = r.unitPrice ? Number(r.unitPrice) : NaN;
      const patch: ItemPatch =
        r.kind === 'delivery'
          ? { sourceMaterialId: null, matchKind: 'delivery', unitPrice: null, matchNote: r.note || undefined }
          : r.kind === 'none'
            ? { sourceMaterialId: null, matchKind: 'none', unitPrice: null, matchNote: r.note || undefined }
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

  // «Сформировать заказы» (шаг 11 плана закупок): утверждённый отбор
  // превращается в заказы — по одному на поставщика. Статус ставится
  // 'draft', а не 'ordered': поставщику ещё ничего не отправляли, письмо
  // заказа — шаг 12. Повторное нажатие не запрещено (часть позиций могли
  // отдать другому поставщику после первого раза), но спрашивает: заказы по
  // категории уже есть.
  async function createOrders(): Promise<PurchaseOrder[] | null> {
    const drafts = buildPurchaseOrderDrafts(
      unorderedCells.map(({ position, cell }) => ({
        position: { id: position.id, name: position.name, unit: position.unit, quantity: position.quantity },
        cell,
      })),
      [...columnById.values()].map((c) => ({
        offerId: c.offer.id,
        name: c.offer.name,
        supplierId: c.offer.supplierId ?? null,
        currency: c.deliveryCurrency,
        delivery: c.delivery,
      })),
    );
    if (drafts.length === 0) {
      setError('Нечего заказывать: в отборе нет ни одной позиции с ценой.');
      return null;
    }
    setCreatingOrders(true);
    setError(null);
    try {
      const created = await insertPurchaseOrders(drafts, { requestId: request.id, legalEntityId: request.legalEntityId });
      setOrders((prev) => [...created, ...prev]);
      return created;
    } catch (e) {
      setError(errorMessage(e, 'Не удалось создать заказы'));
      return null;
    } finally {
      setCreatingOrders(false);
    }
  }

  // «Отправить на согласование» (владелец, 2026-09-28): одна кнопка вместо
  // «Скачать PDF» + «Создать заказы». Заказы рождаются «На согласовании»
  // (status 'draft'), PDF скачивается и тем же файлом ложится на каждый
  // заказ документом «Лист согласования» — чтобы его можно было скачать
  // потом со вкладки «Заказы». PDF собираем ДО заказов: если сборка упадёт,
  // заказов без листа не будет.
  async function sendForApproval() {
    setExportingPdf(true);
    setError(null);
    let blob: Blob;
    let name: string;
    try {
      const report = doc();
      blob = await renderHtmlToPdfBlob(buildPrintHtml(report));
      name = pdfFileName(`${approvalPrintTitle(report)} — на согласование`);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось собрать PDF'));
      return;
    } finally {
      setExportingPdf(false);
    }
    const created = await createOrders();
    if (!created || created.length === 0) return;
    downloadBlob(blob, name);
    try {
      const file = await uploadObjectDocument(new File([blob], name, { type: 'application/pdf' }));
      await Promise.all(
        created.map((o) => insertPurchaseDocument({ orderId: o.id, deliveryId: null, kind: 'approval', title: 'Лист согласования', file })),
      );
    } catch (e) {
      setError(errorMessage(e, 'Заказы созданы, но PDF не сохранился на них'));
    }
  }

  async function setOrderStatus(order: PurchaseOrder, status: PurchaseOrderStatus) {
    if (status === order.status) return;
    try {
      const next = await updatePurchaseOrderStatus(order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)));
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сменить статус заказа'));
    }
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

  // Владелец, 2026-09-17: «делай при клике на кнопку На утверждение сразу
  // загрузку pdf файла» — раньше открывалось окно печати и человек сам
  // выбирал «сохранить как PDF». Теперь файл собирается на месте
  // (src/lib/htmlToPdf.ts) и сразу падает в загрузки.
  async function exportPdf() {
    setExportingPdf(true);
    setError(null);
    try {
      const report = doc();
      await downloadHtmlAsPdf(buildPrintHtml(report), `${approvalPrintTitle(report)} — на утверждение`);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось собрать PDF'));
    } finally {
      setExportingPdf(false);
    }
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
        {s.exact === 0 ? 'позиции из ведомости нет ни у кого · ' : ''}
        {s.exact ? `из ведомости ${s.exact}` : ''}
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
          <KindTag kind={cell.kind} onClick={() => cycleKind(cell)} title="Нажмите, чтобы сменить вид: позиция из ведомости → аналог → уточнить" />{' '}
          {needsReview(cell) && cell.kind !== 'check' && (
            <ReviewTag confidence={cell.matchConfidence} recognition={cell.recognitionConfidence} />
          )}{' '}
          <VatTag vat={cell.vat} rate={cell.vatRate} /> {cell.note}
        </span>
        {cell.isArchived && (
          <span
            className="mt-1 block text-[11px] font-semibold text-ink-faint"
            title="Этой позиции нет в самом последнем счёте поставщика — цена из более раннего КП, оставлена для отчёта"
          >
            архив{cell.quoteDate ? ` · счёт от ${formatDate(cell.quoteDate)}` : ''}
          </span>
        )}
        {cell.excludedFromSupply && <span className="mt-1 block text-[11px] font-semibold text-warning">не покупаем — цена для отчёта</span>}
        {cell.productUrl && (
          <span className="mt-1 block">
            <ProductLink url={cell.productUrl} />
          </span>
        )}
      </>
    );
  }

  // 1-клик «не покупаем у этого поставщика»: рядом с «Выбрать», не заменяет
  // его — владелец, 2026-09-17, специально просил уровень ячейки (материал ×
  // поставщик), а не всю строку ведомости.
  function ExcludeToggle({ cell, p, className }: { cell: Cell; p: EstimateMaterial; className?: string }) {
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => void toggleExclude(cell, p)}
        title={cell.excludedFromSupply ? 'Вернуть позицию в возможную поставку' : 'Не покупаем эту позицию у этого поставщика — цена останется в сравнении и в отчёте'}
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
          cell.excludedFromSupply ? 'border-warning bg-warning-bg text-warning' : 'border-border-strong bg-surface text-ink-faint hover:border-ink hover:text-ink',
          className,
        )}
      >
        {cell.excludedFromSupply ? '↺ Вернуть' : '✕ Не покупаем'}
      </button>
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
              {l.item.name} · {l.item.quantity ?? '—'} {l.item.unit} · {l.item.price != null ? formatUnit(l.item.price, l.currency) : ''}
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
    const mine = [...col.currentCells.keys()].filter((pid) => proposal[pid]?.offerId === col.offer.id).length;
    const all = col.currentCells.size;
    const age = quoteAgeDays(col.lastQuoteAt);
    return (
      <>
        <span className="block text-[13px] font-bold text-ink">{col.offer.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {renderBadges(col.offer, { onRiskClick: () => onOpenDetail(col.offer) })}
        </span>
        <span className="mt-1 flex flex-wrap gap-1 text-[10.5px] font-medium">
          {col.lastQuoteAt && (
            <span className={cn('rounded-full px-1.5 py-px', age != null && age > STALE_QUOTE_DAYS ? 'bg-warning-bg text-warning' : 'bg-surface text-ink-muted')}>
              счёт от {formatDate(col.lastQuoteAt)}
              {age != null && age > STALE_QUOTE_DAYS ? `, ${age} дн.` : ''}
            </span>
          )}
          {col.quotesCount > 1 && <span className="rounded-full bg-surface px-1.5 py-px text-ink-muted">{col.quotesCount} {col.quotesCount < 5 ? 'счёта' : 'счетов'}, последние цены</span>}
          <span className={cn('rounded-full px-1.5 py-px', col.delivery != null ? 'bg-surface text-ink' : 'bg-surface text-ink-faint')}>
            {col.delivery != null ? `доставка ${formatMoney(col.delivery, col.deliveryCurrency)}` : 'доставка не названа'}
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
    // «Всё у одного» — только по currentCells: архивная (не из последнего
    // счёта) или исключённая цена не значит, что поставщик реально поставит
    // это сегодня.
    const covered = positions.filter((p) => col.currentCells.has(p.id));
    const partsAll: MoneyPart[] = covered.map((p) => ({ amount: col.currentCells.get(p.id)!.unitPrice * (p.quantity ?? 0), currency: col.currentCells.get(p.id)!.currency }));
    const delivery: MoneyPart[] = col.delivery != null ? [{ amount: col.delivery, currency: col.deliveryCurrency }] : [];
    return { mine, partsPicked, covered, partsAll, delivery };
  }

  const reviewStatus = APPROVAL_FLOW_ENABLED ? (review?.status ?? 'draft') : 'draft';

  const sectionPicker = (
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
  );

  const unmatchedPanel = !emptyPositions && unmatchedAll.length > 0 && (
      <div className="flex flex-col gap-2 rounded-control border border-warning/40 bg-warning-bg/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col gap-1 text-sm text-ink">
            {unmatchedUnlinked.length > 0 && (
              <span>
                <span className="font-semibold">
                  {unmatchedUnlinked.length} {unmatchedUnlinked.length === 1 ? 'строка' : unmatchedUnlinked.length < 5 ? 'строки' : 'строк'} счетов
                </span>{' '}
                у {unmatchedSuppliers.length} {unmatchedSuppliers.length === 1 ? 'поставщика' : 'поставщиков'} не привязаны к ведомости и не участвуют в сравнении:{' '}
                {unmatchedSuppliers.map((c) => `${c.offer.name} (${c.count})`).join(', ')}
              </span>
            )}
            {unmatchedLinkedNoPrice.length > 0 && (
              <span>
                <span className="font-semibold">
                  {unmatchedLinkedNoPrice.length} {unmatchedLinkedNoPrice.length === 1 ? 'строка' : unmatchedLinkedNoPrice.length < 5 ? 'строки' : 'строк'} счетов
                </span>{' '}
                у {linkedNoPriceSuppliers.length} {linkedNoPriceSuppliers.length === 1 ? 'поставщика' : 'поставщиков'} уже привязаны к позиции ведомости, но без цены за единицу сметы —
                впишите цену вручную, чтобы они попали в сравнение:{' '}
                {linkedNoPriceSuppliers.map((c) => `${c.offer.name} (${c.count})`).join(', ')}
              </span>
            )}
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
                              else if (!v) update({ kind: 'none', positionId: '', accepted: true });
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
              <Button type="button" onClick={() => void applySuggestions()} disabled={saving || !suggestions.some((r) => applicableSuggestion(r))}>
                Применить {suggestions.filter((r) => applicableSuggestion(r)).length}
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
                <span className="tabular-nums text-ink-muted">{line.item.price != null ? formatUnit(line.item.price, line.currency) : ''}</span>
                <button type="button" onClick={() => onOpenDetail(offer)} className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid">
                  <Check className="h-3 w-3" /> В переписке
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
  );

  const asidePanel = !emptyPositions && asideCount > 0 && (
      <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface-muted px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-muted">
            <span className="font-semibold text-ink">{asideCount}</span> {asideCount === 1 ? 'строка' : asideCount < 5 ? 'строки' : 'строк'} счетов разобраны как «не позиция
            ведомости» и в сравнении не участвуют: {asideSuppliers.map((c) => `${c.offer.name} (${c.aside.length})`).join(', ')}
          </span>
          <button type="button" onClick={() => setShowAside((v) => !v)} className="text-xs font-medium text-ink-muted hover:text-ink">
            {showAside ? 'Скрыть строки' : 'Показать строки'}
          </button>
        </div>
        {showAside && (
          <div className="flex flex-col gap-1">
            {asideSuppliers.map((c) =>
              c.aside.map((line) => (
                <div key={`${c.offer.id}-${line.item.id}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium text-ink">{c.offer.name}:</span>
                  <span className="min-w-0 flex-1 text-ink">{line.item.name}</span>
                  <span className="tabular-nums text-ink-muted">
                    {line.item.quantity ?? '—'} {line.item.unit} · {formatMoney(line.total, line.currency)}
                  </span>
                  {line.item.matchNote && <span className="w-full text-[11px] text-ink-faint">{line.item.matchNote}</span>}
                </div>
              )),
            )}
          </div>
        )}
      </div>
  );

  const sendModal = APPROVAL_FLOW_ENABLED && sendOpen && (
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
  );


  // ── Новый вид (владелец, 2026-09-28: «сейчас нихера непонятно, слишком
  // много инфы» + «не хватает разделения на позиции четко по запросу и на
  // аналоги, их нужно сравнивать отдельно»). Одна главная кнопка по этапу,
  // три шага вместо воронки, итог двумя цифрами (строго по запросу / с
  // аналогами), по строке — лучшая цена точно по запросу и лучший аналог
  // отдельно. Прежний вид — layout="old" (переключатель «Старый вид» на
  // странице и ссылка «Все цены таблицей»), он не тронут.
  function approveReview() {
    void setReview({ ...(review ?? { status: 'sent' }), status: 'approved', decidedAt: new Date().toISOString(), comment: undefined });
  }
  function returnReview() {
    const comment = window.prompt('Что нужно уточнить (комментарий руководителя)?', review?.comment ?? '') ?? null;
    if (comment === null) return;
    void setReview({ ...(review ?? { status: 'sent' }), status: 'returned', decidedAt: new Date().toISOString(), comment: comment.trim() || undefined });
  }
  function applyRecommendation(next: SupplierProposal) {
    const current = Object.keys(proposal).length;
    if (current > 0 && !sameProposal(proposal, next) && !window.confirm(`Заменить текущий выбор (${current} поз.) этим набором?`)) return;
    void saveProposal(next);
  }
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Вид «кому что заказать» (третий макет, владелец 2026-09-28: «Мне не
  // нравится Сравнение цен всё равно… попробуй прям переосознать эту
  // страницу»). Решение принимается по одной позиции за раз: слева очередь
  // (ждут решения / решено), справа предложения одной позиции тремя группами
  // (по запросу, аналоги, уточнить), сверху поставщики как «корзины» — что
  // закрывают и что уже лежит в их заказе, внизу будущие заказы. Разница в %
  // — только внутри «по запросу»: минимума по аналогам нет (см. шапку файла).
  // Воронка запроса: сколько поставщиков в работе (владелец, 2026-09-28,
  // вернул её и в вид «кому что заказать»).
  const funnelBlock = (
    <>
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
    </>
  );

  if (layout === 'decide') {
    const riskOf = (o: SupplierOffer) => {
      const r = o.inn ? reliabilityByInn.get(o.inn) ?? null : null;
      return shouldFlag(r) && r ? riskSummary(r) : null;
    };
    const termsLine = (col: Column) => {
      const t = col.terms;
      const parts: string[] = [];
      if (col.delivery != null) parts.push(col.delivery === 0 ? 'доставка бесплатно' : `доставка ${formatMoney(col.delivery, col.deliveryCurrency)}`);
      else if (t?.deliveryTerms) parts.push(t.deliveryTerms);
      else parts.push('доставка не названа');
      if (t?.leadTimeDays != null) parts.push(`${t.leadTimeDays} дн.`);
      if (t?.availability === 'in_stock') parts.push('в наличии');
      if (t?.availability === 'on_order') parts.push('под заказ');
      if (t?.prepaymentPercent != null) parts.push(t.prepaymentPercent === 0 ? 'оплата по факту' : `предоплата ${t.prepaymentPercent}%`);
      return parts.join(' · ');
    };

    const todo = positions.filter((p) => !pickedCellByPosition.has(p.id) && columns.some((c) => c.cells.has(p.id)));
    const none = positions.filter((p) => !columns.some((c) => c.cells.has(p.id)));
    const done = positions.filter((p) => pickedCellByPosition.has(p.id));
    const ordered = [...todo, ...none, ...done];
    const active = ordered.find((p) => p.id === activeId) ?? todo[0] ?? ordered[0] ?? null;
    const activeIdx = active ? ordered.indexOf(active) : -1;

    const go = (p: EstimateMaterial | undefined) => {
      if (!p) return;
      setActiveId(p.id);
      if (window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const pickAndNext = (p: EstimateMaterial, cell: Cell) => {
      const wasPicked = proposal[p.id]?.offerId === cell.offerId;
      togglePick(p.id, cell);
      if (!wasPicked) {
        const next = todo.find((x) => x.id !== p.id && todo.indexOf(x) > todo.indexOf(p)) ?? todo.find((x) => x.id !== p.id);
        if (next) setActiveId(next.id);
      }
    };

    const byOffer = new Map<string, { col: Column; lines: { position: EstimateMaterial; cell: Cell }[] }>();
    for (const x of unorderedCells) {
      const col = columnById.get(x.cell.offerId);
      if (!col) continue;
      if (!byOffer.has(col.offer.id)) byOffer.set(col.offer.id, { col, lines: [] });
      byOffer.get(col.offer.id)!.lines.push(x);
    }
    const futureOrders = [...byOffer.values()];
    const countries = SUPPLIER_COUNTRIES.filter((c) => offers.some((o) => (o.country || SUPPLIER_COUNTRIES[0]) === c));
    const listFiltered = listFilter === 'Решить' ? [...todo, ...none] : listFilter === 'Готово' ? done : ordered;
    const unit = (p: EstimateMaterial) => p.unit || 'ед.';

    const posRow = (p: EstimateMaterial) => {
      const pc = pickedCellByPosition.get(p.id);
      const po = positionOffers(p.id, columns, { includeExcluded: true });
      const alt = po.analogs.filter((c) => c.kind === 'alternative').length;
      const chk = po.analogs.length - alt;
      const on = active?.id === p.id;
      const hasOffers = po.exact.length + po.analogs.length > 0;
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => go(p)}
          className={cn(
            'flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0',
            on ? 'bg-warning-bg/50 shadow-[inset_3px_0_0_var(--color-ink)]' : 'hover:bg-surface-muted/60',
          )}
        >
          <span
            className={cn(
              'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
              pc ? 'bg-success-bg text-success' : hasOffers ? 'bg-warning-bg text-warning' : 'bg-surface-muted text-ink-faint',
            )}
          >
            {pc ? '✓' : hasOffers ? '!' : '–'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink [overflow-wrap:anywhere]">{p.name}</span>
            <span className="block text-xs text-ink-muted">
              {p.quantity != null ? p.quantity.toLocaleString('ru-RU') : '—'} {unit(p)}
            </span>
          </span>
          <span className="max-w-[45%] shrink-0 text-right text-xs">
            {pc ? (
              <>
                <span className="block truncate font-semibold text-ink">
                  {columnById.get(pc.offerId)?.offer.name}{' '}
                  <span className={cn('rounded-full px-1.5 py-px text-[10.5px] font-semibold', pc.kind === 'exact' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning')}>
                    {pc.kind === 'exact' ? 'по запросу' : pc.kind === 'alternative' ? 'аналог' : 'уточнить'}
                  </span>
                </span>
                <span className="block tabular-nums text-ink-muted">
                  {formatUnit(pc.unitPrice, pc.currency)}/{unit(p)}
                  {p.quantity != null && <b className="text-ink"> · {formatMoney(pc.unitPrice * p.quantity, pc.currency)}</b>}
                </span>
              </>
            ) : hasOffers ? (
              <>
                <span className="block font-semibold text-warning">решить</span>
                <span className="block text-ink-muted">
                  {[po.exact.length ? `${po.exact.length} по запросу` : '', alt ? `${alt} ${alt === 1 ? 'аналог' : alt < 5 ? 'аналога' : 'аналогов'}` : '', chk ? 'уточнить' : ''].filter(Boolean).join(' · ')}
                </span>
              </>
            ) : (
              <span className="block text-ink-faint">никто не предложил</span>
            )}
          </span>
        </button>
      );
    };

    const offerRow = (p: EstimateMaterial, c: Cell, reference: Cell | null, showDelta: boolean) => {
      const col = columnById.get(c.offerId);
      if (!col) return null;
      const picked = proposal[p.id]?.offerId === c.offerId;
      const d = showDelta && reference && reference !== c ? deltaToPicked(c, reference) : null;
      const risk = riskOf(col.offer);
      return (
        <div
          key={c.offerId}
          className={cn(
            'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_6.5rem_auto]',
            picked ? 'border-success bg-success-bg/40' : risk ? 'border-border bg-surface-muted' : 'border-border bg-surface',
            c.excludedFromSupply && 'opacity-60',
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => onOpenDetail(col.offer)} className="text-left text-sm font-semibold text-ink hover:underline">
                {col.offer.name}
              </button>
              {risk && <span className="rounded-full bg-danger-bg px-1.5 py-px text-[10.5px] font-semibold text-danger" title={risk}>риск</span>}
              {needsReview(c) && c.kind !== 'check' && <ReviewTag confidence={c.matchConfidence} recognition={c.recognitionConfidence} />}
              {(c.vat === 'net' || c.vat === 'converted') && <VatTag vat={c.vat} rate={c.vatRate} />}
              {c.isArchived && <span className="rounded-full bg-surface-muted px-1.5 py-px text-[10.5px] text-ink-muted">из прошлого КП</span>}
              {c.excludedFromSupply && <span className="text-[10.5px] font-semibold text-ink-faint">не покупаем</span>}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted [overflow-wrap:anywhere]">
              {c.quoteId ? c.quoteTitle : ''}
              {c.quoteDate ? ` от ${formatDate(c.quoteDate)}` : ''}
              {c.note && (
                <>
                  {c.quoteId ? ' · ' : ''}
                  <NoteWithLinks text={c.note} className="inline font-medium text-warning" />
                </>
              )}
            </div>
            <div className="mt-0.5 text-xs text-ink-faint">{termsLine(col)}</div>
            <ShortfallLabel cell={c} p={p} />
          </div>
          <div className="text-right tabular-nums">
            <b className="block text-sm text-ink">
              {formatUnit(c.unitPrice, c.currency)}/{unit(p)}
            </b>
            <span className="block text-[11px] text-ink-muted">{d != null ? formatDelta(d) : ' '}</span>
          </div>
          <div className="hidden text-right text-sm font-semibold tabular-nums text-ink sm:block">{p.quantity != null ? formatMoney(c.unitPrice * p.quantity, c.currency) : '—'}</div>
          <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
            <span className="text-xs tabular-nums text-ink-muted sm:hidden">{p.quantity != null ? formatMoney(c.unitPrice * p.quantity, c.currency) : ''}</span>
            {c.kind === 'check' ? (
              <div className="flex flex-wrap justify-end gap-1">
                {(
                  [
                    ['exact', 'То же'],
                    ['alternative', 'Аналог'],
                    ['none', 'Не то'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={saving}
                    onClick={() => resolveCheck(c, k)}
                    className="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-ink"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => pickAndNext(p, c)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold',
                  picked ? 'border-success bg-success text-white' : 'border-border-strong bg-surface text-ink hover:border-success hover:text-success',
                )}
              >
                {picked ? '✓ Выбрано' : 'Выбрать'}
              </button>
            )}
          </div>
        </div>
      );
    };

    const group = (tone: string, label: string, caption: string, rows: ReactNode[], extra?: ReactNode) =>
      rows.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>{label}</span>
            <span className="text-xs text-ink-muted">
              {caption} · {rows.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {rows}
          {extra}
        </div>
      );

    const detail = active && (() => {
      const po = positionOffers(active.id, columns, { includeExcluded: true });
      const alts = po.analogs.filter((c) => c.kind === 'alternative');
      const checks = po.analogs.filter((c) => c.kind === 'check');
      const empty = po.exact.length + po.analogs.length === 0;
      return (
        <div ref={detailRef} className="min-w-0 scroll-mt-4">
        <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-ink [overflow-wrap:anywhere] sm:text-xl">{active.name}</h3>
              <p className="mt-0.5 text-sm text-ink-muted">
                <b className="text-ink">
                  {active.quantity != null ? active.quantity.toLocaleString('ru-RU') : '—'} {unit(active)}
                </b>
                {active.note && (
                  <>
                    {' · '}
                    <NoteWithLinks text={active.note} className="inline" />
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={activeIdx <= 0} onClick={() => go(ordered[activeIdx - 1])} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-40">
                ← Пред.
              </button>
              <button type="button" disabled={activeIdx >= ordered.length - 1} onClick={() => go(ordered[activeIdx + 1])} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                Следующая →
              </button>
            </div>
          </div>
          {empty ? (
            <p className="text-sm text-ink-muted">На эту позицию никто не прислал цену. Дозапросить можно в «Письмах».</p>
          ) : (
            <>
              {group('bg-success-bg text-success', 'По запросу', 'то, что просили', po.exact.map((c) => offerRow(active, c, po.bestExact, true)))}
              {group(
                'bg-sky-50 text-sky-700',
                'Аналоги',
                'другой бренд или артикул, сравниваем отдельно',
                alts.map((c) => offerRow(active, c, null, false)),
                <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-muted">Аналог — другой товар. Подходит ли он, решаете вы, поэтому «самой низкой цены» по аналогам здесь нет.</p>,
              )}
              {group('bg-warning-bg text-warning', 'Уточнить', 'не ясно, то ли это', checks.map((c) => offerRow(active, c, null, false)))}
            </>
          )}
        </Card>
        </div>
      );
    })();

    return (
      <div className="flex min-w-0 flex-col gap-4">
        {/* Страна видна сразу: поставщики другой страны иначе незаметно
            выпадают из сравнения. */}
        {countries.length > 1 && (
          <div className="flex justify-end">
            <ToggleGroup options={countries} value={country} onChange={setCountry} />
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {funnelBlock}

        {!emptyPositions && unmatchedAll.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warning/40 bg-warning-bg/60 px-4 py-2.5 text-sm text-ink">
              <span className="min-w-0 flex-1 basis-64 [overflow-wrap:anywhere]">
                <AlertTriangle className="mr-1.5 inline h-4 w-4 align-[-3px] text-warning" />
                {unmatchedAll.length} {unmatchedAll.length === 1 ? 'строка' : unmatchedAll.length < 5 ? 'строки' : 'строк'} счетов не {unmatchedAll.length === 1 ? 'привязана' : 'привязаны'} к позициям — их цен здесь не видно
              </span>
              <Button type="button" variant="secondary" onClick={() => setFixOpen((v) => !v)}>
                {fixOpen ? 'Свернуть' : 'Разобрать'}
              </Button>
            </div>
            {fixOpen && (
              <Card className="flex flex-col gap-3 p-4">
                {unmatchedPanel}
                {asidePanel}
              </Card>
            )}
          </div>
        )}

        {emptyPositions ? (
          <Card className="p-5">{sectionPicker}</Card>
        ) : columns.length === 0 ? (
          <Card className="p-5 text-sm text-ink-faint">Пока никто из «{country}» не прислал КП{countries.length > 1 ? ' — смените страну вверху' : ''}.</Card>
        ) : (
          <>
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
              <div className={cn(glassCardClass, 'overflow-hidden')} style={glassCardShadow}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <b className="text-sm text-ink">Позиции · {positions.length}</b>
                  <ToggleGroup options={['Все', 'Решить', 'Готово']} value={listFilter} onChange={(v) => setListFilter(v as typeof listFilter)} badges={{ Решить: todo.length }} />
                </div>
                {listFilter === 'Все' ? (
                  <>
                    {todo.length + none.length > 0 && (
                      <div className="bg-surface-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        Ждут решения · {todo.length}
                        {none.length ? ` + ${none.length} без предложений` : ''}
                      </div>
                    )}
                    {[...todo, ...none].map(posRow)}
                    {done.length > 0 && <div className="bg-surface-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Решено · {done.length}</div>}
                    {done.map(posRow)}
                  </>
                ) : listFiltered.length ? (
                  listFiltered.map(posRow)
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-ink-faint">{listFilter === 'Решить' ? 'Всё решено' : 'Пока ничего не выбрано'}</p>
                )}
              </div>
              {detail}
            </div>

            <div className="z-10 flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-lg sm:sticky sm:bottom-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
                {futureOrders.map(({ col, lines }, i) => {
                  const parts: MoneyPart[] = lines.map((x) => ({ amount: x.cell.unitPrice * (x.position.quantity ?? 0), currency: x.cell.currency }));
                  if (col.delivery != null) parts.push({ amount: col.delivery, currency: col.deliveryCurrency });
                  return (
                    <div key={col.offer.id} className="hidden min-w-0 text-xs text-ink-muted md:block">
                      Заказ {i + 1} · {col.offer.name}
                      <b className="block text-sm tabular-nums text-ink">
                        {lines.length} поз. · {sumMoney(parts, rate)}
                      </b>
                    </div>
                  );
                })}
                <div className="min-w-0 text-xs text-ink-muted md:border-l md:border-border md:pl-6">
                  Решено {done.length} из {positions.length}
                  {futureOrders.length ? ` · ${futureOrders.length} ${futureOrders.length === 1 ? 'заказ' : futureOrders.length < 5 ? 'заказа' : 'заказов'}` : ''}
                  <b className="block text-lg tabular-nums text-ink">{pickedCells.length ? total : '—'}</b>
                  {todo.length > 0 && <span className="block font-semibold text-warning">ещё {todo.length} без решения</span>}
                  {pickedDelivery.length > 0 && <span className="block">с доставкой</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {futureOrders.length === 0 && pickedCells.length > 0 ? (
                  <Link
                    to="/admin/purchases?tab=orders"
                    className="flex items-center gap-2 rounded-full bg-success/10 px-4 py-2.5 text-sm font-semibold text-success hover:bg-success/15"
                  >
                    <Check className="h-4 w-4" />
                    Отправлено на согласование · к заказам
                  </Link>
                ) : (
                  <Button type="button" icon={<Send className="h-4 w-4" />} onClick={() => void sendForApproval()} disabled={exportingPdf || creatingOrders || saving || futureOrders.length === 0}>
                    {exportingPdf
                      ? 'Готовим PDF…'
                      : creatingOrders
                        ? 'Создаём заказы…'
                        : pickedCells.length > unorderedCells.length
                          ? `Отправить ещё ${unorderedCells.length} поз. на согласование`
                          : 'Отправить на согласование'}
                  </Button>
                )}
              </div>
            </div>
            {orders.length > 0 && (
              <Link to="/admin/purchases?tab=orders" className="self-start text-sm text-ink-muted underline decoration-border-strong underline-offset-4 hover:text-ink">
                Заказы по категории во вкладке «Заказы» ({orders.length})
              </Link>
            )}
            {ordersError && <p className="text-xs text-danger">{ordersError}</p>}
          </>
        )}
        {sendModal}
      </div>
    );
  }

  if (layout === 'new') {
    const supplierName = (offerId: string) => columnById.get(offerId)?.offer.name ?? '';
    const suppliersWord = (n: number) => `${n} ${n === 1 ? 'поставщик' : n < 5 && n > 0 ? 'поставщика' : 'поставщиков'}`;
    const kindWord = (k: PurchaseItemMatchKind) => (k === 'exact' ? 'по запросу' : k === 'alternative' ? 'аналог' : 'уточнить');
    const countries = SUPPLIER_COUNTRIES.filter((c) => offers.some((o) => (o.country || SUPPLIER_COUNTRIES[0]) === c));
    const dateRu = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');

    const strictTotal = moneyTotal(recos.strict.parts, rate);
    const analogTotal = moneyTotal(recos.withAnalogs.parts, rate);
    const replacedExact = moneyTotal(recos.withAnalogs.replacedExactParts, rate);
    const replacedAnalog = moneyTotal(recos.withAnalogs.replacedAnalogParts, rate);
    const savings =
      replacedExact && replacedAnalog && replacedExact.currency === replacedAnalog.currency && replacedExact.amount > 0
        ? { amount: replacedExact.amount - replacedAnalog.amount, pct: (replacedExact.amount - replacedAnalog.amount) / replacedExact.amount, currency: replacedExact.currency }
        : null;

    const steps: { title: string; sub: string; state: 'done' | 'cur' | 'next' | 'warn' }[] = ([
      {
        title: 'Цены собраны',
        sub: `${funnel.confirmed} из ${offersInCountry.length} прислали КП · ${funnel.pricedPositions} из ${positions.length} позиций с ценой`,
        state: funnel.pricedPositions > 0 ? 'done' : 'cur',
      },
      {
        title: 'Выбор',
        sub: `${pickedCells.length} из ${positions.length} позиций выбрано`,
        state: reviewStatus !== 'draft' ? 'done' : funnel.pricedPositions > 0 ? 'cur' : 'next',
      },
      {
        title: 'Утверждение',
        sub:
          reviewStatus === 'approved'
            ? `утверждено ${dateRu(review?.decidedAt)}`
            : reviewStatus === 'sent'
              ? `отправлено ${dateRu(review?.sentAt)}${review?.sentTo ? ` на ${review.sentTo}` : ''}, ждём ответ`
              : reviewStatus === 'returned'
                ? `вернули${review?.comment ? `: «${review.comment}»` : ''}`
                : 'руководителю стройки',
        state: reviewStatus === 'approved' ? 'done' : reviewStatus === 'returned' ? 'warn' : reviewStatus === 'sent' ? 'cur' : 'next',
      },
    ] as typeof steps).slice(0, APPROVAL_FLOW_ENABLED ? 3 : 2);

    const stageAction = !APPROVAL_FLOW_ENABLED ? (
      <Button type="button" icon={<FileDown className="h-4 w-4" />} onClick={() => void exportPdf()} disabled={exportingPdf || pickedCells.length === 0}>
        {exportingPdf ? 'Готовим PDF…' : 'Скачать PDF'}
      </Button>
    ) : reviewStatus === 'approved' ? (
        <Button type="button" icon={<Package className="h-4 w-4" />} onClick={() => void createOrders()} disabled={creatingOrders || saving}>
          {creatingOrders ? 'Создаём заказы…' : 'Сформировать заказы'}
        </Button>
      ) : reviewStatus === 'sent' ? (
        <>
          <Button type="button" variant="secondary" onClick={returnReview} disabled={saving}>
            Вернули
          </Button>
          <Button type="button" onClick={approveReview} disabled={saving}>
            Утверждено
          </Button>
        </>
      ) : (
        <Button type="button" icon={<Send className="h-4 w-4" />} onClick={() => setSendOpen(true)} disabled={saving || pickedCells.length === 0}>
          <span className="sm:hidden">На утверждение</span>
          <span className="hidden sm:inline">Отправить на утверждение</span>
        </Button>
      );

    const menuItem = 'block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted disabled:opacity-50';
    const unmatchedNames = [...new Set(unmatchedAll.map((x) => x.offer.name))];

    return (
      <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xl font-bold text-ink">{request.title}</div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {request.sectionTitle ? `Раздел сметы «${request.sectionTitle}» · ` : ''}
              {positions.length} поз.
              {positions.length > 0 && ' · цены с НДС за объём ведомости'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={moreRef}>
              <Button type="button" variant="secondary" icon={<MoreHorizontal className="h-4 w-4" />} onClick={() => setMoreOpen((v) => !v)}>
                Ещё
              </Button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 flex w-64 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg" onClick={() => setMoreOpen(false)}>
                  <button type="button" className={menuItem} onClick={() => void exportPdf()} disabled={exportingPdf}>
                    {exportingPdf ? 'Готовим PDF…' : 'Скачать PDF'}
                  </button>
                  {!APPROVAL_FLOW_ENABLED && pickedCells.length > 0 && (
                    <button type="button" className={menuItem} onClick={() => void createOrders()} disabled={creatingOrders || saving}>
                      {creatingOrders ? 'Создаём заказы…' : 'Сформировать заказы'}
                    </button>
                  )}
                  {reviewStatus === 'sent' && (
                    <button type="button" className={menuItem} onClick={() => setSendOpen(true)} disabled={saving}>
                      Отправить ещё раз
                    </button>
                  )}
                  {APPROVAL_FLOW_ENABLED && reviewStatus === 'draft' && pickedCells.length > 0 && (
                    <button
                      type="button"
                      className={menuItem}
                      disabled={saving}
                      title="Если руководитель утвердил устно или в мессенджере"
                      onClick={() => void setReview({ status: 'approved', decidedAt: new Date().toISOString(), snapshot: buildSnapshot(picked, columnById, total, pickedDelivery.length ? sumMoney(pickedDelivery, rate) : null) })}
                    >
                      Утверждено без письма
                    </button>
                  )}
                  {APPROVAL_FLOW_ENABLED && reviewStatus !== 'draft' && (
                    <button type="button" className={menuItem} onClick={() => void setReview(null)} disabled={saving}>
                      Снова черновик
                    </button>
                  )}
                  {Object.keys(proposal).length > 0 && reviewStatus === 'draft' && (
                    <button type="button" className={menuItem} onClick={() => void saveProposal({})} disabled={saving}>
                      Очистить выбор
                    </button>
                  )}
                  {!emptyPositions && columns.length > 0 && (
                    <button
                      type="button"
                      className={menuItem}
                      onClick={() => void formSupply()}
                      disabled={saving}
                      title="Все предложения, которые не выбраны и ещё не помечены «Не покупаем», станут «Не покупаем» — цены останутся в сравнении и в отчёте"
                    >
                      Сформировать поставку
                    </button>
                  )}
                  {onShowOldView && (
                    <button type="button" className={menuItem} onClick={onShowOldView}>
                      Все цены таблицей (старый вид)
                    </button>
                  )}
                  {countries.length > 1 && (
                    <div className="border-t border-border px-3 pb-2 pt-2" onClick={(e) => e.stopPropagation()}>
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Поставщики из</span>
                      <ToggleGroup options={countries} value={country} onChange={setCountry} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="hidden flex-wrap items-center gap-2 sm:flex">{stageAction}</span>
          </div>
        </div>

        {snapshotDrift && (
          <p className="text-sm font-semibold text-danger">
            Сумма изменилась после отправки: было {snapshotDrift}, сейчас {total}. Отправьте заново или верните в черновик через «Ещё».
          </p>
        )}

        <div className={cn('grid grid-cols-1 overflow-hidden rounded-2xl border border-border', steps.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {steps.map((s, i) => (
            <div key={s.title} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                  s.state === 'done' ? 'bg-success-bg text-success' : s.state === 'cur' ? 'bg-ink text-white' : s.state === 'warn' ? 'bg-danger-bg text-danger' : 'bg-surface-muted text-ink-faint',
                )}
              >
                {s.state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <b className={cn('block text-sm', s.state === 'next' ? 'text-ink-faint' : 'text-ink')}>{s.title}</b>
                <span className="block text-xs text-ink-muted [overflow-wrap:anywhere]">{s.sub}</span>
              </span>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {!emptyPositions && (unmatchedAll.length > 0 || asideCount > 0) && (
          <div className="flex flex-col gap-3">
            {unmatchedAll.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning-bg/60 px-4 py-2.5 text-sm text-ink">
                <span className="min-w-0 flex-1 basis-64 [overflow-wrap:anywhere]">
                  <AlertTriangle className="mr-1.5 inline h-4 w-4 align-[-3px] text-warning" />
                  {unmatchedAll.length} {unmatchedAll.length === 1 ? 'строка' : unmatchedAll.length < 5 ? 'строки' : 'строк'} из счетов {unmatchedNames.slice(0, 3).join(', ')}
                  {unmatchedNames.length > 3 ? ` и ещё ${unmatchedNames.length - 3}` : ''} не {unmatchedAll.length === 1 ? 'привязана' : 'привязаны'} к позициям — их цены не видны в сравнении
                </span>
                <Button type="button" variant="secondary" onClick={() => setFixOpen((v) => !v)}>
                  {fixOpen ? 'Свернуть' : 'Разобрать'}
                </Button>
              </div>
            ) : (
              !fixOpen && (
                <button type="button" onClick={() => setFixOpen(true)} className="self-start text-xs font-medium text-ink-muted hover:text-ink">
                  Разобранные строки счетов, не вошедшие в сравнение ({asideCount})
                </button>
              )
            )}
            {fixOpen && (
              <>
                {unmatchedPanel}
                {asidePanel}
              </>
            )}
          </div>
        )}

        {emptyPositions ? (
          sectionPicker
        ) : columns.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Пока никто из «{country}» не прислал КП{countries.length > 1 ? ' — страну можно сменить в «Ещё»' : ''}.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                {
                  key: 'strict',
                  label: 'Строго по запросу',
                  value: strictTotal ? formatMoney(strictTotal.amount, strictTotal.currency) : '—',
                  desc: recos.strict.positions
                    ? `${recos.strict.positions} из ${positions.length} позиций · ${suppliersWord(recos.strict.offerIds.size)}`
                    : 'точно по запросу цен пока нет',
                  proposal: recos.strict.proposal,
                  count: recos.strict.positions,
                },
                {
                  key: 'analogs',
                  label: 'С аналогами там, где дешевле',
                  value: analogTotal ? formatMoney(analogTotal.amount, analogTotal.currency) : '—',
                  desc:
                    recos.withAnalogs.replaced + recos.withAnalogs.analogOnly === 0
                      ? 'аналоги не дешевле точных предложений'
                      : [
                          savings && recos.withAnalogs.replaced > 0
                            ? `−${formatMoney(savings.amount, savings.currency)} (−${Math.round(savings.pct * 100)} %) на ${recos.withAnalogs.replaced} поз., заменённых аналогом`
                            : recos.withAnalogs.replaced > 0
                              ? `${recos.withAnalogs.replaced} поз. заменены аналогом`
                              : '',
                          recos.withAnalogs.analogOnly > 0 ? `${recos.withAnalogs.analogOnly} поз. есть только аналогом` : '',
                        ]
                          .filter(Boolean)
                          .join(' · '),
                  proposal: recos.withAnalogs.proposal,
                  count: recos.withAnalogs.positions,
                },
              ].map((r) => {
                const applied = sameProposal(proposal, r.proposal);
                return (
                  <div key={r.key} className={cn('flex flex-wrap items-end justify-between gap-3 rounded-2xl border px-4 py-3', applied ? 'border-success/40 bg-success-bg' : 'border-border bg-surface-muted')}>
                    <div className="min-w-0 flex-1 basis-48">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{r.label}</span>
                      <span className="mt-1 block text-xl font-bold tabular-nums text-ink">{r.value}</span>
                      <span className="block text-xs text-ink-muted">{r.desc}</span>
                      <span className="block text-[11px] text-ink-faint">без доставки</span>
                    </div>
                    {applied ? (
                      <span className="shrink-0 text-sm font-semibold text-success">✓ Выбрано</span>
                    ) : (
                      <Button type="button" variant="secondary" disabled={saving || r.count === 0 || reviewStatus === 'approved'} onClick={() => applyRecommendation(r.proposal)} className="shrink-0">
                        Выбрать всё
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="hidden grid-cols-[1.5fr_1.3fr_1.3fr_1fr] gap-3 border-b border-border bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:grid">
                <span>Позиция</span>
                <span>
                  Точно по запросу <span className="font-medium normal-case tracking-normal text-ink-faint">· лучшая цена</span>
                </span>
                <span>
                  Аналоги <span className="font-medium normal-case tracking-normal text-ink-faint">· лучшая, к запросу</span>
                </span>
                <span className="text-right">Выбрано · сумма</span>
              </div>
              {positions.map((p) => {
                const po = positionOffers(p.id, columns);
                const pickedCell = pickedCellByPosition.get(p.id) ?? null;
                const open = expanded.has(p.id);
                const offersCount = po.exact.length + po.analogs.length;
                const unit = p.unit || 'ед.';
                const isPickedCell = (c: Cell | null) => !!c && !!pickedCell && pickedCell.offerId === c.offerId && pickedCell.itemId === c.itemId;
                const analogDelta = po.bestAnalog && po.bestExact ? deltaToPicked(po.bestAnalog, po.bestExact) : null;
                const bestCell = (c: Cell | null, extra: ReactNode) =>
                  c ? (
                    <span className={cn('inline-block min-w-0 max-w-full rounded-lg px-2 py-1 align-top', isPickedCell(c) && 'ring-1 ring-success')}>
                      <span className="block truncate text-sm font-semibold text-ink">{supplierName(c.offerId)}</span>
                      <span className="block text-xs tabular-nums text-ink-muted">
                        {formatUnit(c.unitPrice, c.currency)}/{unit}
                        {extra}
                      </span>
                    </span>
                  ) : null;
                const rowList = (list: Cell[], reference: Cell | null, title: string) => (
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      {title} · {list.length}
                    </span>
                    {list.length === 0 && <span className="px-1 text-xs text-ink-faint">нет предложений</span>}
                    {list.map((c) => {
                      const col = columnById.get(c.offerId);
                      if (!col) return null;
                      const d = reference && reference !== c ? deltaToPicked(c, reference) : null;
                      const picked = isPickedCell(c);
                      return (
                        <div key={c.offerId} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-2 text-xs', picked && 'ring-1 ring-success', c.excludedFromSupply && 'opacity-60')}>
                          <span className="min-w-0 flex-1 basis-40">
                            <button type="button" onClick={() => onOpenDetail(col.offer)} className="text-left text-sm font-semibold text-ink hover:underline">
                              {col.offer.name}
                            </button>
                            <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
                              <KindTag kind={c.kind} onClick={() => cycleKind(c)} title="Нажмите, чтобы сменить вид: по запросу → аналог → уточнить" />
                              {needsReview(c) && c.kind !== 'check' && <ReviewTag confidence={c.matchConfidence} recognition={c.recognitionConfidence} />}
                              {(c.vat === 'net' || c.vat === 'converted') && <VatTag vat={c.vat} rate={c.vatRate} />}
                              {c.excludedFromSupply && <span className="text-[11px] font-semibold text-ink-faint">не покупаем</span>}
                              {c.isArchived && <span className="text-[11px] text-ink-faint">из прошлого КП</span>}
                            </span>
                            {c.note && <NoteWithLinks text={c.note} className="block text-[11px] text-ink-muted [overflow-wrap:anywhere]" />}
                            <ShortfallLabel cell={c} p={p} />
                          </span>
                          <span className="w-20 text-right tabular-nums text-ink">{formatUnit(c.unitPrice, c.currency)}</span>
                          <span className={cn('w-12 text-right tabular-nums', d == null ? 'text-ink-faint' : d < -0.005 ? 'font-semibold text-success' : 'text-ink-muted')}>
                            {d == null ? '' : formatDelta(d).replace('та же цена', '=')}
                          </span>
                          <span className="w-20 text-right tabular-nums text-ink-muted">{p.quantity != null ? formatMoney(c.unitPrice * p.quantity, c.currency) : '—'}</span>
                          <PickButton cell={c} p={p} />
                        </div>
                      );
                    })}
                  </div>
                );
                return (
                  <div key={p.id} className="border-b border-border last:border-b-0">
                    <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1.5fr_1.3fr_1.3fr_1fr]">
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <span className="block text-sm font-semibold text-ink [overflow-wrap:anywhere]">{p.name}</span>
                        <span className="text-xs text-ink-muted">
                          {p.quantity != null ? p.quantity.toLocaleString('ru-RU') : '—'} {unit}
                          {offersCount > 0 && (
                            <>
                              {' · '}
                              <button type="button" onClick={() => toggleExpanded(p.id)} className="font-medium text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid">
                                {open ? 'свернуть' : `все предложения (${offersCount})`}
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[11px] text-ink-faint md:hidden">По запросу</span>
                        {bestCell(po.bestExact, null) ?? <span className="px-2 text-xs text-ink-faint">нет предложений</span>}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[11px] text-ink-faint md:hidden">Аналог</span>
                        {bestCell(
                          po.bestAnalog,
                          po.bestAnalog && (
                            <>
                              {' '}
                              {po.bestAnalog.kind === 'check' ? (
                                <span className="font-semibold text-warning">уточнить</span>
                              ) : analogDelta != null ? (
                                <span className={cn('font-semibold', analogDelta < -0.005 ? 'text-success' : 'text-ink-muted')}>{formatDelta(analogDelta)}</span>
                              ) : !po.bestExact ? (
                                <span className="text-ink-faint">нет точного</span>
                              ) : null}
                            </>
                          ),
                        ) ?? <span className="px-2 text-xs text-ink-faint">нет</span>}
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:flex-col md:items-end md:justify-center md:gap-0.5">
                        {pickedCell ? (
                          <>
                            <span className="min-w-0 truncate text-xs text-ink-muted md:text-right">
                              <span className={cn('font-semibold', pickedCell.kind === 'exact' ? 'text-success' : 'text-warning')}>{kindWord(pickedCell.kind)}</span> · {supplierName(pickedCell.offerId)}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-ink">{p.quantity != null ? formatMoney(pickedCell.unitPrice * p.quantity, pickedCell.currency) : '—'}</span>
                          </>
                        ) : offersCount > 0 ? (
                          <button type="button" onClick={() => toggleExpanded(p.id)} className="ml-auto rounded-full border border-border-strong px-3 py-1 text-xs font-semibold text-ink hover:border-success hover:text-success">
                            {open ? 'Свернуть' : 'Выбрать ▾'}
                          </button>
                        ) : (
                          <span className="ml-auto text-xs text-ink-faint">цен нет</span>
                        )}
                      </div>
                    </div>
                    {open && (
                      <div className="grid grid-cols-1 gap-3 bg-surface-muted px-3 py-3 lg:grid-cols-2">
                        {rowList(po.exact, po.bestExact, 'Точно по запросу')}
                        {rowList(po.analogs, po.bestExact ?? po.bestAnalog, 'Аналоги')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
              {onShowOldView && (
                <button type="button" onClick={onShowOldView} className="underline decoration-border-strong underline-offset-4 hover:text-ink">
                  Все цены таблицей
                </button>
              )}
              {orders.length > 0 && (
                <Link to="/admin/purchases?tab=orders" className="underline decoration-border-strong underline-offset-4 hover:text-ink">
                  Заказы по категории ({orders.length})
                </Link>
              )}
            </div>

            <div className="sticky bottom-3 z-10 flex items-center justify-between gap-2 rounded-2xl bg-ink px-3 py-3 sm:gap-3 sm:px-4 text-white shadow-lg">
              <div className="min-w-0 flex-1">
                <span className="block text-xs text-white/70">
                  <span className="sm:hidden">
                    Выбрано {pickedCells.length} из {positions.length}
                  </span>
                  <span className="hidden sm:inline">
                    Выбрано {pickedCells.length} из {positions.length} позиций{pickedOfferIds.size ? ` · ${suppliersWord(pickedOfferIds.size)}` : ''}
                    {pickedDelivery.length ? ' · с доставкой' : ''}
                  </span>
                </span>
                <span className="block whitespace-nowrap text-base font-bold tabular-nums sm:text-xl">{pickedCells.length > 0 ? total : '—'}</span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {APPROVAL_FLOW_ENABLED && <button type="button" onClick={() => void exportPdf()} disabled={exportingPdf} className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60">
                  <FileDown className="h-4 w-4" /> {exportingPdf ? 'Готовим PDF…' : 'PDF'}
                </button>}
                {stageAction}
              </div>
            </div>
          </>
        )}

        {sendModal}
      </Card>
    );
  }

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
          {!emptyPositions && columns.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              icon={<Check className="h-4 w-4" />}
              disabled={saving}
              onClick={() => void formSupply()}
              title="Все предложения, которые не отобраны кнопкой «Выбрать» и ещё не помечены «Не покупаем», станут «Не покупаем» — цены останутся в сравнении и в отчёте"
            >
              Сформировать поставку
            </Button>
          )}
          <Button type="button" variant="secondary" icon={<FileDown className="h-4 w-4" />} onClick={() => void exportPdf()} disabled={exportingPdf}>
            {exportingPdf ? 'Готовим PDF…' : APPROVAL_FLOW_ENABLED ? 'На утверждение' : 'Скачать PDF'}
          </Button>
        </div>
      </div>

      {funnelBlock}

      {/* Плашки — только про отобранное */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={cn('flex flex-col gap-0.5 rounded-control border px-4 py-3', pickedCells.length > 0 ? 'border-success/30 bg-success-bg' : 'border-border bg-surface-muted')}>
          <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {APPROVAL_FLOW_ENABLED ? 'На утверждение' : 'Выбрано'}
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
            {kinds.exact ?? 0} <span className="text-xs font-medium text-ink-muted">из ведомости</span> · {kinds.alternative ?? 0}{' '}
            <span className="text-xs font-medium text-ink-muted">аналог</span> · {kinds.check ?? 0} <span className="text-xs font-medium text-ink-muted">уточнить</span>
          </span>
          <span className="text-xs text-ink-muted">
            {kinds.check ? 'по позициям «уточнить» нужен ответ поставщика до заказа' : kinds.alternative ? 'аналоги согласовать по карточкам товара' : 'всё отобранное — позиции из ведомости'}
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

      {/* Ответ на «где заказать всё сразу» — до таблицы: сетка из позиций и
          поставщиков глазами не сравнивается (владелец, 2026-09-17). */}
      {!emptyPositions && columns.length > 1 && (
        <SingleSupplierPanel
          columns={columns}
          positions={positions}
          rate={rate}
          saving={saving}
          onPickAll={toggleColumn}
          riskOf={(o) => {
            const r = o.inn ? reliabilityByInn.get(o.inn) ?? null : null;
            return shouldFlag(r) && r ? { level: r.riskLevel === 'danger' ? 'danger' : 'warn', summary: riskSummary(r) } : null;
          }}
        />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Строки счетов без привязки — заметно и сверху, а не свёрнуто внизу:
          у красок 10 КП и 53 строки лежали тут, а таблица показывала 50 ячеек
          «не предложено». */}
      {unmatchedPanel}

      {/* Разобрано и в сравнение не идёт. Отдельно от оранжевого блока выше:
          там строки ЖДУТ решения, здесь оно уже принято (колеровка в цене
          краски, товар не из ведомости). Владелец, 2026-09-17: «мне нужно
          полностью распознанные счета» — счёт распознан полностью ровно
          тогда, когда у каждой его строки есть исход, а не когда исходов нет
          совсем. */}
      {asidePanel}


      {emptyPositions ? (
        sectionPicker
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
                          <tr
                            key={col.offer.id}
                            className={cn(
                              'border-t border-border align-top first:border-t-0',
                              isPicked && 'bg-success-bg shadow-[inset_3px_0_0_var(--color-success)]',
                              cell.excludedFromSupply && 'opacity-60',
                            )}
                          >
                            <td className="w-[26%] px-3 py-2">
                              <button type="button" onClick={() => onOpenDetail(col.offer)} className={cn('text-left font-semibold hover:underline', isPicked ? 'text-success' : 'text-ink')}>
                                {col.offer.name}
                              </button>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                {renderBadges(col.offer, { onRiskClick: () => onOpenDetail(col.offer) })}
                              </span>
                              <span className="block text-[11px] text-ink-muted">{col.delivery != null ? `доставка ${formatMoney(col.delivery, col.deliveryCurrency)}` : 'доставка не названа'}</span>
                            </td>
                            <td className="px-3 py-2 text-[12px] leading-snug text-ink">
                              <KindTag kind={cell.kind} onClick={() => cycleKind(cell)} title="Нажмите, чтобы сменить вид: позиция из ведомости → аналог → уточнить" />{' '}
                              {needsReview(cell) && cell.kind !== 'check' && (
                                <ReviewTag confidence={cell.matchConfidence} recognition={cell.recognitionConfidence} />
                              )}{' '}
                              <VatTag vat={cell.vat} rate={cell.vatRate} /> {cell.note}
                              {cell.isArchived && (
                                <span className="block text-ink-faint" title="Этой позиции нет в самом последнем счёте поставщика — цена из более раннего КП">
                                  архив{cell.quoteDate ? ` · счёт от ${formatDate(cell.quoteDate)}` : ''}
                                </span>
                              )}
                              {cell.excludedFromSupply && <span className="block font-semibold text-warning">не покупаем — цена для отчёта</span>}
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
                              <span className="flex flex-wrap items-center justify-end gap-1.5">
                                {!cell.excludedFromSupply && <PickButton cell={cell} p={p} />}
                                <ExcludeToggle cell={cell} p={p} />
                              </span>
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
                      <td
                        key={col.offer.id}
                        className={cn('px-3 py-2.5', isPicked && 'bg-success-bg shadow-[inset_3px_0_0_var(--color-success)]', cell.excludedFromSupply && 'opacity-60')}
                      >
                        <CellBody cell={cell} p={p} col={col} />
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {!cell.excludedFromSupply && <PickButton cell={cell} p={p} />}
                          <ExcludeToggle cell={cell} p={p} />
                        </span>
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
            <i className="inline-block h-3 w-3 rounded-sm border border-border bg-success-bg shadow-[inset_2px_0_0_var(--color-success)]" /> {APPROVAL_FLOW_ENABLED ? 'отобрано на утверждение' : 'выбрано'}
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
            <ReviewTag confidence={null} /> распознал или сопоставил ИИ-закупщик, уверенность ниже{' '}
            {Math.round(MATCH_CONFIDENCE_THRESHOLD * 100)}%
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
      {APPROVAL_FLOW_ENABLED && pickedCells.length > 0 && (
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
              {reviewStatus === 'approved' && (
                <Button type="button" icon={<Package className="h-4 w-4" />} onClick={() => void createOrders()} disabled={creatingOrders || saving}>
                  {creatingOrders ? 'Создаём заказы...' : 'Сформировать заказы'}
                </Button>
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

      {/* Заказы по этой категории (шаг 11 плана закупок). Снаружи листа
          согласования: отбор могут очистить или переиграть, а уже созданные
          заказы обязаны остаться на виду. */}
      {(orders.length > 0 || ordersError) && (
        <div className="flex flex-col gap-2 rounded-control border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Заказы поставщикам</span>
            <span className="text-[11px] text-ink-faint">Из утверждённого отбора, по одному на поставщика</span>
          </div>
          {ordersError && <p className="text-xs text-danger">{ordersError}</p>}
          {orders.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-sm first:border-t-0 first:pt-0">
              <span className="font-semibold text-ink">{order.number}</span>
              <span className="text-ink">{order.supplierName}</span>
              <span className="text-xs text-ink-muted">
                {order.items.length} поз.{order.delivery != null ? ` + доставка ${formatMoney(order.delivery, order.currency)}` : ''}
              </span>
              <span className="ml-auto font-semibold tabular-nums text-ink">{formatMoney(order.total, order.currency)}</span>
              <Select
                options={PURCHASE_ORDER_STATUSES.map((st) => PURCHASE_ORDER_STATUS_LABELS[st])}
                value={PURCHASE_ORDER_STATUS_LABELS[order.status]}
                onChange={(label) => {
                  const next = PURCHASE_ORDER_STATUSES.find((st) => PURCHASE_ORDER_STATUS_LABELS[st] === label);
                  if (next) void setOrderStatus(order, next);
                }}
                pill
                triggerClassName="py-1 text-xs"
              />
              <span className="w-full text-[11px] text-ink-faint">
                {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                {order.createdBy ? ` · ${order.createdBy}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {sendModal}
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

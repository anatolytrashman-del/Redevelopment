import { useEffect, useMemo, useState } from 'react';
import { Mail, Paperclip, Send, FileText, Save, ChevronDown, ChevronUp, Reply, FileSearch, CheckCircle2, Eye } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { cn } from '../../lib/cn';
import type { SupplierRequest, SupplierOffer } from '../../data/supplierResearch';
import { supplierOfferEmailAddress } from '../../data/supplierResearch';
import { updateSupplierOffer } from '../../lib/supplierResearchApi';
import type { SupplierOfferEmail, EmailExtractionItem } from '../../data/supplierOfferEmails';
import { sendSupplierOfferEmail, setSupplierOfferEmailExtractionStatus } from '../../lib/supplierOfferEmailsApi';
import type { EmailTemplate } from '../../data/emailTemplates';
import { renderEmailTemplate } from '../../lib/emailTemplates';
import { TemplateFormModal, TemplateManagerModal } from './EmailTemplates';
import { getCurrentProfile } from '../../lib/accessProfile';
import { DocumentPreviewModal, isPreviewable, type PreviewFile } from '../documents/DocumentPreviewModal';
import { currencies, type Currency } from '../../data/transactions';
import type { PurchaseItem } from '../../data/purchases';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Владелец, 2026-09-03: "обязательно нужно загружать вложения с
// возможностью предпросмотра" — для картинок показываем миниатюру прямо в
// ленте (клик открывает оригинал в новой вкладке), для остального (PDF,
// счета, спецификации) остаётся обычная ссылка — открывается в новой
// вкладке, где браузер сам умеет превью PDF.
function isImageFile(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg)$/i.test(fileName);
}

// Владелец, 2026-09-03, после живого теста: "текст, скрытый под спойлер в
// почтовом клиенте (в нашем случае On ... wrote: > ...) нужно скрывать под
// спойлер и выводить только ответ" — реальные ответы поставщиков приходят
// с процитированным предыдущим письмом внизу (стандартное поведение любого
// почтового клиента), это раздувает ленту. Эвристика best-effort (нельзя
// знать заранее локаль/формат клиента отправителя): ищем первую строку,
// которая либо начинается с ">" (стандартный маркер цитаты, кросс-клиентно),
// либо похожа на преамбулу вида "On ... wrote:"/"...писал(а):" — всё начиная
// с неё сворачивается. Не находим — весь текст видимый, ничего не прячем.
const QUOTE_PREAMBLE_RE = /^(On .+wrote:|.*писал\(а\):)\s*$/i;

function splitQuotedReply(body: string): { visible: string; quoted: string | null } {
  const lines = body.split('\n');
  let splitIndex = -1;
  let foundViaQuoteMarker = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('>')) {
      splitIndex = i;
      foundViaQuoteMarker = true;
      break;
    }
    if (QUOTE_PREAMBLE_RE.test(trimmed)) {
      splitIndex = i;
      break;
    }
  }
  if (splitIndex === -1) return { visible: body, quoted: null };

  // Преамбула вида "On ... wrote:" часто переносится почтовым клиентом на
  // несколько строк (Gmail рвёт длинные строки ~76 символов — реальный
  // пример владельца: "On Thu... <email>" и "wrote:" оказались на РАЗНЫХ
  // строках) — если границу нашли по ">", расширяем её назад через любые
  // непустые строки прямо перед ней, похожие на фрагмент такой преамбулы.
  // Идём только назад ОТ уже найденного ">" (не ищем "wrote:" в письме без
  // единой цитаты вообще) — иначе случайное "On the invoice..." в начале
  // обычного письма без квоты ложно свернулось бы целиком.
  if (foundViaQuoteMarker) {
    for (let i = splitIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === '') continue;
      if (/wrote:\s*$/i.test(trimmed) || /писал\(а\):\s*$/i.test(trimmed) || /^on\s/i.test(trimmed)) {
        splitIndex = i;
        continue;
      }
      break;
    }
  }

  const visible = lines.slice(0, splitIndex).join('\n').trimEnd();
  const quoted = lines.slice(splitIndex).join('\n');
  return { visible, quoted: quoted.trim() ? quoted : null };
}

// Владелец, тем же сообщением: "нужна возможность отвечать на это письмо,
// чтобы сохранялся и заголовок, и вся предыдущая история" — "Ответить" на
// конкретном письме треда подставляет в форму тему с "Re:" (если её там ещё
// нет) и цитату этого письма целиком (как в обычном email-клиенте, ">" на
// каждую строку + преамбула с датой/отправителем), а не пустой черновик.
function buildQuotedReply(e: SupplierOfferEmail): { subject: string; body: string } {
  const subject = /^re:/i.test(e.subject.trim()) ? e.subject : `Re: ${e.subject}`;
  const preamble = `${new Date(e.createdAt).toLocaleString('ru-RU')}, ${e.fromAddress} писал(а):`;
  const quotedLines = e.body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return { subject, body: `\n\n${preamble}\n${quotedLines}` };
}

// Распознавание счёта/КП из вложения (владелец, 2026-09-03: "давай подумаем,
// как сделать так, чтобы это КП было потом удобно перенести в карточку
// подрядчика... даже сумму и позиции из счета можем распознавать
// автоматически" → "делай на Haiku 4.5"). Раньше рядом была ещё и ручная
// кнопка "Распознать данные автоматически" в предпросмотре вложения — тем
// же днём убрана ("Убирай эту кнопку, раз система сама распознает данные"):
// автоматика (api/purchase-email-webhook.js, по числу страниц вложения +
// классификация моделью) срабатывает на каждом входящем письме сама, кладёт
// результат в email.extraction (status:'pending') — здесь только
// подтверждение/отклонение уже готового результата, без ручного триггера.
function isValidCurrency(value: string | null): value is Currency {
  return !!value && (currencies as readonly string[]).includes(value);
}

function pluralPositions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'позиция';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'позиции';
  return 'позиций';
}

// Пишет распознанные цену/валюту/позиции в карточку предложения и, если
// известен источник (sourceFile — сам файл, который распознавали),
// прикрепляет его к тем же файлам предложения — владелец, 2026-09-03:
// "давай верстать таблицу" (вместо текстовой простыни в "Требованиях",
// см. историю в EMAIL_CORRESPONDENCE_PLAN.md) + "давай подкреплять в
// карточку файл КП из письма". Позиции ДОБАВЛЯЮТСЯ к уже существующим
// (не затирают то, что уже было в карточке вручную), файл — тоже, с
// дедупликацией по url (повторное подтверждение того же письма не
// плодит копии). currency из распознавания может не совпасть ни с одним
// известным значением (модели явно запрещено гадать, возвращает null,
// если не уверена) — тогда валюту карточки не трогаем.
async function applyExtractionToOffer(
  offer: SupplierOffer,
  extraction: { price: number | null; currency: string | null; items: EmailExtractionItem[] },
  sourceFile: { url: string; fileName: string } | null,
): Promise<SupplierOffer> {
  const newItems: PurchaseItem[] = extraction.items.map((i) => ({
    id: crypto.randomUUID(),
    sourceMaterialId: null,
    name: i.name,
    unit: i.unit,
    quantity: i.quantity,
    price: i.price,
    note: '',
  }));
  const files =
    sourceFile && !offer.files.some((f) => f.url === sourceFile.url)
      ? [...offer.files, { url: sourceFile.url, fileName: sourceFile.fileName }]
      : offer.files;
  return updateSupplierOffer(offer.id, {
    requestId: offer.requestId,
    name: offer.name,
    contact: offer.contact,
    contactMethod: offer.contactMethod,
    email: offer.email,
    websiteUrl: offer.websiteUrl,
    catalogModelName: offer.catalogModelName,
    catalogModelPhoto: offer.catalogModelPhoto,
    communicationStatus: offer.communicationStatus,
    price: extraction.price ?? offer.price,
    currency: isValidCurrency(extraction.currency) ? extraction.currency : offer.currency,
    deadline: offer.deadline,
    requirements: offer.requirements,
    items: [...offer.items, ...newItems],
    files,
  });
}

// Черновик первого письма по умолчанию (до выбора сохранённого шаблона) —
// владелец, 2026-09-03, прислал готовый текст ("Заголовок письма по
// умолчанию... По умолчанию все письма выглядят так..."). "Категория" в
// его формулировке — это сам запрос Ресерча (та же категория, что и
// бейдж на треде, см. комментарий у SupplierCorrespondenceTab ниже), не
// свободный текст. Подпись — не захардкожена "Альмира" (в его примере это
// была она сама, тестировавшая форму), а имя реально вошедшего сотрудника
// (getCurrentProfile) — иначе письма от Светланы или владельца подписывались
// бы чужим именем.
//
// Владелец, тем же днём после живого теста: "После отправки запроса не
// нужно выводить еще раз шаблон письма под перепиской, он уже будет не
// актуален" — этот вводный текст ("Добрый день, планируем реновацию...")
// имеет смысл только для ПЕРВОГО письма в треде. Как только в треде уже
// есть хоть одно письмо (отправленное или полученное), новый черновик
// начинается пустым, а не с того же интро — hasHistory решает это.
function defaultSubject(request: SupplierRequest, hasHistory: boolean): string {
  return hasHistory ? '' : `Запрос цены на ${request.title}`;
}

function defaultBody(request: SupplierRequest, hasHistory: boolean): string {
  if (hasHistory) return '';
  const signature = getCurrentProfile().displayName;
  return `Добрый день.
Планируем реновацию здания в г. Минск, интересуют ${request.title}.

В вашем каталоге понравились следующие модели:


Оплата со счета юрлица. Просьба прислать коммерческое предложение.

С уважением,
${signature}`;
}

// Лента писем + форма ответа — общий компонент для полноэкранной вкладки
// "Переписка" и для OfferEmailModal (карточка отдельного предложения), см.
// EMAIL_CORRESPONDENCE_PLAN.md, этап 2: "вынести разметку ленты в общий
// компонент, чтобы не было двух копий". Данные (emails) и их обновление —
// снаружи (в Suppliers.tsx, единый источник правды на всю страницу), сама
// отправка — здесь, единственное место в коде, которое реально шлёт письмо
// по предложению.
export function EmailThread({
  offer,
  request,
  requests,
  emails,
  templates,
  onEmailSent,
  onTemplateSaved,
  onOfferUpdated,
  onEmailUpdated,
}: {
  offer: SupplierOffer;
  request: SupplierRequest;
  requests: SupplierRequest[];
  emails: SupplierOfferEmail[];
  templates: EmailTemplate[];
  onEmailSent: (email: SupplierOfferEmail) => void;
  onTemplateSaved: (template: EmailTemplate) => void;
  onOfferUpdated: (offer: SupplierOffer) => void;
  onEmailUpdated: (email: SupplierOfferEmail) => void;
}) {
  const [subject, setSubject] = useState(() => defaultSubject(request, emails.length > 0));
  const [body, setBody] = useState(() => defaultBody(request, emails.length > 0));
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // Какие письма развёрнуты (показана свёрнутая цитата целиком) — по id,
  // сбрасывается сам собой при смене offer (новый emails-список).
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Set<string>>(new Set());
  // Владелец, 2026-09-03: "форма пустого письма не нужна, лучше сделай саму
  // кнопку Ответить побольше" — форма Тема/Сообщение не висит постоянно, а
  // открывается по "Ответить" на конкретном письме. Отдельная кнопка
  // "Написать" (для сообщения не в ответ на конкретное письмо) была здесь же,
  // убрана тем же днём ("Убирай кнопку написать, оставляем только Ответить").
  // Открыта по умолчанию только когда в треде вообще ещё нет писем — иначе
  // первое письмо было бы физически некому "ответить".
  const [composerOpen, setComposerOpen] = useState(emails.length === 0);
  // Предпросмотр вложения (владелец: "мне бы предпросмотр, как договора") —
  // просто просмотр PDF/докс/картинки прямо в приложении, без ручной кнопки
  // распознавания (была здесь, убрана владельцем 2026-09-03 — см. комментарий
  // выше про isValidCurrency: автоматика справляется сама).
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);

  // Черновик по умолчанию завязан на конкретное предложение/запрос — при
  // переключении между тредами (вкладка "Переписка") нужно пересчитать
  // и тему, и текст, иначе останется черновик предыдущего поставщика.
  // Новый тред = чистый черновик, ничего печатного до этого момента тут
  // не теряется — сброс срабатывает только на реальную смену offer.id.
  // hasHistory читает emails на момент срабатывания эффекта (не входит в
  // зависимости намеренно) — важно только "было ли хоть одно письмо к
  // моменту открытия ЭТОГО треда", не реагировать на каждое новое письмо.
  useEffect(() => {
    const hasHistory = emails.length > 0;
    setSubject(defaultSubject(request, hasHistory));
    setBody(defaultBody(request, hasHistory));
    setSendError(null);
    setSelectedTemplateId('');
    setComposerOpen(!hasHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  // Шаблоны этого запроса первыми, общие — следом (EMAIL_CORRESPONDENCE_PLAN.md,
  // этап 3: "сначала шаблоны с request_id этого запроса, затем общие").
  const orderedTemplates = useMemo(() => {
    const own = templates.filter((t) => t.requestId === request.id);
    const shared = templates.filter((t) => t.requestId !== request.id);
    return [...own, ...shared];
  }, [templates, request.id]);

  function handlePickTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    // Не затираем молча уже напечатанный текст — только тема (короткая,
    // почти всегда одна и та же по умолчанию) заменяется без вопросов.
    if (body.trim() && !window.confirm('Заменить уже введённый текст письма шаблоном?')) return;
    const rendered = renderEmailTemplate(template, { offer, request });
    setSubject(rendered.subject);
    setBody(rendered.body);
  }

  function handleReplyTo(e: SupplierOfferEmail) {
    if ((subject.trim() || body.trim()) && !window.confirm('Заменить черновик цитатой этого письма?')) return;
    const quoted = buildQuotedReply(e);
    setSubject(quoted.subject);
    setBody(quoted.body);
    setSelectedTemplateId('');
    setComposerOpen(true);
  }

  function toggleQuoteExpanded(emailId: string) {
    setExpandedQuoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }

  function openPreview(f: PreviewFile) {
    setPreviewFile(f);
  }

  function closePreview() {
    setPreviewFile(null);
  }

  // Владелец, 2026-09-03: "я не вижу счёт, но есть кнопка подтвердить. А
  // если смотрю счёт в предпросмотре, нет кнопки подтвердить — нелогично" —
  // решение: карточка "Похоже, это счёт" открывает предпросмотр САМОГО
  // файла (не просто сводку), а кнопки подтверждения/отклонения переезжают
  // в футер предпросмотра — рядом с уже видимым документом. Это письмо
  // (если есть) ищем по совпадению url текущего previewFile с
  // sourceFile — так футер понимает, что показывать, независимо от того,
  // как открыт предпросмотр (кнопка на карточке или обычный клик по
  // вложению).
  const previewExtractionEmail = previewFile
    ? emails.find((e) => e.extraction?.status === 'pending' && e.extraction.sourceFile?.url === previewFile.url) ?? null
    : null;

  async function handleConfirmAutoExtraction(e: SupplierOfferEmail) {
    if (!e.extraction || applyingExtraction) return;
    setApplyingExtraction(true);
    setExtractionError(null);
    try {
      const updated = await applyExtractionToOffer(offer, e.extraction, e.extraction.sourceFile ?? null);
      onOfferUpdated(updated);
      await setSupplierOfferEmailExtractionStatus(e.id, e.extraction, 'confirmed');
      onEmailUpdated({ ...e, extraction: { ...e.extraction, status: 'confirmed' } });
      closePreview();
    } catch (err) {
      setExtractionError(errorMessage(err, 'Не удалось применить распознанные данные'));
    } finally {
      setApplyingExtraction(false);
    }
  }

  async function handleDismissAutoExtraction(e: SupplierOfferEmail) {
    if (!e.extraction) return;
    const extraction = e.extraction;
    try {
      await setSupplierOfferEmailExtractionStatus(e.id, extraction, 'dismissed');
      onEmailUpdated({ ...e, extraction: { ...extraction, status: 'dismissed' } });
      closePreview();
    } catch {
      // Тихий сбой достаточен — карточка просто останется видна, можно
      // нажать ещё раз, это не критичное действие.
    }
  }

  async function handleSend() {
    if (!offer.email || !body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const email = await sendSupplierOfferEmail({ offerId: offer.id, toAddress: offer.email, subject, body });
      onEmailSent(email);
      setBody('');
      setComposerOpen(false);
    } catch (err) {
      setSendError(errorMessage(err, 'Не удалось отправить письмо'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <span>Email: {offer.email || 'не указан'}</span>
        <span>Адрес для переписки: {supplierOfferEmailAddress(offer.shortCode)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">Переписка</span>
        {extractionError && <p className="text-sm text-danger">{extractionError}</p>}
        {emails.length === 0 && <p className="text-sm text-ink-faint">Писем пока нет.</p>}
        {emails.length > 0 && (
          <div className="flex flex-col gap-2">
            {/* Владелец, 2026-09-03: "когда много писем, приходится листать в
                самый низ... я бы делал обратную хронологию — последнее письмо
                наверху" — [...emails] копия перед reverse(), исходный emails
                (по возрастанию даты) нужен как есть в других местах (threadStatus
                читает emails[emails.length-1] как последнее). */}
            {[...emails].reverse().map((e) => {
              const { visible, quoted } = splitQuotedReply(e.body);
              const isQuoteExpanded = expandedQuoteIds.has(e.id);
              return (
              <div
                key={e.id}
                className={cn(
                  'flex flex-col gap-1 rounded-control p-3 text-sm',
                  // Владелец, 2026-09-03: "слишком много красного цвета...
                  // остальное делай нейтральным" — направление письма теперь
                  // различимо только отступом (ml/mr) и подписью
                  // "Отправлено"/"Получено", без цветового акцента.
                  e.direction === 'out' ? 'ml-6 border border-border bg-surface' : 'mr-6 bg-surface-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {e.direction === 'out' ? 'Отправлено' : 'Получено'}
                  </span>
                  <span>{new Date(e.createdAt).toLocaleString('ru-RU')}</span>
                </div>
                {e.subject && <div className="font-semibold text-ink">{e.subject}</div>}
                {/* Владелец, 2026-09-03: "все приложения к письмам в виде файлов
                    пусть прикрепляются к верху письма" — вложения сразу после
                    темы, до текста, а не в самом низу карточки. */}
                {e.files.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {e.files.map((f, i) =>
                      isImageFile(f.fileName) ? (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block w-fit">
                          <img
                            src={f.url}
                            alt={f.fileName}
                            className="max-h-48 max-w-full rounded-control border border-border object-contain"
                          />
                        </a>
                      ) : isPreviewable(f.fileName) ? (
                        // Владелец: "мне бы предпросмотр, как договора" —
                        // открываем в DocumentPreviewModal вместо новой
                        // вкладки браузера.
                        <button
                          key={i}
                          type="button"
                          onClick={() => openPreview(f)}
                          className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-left text-xs text-ink hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                        </button>
                      ) : (
                        <a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-ink hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                        </a>
                      ),
                    )}
                  </div>
                )}
                {/* Владелец, 2026-09-03: "система [должна] понимать, что перед
                    ней счёт... а Альмира только сверяла и подтверждала" —
                    автоматически распознанный счёт ждёт подтверждения прямо
                    здесь, рядом с письмом, из которого он взят. Тем же днём,
                    доработка: "я не вижу счёт, но есть кнопка подтвердить...
                    нелогично" — карточка теперь только сводка + кнопка
                    "Посмотреть и подтвердить", сам выбор (подтвердить/это не
                    счёт) — в футере предпросмотра, рядом с открытым файлом
                    (см. previewExtractionEmail выше). Прямые кнопки здесь —
                    только запасной путь для писем без sourceFile (записи до
                    того, как это поле появилось) — посмотреть файл негде. */}
                {e.extraction?.status === 'pending' && (
                  <div className="flex flex-col gap-2 rounded-control border border-border-strong bg-surface-muted p-3 text-sm">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <FileSearch className="h-4 w-4 text-ink-muted" />
                      Похоже, это счёт от {offer.name}
                    </div>
                    <div className="text-ink">
                      {e.extraction.price != null ? `${e.extraction.price} ${e.extraction.currency ?? ''}`.trim() : 'Сумма не распознана'}
                      {e.extraction.items.length > 0 && ` · ${e.extraction.items.length} ${pluralPositions(e.extraction.items.length)}`}
                    </div>
                    {e.extraction.sourceFile ? (
                      <Button
                        type="button"
                        icon={<Eye className="h-4 w-4" />}
                        className="w-fit"
                        onClick={() => openPreview(e.extraction!.sourceFile!)}
                      >
                        Посмотреть и подтвердить
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => handleConfirmAutoExtraction(e)}
                          disabled={applyingExtraction}
                        >
                          Подтвердить и заполнить карточку
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => handleDismissAutoExtraction(e)} disabled={applyingExtraction}>
                          Это не счёт
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-ink">{visible}</div>
                {quoted && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => toggleQuoteExpanded(e.id)}
                      className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink"
                    >
                      {isQuoteExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isQuoteExpanded ? 'Скрыть историю переписки' : 'Показать историю переписки'}
                    </button>
                    {isQuoteExpanded && (
                      <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-2 text-ink-faint">{quoted}</div>
                    )}
                  </div>
                )}
                {/* Владелец, 2026-09-03: "форма пустого письма не нужна, лучше
                    сделай саму кнопку Ответить побольше" — обычная кнопка
                    вместо мелкой текстовой ссылки. */}
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Reply className="h-4 w-4" />}
                  onClick={() => handleReplyTo(e)}
                  className="mt-1 w-fit"
                >
                  Ответить
                </Button>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {!offer.email ? (
        <p className="text-sm text-ink-faint">У предложения не указан email — добавьте его через «Редактировать», чтобы писать отсюда.</p>
      ) : !composerOpen ? null : (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {orderedTemplates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-muted">Шаблон</span>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handlePickTemplate(e.target.value)}
                  className="flex-1 rounded-control border border-transparent bg-surface-muted px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
                >
                  <option value="">Без шаблона</option>
                  {orderedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Input label="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea label="Сообщение" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          {sendError && <p className="text-sm text-danger">{sendError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setComposerOpen(false)} disabled={sending}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={<Save className="h-4 w-4" />}
              onClick={() => setSaveTemplateOpen(true)}
              disabled={!subject.trim() && !body.trim()}
            >
              Сохранить как шаблон
            </Button>
            <Button type="button" icon={<Send className="h-4 w-4" />} onClick={handleSend} disabled={!body.trim() || sending}>
              {sending ? 'Отправляем...' : 'Отправить'}
            </Button>
          </div>
        </div>
      )}

      <TemplateFormModal
        open={saveTemplateOpen}
        template={null}
        requests={requests}
        initialSubject={subject}
        initialBody={body}
        onClose={() => setSaveTemplateOpen(false)}
        onSaved={onTemplateSaved}
      />

      <DocumentPreviewModal
        file={previewFile}
        onClose={closePreview}
        footer={
          previewExtractionEmail?.extraction && (
            <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <FileSearch className="h-4 w-4 text-ink-muted" />
                Распознанные данные
              </div>
              <div className="text-ink">
                {previewExtractionEmail.extraction.price != null
                  ? `${previewExtractionEmail.extraction.price} ${previewExtractionEmail.extraction.currency ?? ''}`.trim()
                  : 'Сумма не распознана'}
                {previewExtractionEmail.extraction.items.length > 0 &&
                  ` · ${previewExtractionEmail.extraction.items.length} ${pluralPositions(previewExtractionEmail.extraction.items.length)}`}
              </div>
              {extractionError && <p className="text-sm text-danger">{extractionError}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={() => handleConfirmAutoExtraction(previewExtractionEmail)}
                  disabled={applyingExtraction}
                >
                  Подтвердить и заполнить карточку
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleDismissAutoExtraction(previewExtractionEmail)}
                  disabled={applyingExtraction}
                >
                  Это не счёт
                </Button>
              </div>
            </div>
          )
        }
      />
    </div>
  );
}

type ThreadStatus = 'unread' | 'sent' | 'replied' | 'none';

// Владелец не хранится нигде отдельно — статус всегда пересчитывается из
// самой переписки (см. EMAIL_CORRESPONDENCE_PLAN.md, этап 2): "Не писали"
// (писем нет), "Отправлено" (есть исходящее, ответа нет), "Ответили"
// (последнее письмо входящее — unread красным счётчиком поверх статуса,
// если ещё не открывали тред).
function threadStatus(emails: SupplierOfferEmail[]): { status: ThreadStatus; unreadCount: number } {
  const unreadCount = emails.filter((e) => e.direction === 'in' && !e.readAt).length;
  if (emails.length === 0) return { status: 'none', unreadCount: 0 };
  const last = emails[emails.length - 1];
  if (unreadCount > 0) return { status: 'unread', unreadCount };
  return { status: last.direction === 'in' ? 'replied' : 'sent', unreadCount: 0 };
}

const STATUS_LABEL: Record<ThreadStatus, string> = {
  none: 'Не писали',
  sent: 'Отправлено',
  replied: 'Ответили',
  unread: 'Ответили',
};

const STATUS_CLASS: Record<ThreadStatus, string> = {
  none: 'text-ink-faint',
  sent: 'text-ink-muted',
  replied: 'text-success',
  unread: 'text-success',
};

interface RequestGroup {
  request: SupplierRequest;
  offers: { offer: SupplierOffer; emails: SupplierOfferEmail[] }[];
}

// Слева — дерево Запрос → Поставщик (только те, у кого есть email — писать
// больше некому), справа — тред выбранного. Владелец, 2026-09-03: "точно
// нужна группировка по подрядчику, метка с категорией... ну и сама
// группировка по этому тегу" — категория тут это сам запрос Ресерча
// (согласовано отдельно, см. EMAIL_CORRESPONDENCE_PLAN.md п.0), второго
// поля-тега не заводили.
export function SupplierCorrespondenceTab({
  requests,
  offers,
  emails,
  templates,
  onEmailSent,
  onMarkRead,
  onTemplatesChange,
  onOfferUpdated,
  onEmailUpdated,
}: {
  requests: SupplierRequest[];
  offers: SupplierOffer[];
  emails: SupplierOfferEmail[];
  templates: EmailTemplate[];
  onEmailSent: (email: SupplierOfferEmail) => void;
  onMarkRead: (offerId: string) => void;
  onTemplatesChange: (templates: EmailTemplate[]) => void;
  onOfferUpdated: (offer: SupplierOffer) => void;
  onEmailUpdated: (email: SupplierOfferEmail) => void;
}) {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);

  function handleTemplateSaved(saved: EmailTemplate) {
    onTemplatesChange(templates.some((t) => t.id === saved.id) ? templates.map((t) => (t.id === saved.id ? saved : t)) : [...templates, saved]);
  }

  const groups = useMemo<RequestGroup[]>(() => {
    const byRequest = new Map<string, RequestGroup>();
    for (const request of requests) {
      byRequest.set(request.id, { request, offers: [] });
    }
    for (const offer of offers) {
      if (!offer.email) continue; // некому писать — не показываем
      const group = byRequest.get(offer.requestId);
      if (!group) continue;
      const offerEmails = emails.filter((e) => e.offerId === offer.id);
      group.offers.push({ offer, emails: offerEmails });
    }
    const withSortedOffers = [...byRequest.values()]
      .filter((g) => g.offers.length > 0)
      .map((g) => ({
        ...g,
        offers: g.offers.sort((a, b) => {
          const sa = threadStatus(a.emails);
          const sb = threadStatus(b.emails);
          if (sa.unreadCount !== sb.unreadCount) return sb.unreadCount - sa.unreadCount;
          const lastA = a.emails[a.emails.length - 1]?.createdAt ?? '';
          const lastB = b.emails[b.emails.length - 1]?.createdAt ?? '';
          if (lastA !== lastB) return lastB.localeCompare(lastA);
          return a.offer.name.localeCompare(b.offer.name, 'ru');
        }),
      }));
    // Владелец, 2026-09-03: "поднимай непрочитанные письма и поставщиков с
    // ними в левом боковом меню в верх списка" — сортировка offers внутри
    // группы (выше) уже поднимала поставщика наверх ВНУТРИ своего запроса,
    // но сами запросы (категории) шли в исходном порядке. Теперь категория
    // с хотя бы одним непрочитанным письмом целиком поднимается над
    // категориями без непрочитанных — .sort() в JS стабилен, поэтому
    // порядок внутри одинакового unread-счёта не меняется.
    return withSortedOffers.sort((a, b) => {
      const unreadA = a.offers.reduce((sum, x) => sum + threadStatus(x.emails).unreadCount, 0);
      const unreadB = b.offers.reduce((sum, x) => sum + threadStatus(x.emails).unreadCount, 0);
      return unreadB - unreadA;
    });
  }, [requests, offers, emails]);

  const selected = useMemo(() => {
    if (!selectedOfferId) return null;
    for (const group of groups) {
      const found = group.offers.find((x) => x.offer.id === selectedOfferId);
      if (found) return { ...found, request: group.request };
    }
    return null;
  }, [groups, selectedOfferId]);

  function selectOffer(offerId: string) {
    setSelectedOfferId(offerId);
    onMarkRead(offerId);
  }

  const templatesButton = (
    <Button type="button" variant="secondary" icon={<FileText className="h-4 w-4" />} className="w-fit" onClick={() => setTemplatesModalOpen(true)}>
      Шаблоны
    </Button>
  );

  const templatesModal = (
    <TemplateManagerModal
      open={templatesModalOpen}
      templates={templates}
      requests={requests}
      onClose={() => setTemplatesModalOpen(false)}
      onChange={onTemplatesChange}
    />
  );

  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {templatesButton}
        <Card className="py-10 text-center text-sm text-ink-muted">
          Пока не с кем переписываться — у предложений в Ресерче ещё нет email, или запросов вовсе нет.
        </Card>
        {templatesModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {templatesButton}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
          {groups.map((group) => (
            <div key={group.request.id} className="flex flex-col gap-1.5">
              <span className="w-fit rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                {group.request.title}
              </span>
              <div className="flex flex-col gap-1">
                {group.offers.map(({ offer, emails: offerEmails }) => {
                  const { status, unreadCount } = threadStatus(offerEmails);
                  const isSelected = selectedOfferId === offer.id;
                  return (
                    <button
                      key={offer.id}
                      type="button"
                      onClick={() => selectOffer(offer.id)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-sm transition-colors',
                        isSelected ? 'border-ink bg-surface-muted' : 'border-border bg-surface hover:border-border-strong',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{offer.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                            {unreadCount}
                          </span>
                        )}
                        <span className={cn('text-xs', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Card className="flex-1 p-5">
          {!selected ? (
            <p className="text-sm text-ink-faint">Выберите поставщика слева, чтобы открыть переписку.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold text-ink">{selected.offer.name}</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                  {selected.request.title}
                </span>
              </div>
              <EmailThread
                offer={selected.offer}
                request={selected.request}
                requests={requests}
                emails={selected.emails}
                templates={templates}
                onEmailSent={onEmailSent}
                onTemplateSaved={handleTemplateSaved}
                onOfferUpdated={onOfferUpdated}
                onEmailUpdated={onEmailUpdated}
              />
            </div>
          )}
        </Card>
      </div>
      {templatesModal}
    </div>
  );
}

// Общий счётчик непрочитанных по всей переписке — бейдж поверх вкладки
// "Email" в ToggleGroup (Suppliers.tsx, проп badges).
export function countUnreadSupplierEmails(emails: SupplierOfferEmail[]): number {
  return emails.filter((e) => e.direction === 'in' && !e.readAt).length;
}

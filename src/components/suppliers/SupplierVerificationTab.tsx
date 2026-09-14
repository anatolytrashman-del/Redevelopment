import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, CheckCircle2, ExternalLink, ImagePlus, Loader2, MessageCircle, Phone, Play, Send, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ContactValue } from '../ui/ContactValue';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { logActivity } from '../../lib/activityLogApi';
import { formatPhoneDisplay } from '../../lib/formatPhone';
import { updateSupplierOffer } from '../../lib/supplierResearchApi';
import { countryFlag, messengerLink, supplierWebsiteFullUrl, supplierWebsiteHost, SUPPLIER_COUNTRIES, type SupplierOffer } from '../../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';
import type { SupplierScreenshot } from '../../data/supplierScreenshots';
import { deleteSupplierScreenshot, fetchSupplierScreenshots, uploadSupplierScreenshot } from '../../lib/supplierScreenshotsApi';
import { fetchSupplierMenuCaptures, fetchSupplierMenuCaptureHosts, type SupplierMenuCapture } from '../../lib/supplierMenuCapturesApi';
import { CONTACT_CAPTURE_SAVED_EVENT, MENU_CAPTURE_SAVED_EVENT } from '../../lib/menuCaptureReceiver';
import { CONTACTS_BOOKMARKLET_HREF, MENU_BOOKMARKLET_HREF } from '../../data/bookmarkletLinks';
import {
  fetchSupplierContactCaptures,
  markSupplierContactCapture,
  type SupplierContactCapture,
  type SupplierContactCaptureKind,
} from '../../lib/supplierContactCapturesApi';

// Вкладка "Верификация" на странице Закупки. Владелец, 2026-09-13 (второй
// заход, после первой версии с редактируемым чек-листом категорий — снята
// по прямой правке "не будем отмечать категории вручную"): карточка
// поставщика в РЕЖИМЕ ПРОСМОТРА + сайт поставщика соседней вкладкой (см.
// openSupplierSiteTab ниже), одной кнопкой "Верифицировать" — без правки
// категорий. Категории здесь только показываются (для контекста, что этот
// сайт вообще продаёт), присваивает их по-прежнему классификатор
// (supplier_site_snapshots.categories, см. data/supplyCategories.ts).
//
// "Верифицировать" переиспользует УЖЕ СУЩЕСТВУЮЩИЙ признак
// SupplierOffer.verified (владелец, 2026-09-04: "поставщика заводят из
// поиска — verified=false, закупщик сверяет и подтверждает") — та же кнопка,
// что раньше была доступна только по одной карточке за раз в общем списке
// "Поставщики"; эта вкладка просто даёт для неё выделенную очередь с
// превью сайта, не новый смысл поля.
//
// Единица очереди — ДОМЕН (не карточка-предложение): у одной компании
// может быть несколько карточек-предложений под разные категории закупки
// с одним и тем же сайтом. Владелец, 2026-09-13: "если поставщика
// апрувнули в одной категории, значит он автоматически апрувнулся и во
// всех" — "Верифицировать" помечает verified=true СРАЗУ у всех
// карточек-предложений с этим доменом, поэтому очередь и показывает
// уникальное число поставщиков, а не число карточек.
//
// Сайт поставщика — соседняя ВКЛАДКА того же окна, а не встроенный iframe и
// не отдельное окно. История: 2026-09-13 (четвёртый заход) владелец просил
// «точно как в верификации объявлений с рынка» — позиционированное окно на
// половину экрана, как openAdWindow в MarketOffersReview.tsx. 2026-09-14 это
// отменено им же: «в этом окне нет закладок, правильнее открывать сайт
// поставщика в новой вкладке этого же браузера». Причина конкретная — со
// вчера разметку каталога снимает закладка «Снять меню»
// (tools/menu-bookmarklet), а панели закладок у всплывающего окна нет вовсе,
// то есть инструмент там физически недоступен.
//
// Одно и то же имя вкладки ('supplier-site-check') сохранено: переход к
// следующему поставщику переиспользует ту же вкладку, а не плодит их.
//
// "Вторая очередь" (владелец, 2026-09-13, третий заход — после разбора
// кейса 169.ru, см. docs/session-journal.md): "на верификацию мне нужны
// только те, где есть название, почта и все категории каталога". Хост, у
// которого это не так (нет email, или снимок сайта ещё не дошёл до
// классификации/классификатор ничего не нашёл), в основную очередь
// (карточка + кнопка "Верифицировать") не попадает вовсе. Владелец,
// 2026-09-13 (четвёртый заход): убрать отдельный видимый список таких
// хостов со всех страниц — данные (name/email/categories на самом
// поставщике и его снимке сайта) по-прежнему в базе как есть, просто без
// отдельного UI-списка; isReadyForVerification ниже по-прежнему фильтрует
// основную очередь, эти хосты просто нигде не показываются.

interface HostGroup {
  host: string;
  // Все карточки-предложения этого домена в выбранной стране — не только
  // непроверенные: нужно знать полный список, чтобы "Верифицировать"
  // подтвердил их разом (см. комментарий выше).
  offers: SupplierOffer[];
  representative: SupplierOffer;
  snapshot: SupplierSiteSnapshot | null;
}

// Владелец, 2026-09-13 (третий заход, после разбора кейса 169.ru — брак
// одного прогона классификатора записал пустые категории части
// поставщиков, хотя по факту распознать их было можно, см.
// docs/session-journal.md): "на верификацию мне нужны только те, где есть
// название, почта и все категории каталога" — остальные (нет email или
// снимок сайта ещё не классифицирован/классификатор ничего не нашёл) в
// основную очередь не идут вовсе (см. комментарий про "вторую очередь"
// в шапке файла — в интерфейсе больше нигде не показываются).
//
// Владелец, 2026-09-13 (шестой заход, после разбора кейсов abb-electro.ru/
// oaomkk.ru/priorglass.ru — массовая переклассификация "второго захода"
// оказалась в основном галлюцинацией, см. data/supplierSiteSnapshots.ts):
// "отложи вообще всю очередь верификации... будем шаг за шагом дообучать
// модель" — снимок сайта ДОПОЛНИТЕЛЬНО должен быть помечен
// categoriesVerified (пересчитан новым методом и одобрен владельцем), иначе
// в очередь не идёт, ДАЖЕ если у него уже есть непустые categories от
// старого ненадёжного прогона. Расширять очередь можно только пачками:
// scripts/supply-categories/review.mjs next → diff → apply (с 2026-09-14) —
// пачка из 10 компаний переклассифицируется по полному дереву разделов
// сайта с обязательной уликой на каждую группу, apply ставит флаг, и пачка
// появляется здесь для ручной проверки владельцем рядом с сайтом.
function isReadyForVerification(group: HostGroup): boolean {
  // Условие переписано 2026-09-14 (владелец: «я бы очистил вообще всю инфу
  // по контактам и категориям, будем записывать её с нуля через кнопки»).
  // Раньше требовались непустая почта и проверенные категории — правило
  // писалось в сентябре, когда очередь была последним шагом после
  // автообогащения: приходить туда с пустой карточкой было незачем.
  // Теперь наоборот: карточка ПУСТАЯ по замыслу, а заполняется прямо в
  // очереди двумя кнопками («Снять меню» и «Снять контакты»). Оставлять
  // старое условие нельзя — после очистки очередь была бы пуста целиком.
  //
  // Нужен только сайт: без него открывать нечего и кнопки не работают.
  return group.representative.name.trim().length > 0 && group.representative.websiteUrl.trim().length > 0;
}

// includeVerified — брать хост даже тогда, когда все его карточки уже
// помечены верифицированными. Основной очереди это не нужно (там как раз
// ждут неподтверждённые), а второй — нужно: с 2026-09-14 отметку ставит
// scripts/verify-recognized.mjs по факту распознанного каталога, и её
// получили в том числе десять сайтов, которые робот ни разу не открывал —
// категории у них от старого серверного снимка без браузера. Без этой
// опции они не попали бы никуда вообще.
function buildHostGroups(
  offers: SupplierOffer[],
  snapshotByHost: Map<string, SupplierSiteSnapshot>,
  options: { includeVerified?: boolean } = {},
): HostGroup[] {
  const byHost = new Map<string, SupplierOffer[]>();
  for (const o of offers) {
    const host = supplierWebsiteHost(o.websiteUrl);
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(o);
  }
  const groups: HostGroup[] = [];
  for (const [host, list] of byHost) {
    const representative = list.find((o) => !o.verified) ?? (options.includeVerified ? list[0] : undefined);
    if (!representative) continue;
    groups.push({ host, offers: list, representative, snapshot: snapshotByHost.get(host) ?? null });
  }
  return groups;
}

// Используется и здесь, и бейджем на самой вкладке (Suppliers.tsx) — чтобы
// не считать по разным правилам в двух местах. Считает только то, что
// реально попадёт в очередь верификации (см. isReadyForVerification) — не
// "вторую очередь".
export function pendingVerificationHostCount(offers: SupplierOffer[], snapshots: SupplierSiteSnapshot[]): number {
  const snapshotByHost = new Map(snapshots.map((s) => [s.host, s]));
  return buildHostGroups(offers, snapshotByHost).filter(isReadyForVerification).length;
}

// Открывает сайт поставщика соседней вкладкой (см. комментарий выше).
// Третий аргумент window.open НЕ передаём намеренно: любая строка
// параметров — и браузер делает всплывающее окно вместо вкладки, а вместе с
// ним пропадает панель закладок, на которой живёт «Снять меню».
function openSupplierSiteTab(url: string) {
  window.open(url, 'supplier-site-check');
}

// Зона загрузки скриншотов каталога прямо на карточке верификации.
// Владелец, 2026-09-14: «мы будем верифицировать каждого поставщика вручную,
// загружая скрины… нужно решение, чтобы скрины массово грузить». Главный
// путь — вставка из буфера: сделал скрин меню → ⌘V, не отрываясь от
// карточки (слушатель висит на всей вкладке, см. useEffect с 'paste' ниже);
// drag&drop и выбор файлов — запасные.
//
// Дальше картинки разбирает НЕ эта вкладка, а сессия Claude Code
// (scripts/supply-categories/screenshots.mjs pull → субагент читает картинки
// → расшифровка → review.mjs sections): в чат сами картинки не попадают,
// чтобы не забивать контекст, а категории по-прежнему присваиваются только
// с уликой из разделов.
function ScreenshotZone({
  screenshots,
  uploading,
  onFiles,
  onDelete,
}: {
  screenshots: SupplierScreenshot[];
  uploading: boolean;
  onFiles: (files: File[]) => void;
  onDelete: (screenshot: SupplierScreenshot) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = screenshots.filter((s) => s.status === 'pending').length;
  const processed = screenshots.length - pending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-faint">Скрины каталога</span>
        {screenshots.length > 0 &&
          (pending > 0 ? (
            // Заметный статус, а не мелкая серая подпись: это промежуточное
            // состояние карточки — верифицировать её сейчас нельзя, категории
            // изменятся после разбора (владелец, 2026-09-14).
            <span className="flex items-center gap-1.5 rounded-full border border-primary px-2.5 py-0.5 text-xs font-medium text-primary">
              <Loader2 className="h-3 w-3" />
              {pending} ждут распознавания
            </span>
          ) : (
            <span className="text-xs text-ink-faint">{processed} разобрано</span>
          ))}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles([...e.dataTransfer.files]);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-3 py-4 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary',
        )}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
        ) : (
          <ImagePlus className="h-5 w-5 text-ink-faint" />
        )}
        <span className="text-xs text-ink-muted">
          {uploading ? 'Загружаем...' : 'Вставьте скрин (⌘V), перетащите или нажмите'}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      {pending > 0 && (
        <p className="text-xs text-ink-faint">
          Карточка вышла из очереди до разбора — нажмите «Дальше», чтобы перейти к следующему поставщику.
        </p>
      )}

      {screenshots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {screenshots.map((s) => (
            <div key={s.id} className="group relative">
              <a href={s.publicUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={s.publicUrl}
                  alt=""
                  className={cn(
                    'h-14 w-20 rounded-lg border border-border object-cover',
                    s.status === 'pending' ? '' : 'opacity-50',
                  )}
                />
              </a>
              <button
                type="button"
                onClick={() => onDelete(s)}
                aria-label="Удалить скрин"
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-ink-muted hover:border-danger hover:text-danger group-hover:flex"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Варианты контакта, снятые закладкой со страницы поставщика: текущее
// значение карточки и чипы-альтернативы. Владелец, 2026-09-14: закладка
// теперь отдаёт ВЕСЬ набор со страницы одним кликом, поэтому выбор «какой из
// двух телефонов верный» должен быть одним кликом по нужному, а не разбором
// нескольких отдельных предложений.
interface CaptureGroup {
  key: string;
  host: string;
  hostOffers: SupplierOffer[];
  kind: SupplierContactCaptureKind;
  messengerType: string;
  current: string;
  options: SupplierContactCapture[];
}

function CaptureGroupRow({
  group,
  withName,
  onPick,
  onDismiss,
}: {
  group: CaptureGroup;
  withName: boolean;
  onPick: (group: CaptureGroup, capture: SupplierContactCapture) => void;
  onDismiss: (group: CaptureGroup) => void;
}) {
  const label = group.kind === 'email' ? 'почта' : group.kind === 'phone' ? 'телефон' : group.messengerType;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
      {withName && <span className="font-semibold text-ink">{group.hostOffers[0].name}</span>}
      <span className="text-ink-faint">{label}</span>
      <span className="min-w-0 break-all text-ink-faint">{group.current || '—'}</span>
      <span className="text-ink-faint">→</span>
      {group.options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onPick(group, option)}
          className="min-w-0 break-all rounded-full border border-border bg-surface px-2.5 py-1 font-semibold text-ink hover:border-primary hover:text-primary"
        >
          {option.value}
        </button>
      ))}
      <button type="button" onClick={() => onDismiss(group)} className="px-1 text-ink-faint hover:text-ink">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Что делать со снятым контактом: пустое поле — записать молча, такое же
// значение — молча закрыть, иное — спросить. Телефоны сравниваем по цифрам:
// в базе они лежат в разном оформлении («+7 495 120-24-13» и
// «+7 (495) 120-24-13» — один и тот же номер), и посимвольное сравнение
// показывало бы расхождение там, где его нет.
function sameContact(kind: SupplierContactCapture['kind'], a: string, b: string): boolean {
  if (kind === 'phone') {
    const digits = (v: string) => v.replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7');
    return digits(a) === digits(b) && digits(a).length > 0;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Обе закладки — прямо в админке. Владелец, 2026-09-14: «я вижу снять меню и
// оно снялось, но не вижу снять контакт» — открылся присланный раньше файл
// install.html, в котором второй кнопки ещё не было. Пока страница установки
// живёт отдельным файлом в переписке, это будет повторяться на каждой правке:
// версий в чате несколько, а на вид они одинаковые. Здесь версия всегда ровно
// одна — та, что задеплоена.
//
// href проставляется через ref, а не атрибутом в JSX: React намеренно режет
// javascript:-адреса в href (и обещает в будущих версиях блокировать их
// совсем), а для закладки это единственно возможный вид ссылки.
function BookmarkletLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('href', href);
  }, [href]);
  return (
    <a
      ref={ref}
      draggable
      onClick={(e) => e.preventDefault()}
      className={cn(
        'cursor-grab rounded-full px-4 py-1.5 text-xs font-semibold',
        primary ? 'bg-primary text-white' : 'border border-ink bg-ink text-white',
      )}
    >
      {label}
    </a>
  );
}

function BookmarkletsBlock() {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('flex flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
      <button type="button" className="flex items-center gap-2 text-left text-sm font-semibold text-ink" onClick={() => setOpen((v) => !v)}>
        <Bookmark className="h-4 w-4 shrink-0" />
        Закладки для браузера — «Снять меню» и «Снять контакты»
      </button>
      {open && (
        <>
          <p className="text-xs text-ink-faint">
            Перетащите обе кнопки мышью на панель закладок браузера (если её не видно — ⌘+Shift+B). Старые такие же
            кнопки сначала удалите: иначе сработает прежняя версия. Это всегда актуальные версии — они обновляются
            вместе с админкой.
          </p>
          <div className="flex flex-wrap items-center gap-3 py-1">
            <BookmarkletLink href={MENU_BOOKMARKLET_HREF} label="Снять меню" primary />
            <BookmarkletLink href={CONTACTS_BOOKMARKLET_HREF} label="Снять контакты" />
          </div>
          <p className="text-xs text-ink-faint">
            Обе работают одинаково: один клик на странице поставщика, дальше ничего нажимать не нужно. «Снять меню»
            заберёт разделы каталога, «Снять контакты» — все телефоны, почты и мессенджеры страницы, а заодно фоном
            прочитает страницу «Контакты» того же сайта.
          </p>
        </>
      )}
    </div>
  );
}

function SupplierCard({
  group,
  onVerify,
  onEdit,
  onDelete,
  saving,
  screenshots,
  menuCaptured,
  captureGroups,
  onPickCapture,
  onDismissCaptures,
  uploadingScreenshots,
  onScreenshotFiles,
  onScreenshotDelete,
}: {
  group: HostGroup;
  onVerify: (group: HostGroup) => void;
  onEdit: (offer: SupplierOffer) => void;
  onDelete: (offer: SupplierOffer) => void;
  saving: boolean;
  screenshots: SupplierScreenshot[];
  menuCaptured: boolean;
  captureGroups: CaptureGroup[];
  onPickCapture: (group: CaptureGroup, capture: SupplierContactCapture) => void;
  onDismissCaptures: (group: CaptureGroup) => void;
  uploadingScreenshots: boolean;
  onScreenshotFiles: (files: File[]) => void;
  onScreenshotDelete: (screenshot: SupplierScreenshot) => void;
}) {
  const offer = group.representative;
  const categories = group.snapshot?.categories ?? [];
  return (
    <div className={cn('flex w-full flex-col gap-4 p-5 lg:w-[420px]', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <span className="text-lg font-bold text-ink">{offer.name}</span>
        {offer.country && (
          <span className="text-sm text-ink-faint">
            {countryFlag(offer.country)} {offer.country}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint">Сайт</span>
        <a
          href={supplierWebsiteFullUrl(offer.websiteUrl)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Обычный клик — открываем соседнюю вкладку (см.
            // openSupplierSiteTab). Ctrl/Cmd/Shift/средняя кнопка —
            // оставляем браузеру штатное поведение, не мешаем привычным
            // жестам (тот же принцип, что у ссылки источника в
            // MarketOffersReview.tsx).
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            openSupplierSiteTab(supplierWebsiteFullUrl(offer.websiteUrl));
          }}
          className="flex min-w-0 items-center gap-1 text-primary-hover hover:underline"
        >
          <span className="truncate">{group.host}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint">Email</span>
        <span className="text-ink">{offer.email || '—'}</span>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint">Телефон</span>
        {offer.contact ? (
          <span className="flex items-center gap-1.5 text-ink">
            {offer.contactMethod === 'Telegram' ? (
              <Send className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Phone className="h-3.5 w-3.5 shrink-0" />
            )}
            <ContactValue
              contact={offer.contactMethod === 'Телефон' ? formatPhoneDisplay(offer.contact) : offer.contact}
              contactMethod={offer.contactMethod}
            />
          </span>
        ) : (
          <span className="text-ink">—</span>
        )}
      </div>

      {offer.messengers.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint">Мессенджеры</span>
          <div className="flex flex-wrap gap-1.5">
            {offer.messengers.map((m, i) => {
              const { href, label } = messengerLink(m);
              const inner = (
                <>
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    {m.type}: {label}
                  </span>
                </>
              );
              return href ? (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-primary-hover hover:border-primary hover:underline"
                >
                  {inner}
                </a>
              ) : (
                <span key={i} className="flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-ink-muted">
                  {inner}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {captureGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-ink">Снято на сайте — выберите верное</span>
          {captureGroups.map((group) => (
            <CaptureGroupRow key={group.key} group={group} withName={false} onPick={onPickCapture} onDismiss={onDismissCaptures} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint">Категории</span>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <span key={c} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted">
                {c}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-ink-faint">категорий не найдено</span>
        )}
      </div>

      {group.offers.length > 1 && (
        <p className="text-xs text-ink-faint">
          У этой компании {group.offers.length} карточки-предложения — «Верифицировать» подтвердит их разом.
        </p>
      )}

      {menuCaptured && (
        <div className="flex items-center gap-2 rounded-2xl border border-success/40 bg-success/5 px-3 py-2 text-xs text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          Меню каталога снято закладкой — ушло на разбор
        </div>
      )}

      <ScreenshotZone
        screenshots={screenshots}
        uploading={uploadingScreenshots}
        onFiles={onScreenshotFiles}
        onDelete={onScreenshotDelete}
      />

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={() => onDelete(offer)}
          aria-label="Удалить поставщика"
          className="p-2 text-ink-faint hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => onEdit(offer)}>
            Редактировать
          </Button>
          <Button type="button" onClick={() => onVerify(group)} disabled={saving}>
            {saving ? 'Сохраняем…' : 'Верифицировать'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SupplierVerificationTab({
  offers,
  snapshots,
  onOfferUpdated,
  onEditOffer,
  onDeleteOffer,
}: {
  offers: SupplierOffer[];
  snapshots: SupplierSiteSnapshot[];
  onOfferUpdated: (offer: SupplierOffer) => void;
  onEditOffer: (offer: SupplierOffer) => void;
  onDeleteOffer: (offer: SupplierOffer) => void;
}) {
  // Владелец, 2026-09-13: "раздели очередь верификации на Россию и
  // Беларусь, мне пока не нужны белорусские поставщики" — SUPPLIER_COUNTRIES[0]
  // это уже "Россия" (см. data/supplierResearch.ts), поэтому она и по
  // умолчанию.
  const [country, setCountry] = useState<string>(SUPPLIER_COUNTRIES[0]);
  const [verifying, setVerifying] = useState(false);
  const [skippedHosts, setSkippedHosts] = useState<Set<string>>(new Set());
  const [savingHost, setSavingHost] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Скрины грузятся одним запросом на всю вкладку, а не по карточке:
  // таблица маленькая (одна строка на картинку), а карточка в очереди
  // меняется каждые несколько секунд — отдельный запрос на каждую был бы
  // заметно хуже при том же результате.
  const [screenshots, setScreenshots] = useState<SupplierScreenshot[]>([]);
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false);
  const [menuCaptures, setMenuCaptures] = useState<SupplierMenuCapture[]>([]);
  // Контакты, снятые кликом на сайте (закладка «Снять контакт»). Владелец,
  // 2026-09-14: «чтобы вся верификация была на одной вкладке». В отличие от
  // скринов и меню, снятый контакт НЕ выводит поставщика из очереди —
  // наоборот, он нужен прямо сейчас, на открытой карточке.
  const [contactCaptures, setContactCaptures] = useState<SupplierContactCapture[]>([]);
  // Хосты, чей сайт уже открывали (роботом или закладкой) — отдельным
  // лёгким запросом, см. fetchSupplierMenuCaptureHosts.
  const [capturedHosts, setCapturedHosts] = useState<Set<string>>(new Set());

  const snapshotByHost = useMemo(() => new Map(snapshots.map((s) => [s.host, s])), [snapshots]);

  useEffect(() => {
    fetchSupplierScreenshots()
      .then(setScreenshots)
      .catch(() => {
        // Молча: скрины — вспомогательная штука, из-за их недоступности
        // верификация как таковая работать не перестаёт.
      });
    fetchSupplierMenuCaptures()
      .then(setMenuCaptures)
      .catch(() => {});
    fetchSupplierContactCaptures()
      .then(setContactCaptures)
      .catch(() => {});
    fetchSupplierMenuCaptureHosts()
      .then(setCapturedHosts)
      .catch(() => {});
  }, []);

  // Карточки без страны видны при любом флаге — тот же принцип, что в
  // SupplierCatalog.tsx (молчаливо прятать их было бы потерей данных).
  const countryOffers = useMemo(() => offers.filter((o) => !o.country.trim() || o.country === country), [offers, country]);

  const hostGroups = useMemo(
    () => buildHostGroups(countryOffers, snapshotByHost).filter(isReadyForVerification).sort((a, b) => a.host.localeCompare(b.host)),
    [countryOffers, snapshotByHost],
  );

  // Промежуточное состояние «скрины загружены, но ещё не распознаны»
  // (владелец, 2026-09-14: «явно нет промежуточного шага, чтобы видеть, что
  // скрины уже загружены, но ещё не распознались»). Отдельного поля под это
  // не заводим: наличие непрочитанного скрина У САМОГО ХОСТА и есть признак.
  // Такой поставщик выходит из активной очереди — верифицировать его сейчас
  // нельзя, его категории вот-вот изменятся разбором.
  // Только скрины: их ещё должен разобрать человек в сессии, и до разбора
  // категории поставщика вот-вот изменятся — верифицировать его рано.
  //
  // Снятое МЕНЮ сюда больше не входит (2026-09-14). Раньше входило, и это
  // было верно, пока меню снимали поштучно. С роботом (scripts/harvest.mjs),
  // который проходит всю базу за один прогон, это правило вымело бы из
  // очереди всех до единого: у каждого поставщика появился бы неразобранный
  // снимок меню. На карточке снятое меню по-прежнему отмечено галочкой.
  const awaitingHosts = useMemo(
    () => new Set(screenshots.filter((s) => s.status === 'pending').map((s) => s.host)),
    [screenshots],
  );
  // Вторая очередь. Владелец, 2026-09-14: «всё, что не распозналось,
  // закидывай во вторую очередь… а всё, что распозналось, помечай
  // верифицированным». Не распозналось — значит у поставщика нет ни одной
  // товарной группы: робот принёс с сайта пустое или почти пустое меню
  // (каталог рисуется скриптом, спрятан за поиском, закрыт защитой).
  // Раскладывать там нечего, нужен съём руками — поэтому такие не мешаются
  // в основной очереди, а ждут отдельным списком с кнопкой «открыть сайт».
  //
  // Расширено 2026-09-15 (владелец: «15 поставщиков по России прячь во
  // вторую очередь»). Случаев на самом деле два, и оба означают одно и то
  // же — каталога у нас нет, нужен человек:
  //   1. сайт открывали, но меню пустое — то, ради чего очередь заводилась;
  //   2. сайт не открывали ни разу — робот до него не дошёл (отдавал отказ
  //      или выпал из очереди прогона).
  // Второй случай раньше не отображался нигде: десять таких хостов уже
  // помечены верифицированными по старому серверному снимку, и обычная
  // сборка групп их отбрасывала. Отсюда includeVerified.
  const secondQueueGroups = useMemo(
    () =>
      buildHostGroups(countryOffers, snapshotByHost, { includeVerified: true })
        .filter(isReadyForVerification)
        .filter((g) => !capturedHosts.has(g.host) || (g.snapshot?.categories.length ?? 0) === 0)
        .sort((a, b) => a.host.localeCompare(b.host)),
    [countryOffers, snapshotByHost, capturedHosts],
  );
  const unrecognizedHosts = useMemo(() => new Set(secondQueueGroups.map((g) => g.host)), [secondQueueGroups]);
  const queueGroups = useMemo(
    () => hostGroups.filter((g) => !awaitingHosts.has(g.host) && !unrecognizedHosts.has(g.host)),
    [hostGroups, awaitingHosts, unrecognizedHosts],
  );
  const awaitingGroups = useMemo(() => hostGroups.filter((g) => awaitingHosts.has(g.host)), [hostGroups, awaitingHosts]);

  // Карточку, на которую только что загрузили скрины, держим на экране до
  // явного «Дальше»: иначе она исчезает прямо под руками сразу после ⌘V.
  const [heldHost, setHeldHost] = useState<string | null>(null);

  const verifyTarget = useMemo(() => {
    if (!verifying) return null;
    if (heldHost && !skippedHosts.has(heldHost)) {
      const held = hostGroups.find((g) => g.host === heldHost);
      if (held) return held;
    }
    return queueGroups.find((g) => !skippedHosts.has(g.host)) ?? null;
  }, [verifying, heldHost, hostGroups, queueGroups, skippedHosts]);

  useEffect(() => {
    if (verifyTarget && verifyTarget.host !== heldHost) setHeldHost(verifyTarget.host);
  }, [verifyTarget, heldHost]);

  const remaining = queueGroups.filter((g) => !skippedHosts.has(g.host)).length;
  const skippedCount = skippedHosts.size;
  const currentAwaits = verifyTarget ? awaitingHosts.has(verifyTarget.host) : false;

  // Минимум кликов во время верификации — как только цель меняется, сама
  // открывается вкладка с сайтом (см. openSupplierSiteTab). Гвард по хосту
  // (не по verifyTarget целиком) — чтобы "Пропустить" не открывало вкладку
  // повторно на каждый ре-рендер, только когда цель реально сменилась.
  const lastAutoOpenedHostRef = useRef<string | null>(null);
  useEffect(() => {
    if (!verifying || !verifyTarget) return;
    if (lastAutoOpenedHostRef.current === verifyTarget.host) return;
    lastAutoOpenedHostRef.current = verifyTarget.host;
    openSupplierSiteTab(supplierWebsiteFullUrl(verifyTarget.representative.websiteUrl));
  }, [verifying, verifyTarget]);

  async function handleScreenshotFiles(host: string, files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setUploadingScreenshots(true);
    setError('');
    try {
      for (const file of images) {
        const created = await uploadSupplierScreenshot(host, file);
        setScreenshots((prev) => [...prev, created]);
      }
    } catch {
      setError('Не удалось загрузить скрин — попробуйте ещё раз.');
    } finally {
      setUploadingScreenshots(false);
    }
  }

  async function handleScreenshotDelete(screenshot: SupplierScreenshot) {
    setScreenshots((prev) => prev.filter((s) => s.id !== screenshot.id));
    try {
      await deleteSupplierScreenshot(screenshot);
    } catch {
      setError('Не удалось удалить скрин — обновите страницу.');
    }
  }

  // Снятое меню принимает вся админка целиком (lib/menuCaptureReceiver.ts) —
  // здесь только обновляем список, когда посылка сохранилась: иначе при
  // переключении на другую страницу принимать было бы некому, а два
  // слушателя записали бы одну посылку дважды.
  useEffect(() => {
    function onSaved() {
      fetchSupplierMenuCaptures()
        .then(setMenuCaptures)
        .catch(() => {});
    }
    window.addEventListener(MENU_CAPTURE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(MENU_CAPTURE_SAVED_EVENT, onSaved);
  }, []);

  // Главный путь загрузки — ⌘V прямо на вкладке: сделал скрин меню
  // поставщика в соседнем окне, вернулся, вставил. Слушатель висит на окне
  // (а не на самой зоне), чтобы не нужно было сначала целиться мышью;
  // ввод в поля не перехватываем — иначе сломается вставка текста в форму
  // редактирования, открытую поверх вкладки.
  useEffect(() => {
    if (!verifying || !verifyTarget) return;
    const host = verifyTarget.host;
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length === 0) return;
      e.preventDefault();
      void handleScreenshotFiles(host, files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifying, verifyTarget]);

  // Снятый контакт принимает вся админка (lib/menuCaptureReceiver.ts), здесь
  // только подхватываем.
  useEffect(() => {
    function onSaved() {
      fetchSupplierContactCaptures()
        .then(setContactCaptures)
        .catch(() => {});
    }
    window.addEventListener(CONTACT_CAPTURE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(CONTACT_CAPTURE_SAVED_EVENT, onSaved);
  }, []);

  // Запись снятого контакта в карточку. Пишем ВСЕМ карточкам-предложениям
  // этого домена — по той же логике, что и «Верифицировать»: контакт у
  // компании один, а карточек под разные категории закупки может быть
  // несколько.
  async function applyContactCapture(hostOffers: SupplierOffer[], capture: SupplierContactCapture) {
    setError('');
    try {
      for (const offer of hostOffers) {
        const patch =
          capture.kind === 'email'
            ? { email: capture.value }
            : capture.kind === 'phone'
              ? { contact: capture.value, contactMethod: 'Телефон' as const }
              : {
                  messengers: [
                    // Мессенджер того же типа заменяем, а не добавляем вторым:
                    // Светлана кликает по нему как раз тогда, когда нашла
                    // рабочий, а старый оказался не тем (кейс «Альбия»,
                    // 2026-09-14 — один и тот же Max записался двумя видами).
                    ...offer.messengers.filter((m) => m.type !== capture.messengerType),
                    { type: capture.messengerType as SupplierOffer['messengers'][number]['type'], number: capture.value },
                  ],
                };
        const updated = await updateSupplierOffer(offer.id, { ...offer, ...patch });
        onOfferUpdated(updated);
      }
      await markSupplierContactCapture(capture.id, 'applied');
      setContactCaptures((prev) => prev.filter((c) => c.id !== capture.id));
    } catch {
      setError('Не удалось записать контакт в карточку — попробуйте ещё раз.');
    }
  }

  async function skipContactCapture(capture: SupplierContactCapture) {
    setContactCaptures((prev) => prev.filter((c) => c.id !== capture.id));
    try {
      await markSupplierContactCapture(capture.id, 'skipped');
    } catch {
      setError('Не удалось убрать снятый контакт — обновите страницу.');
    }
  }

  // Пустое поле заполняем сами, без лишнего клика — ровно то, ради чего
  // затевалось («а оно записало бы само в базу»). А вот РАСХОЖДЕНИЕ с уже
  // заполненным полем автоматически не переписываем никогда: карточки
  // поставщиков продаются с требованием точности 97%, и молча затереть
  // проверенный номер тем, что случайно кликнули в подвале, дороже, чем
  // один клик «Заменить». Ref — чтобы повторный рендер не пытался применить
  // ту же строку второй раз, пока идёт запрос.
  const autoAppliedRef = useRef<Set<string>>(new Set());

  // Все карточки по домену — по ВСЕМ предложениям, а не по очереди
  // верификации: снятый контакт нужен и у поставщика, которого уже
  // верифицировали (иначе снятое некуда показать — ровно это и случилось
  // 2026-09-14 у glavrele.ru и ironpolimer.ru, см. журнал).
  const offersByHost = useMemo(() => {
    const map = new Map<string, SupplierOffer[]>();
    for (const offer of offers) {
      const host = supplierWebsiteHost(offer.websiteUrl);
      if (!host) continue;
      const list = map.get(host);
      if (list) list.push(offer);
      else map.set(host, [offer]);
    }
    return map;
  }, [offers]);

  // Снятое группируем по домену и виду контакта: закладка отдаёт весь набор
  // со страницы (несколько телефонов и почт), и показывать их отдельными
  // предложениями значило бы заставлять человека решать один и тот же вопрос
  // по нескольку раз.
  const captureGroups = useMemo<CaptureGroup[]>(() => {
    const byKey = new Map<string, CaptureGroup>();
    for (const capture of contactCaptures) {
      const hostOffers = offersByHost.get(capture.host);
      if (!hostOffers || hostOffers.length === 0) continue;
      const offer = hostOffers[0];
      const key = `${capture.host}|${capture.kind}|${capture.messengerType}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.options.push(capture);
        continue;
      }
      byKey.set(key, {
        key,
        host: capture.host,
        hostOffers,
        kind: capture.kind,
        messengerType: capture.messengerType,
        current:
          capture.kind === 'email'
            ? offer.email
            : capture.kind === 'phone'
              ? offer.contact
              : (offer.messengers.find((m) => m.type === capture.messengerType)?.number ?? ''),
        options: [capture],
      });
    }
    for (const group of byKey.values()) {
      group.options.sort((a, b) => b.rank - a.rank || a.value.localeCompare(b.value));
    }
    return [...byKey.values()].sort((a, b) => a.hostOffers[0].name.localeCompare(b.hostOffers[0].name));
  }, [contactCaptures, offersByHost]);

  function pickCapture(group: CaptureGroup, capture: SupplierContactCapture) {
    void applyContactCapture(group.hostOffers, capture);
  }

  function dismissCaptureGroup(group: CaptureGroup) {
    for (const option of group.options) void skipContactCapture(option);
  }

  useEffect(() => {
    for (const group of captureGroups) {
      const best = group.options[0];
      if (!group.current.trim()) {
        // Пустое поле заполняем лучшим вариантом сами — ровно то, ради чего
        // всё затевалось. Остальные варианты остаются чипами: если закупщик
        // видит, что верным был второй, это один клик.
        if (autoAppliedRef.current.has(best.id)) continue;
        autoAppliedRef.current.add(best.id);
        void applyContactCapture(group.hostOffers, best);
        continue;
      }
      // Снято ровно то, что уже в карточке: молча закрываем, чтобы человек
      // не сверял глазами две одинаковые строки (2026-09-14: два из семи
      // снятых контактов совпадали до символа).
      const same = group.options.find((o) => sameContact(o.kind, group.current, o.value));
      if (same && !autoAppliedRef.current.has(same.id)) {
        autoAppliedRef.current.add(same.id);
        void markSupplierContactCapture(same.id, 'applied', 'совпало с карточкой');
        setContactCaptures((prev) => prev.filter((c) => c.id !== same.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureGroups]);

  function startVerification() {
    setSkippedHosts(new Set());
    setVerifying(true);
  }

  function stopVerification() {
    setVerifying(false);
  }

  function skipCurrent() {
    if (verifyTarget) setSkippedHosts((prev) => new Set(prev).add(verifyTarget.host));
  }

  // После успешной верификации следующая карточка (и её сайт справа)
  // подставляется сама — hostGroups пересчитывается из обновлённых offers
  // и больше не содержит этот хост (все его карточки уже verified).
  async function handleVerify(group: HostGroup) {
    setSavingHost(group.host);
    setError('');
    try {
      const toVerify = group.offers.filter((o) => !o.verified);
      const updated = await Promise.all(toVerify.map((o) => updateSupplierOffer(o.id, { ...o, verified: true })));
      updated.forEach(onOfferUpdated);
      logActivity('supplier_offer_verified');
    } catch {
      setError('Не удалось верифицировать — попробуйте ещё раз.');
    } finally {
      setSavingHost(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">Осталось проверить: {queueGroups.length}</p>
          <BookmarkletsBlock />

      {captureGroups.length > 0 && (
        <div className={cn('flex flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
          <p className="text-sm font-semibold text-ink">Снято на сайте — выберите верное</p>
          <p className="text-xs text-ink-faint">
            Закладка снимает со страницы все контакты разом. Пустое поле карточки заполняется лучшим вариантом само
            (ящик закупок важнее общего info@, городской номер важнее 8-800); здесь остаётся выбор, когда в карточке
            уже стоит другое значение. Клик по варианту записывает его. Блок виден и после верификации поставщика.
          </p>
          {captureGroups.map((group) => (
            <CaptureGroupRow key={group.key} group={group} withName onPick={pickCapture} onDismiss={dismissCaptureGroup} />
          ))}
        </div>
      )}

      {secondQueueGroups.length > 0 && (
        <div className={cn('flex flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
          <p className="text-sm font-semibold text-ink">Вторая очередь: каталога нет ({secondQueueGroups.length})</p>
          <p className="text-xs text-ink-faint">
            Товарных групп у этих поставщиков нет, поэтому в основную очередь они не идут. Сплошной контур — робот сайт
            открыл, но меню не снялось: каталог рисуется скриптом, спрятан за поиском или закрыт защитой. Пунктир —
            сайт не открывали ни разу, робот до него не дошёл. Действие в обоих случаях одно: открыть сайт и нажать
            «Снять меню» руками, после этого поставщик вернётся в обычную очередь сам.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {secondQueueGroups.map((g) => {
              const neverOpened = !capturedHosts.has(g.host);
              return (
                <button
                  key={g.host}
                  type="button"
                  title={neverOpened ? 'Сайт не открывали ни разу' : 'Сайт открывали, меню не снялось'}
                  onClick={() => openSupplierSiteTab(supplierWebsiteFullUrl(g.representative.websiteUrl))}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-primary-hover hover:border-primary hover:underline',
                    neverOpened ? 'border-dashed border-ink-faint' : 'border-border',
                  )}
                >
                  {g.representative.name || g.host}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {awaitingGroups.length > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-ink-muted"
              title={awaitingGroups.map((g) => g.representative.name || g.host).join(', ')}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Ждут распознавания: {awaitingGroups.length}
            </span>
          )}
          <div className="flex items-center gap-1">
            {SUPPLIER_COUNTRIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  country === c ? 'border-primary text-primary' : 'border-border text-ink-muted hover:border-primary',
                )}
              >
                <span className="text-sm leading-none">{countryFlag(c)}</span>
                {c}
              </button>
            ))}
          </div>
        </div>
        {!verifying && (
          <Button icon={<Play className="h-4 w-4" />} disabled={hostGroups.length === 0} onClick={startVerification}>
            Начать верификацию
          </Button>
        )}
      </div>

      {awaitingGroups.length > 0 && (
        <div className={cn('flex flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
          <p className="text-sm font-semibold text-ink">Скрины загружены, ждут распознавания</p>
          <p className="text-xs text-ink-faint">
            Эти поставщики временно вне очереди — их категории изменятся после разбора скринов. Скажите в сессии
            «разбери скрины», и они вернутся сюда уже с обновлёнными категориями.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {awaitingGroups.map((g) => {
              const shots = screenshots.filter((s) => s.host === g.host && s.status === 'pending').length;
              const menus = menuCaptures.filter((c) => c.host === g.host && c.status === 'pending').length;
              const what = [menus > 0 ? 'меню' : '', shots > 0 ? `${shots} скр.` : ''].filter(Boolean).join(' + ');
              return (
                <span key={g.host} className="rounded-full border border-border px-2.5 py-1 text-xs text-ink-muted">
                  {g.representative.name || g.host} · {what}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {verifying && (
        <div className="flex flex-col gap-3">
          <div className={cn('flex flex-wrap items-center justify-between gap-3 p-4', glassCardClass)} style={glassCardShadow}>
            <p className="text-sm font-semibold text-ink">Верификация — осталось {remaining}</p>
            <div className="flex gap-2">
              {verifyTarget && (
                <Button variant="secondary" onClick={skipCurrent}>
                  {currentAwaits ? 'Дальше →' : 'Пропустить'}
                </Button>
              )}
              <Button variant="ghost" onClick={stopVerification}>
                Завершить проверку
              </Button>
            </div>
          </div>

          {verifyTarget ? (
            <SupplierCard
              group={verifyTarget}
              onVerify={handleVerify}
              onEdit={onEditOffer}
              onDelete={onDeleteOffer}
              saving={savingHost === verifyTarget.host}
              screenshots={screenshots.filter((s) => s.host === verifyTarget.host)}
              menuCaptured={menuCaptures.some((c) => c.host === verifyTarget.host && c.status === 'pending')}
              captureGroups={captureGroups.filter((g) => g.host === verifyTarget.host)}
              onPickCapture={pickCapture}
              onDismissCaptures={dismissCaptureGroup}
              uploadingScreenshots={uploadingScreenshots}
              onScreenshotFiles={(files) => handleScreenshotFiles(verifyTarget.host, files)}
              onScreenshotDelete={handleScreenshotDelete}
            />
          ) : (
            <div className={cn('flex flex-col items-center gap-2 p-8 text-center', glassCardClass)} style={glassCardShadow}>
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm font-semibold text-ink">Всё проверено!</p>
              {skippedCount > 0 && <p className="text-xs text-ink-faint">Пропущено {skippedCount} за этот проход.</p>}
              <Button className="mt-2" onClick={stopVerification}>
                Завершить
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, ImagePlus, Loader2, MessageCircle, Phone, Play, Send, Trash2, X } from 'lucide-react';
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
import {
  fetchSupplierMenuCaptures,
  insertSupplierMenuCapture,
  type SupplierMenuCapture,
} from '../../lib/supplierMenuCapturesApi';

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
  return (
    group.representative.name.trim().length > 0 &&
    group.representative.email.trim().length > 0 &&
    (group.snapshot?.categories.length ?? 0) > 0 &&
    group.snapshot?.categoriesVerified === true
  );
}

function buildHostGroups(offers: SupplierOffer[], snapshotByHost: Map<string, SupplierSiteSnapshot>): HostGroup[] {
  const byHost = new Map<string, SupplierOffer[]>();
  for (const o of offers) {
    const host = supplierWebsiteHost(o.websiteUrl);
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(o);
  }
  const groups: HostGroup[] = [];
  for (const [host, list] of byHost) {
    const unverified = list.find((o) => !o.verified);
    if (!unverified) continue;
    groups.push({ host, offers: list, representative: unverified, snapshot: snapshotByHost.get(host) ?? null });
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

function SupplierCard({
  group,
  onVerify,
  onEdit,
  onDelete,
  saving,
  screenshots,
  menuCaptured,
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
  // Короткое подтверждение после снимка меню — владелец просил именно
  // уведомление: «система записала в память и, если всё ок, показала
  // уведомление».
  const [captureToast, setCaptureToast] = useState('');

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
  const awaitingHosts = useMemo(
    () =>
      new Set([
        ...screenshots.filter((s) => s.status === 'pending').map((s) => s.host),
        ...menuCaptures.filter((c) => c.status === 'pending').map((c) => c.host),
      ]),
    [screenshots, menuCaptures],
  );
  const queueGroups = useMemo(() => hostGroups.filter((g) => !awaitingHosts.has(g.host)), [hostGroups, awaitingHosts]);
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

  // Приём дерева разделов от закладки «Снять меню». Вкладку с сайтом открыла
  // эта же страница (openSupplierSiteTab), поэтому у той вкладки есть ссылка
  // на нас, и закладка шлёт дерево сюда напрямую — без всплывающих окон,
  // страниц-приёмников и токенов в самой закладке. Владелец, 2026-09-14:
  // «я не хочу вручную пересылать каждый раз… система записала в память и,
  // если всё ок, показала уведомление».
  //
  // Источник сообщения — чужой домен (сайт поставщика), поэтому доверять
  // origin нельзя и проверяется ФОРМА данных: наша метка, строковый хост и
  // непустое дерево. Худшее, что может сделать посторонняя страница, —
  // записать строку-заготовку в отдельную таблицу, которую всё равно
  // проверяют глазами перед тем, как пустить разделы в улики.
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const d = e.data as { source?: unknown; host?: unknown; tree?: unknown; pageUrl?: unknown } | null;
      if (!d || d.source !== 'redevelopment-menu-capture') return;
      const host = typeof d.host === 'string' ? d.host.trim().toLowerCase() : '';
      const tree = typeof d.tree === 'string' ? d.tree.trim() : '';
      if (!host || !tree) return;
      const count = tree.split('\n').filter((l) => l.trim()).length;
      try {
        const created = await insertSupplierMenuCapture({
          host,
          pageUrl: typeof d.pageUrl === 'string' ? d.pageUrl.slice(0, 500) : '',
          tree,
          sectionsCount: count,
        });
        setMenuCaptures((prev) => [created, ...prev]);
        setCaptureToast(`${host}: снято ${count} разделов`);
        // Отвечаем закладке, чтобы она показала подтверждение у себя на
        // странице — Светлана видит результат, не переключая вкладку.
        if (e.source) (e.source as Window).postMessage({ source: 'redevelopment-menu-capture-ok', count }, '*');
      } catch {
        setError('Не удалось сохранить снятое меню — попробуйте ещё раз.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!captureToast) return;
    const t = setTimeout(() => setCaptureToast(''), 6000);
    return () => clearTimeout(t);
  }, [captureToast]);

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
      {captureToast && (
        <div className={cn('flex items-center gap-2 p-3 text-sm text-ink', glassCardClass)} style={glassCardShadow}>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          Меню снято — {captureToast}. Заполните контакты и жмите «Дальше».
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">Осталось проверить: {queueGroups.length}</p>
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

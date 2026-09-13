import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, MessageCircle, Phone, Play, Send, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { ContactValue } from '../ui/ContactValue';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { logActivity } from '../../lib/activityLogApi';
import { formatPhoneDisplay } from '../../lib/formatPhone';
import { updateSupplierOffer } from '../../lib/supplierResearchApi';
import { countryFlag, messengerLink, supplierWebsiteHost, SUPPLIER_COUNTRIES, type SupplierOffer } from '../../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../../data/supplierSiteSnapshots';

// Вкладка "Верификация" на странице Закупки. Владелец, 2026-09-13 (второй
// заход, после первой версии с редактируемым чек-листом категорий — снята
// по прямой правке "не будем отмечать категории вручную"): карточка
// поставщика в РЕЖИМЕ ПРОСМОТРА + сайт поставщика в отдельном окне (см.
// openSupplierSiteWindow ниже), одной кнопкой "Верифицировать" — без правки
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
// Сайт поставщика — отдельное позиционированное окно (половина экрана
// справа), а НЕ встроенный iframe. Владелец, 2026-09-13 (четвёртый заход):
// "точно как в верификации объявлений с рынка" — переиспользует тот же
// приём, что openAdWindow в MarketOffersReview.tsx (см. openSupplierSiteWindow
// ниже), вместо прежнего embed-панели рядом с карточкой. Одно и то же имя
// окна ('supplier-site-check') — переход к следующему поставщику
// переиспользует то же окно, не плодит вкладки.
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
function isReadyForVerification(group: HostGroup): boolean {
  return (
    group.representative.name.trim().length > 0 &&
    group.representative.email.trim().length > 0 &&
    (group.snapshot?.categories.length ?? 0) > 0
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

// Открывает сайт поставщика в отдельном окне на половину экрана — тот же
// приём, что openAdWindow в MarketOffersReview.tsx (см. комментарий выше).
// Размер и позиция считаются от РЕАЛЬНОГО экрана в момент вызова
// (window.screen), не зашиты заранее.
function openSupplierSiteWindow(url: string) {
  const width = Math.round(window.screen.availWidth / 2);
  const height = window.screen.availHeight;
  const left = window.screen.availWidth - width;
  window.open(url, 'supplier-site-check', `width=${width},height=${height},left=${left},top=0`);
}

function SupplierCard({
  group,
  onVerify,
  onEdit,
  onDelete,
  saving,
}: {
  group: HostGroup;
  onVerify: (group: HostGroup) => void;
  onEdit: (offer: SupplierOffer) => void;
  onDelete: (offer: SupplierOffer) => void;
  saving: boolean;
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
          href={offer.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Обычный клик — открываем позиционированное окно (см.
            // openSupplierSiteWindow). Ctrl/Cmd/Shift/средняя кнопка —
            // оставляем браузеру штатное поведение, не мешаем привычным
            // жестам (тот же принцип, что у ссылки источника в
            // MarketOffersReview.tsx).
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            openSupplierSiteWindow(offer.websiteUrl);
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

  const snapshotByHost = useMemo(() => new Map(snapshots.map((s) => [s.host, s])), [snapshots]);

  // Карточки без страны видны при любом флаге — тот же принцип, что в
  // SupplierCatalog.tsx (молчаливо прятать их было бы потерей данных).
  const countryOffers = useMemo(() => offers.filter((o) => !o.country.trim() || o.country === country), [offers, country]);

  const hostGroups = useMemo(
    () => buildHostGroups(countryOffers, snapshotByHost).filter(isReadyForVerification).sort((a, b) => a.host.localeCompare(b.host)),
    [countryOffers, snapshotByHost],
  );

  const verifyTarget = useMemo(() => {
    if (!verifying) return null;
    return hostGroups.find((g) => !skippedHosts.has(g.host)) ?? null;
  }, [verifying, hostGroups, skippedHosts]);

  const remaining = hostGroups.filter((g) => !skippedHosts.has(g.host)).length;
  const skippedCount = skippedHosts.size;

  // Минимум кликов во время верификации — как только цель меняется, сама
  // открывается позиционированное окно с сайтом (см. openSupplierSiteWindow
  // и комментарий про openAdWindow в MarketOffersReview.tsx). Гвард по хосту
  // (не по verifyTarget целиком) — чтобы "Пропустить" не открывало окно
  // повторно на каждый ре-рендер, только когда цель реально сменилась.
  const lastAutoOpenedHostRef = useRef<string | null>(null);
  useEffect(() => {
    if (!verifying || !verifyTarget) return;
    if (lastAutoOpenedHostRef.current === verifyTarget.host) return;
    lastAutoOpenedHostRef.current = verifyTarget.host;
    openSupplierSiteWindow(verifyTarget.representative.websiteUrl);
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">Осталось проверить: {hostGroups.length}</p>
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

      {verifying && (
        <div className="flex flex-col gap-3">
          <div className={cn('flex flex-wrap items-center justify-between gap-3 p-4', glassCardClass)} style={glassCardShadow}>
            <p className="text-sm font-semibold text-ink">Верификация — осталось {remaining}</p>
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

          {verifyTarget ? (
            <SupplierCard
              group={verifyTarget}
              onVerify={handleVerify}
              onEdit={onEditOffer}
              onDelete={onDeleteOffer}
              saving={savingHost === verifyTarget.host}
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

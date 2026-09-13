import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, MessageCircle, Phone, Play, Send, Trash2 } from 'lucide-react';
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
// поставщика в РЕЖИМЕ ПРОСМОТРА слева + встроенный браузер с главной
// страницей сайта справа, одной кнопкой "Верифицировать" — без правки
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
// Встроить сайт поставщика в iframe (в отличие от Kufar/Realt в
// MarketOffersReview.tsx) в большинстве случаев можно — мелкие корпоративные
// сайты обычно не выставляют X-Frame-Options/CSP frame-ancestors, в отличие
// от крупных площадок с антискрейпингом. Для тех, что всё же блокируют
// встраивание (сайт будет пустым/не загрузится) — рядом всегда есть ссылка
// "Открыть в новой вкладке".
//
// "Вторая очередь" (владелец, 2026-09-13, третий заход — после разбора
// кейса 169.ru, см. docs/session-journal.md): "на верификацию мне нужны
// только те, где есть название, почта и все категории каталога". Хост, у
// которого это не так (нет email, или снимок сайта ещё не дошёл до
// классификации/классификатор ничего не нашёл), в основную очередь
// (карточка + браузер + кнопка "Верифицировать") не попадает вовсе, а
// перечисляется отдельным списком ниже с причиной — только чтобы было
// видно, что они есть, без действия по умолчанию (кнопка "Редактировать"
// уходит в общую форму карточки поставщика).

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
// основную очередь не идут вовсе, а показываются отдельным списком
// ("вторая очередь") ниже, без кнопки "Верифицировать".
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

function SiteBrowser({ url }: { url: string }) {
  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-control border border-border bg-white">
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-3 py-2 text-xs text-ink-muted">
        <span className="min-w-0 flex-1 truncate">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-primary-hover hover:underline"
        >
          Открыть в новой вкладке
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      {/* Некоторые сайты запрещают встраивание (X-Frame-Options/CSP) — тогда
          здесь будет пусто, ссылка выше на этот случай и рассчитана. */}
      <iframe key={url} src={url} title="Сайт поставщика" referrerPolicy="no-referrer" className="w-full flex-1" />
    </div>
  );
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
    <div className={cn('flex w-full flex-col gap-4 p-5 lg:w-[380px] lg:shrink-0', glassCardClass)} style={glassCardShadow}>
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

  const allHostGroups = useMemo<HostGroup[]>(
    () => buildHostGroups(countryOffers, snapshotByHost).sort((a, b) => a.host.localeCompare(b.host)),
    [countryOffers, snapshotByHost],
  );
  const hostGroups = useMemo(() => allHostGroups.filter(isReadyForVerification), [allHostGroups]);
  const secondQueueGroups = useMemo(() => allHostGroups.filter((g) => !isReadyForVerification(g)), [allHostGroups]);

  function secondQueueReason(group: HostGroup): string {
    const reasons: string[] = [];
    if (!group.representative.name.trim()) reasons.push('нет названия');
    if (!group.representative.email.trim()) reasons.push('нет email');
    if ((group.snapshot?.categories.length ?? 0) === 0) reasons.push('категории не распознаны');
    return reasons.join(', ') || 'не хватает данных';
  }

  const verifyTarget = useMemo(() => {
    if (!verifying) return null;
    return hostGroups.find((g) => !skippedHosts.has(g.host)) ?? null;
  }, [verifying, hostGroups, skippedHosts]);

  const remaining = hostGroups.filter((g) => !skippedHosts.has(g.host)).length;
  const skippedCount = skippedHosts.size;

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
            <div className="flex flex-col gap-4 lg:flex-row">
              <SupplierCard
                group={verifyTarget}
                onVerify={handleVerify}
                onEdit={onEditOffer}
                onDelete={onDeleteOffer}
                saving={savingHost === verifyTarget.host}
              />
              <SiteBrowser url={verifyTarget.representative.websiteUrl} />
            </div>
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

      {secondQueueGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-ink">Вторая очередь — не хватает данных ({secondQueueGroups.length})</p>
          </div>
          <p className="text-xs text-ink-faint">
            Название, email и категории каталога распознаны не полностью — в верификацию не идут, пока классификатор
            (или карточка) не дозаполнит данные.
          </p>
          <div className={cn('flex flex-col divide-y divide-border overflow-hidden', glassCardClass)} style={glassCardShadow}>
            {secondQueueGroups.map((g) => (
              <div key={g.host} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-ink">{g.representative.name || g.host}</span>
                  <span className="truncate text-xs text-ink-faint">
                    {g.host} · {secondQueueReason(g)}
                  </span>
                </div>
                <Button type="button" variant="secondary" onClick={() => onEditOffer(g.representative)}>
                  Редактировать
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

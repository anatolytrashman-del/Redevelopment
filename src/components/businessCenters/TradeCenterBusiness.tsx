import { Car, Image, Megaphone, Monitor, Play, Sparkles, Store, Volume2 } from 'lucide-react';
import type { RetailInfo } from '../../data/businessCenters';
import type { DealStats } from '../../lib/businessCenterOfferStats';
import { advertisingMedium, compactAudience, leasingFormats, parseBusinessContacts } from '../../lib/tradeCenterBusiness';
import { BuildingOffersSection } from './BuildingOffersSection';
import { CategorySpoiler } from '../ui/CategorySpoiler';
import { RetailCategorySpoiler } from './RetailCategorySpoiler';
import { fitGridClass } from '../../lib/fitGrid';

const boxClass = 'min-w-0 rounded-[20px] border border-border bg-white px-5 py-[18px]';
const icons = { monitor: Monitor, play: Play, volume: Volume2, image: Image, car: Car, sparkles: Sparkles, megaphone: Megaphone };

function BusinessContact({ title, text }: { title: string; text: string }) {
  const contacts = parseBusinessContacts(text);
  return <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#1b1c20] px-5 py-[18px] text-white">
    <div className="min-w-0">
      <h3 className="text-sm font-bold">{title}</h3>
      {(contacts.hours || contacts.rest) && <p className="mt-1 text-xs text-white/60">{contacts.hours ?? contacts.rest}</p>}
    </div>
    <div className="flex min-w-0 flex-wrap gap-2">
      {contacts.phones.map((phone) => <a key={phone.href} href={phone.href} className="rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold hover:bg-primary-hover">{phone.label}</a>)}
      {contacts.emails.map((email) => <a key={email.href} href={email.href} className="break-all rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-sm font-semibold hover:bg-white/15">{email.label}</a>)}
    </div>
  </div>;
}

export function TradeCenterLeasing({
  info,
  name,
  sale,
  rent,
  index,
}: {
  info: RetailInfo | null;
  name: string;
  sale: DealStats | null;
  rent: DealStats | null;
  index?: number;
}) {
  const leasing = info?.leasing ?? null;
  const listed = info?.vacancies ?? [];
  if (!leasing && !sale && !rent && !listed.length) return null;
  const formats = leasingFormats(leasing);
  return (
    <CategorySpoiler
      id="offers"
      title="Аренда в ТЦ"
      subtitle={leasing?.contacts ? `Помещения сдаёт сама управляющая компания ${name}` : 'Свободные площади и отдел аренды'}
      meta="Для бизнеса"
      icon={Store}
      index={index}
    >
      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-ink-muted">Свободные помещения</h3>
        {sale || rent || listed.length ? <BuildingOffersSection sale={sale} rent={rent} listed={listed} embedded /> : <div className={`${boxClass} flex items-center gap-3.5`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] font-bold text-ink/60" aria-hidden="true">0</span>
          <p className="text-sm text-ink">ТЦ не публикует список свободных площадей<span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">Узнать, что есть сейчас, можно напрямую в отделе аренды.</span></p>
        </div>}
      </div>
      {formats.length > 0 && <div className={`grid gap-2.5 ${fitGridClass(formats.length, 2)}`}>
        {formats.map((format, formatIndex) => <article key={formatIndex} className={boxClass}>
          <h3 className="text-sm font-bold text-ink">{format.title}</h3>
          {format.text && <p className="mt-1 break-words text-xs leading-relaxed text-ink-muted">{format.text}</p>}
        </article>)}
      </div>}
      {leasing?.contacts && <BusinessContact title={`Отдел аренды ${name}`} text={leasing.contacts} />}
    </CategorySpoiler>
  );
}

export function TradeCenterAdvertising({ info, name, index }: { info: RetailInfo; name: string; index?: number }) {
  const { audience, advertising } = info;
  if (!audience.length && !advertising) return null;
  const lead = advertising?.text?.match(/^.*?(?:[.!?](?=\s|$)|$)/)?.[0];
  return (
    <RetailCategorySpoiler
      id="advertising"
      subtitle={lead || 'Носители, аудитория и контакты отдела рекламы'}
      meta="Для бизнеса"
      index={index}
    >
      {audience.length > 0 && <div className={`grid gap-2.5 ${fitGridClass(audience.length, 5, 'tiles')}`}>
        {audience.map((entry, audienceIndex) => {
          const tile = compactAudience(entry);
          return <div key={audienceIndex} className="min-w-0 rounded-2xl border border-border bg-white p-3.5">
            <div className="break-words text-[22px] font-extrabold leading-tight text-ink">{tile.value}</div>
            <div className="mt-1 text-xs text-ink-muted">{tile.label}</div>
          </div>;
        })}
      </div>}
      {!!advertising?.points.length && <div className={`grid gap-2.5 ${fitGridClass(advertising.points.length, 3)}`}>
        {advertising.points.map((point, pointIndex) => {
          const medium = advertisingMedium(point);
          const Icon = icons[medium.icon];
          return <article key={pointIndex} className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-white px-4 py-3.5">
            <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-ink/[0.06] text-ink/70"><Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></span>
            <div className="min-w-0"><h3 className="break-words text-sm font-bold text-ink">{medium.title}</h3>{medium.text && <p className="mt-0.5 break-words text-xs leading-relaxed text-ink-muted">{medium.text}</p>}</div>
          </article>;
        })}
      </div>}
      {advertising?.contacts && <BusinessContact title={`Отдел рекламы ${name}`} text={advertising.contacts} />}
    </RetailCategorySpoiler>
  );
}

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { RetailInfo } from '../../data/businessCenters';
import { METRO_LINE_DOT_CLASS } from '../../lib/businessCenterCatalogFilter';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import { eventDateForVisit, eventsForVisit, loyaltyForVisit, parkingForVisit, transportForVisit } from '../../lib/tradeCenterVisit';
import { RetailCardTitle } from './TradeCenterRetailParts';
import { retailCardClass } from './tradeCenterRetailStyle';

const boxClass = 'min-w-0 rounded-[20px] border border-border bg-white px-5 py-[18px]';
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-ink-muted';

function TransportRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline gap-2.5 py-2 text-sm first:pt-0 last:pb-0">
    <dt className="w-[92px] shrink-0 text-xs font-semibold text-ink-muted">{label}</dt>
    <dd className="min-w-0 flex-1 break-words">{children}</dd>
  </div>;
}

export function TradeCenterGettingHere({ info }: { info: RetailInfo }) {
  const transport = transportForVisit(info.transport);
  const parking = parkingForVisit(info.parking, info.hours);
  const hasTransport = Boolean(transport.metro.length || transport.routes.length || transport.transfers.length);
  if (!hasTransport && !parking) return null;
  return <section id="getting-here" className={retailCardClass} style={glassCardShadow}>
    <RetailCardTitle id="getting-here" label="Как добраться и где встать" />
    <div className={cn('grid grid-cols-1 gap-[18px]', hasTransport && parking && 'md:grid-cols-2')}>
      {hasTransport && <div className={boxClass}>
        <h3 className={cn(labelClass, 'mb-3')}>Транспорт</h3>
        <dl className="divide-y divide-border">
          {transport.metro.length > 0 && <TransportRow label="Метро">
            {transport.metro.map((station, index) => <span key={station.name}>
              {index > 0 && ' · '}
              <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', station.line ? METRO_LINE_DOT_CLASS[station.line] : 'bg-ink-faint')} aria-hidden="true" />
              «{station.name}» {station.distance}
            </span>)}
          </TransportRow>}
          {transport.routes.map((route) => <TransportRow key={route.label} label={route.label}>
            <span className="flex flex-wrap gap-1.5">{route.numbers.map((number) => <span key={number} className="rounded-lg border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold">{number}</span>)}</span>
          </TransportRow>)}
          {transport.transfers.map((transfer, index) => <TransportRow key={`${transfer.label}-${index}`} label={transfer.label}>{transfer.text}</TransportRow>)}
        </dl>
      </div>}
      {parking && <div className={boxClass}>
        <h3 className={cn(labelClass, 'mb-3')}>Парковка{parking.entrance && ` · въезд ${parking.entrance}`}</h3>
        {parking.tiles.length > 0 && <dl className="mb-4 grid grid-cols-3 gap-2">
          {parking.tiles.map((tile) => <div key={tile.label} className="min-w-0 rounded-2xl bg-surface-muted p-3">
            <dd className="break-words text-lg font-extrabold sm:text-xl">{tile.value}</dd>
            <dt className="mt-0.5 text-[11px] leading-snug text-ink-muted">{tile.label}</dt>
          </div>)}
        </dl>}
        {parking.free.length > 0 && <>
          <h4 className={labelClass}>Как встать бесплатно</h4>
          <ul className="mt-1">{parking.free.map((text, index) => <li key={index} className="flex gap-2 py-1 text-[13px] leading-snug">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /><span>{text}</span>
          </li>)}</ul>
        </>}
        {parking.charging && <p className="mt-3 text-xs text-ink-muted">Электрозарядки: {parking.charging}</p>}
      </div>}
    </div>
  </section>;
}

export function TradeCenterOffersEvents({ info }: { info: RetailInfo }) {
  const events = eventsForVisit(info.events);
  const loyalty = info.loyalty.map(loyaltyForVisit);
  if (!events.length && !loyalty.length) return null;
  return <section id="offers-events" className={retailCardClass} style={glassCardShadow}>
    <RetailCardTitle id="offers-events" />
    {loyalty.map((program, index) => <div key={`${program.name}-${index}`} className="grid grid-cols-1 items-center gap-[18px] rounded-[20px] bg-[#1b1c20] px-5 py-[18px] text-white md:grid-cols-[1.1fr_2fr]">
      <div><h3 className="text-base font-bold">{program.name}</h3>{program.subtitle && <p className="mt-1 text-xs text-white/65">{program.subtitle}</p>}</div>
      {program.facts.length > 0 ? <dl className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
        {program.facts.map((fact) => <div key={fact.label} className="min-w-0 rounded-xl bg-white/[0.06] px-3 py-2.5">
          <dd className="break-words text-base font-extrabold">{fact.value}</dd><dt className="mt-0.5 text-[11px] leading-snug text-white/65">{fact.label}</dt>
        </div>)}
      </dl> : <p className="text-sm leading-relaxed text-white/65">{program.fallback}</p>}
    </div>)}
    {events.length > 0 && <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-3">
      {events.map((event, index) => <article key={`${event.name}-${index}`} className="min-w-0 rounded-[18px] border border-border bg-white px-4 py-3.5">
        {eventDateForVisit(event) && <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{eventDateForVisit(event)}</p>}
        <h3 className="mt-1 text-[15px] font-bold">{event.name}</h3>
        {event.text && <details open={index === 0} className="mt-2 text-xs text-ink-muted">
          <summary className="cursor-pointer list-none hover:text-ink focus-visible:outline-primary">Подробнее ▾</summary>
          <p className="mt-1.5 text-[13px] leading-relaxed">{event.text}</p>
        </details>}
      </article>)}
    </div>}
  </section>;
}

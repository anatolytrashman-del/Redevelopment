// Развёрнутый блок «Кто стоит за ТЦ» (владелец, 2026-09-24: у ТЦ блок
// застройщика «смотрится бедно, мало инфы»). Рисуется ВМЕСТО простой
// карточки «Застройщик», только когда в developer_info есть новые поля
// (hasDeveloperDeepData); у 141 БЦ их нет, и там всё как было. Порядок:
// главная компания с цифрами масштаба → участники проекта по ролям →
// портфель → факты → контакты → источники одним списком без дублей.
// Портфель длинный — первые PORTFOLIO_PREVIEW и «Показать все» на месте,
// без модалки (вложенных модалок у нас нет, см. CLAUDE.md).
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, CalendarDays, ExternalLink, HardHat, Landmark, Lightbulb, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DeveloperInfo } from '../../data/businessCenters';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import {
  PORTFOLIO_PREVIEW,
  capitalizeRole,
  collectDeveloperSources,
  companyMeta,
  groupPortfolio,
  portfolioMeta,
  websiteLink,
} from '../../lib/developerProfile';
import { formatRetailDate } from '../../lib/tradeCenterRetail';
import { SourcesLine } from './TradeCenterRetailParts';
import { pluralRu } from '../../lib/pluralRu';

const SCALE_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' };

function SubTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-base font-bold text-ink">
      <Icon className="h-4 w-4 shrink-0 text-icon" />
      {children}
    </h3>
  );
}

export function DeveloperDeepCard({
  info,
  title,
  mainName,
  logoAlt,
  contacts,
  showSources = true,
}: {
  info: DeveloperInfo;
  /** «Кто стоит за торговым центром «Замок»». */
  title: string;
  /** Главная компания: profile.name, иначе короткое поле developer. */
  mainName: string | null;
  logoAlt: string;
  /** Контакты — тот же кусок, что у простой карточки (страница собирает). */
  contacts: ReactNode;
  showSources?: boolean;
}) {
  const [showAllPortfolio, setShowAllPortfolio] = useState(false);
  const profile = info.profile ?? null;
  const companies = info.companies ?? [];
  const portfolio = info.portfolio ?? [];
  const facts = info.facts ?? [];
  const scale = (profile?.scale ?? []).slice(0, 4);
  const portfolioGroups = groupPortfolio(portfolio, showAllPortfolio ? Infinity : PORTFOLIO_PREVIEW);
  const hiddenCount = portfolio.length - portfolioGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div id="developer" className={cn('mt-6 flex scroll-mt-32 flex-col gap-6 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold text-ink">
          <HardHat className="h-5 w-5 shrink-0 text-icon" />
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        {info.logoUrl && (
          <img src={info.logoUrl} alt={logoAlt} loading="lazy" className="h-9 w-auto max-w-[10rem] object-contain" />
        )}
      </div>

      {/* Главная компания */}
      <div className="flex flex-col gap-3">
        {mainName && <p className="break-words text-base font-bold text-ink sm:text-lg">{mainName}</p>}
        {profile?.business && <p className="text-sm leading-relaxed text-ink">{profile.business}</p>}
        {(profile?.founded || profile?.hq) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-muted">
            {profile.founded && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-icon" />
                {/^\d{4}$/.test(profile.founded) ? `Основана в ${profile.founded} году` : `Основана: ${profile.founded}`}
              </span>
            )}
            {profile.hq && (
              <span className="flex min-w-0 items-center gap-1.5">
                <Landmark className="h-4 w-4 shrink-0 text-icon" />
                <span className="min-w-0 break-words">Штаб-квартира: {profile.hq}</span>
              </span>
            )}
          </div>
        )}
        {info.description && <p className="text-sm leading-relaxed text-ink-muted">{info.description}</p>}
        {scale.length > 0 && (
          <div className={cn('grid grid-cols-2 gap-3', SCALE_COLS[scale.length] ?? 'sm:grid-cols-4')}>
            {scale.map((s, i) => {
              const when = formatRetailDate(s.date);
              return (
                <div
                  key={`${s.label}-${i}`}
                  className="flex min-w-0 flex-col gap-1 rounded-2xl bg-icon-bg p-4 max-sm:[&:last-child:nth-child(odd)]:col-span-2"
                >
                  <span className="break-words text-xl font-bold leading-tight text-ink tabular-nums sm:text-2xl">{s.value}</span>
                  <span className="break-words text-xs leading-snug text-ink-muted">{s.label}</span>
                  {when && <span className="mt-auto break-words pt-0.5 text-[11px] leading-snug text-ink-faint">{when}</span>}
                </div>
              );
            })}
          </div>
        )}
        {profile && profile.people.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-ink-muted">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-icon" />
            <span className="min-w-0 break-words">
              {profile.people.map((p, i) => (
                <span key={`${p.name}-${i}`}>
                  {i > 0 && ' · '}
                  {capitalizeRole(p.role)} — <span className="text-ink">{p.name}</span>
                </span>
              ))}
            </span>
          </p>
        )}
      </div>

      {companies.length > 0 && (
        <div className="flex flex-col gap-3">
          <SubTitle icon={Users}>Участники проекта</SubTitle>
          <div className={cn('grid grid-cols-1 gap-3', companies.length > 1 && 'md:grid-cols-2')}>
            {companies.map((c, i) => {
              const meta = companyMeta(c);
              const site = websiteLink(c.website);
              return (
                <div key={`${c.role}-${c.name}-${i}`} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-white/65 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{c.role}</span>
                  <span className="break-words text-sm font-bold text-ink">{c.name}</span>
                  {(meta || (c.legalName && c.legalName !== c.name)) && (
                    <span className="break-words text-xs text-ink-muted">
                      {[meta, c.legalName && c.legalName !== c.name ? c.legalName : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {c.text && <p className="mt-1 break-words text-sm leading-relaxed text-ink-muted">{c.text}</p>}
                  {site && (
                    <a
                      href={site.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-ink hover:underline"
                    >
                      {site.label}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {portfolio.length > 0 && (
        <div className="flex flex-col gap-3">
          <SubTitle icon={Building2}>
            Другие объекты
            <span className="text-sm font-semibold text-ink-faint">{portfolio.length}</span>
          </SubTitle>
          {portfolioGroups.map((group, gi) => (
            <div key={`${group.owner ?? ''}-${gi}`} className="flex flex-col gap-2">
              {group.owner && <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{group.owner}</span>}
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {group.items.map((e, i) => {
                  const meta = portfolioMeta(e);
                  return (
                    <li key={`${e.name}-${i}`} className="flex min-w-0 flex-col border-l-2 border-primary/25 pl-3">
                      <span className="break-words text-sm font-semibold text-ink">{e.name}</span>
                      {meta && <span className="break-words text-xs text-ink-muted">{meta}</span>}
                      {e.note && <span className="break-words text-xs text-ink-faint">{e.note}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {portfolio.length > PORTFOLIO_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllPortfolio((v) => !v)}
              className="w-fit text-sm font-semibold text-primary-hover hover:underline"
            >
              {showAllPortfolio
                ? 'Свернуть'
                : `Показать ещё ${hiddenCount} ${pluralRu(hiddenCount, 'объект', 'объекта', 'объектов')}`}
            </button>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <div className="flex flex-col gap-3">
          <SubTitle icon={Lightbulb}>Факты о компании</SubTitle>
          <ul className="flex flex-col gap-2.5">
            {facts.map((f, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-icon" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  {f.label && (
                    <span className="font-semibold text-ink">{/[.!?…:]$/.test(f.label) ? `${f.label} ` : `${f.label}. `}</span>
                  )}
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {contacts}

      {showSources && <SourcesLine entries={collectDeveloperSources(info)} />}
    </div>
  );
}

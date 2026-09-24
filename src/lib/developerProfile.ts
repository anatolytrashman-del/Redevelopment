// Развёрнутый блок «Кто стоит за ТЦ» (2026-09-24): разбор новых полей
// jsonb-колонки business_centers.developer_info (companies, profile,
// portfolio, facts — бриф tc-catalog/codex/briefs/developer-deep.md) и
// чистые функции, которыми пользуются и видимый блок
// (components/businessCenters/DeveloperDeepCard.tsx), и FAQ карточки.
// Одни и те же данные на обе стороны — FAQ не пересказывает блок своими
// словами и не выдумывает того, чего в блоке нет.
import type {
  DeveloperCompany,
  DeveloperFact,
  DeveloperInfo,
  DeveloperPerson,
  DeveloperPortfolioEntry,
  DeveloperProfile,
  DeveloperScaleEntry,
  RetailSource,
} from '../data/businessCenters';
import { formatRetailDate } from './tradeCenterRetail';

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Строка или число как строка: «1996» и 1996 в jsonb значат одно и то же. */
function text(value: unknown): string | null {
  return str(value) ?? (num(value) != null ? String(value) : null);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.flatMap((item) => (record(item) ? [item as Record<string, unknown>] : [])) : [];
}

/** Ресёрч пишет то camelCase (бриф), то snake_case (пилот) — берём любое. */
function pick(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (r[key] != null) return r[key];
  return null;
}

function sourceOf(r: Record<string, unknown>): RetailSource {
  return { source: str(r.source), sourceUrl: str(pick(r, 'sourceUrl', 'source_url', 'url')) };
}

/** Число из базы — квадратные метры: 12300 → «12 300 м²». Строка — как есть. */
export function formatDeveloperArea(value: unknown): string | null {
  const n = num(value);
  if (n != null) return n > 0 ? `${Math.round(n).toLocaleString('ru-RU')} м²` : null;
  return str(value);
}

function companies(value: unknown): DeveloperCompany[] {
  return records(value).flatMap((r) => {
    const role = str(r.role);
    const name = str(r.name);
    if (!role || !name) return [];
    return [
      {
        role,
        name,
        legalName: str(pick(r, 'legalName', 'legal_name')),
        years: text(r.years),
        country: str(r.country),
        website: str(r.website),
        text: str(pick(r, 'text', 'description')),
        quote: str(r.quote),
        ...sourceOf(r),
      },
    ];
  });
}

function scale(value: unknown): DeveloperScaleEntry[] {
  return records(value).flatMap((r) => {
    const label = str(r.label);
    const v = text(r.value);
    return label && v ? [{ label, value: v, date: text(r.date), ...sourceOf(r) }] : [];
  });
}

function people(value: unknown): DeveloperPerson[] {
  return records(value).flatMap((r) => {
    const name = str(r.name);
    const role = str(r.role);
    return name && role ? [{ name, role, ...sourceOf(r) }] : [];
  });
}

function profile(value: unknown): DeveloperProfile | null {
  const r = record(value);
  if (!r) return null;
  const name = str(r.name);
  if (!name) return null;
  return {
    name,
    founded: text(r.founded),
    hq: str(r.hq),
    business: str(r.business),
    scale: scale(r.scale),
    people: people(r.people),
  };
}

function portfolio(value: unknown): DeveloperPortfolioEntry[] {
  return records(value).flatMap((r) => {
    const name = str(r.name);
    if (!name) return [];
    return [
      {
        name,
        kind: str(r.kind),
        city: str(r.city),
        year: text(r.year),
        area: formatDeveloperArea(r.area),
        note: str(r.note),
        owner: str(r.owner),
        ...sourceOf(r),
      },
    ];
  });
}

function facts(value: unknown): DeveloperFact[] {
  return records(value).flatMap((r) => {
    const t = str(r.text);
    return t ? [{ label: str(r.label), text: t, quote: str(r.quote), ...sourceOf(r) }] : [];
  });
}

const DEEP_KEYS = ['companies', 'profile', 'portfolio', 'facts'] as const;

/**
 * jsonb из базы → DeveloperInfo. Старые поля (описание, контакты) —
 * строка или null, как и раньше. Новые — только если в них есть хоть одна
 * годная запись: запись без обязательных полей отбрасывается, пустой
 * массив не кладётся вовсе, чтобы у 141 БЦ объект остался прежней формы.
 * Прочие ключи, которых код не знает, сохраняются как есть: форма админки
 * пишет developer_info целиком, и без этого одно сохранение стирало бы
 * данные, заведённые ресёрчем позже этого кода.
 */
export function normalizeDeveloperInfo(raw: unknown): DeveloperInfo | null {
  const data = record(raw);
  if (!data) return null;
  const rest: Record<string, unknown> = { ...data };
  for (const key of DEEP_KEYS) delete rest[key];
  const info: DeveloperInfo = {
    ...rest,
    logoUrl: str(data.logoUrl),
    description: str(data.description),
    phone: str(data.phone),
    address: str(data.address),
    hours: str(data.hours),
    website: str(data.website),
    email: str(data.email),
  };
  const c = companies(data.companies);
  if (c.length) info.companies = c;
  const p = profile(data.profile);
  if (p) info.profile = p;
  const pf = portfolio(data.portfolio);
  if (pf.length) info.portfolio = pf;
  const f = facts(data.facts);
  if (f.length) info.facts = f;
  return info;
}

/** Поля developer_info, которые правит форма админки. */
export type DeveloperFormFields = Pick<
  DeveloperInfo,
  'logoUrl' | 'description' | 'phone' | 'address' | 'hours' | 'website' | 'email'
>;

/**
 * Форма админки → developer_info без потерь. Форма знает только семь
 * полей, а в том же jsonb ресёрч хранит развёрнутый блок (companies,
 * profile, portfolio, facts) и может завести что-то ещё: всё, чего нет в
 * форме, переносится из existing как было. null («карточки нет») — только
 * когда пусты и форма, и переносить нечего.
 */
export function mergeDeveloperFormFields(
  fields: DeveloperFormFields,
  existing: DeveloperInfo | null | undefined,
): DeveloperInfo | null {
  const carried: Record<string, unknown> = { ...(existing ?? {}) };
  for (const key of Object.keys(fields)) delete carried[key];
  const hasCarried = Object.values(carried).some((v) => v != null && !(Array.isArray(v) && v.length === 0));
  if (!hasCarried && Object.values(fields).every((v) => !v)) return null;
  return { ...carried, ...fields };
}

/** Есть ли хоть что-то для развёрнутого блока; нет — карточка как раньше. */
export function hasDeveloperDeepData(info: DeveloperInfo | null | undefined): boolean {
  if (!info) return false;
  return Boolean(info.companies?.length || info.profile || info.portfolio?.length || info.facts?.length);
}

/** «Хозяин» объекта для заголовков: профиль, иначе короткое поле developer. */
export function developerMainName(info: DeveloperInfo | null | undefined, fallback: string | null): string | null {
  return info?.profile?.name ?? fallback;
}

/** «Инвестор и застройщик» — роль с заглавной для подписи. */
export function capitalizeRole(role: string): string {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : role;
}

/** «2011–2014 · Турция» — мелкая строка под названием участника. */
export function companyMeta(company: DeveloperCompany): string {
  return [company.years, company.country].filter(Boolean).join(' · ');
}

/** «ТЦ · Минск · 2011 · 12 300 м²» — строка под названием объекта портфеля. */
export function portfolioMeta(entry: DeveloperPortfolioEntry): string {
  return [entry.kind, entry.city, entry.year, entry.area].filter(Boolean).join(' · ');
}

/**
 * Портфель по владельцам в порядке первого появления. Группы имеют смысл,
 * только когда владельцев больше одного (компания и её генподрядчик), —
 * иначе одна группа без подписи (owner: null). limit — сколько объектов
 * показать до «Показать ещё»: считается ПОСЛЕ группировки по всему списку,
 * чтобы подписи групп не появлялись и не пропадали при раскрытии.
 */
export function groupPortfolio(
  entries: DeveloperPortfolioEntry[],
  limit: number = Infinity,
): { owner: string | null; items: DeveloperPortfolioEntry[] }[] {
  const owners = new Set(entries.map((e) => e.owner ?? ''));
  const groups = new Map<string, DeveloperPortfolioEntry[]>();
  for (const entry of entries) {
    const key = owners.size <= 1 ? '' : (entry.owner ?? '');
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  let left = limit;
  const result: { owner: string | null; items: DeveloperPortfolioEntry[] }[] = [];
  for (const [owner, items] of groups) {
    if (left <= 0) break;
    const shown = items.slice(0, left);
    left -= shown.length;
    result.push({ owner: owner || null, items: shown });
  }
  return result;
}

/** Сайт компании → ссылка с голым хостом в подписи; мусор — null. */
export function websiteLink(raw: string | null | undefined): { href: string; label: string } | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return { href: url.href, label: url.host.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

/** Сколько объектов портфеля видно до «Показать все». */
export const PORTFOLIO_PREVIEW = 8;

/** Все источники блока в порядке на странице; дубли убирает SourcesLine. */
export function collectDeveloperSources(info: DeveloperInfo): RetailSource[] {
  return [
    ...(info.profile?.scale ?? []),
    ...(info.profile?.people ?? []),
    ...(info.companies ?? []),
    ...(info.portfolio ?? []),
    ...(info.facts ?? []),
  ];
}

function estimateLines(value: string | null | undefined, charsPerLine: number): number {
  if (!value) return 0;
  return value.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
}

/**
 * Модель высоты блока `developer` (businessCenterPageLayout: base 240,
 * perItem 15) — число «строк по 15 px» при 1280 px. Без новых полей — как
 * раньше: строки описания. С ними — сумма частей; замер 2026-09-24 на
 * мок-данных «Замка» (3 цифры, 5 участников, 10 объектов, 5 фактов):
 * 1780 px на странице против 1725 по модели.
 */
export function developerSectionSize(info: DeveloperInfo | null | undefined): number {
  if (!info) return 0;
  const descriptionLines = estimateLines(info.description, 110);
  if (!hasDeveloperDeepData(info)) return descriptionLines;
  let px = descriptionLines * 23;
  const p = info.profile;
  if (p) {
    px += 70 + (p.business ? 24 : 0) + (p.founded || p.hq ? 30 : 0);
    if (p.scale.length) px += 110 * Math.ceil(Math.min(p.scale.length, 4) / 4);
    if (p.people.length) px += 24;
  }
  const c = info.companies ?? [];
  if (c.length) {
    // Две колонки: высота ряда — от более длинного текста в нём.
    px += 44;
    for (let i = 0; i < c.length; i += 2) {
      const lines = Math.max(...c.slice(i, i + 2).map((x) => estimateLines(x.text, 55)));
      px += 122 + lines * 23;
    }
  }
  const pf = info.portfolio ?? [];
  if (pf.length) {
    const groups = groupPortfolio(pf, PORTFOLIO_PREVIEW);
    const rows = groups.reduce((sum, g) => sum + Math.ceil(g.items.length / 2), 0);
    const labels = groups.filter((g) => g.owner).length;
    px += 44 + rows * 48 + labels * 30 + (pf.length > PORTFOLIO_PREVIEW ? 44 : 0);
  }
  const f = info.facts ?? [];
  if (f.length) px += 44 + f.reduce((sum, x) => sum + 12 + estimateLines(`${x.label ?? ''} ${x.text}`, 110) * 22, 0);
  if (collectDeveloperSources(info).some((s) => s.source || s.sourceUrl)) px += 60;
  // Между частями развёрнутого блока gap-6, у простой карточки — gap-4.
  px += 8 * [p, c.length, pf.length, f.length].filter(Boolean).length;
  return Math.round(px / 15);
}

// --- FAQ -----------------------------------------------------------------

function sentence(value: string): string {
  const t = value.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** «Основана в 1996 году, штаб-квартира — Минск. Сеть торговых центров.» */
export function developerProfileSentence(profile: DeveloperProfile | null | undefined): string | null {
  if (!profile) return null;
  const bits = [
    profile.founded ? (/^\d{4}$/.test(profile.founded) ? `основана в ${profile.founded} году` : `основана: ${profile.founded}`) : null,
    profile.hq ? `штаб-квартира — ${profile.hq}` : null,
  ].filter((v): v is string => Boolean(v));
  const parts = [
    bits.length ? sentence(`${profile.name}: ${bits.join(', ')}`) : null,
    profile.business ? sentence(profile.business) : null,
  ].filter((v): v is string => Boolean(v));
  return parts.length ? parts.join(' ') : null;
}

/** Ответ «Кто участвовал в строительстве …» — по участнику в строку. */
export function developerCompaniesFaqAnswer(list: DeveloperCompany[] | undefined): string | null {
  if (!list?.length) return null;
  return list
    .map((c) => {
      const meta = companyMeta(c);
      const head = `${capitalizeRole(c.role)} — ${c.name}${meta ? ` (${meta})` : ''}`;
      return c.text ? `${sentence(head)} ${sentence(c.text)}` : sentence(head);
    })
    .join('\n');
}

/** Ответ «Что ещё построила …» — объекты через точку с запятой, по группам. */
export function developerPortfolioFaqAnswer(list: DeveloperPortfolioEntry[] | undefined): string | null {
  if (!list?.length) return null;
  return groupPortfolio(list)
    .map((group) => {
      const items = group.items.map((e) => {
        const meta = portfolioMeta(e);
        return `${e.name}${meta ? ` (${meta})` : ''}`;
      });
      const body = sentence(items.join('; '));
      return group.owner ? `${group.owner}: ${body}` : body;
    })
    .join('\n');
}

/**
 * Ответ «Что известно о компании …» — цифры масштаба, люди и факты.
 * Год основания и штаб-квартира сюда не входят: они уже в ответе «Кто
 * застройщик» (developerProfileSentence), второй раз — повтор.
 */
export function developerAboutFaqAnswer(info: DeveloperInfo | null | undefined): string | null {
  if (!info) return null;
  const p = info.profile;
  const lines: string[] = [];
  if (p?.scale.length) {
    lines.push(
      sentence(
        `В цифрах: ${p.scale.map((s) => {
          const when = formatRetailDate(s.date);
          return `${s.label} — ${s.value}${when ? ` (${when})` : ''}`;
        }).join('; ')}`,
      ),
    );
  }
  if (p?.people.length) lines.push(p.people.map((x) => sentence(`${capitalizeRole(x.role)} — ${x.name}`)).join(' '));
  for (const f of info.facts ?? []) lines.push(f.label ? `${sentence(f.label)} ${sentence(f.text)}` : sentence(f.text));
  return lines.length ? lines.join('\n') : null;
}

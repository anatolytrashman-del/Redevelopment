// Блок «Инфраструктура» карточки ТЦ (2026-09-24). Владелец: «сделай единый
// понятный блок инфраструктура». До этого у ТЦ было два списка одного и того
// же: плитки оборудования из Яндекс.Карт с числом (BuildingAmenities —
// банкоматы, туалеты, велопарковка…) и панель «Удобства и правила» в
// «Посетителю» (retail_info.services с сайта ТЦ). Инфоцентр, велопарковка и
// гардероб при этом стояли в обоих местах.
//
// Здесь оба списка сливаются в один, по группам (RETAIL_SERVICE_GROUPS):
// - оборудование Яндекса раскладывается по группам по своей канонической
//   подписи (AMENITY_GROUPS); «Парковку» у ТЦ не показываем вовсе — это
//   въезды в паркинг, «2 шт.» читается как «два места», а сам паркинг
//   подробно описан в «Посетителю»;
// - сервис и оборудование об одном и том же склеиваются в одну плитку:
//   название, этаж и пояснение — из сервиса, число — из Яндекса.
//
// Видимый блок (components/businessCenters/TradeCenterInfrastructure.tsx),
// ответ FAQ и модель высоты берут одни и те же группы отсюда — чтобы FAQ не
// расходился с блоком.
import { RETAIL_SERVICE_GROUPS, type RetailServiceEntry, type RetailServiceGroup } from '../data/businessCenters';
import type { TenantAmenity } from './businessCenterTenants';
import { tenantAmenityTitle } from './tenantCategories';
import { RETAIL_SERVICE_GROUP_LABELS, serviceFloorLabel, serviceGroupFromName } from './tradeCenterRetail';

/** Группа оборудования по канонической подписи; null — у ТЦ не показывать. */
const AMENITY_GROUPS: Record<string, RetailServiceGroup | null> = {
  Банкомат: 'money',
  Криптомат: 'money',
  'Платёжный терминал': 'money',
  Туалет: 'comfort',
  'Кофейный автомат': 'comfort',
  'Вендинговый автомат': 'comfort',
  'Зарядная станция': 'comfort',
  'Камера хранения': 'comfort',
  Гардероб: 'comfort',
  Инфоцентр: 'info',
  'Комната матери и ребёнка': 'family',
  Велопарковка: 'car',
  'Зарядка электромобилей': 'car',
  Постамат: 'everyday',
  Парковка: null,
};

function amenityGroup(label: string): RetailServiceGroup | null {
  return label in AMENITY_GROUPS ? AMENITY_GROUPS[label] : serviceGroupFromName(label);
}

// Сервис с сайта ТЦ, который описывает то же оборудование, что и Яндекс:
// «Инфоцентры», «Информационный центр» и «Инфоцентр» — одна стойка.
// «Туалеты для маломобильных» — отдельная плитка в «Доступной среде», а не
// те же туалеты: их число у Яндекса не выделено.
const SERVICE_AMENITY: [string, RegExp][] = [
  ['Инфоцентр', /^(инфоцентр|информационн\p{L}* (центр|стойк)|справочн)/iu],
  ['Велопарковка', /^велопарковк/iu],
  ['Гардероб', /^гардероб/iu],
  ['Комната матери и ребёнка', /^комнат\p{L}* матери/iu],
  ['Туалет', /^туалет(?!.*(маломобил|инвалид))/iu],
  ['Камера хранения', /^камер\p{L}* хранения/iu],
  ['Банкомат', /^банкомат/iu],
  ['Платёжный терминал', /^плат[её]жн\p{L}* терминал/iu],
  ['Постамат', /^постамат/iu],
  ['Зарядка электромобилей', /электромобил|электрозаряд/iu],
  ['Зарядная станция', /^зарядк\p{L}* (гаджет|телефон|смартфон)|^зарядн\p{L}* станц|па[уў]эрбанк|повербанк/iu],
  ['Кофейный автомат', /^кофе-?автомат|^кофейн\p{L}* автомат/iu],
];

export function serviceAmenityLabel(name: string): string | null {
  return SERVICE_AMENITY.find(([, re]) => re.test(name.trim()))?.[0] ?? null;
}

export interface InfrastructureItem {
  key: string;
  /** Короткое название плитки. */
  title: string;
  /** Каноническая подпись оборудования Яндекса — по ней иконка; null у сервиса без пары. */
  amenity: string | null;
  /** Сколько точек в Яндексе; null — у сервиса без пары. */
  count: number | null;
  floor: string | null;
  text: string | null;
  /** Запись с сайта ТЦ — для строки источников; null у чистого оборудования. */
  service: RetailServiceEntry | null;
}

export interface InfrastructureGroup {
  id: RetailServiceGroup;
  label: string;
  items: InfrastructureItem[];
}

/**
 * Группы блока в порядке показа, пустые выброшены. Внутри группы — сначала
 * сервисы в порядке ресёрча (с числом, если нашлась пара в Яндексе), за ними
 * оборудование без пары по убыванию числа.
 */
export function buildTradeCenterInfrastructure(
  services: RetailServiceEntry[],
  amenities: TenantAmenity[],
): InfrastructureGroup[] {
  const shownAmenities = amenities.filter((a) => amenityGroup(a.category) !== null);
  const amenityByLabel = new Map(shownAmenities.map((a) => [a.category, a]));
  const merged = new Set<string>();
  const byGroup = new Map<RetailServiceGroup, InfrastructureItem[]>();
  const push = (group: RetailServiceGroup, item: InfrastructureItem) => {
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  };

  services.forEach((service, i) => {
    const label = serviceAmenityLabel(service.name);
    const amenity = label && !merged.has(label) ? amenityByLabel.get(label) : undefined;
    if (amenity) merged.add(amenity.category);
    push(service.group, {
      key: `s-${i}`,
      // Название — как у ТЦ («Зарядка гаджетов» понятнее яндексовской
      // «Зарядки»), число — из Яндекса.
      title: service.name,
      amenity: amenity?.category ?? label,
      count: amenity?.count ?? null,
      floor: service.floor,
      text: service.text,
      service,
    });
  });

  for (const amenity of shownAmenities) {
    if (merged.has(amenity.category)) continue;
    push(amenityGroup(amenity.category) ?? 'comfort', {
      key: `a-${amenity.category}`,
      title: tenantAmenityTitle(amenity.category),
      amenity: amenity.category,
      count: amenity.count,
      floor: null,
      text: null,
      service: null,
    });
  }

  return RETAIL_SERVICE_GROUPS.flatMap((id) => {
    const items = byGroup.get(id);
    return items?.length ? [{ id, label: RETAIL_SERVICE_GROUP_LABELS[id], items }] : [];
  });
}

/** «2 этаж · 3 шт.» — этаж из сервиса и число из Яндекса, что есть. */
export function infrastructureItemMeta(item: InfrastructureItem): string | null {
  // «1 шт.» у гардероба или комнаты матери ничего не сообщает — число
  // показываем, только когда точек несколько.
  const parts = [serviceFloorLabel(item.floor), item.count != null && item.count > 1 ? `${item.count} шт.` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

// Посреди фразы «Банкоматы» пишется со строчной; латиница («Wi-Fi») и
// аббревиатуры остаются как есть.
function lowerFirst(text: string): string {
  return /^[А-ЯЁ][а-яё]/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/**
 * Ответ FAQ — строка на группу, как в блоке: «Деньги: банкоматы (19 шт.),
 * обмен валют (2 этаж) — обменный пункт Технобанка.»
 */
export function infrastructureFaqAnswer(groups: InfrastructureGroup[]): string | null {
  if (!groups.length) return null;
  return groups
    .map((group) => {
      const items = group.items.map((item) => {
        const meta = infrastructureItemMeta(item);
        const head = `${lowerFirst(item.title)}${meta ? ` (${meta})` : ''}`;
        return item.text ? `${head} — ${item.text.replace(/[.!?…]+$/, '')}` : head;
      });
      return sentence(`${group.label}: ${items.join('; ')}`);
    })
    .join('\n');
}

// Сколько символов влезает в строку плитки при трёх колонках на десктопе
// (1280px): пояснение text-xs, название — text-[13px] вместе с этажом справа.
const TILE_TEXT_CHARS = 38;
const TILE_TITLE_CHARS = 30;

/** Высота плитки в строках пояснения (~17px): название плюс пояснение. */
function tileLines(item: InfrastructureItem): number {
  const titleLength = item.title.length + (infrastructureItemMeta(item)?.length ?? 0);
  const title = titleLength > TILE_TITLE_CHARS ? 2 : 1;
  const text = item.text ? Math.ceil(item.text.length / TILE_TEXT_CHARS) : 0;
  return Math.max(title + text, 2);
}

/**
 * Высота блока для модели высот (businessCenterPageLayout) в «строках» по
 * ~17px: подзаголовок группы — две, ряд плиток по три на десктопе — отступы
 * ряда (одна) плюс самая высокая плитка ряда. Пояснения у ТЦ бывают на
 * пять-шесть строк («Доступная среда» у Galleria), поэтому считаем по длине
 * текста, а не по числу плиток.
 */
export function infrastructureSectionSize(groups: InfrastructureGroup[]): number {
  return groups.reduce((sum, group) => {
    let rows = 0;
    for (let i = 0; i < group.items.length; i += 3) {
      rows += 1 + Math.max(...group.items.slice(i, i + 3).map(tileLines));
    }
    return sum + 2 + rows;
  }, 0);
}

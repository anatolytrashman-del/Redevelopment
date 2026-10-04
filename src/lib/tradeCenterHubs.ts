// Тематические подборки каталога ТЦ (/minsk/tc/with/<slug>): «с одеждой»,
// дальше — кино, дети, подземные и т.д. Тот же шаблон каталога, что у
// /format/*, но отбор не по retail_format, а по правилу match.
//
// ФАЙЛ-БЛИЗНЕЦ правил отбора — scripts/_tcPaths.mjs (TC_TOPIC_HUB_MATCHERS),
// сверяет тест. Новые подборки добавлять сюда и в близнец одной правкой.
import type { BusinessCenter } from '../data/businessCenters';
import { pluralRu } from './pluralRu';
import { isOutsideMinsk } from './businessCenterRanking';

export type TcTopicMatchId = 'shopping';

export interface TcTopicHub {
  slug: string;
  match: TcTopicMatchId;
  /** «Торговые центры Минска с одеждой» — заголовок подборки. */
  title: string;
  /** «С одеждой» — крошки и ссылка. */
  label: string;
  subjectGen: (n: number) => string;
  plural: (n: number) => string;
  intro: (countLabel: string) => string;
}

/** Форматы, которые не отвечают на запрос «ТЦ с одеждой / для шопинга». */
export const TC_NON_SHOPPING_FORMATS = ['мебельный центр', 'рынок', 'строительный центр', 'автоцентр'] as const;

export const TC_TOPIC_HUBS: TcTopicHub[] = [
  {
    slug: 'shopping',
    match: 'shopping',
    title: 'Торговые центры Минска с одеждой',
    label: 'С одеждой',
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров'} Минска с одеждой`,
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
    intro: (count) =>
      `${count} Минска, где можно купить одежду. Адреса, площадь, парковка, часы работы и бренды внутри.`,
  },
];

export function tcTopicHubBySlug(slug: string | undefined): TcTopicHub | null {
  return TC_TOPIC_HUBS.find((h) => h.slug === slug) ?? null;
}

export function tcTopicHubUrl(hub: TcTopicHub, basePath = '/minsk/tc'): string {
  return `${basePath}/with/${hub.slug}`;
}

export function matchesTcTopicHub(center: BusinessCenter, hub: TcTopicHub): boolean {
  if (center.status === 'under_construction') return false;
  if (isOutsideMinsk(center)) return false;
  switch (hub.match) {
    case 'shopping':
      return center.retailFormat == null || !(TC_NON_SHOPPING_FORMATS as readonly string[]).includes(center.retailFormat);
    default:
      return false;
  }
}

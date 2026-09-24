import { createContext, useContext, type ReactNode } from 'react';
import { pluralRu } from './pluralRu';

// Два каталога на одном шаблоне (2026-09-23): бизнес-центры (/minsk/bc) и
// торговые центры (/minsk/tc). Данные лежат в одной таблице business_centers
// (колонка kind), страницы — одни и те же компоненты. Всё, чем каталоги
// отличаются в тексте и адресах, собрано здесь: страница берёт словарь из
// контекста (useCatalogKind) и не пишет «бизнес-центр» руками.
//
// Слова даны готовыми падежными формами, а не склоняются на лету: у
// «торговый центр» склоняются оба слова, и правило «добавь окончание»
// тут не работает.

export type CatalogKind = 'bc' | 'tc';

export interface CatalogVocabulary {
  kind: CatalogKind;
  /** Корень раздела на сайте: '/minsk/bc'. */
  basePath: string;
  /** Абсолютный адрес корня: 'https://redevelopment.pro/minsk/bc'. */
  siteUrl: string;
  /** Файл списка в dist/data (см. scripts/generate-catalog-data.mjs). */
  listFile: string;
  /** Короткая форма: «БЦ» / «ТЦ». */
  abbr: string;
  /** бизнес-центр / торговый центр */
  one: string;
  /** бизнес-центра / торгового центра */
  oneGen: string;
  /** бизнес-центре / торговом центре */
  onePrep: string;
  /** бизнес-центром / торговым центром */
  oneIns: string;
  /** бизнес-центры / торговые центры */
  many: string;
  /** Бизнес-центры / Торговые центры */
  Many: string;
  /** бизнес-центров / торговых центров */
  manyGen: string;
  /** бизнес-центрах / торговых центрах */
  manyPrep: string;
  /** бизнес-центрам / торговым центрам */
  manyDat: string;
  /** «Бизнес-центры Минска» — название раздела в крошках и заголовках. */
  catalogTitle: string;
  /** 1 бизнес-центр, 2 бизнес-центра, 5 бизнес-центров (без числа). */
  plural: (n: number) => string;
}

export const CATALOG_VOCABULARY: Record<CatalogKind, CatalogVocabulary> = {
  bc: {
    kind: 'bc',
    basePath: '/minsk/bc',
    siteUrl: 'https://redevelopment.pro/minsk/bc',
    listFile: 'business-centers.json',
    abbr: 'БЦ',
    one: 'бизнес-центр',
    oneGen: 'бизнес-центра',
    onePrep: 'бизнес-центре',
    oneIns: 'бизнес-центром',
    many: 'бизнес-центры',
    Many: 'Бизнес-центры',
    manyGen: 'бизнес-центров',
    manyPrep: 'бизнес-центрах',
    manyDat: 'бизнес-центрам',
    catalogTitle: 'Бизнес-центры Минска',
    plural: (n) => pluralRu(n, 'бизнес-центр', 'бизнес-центра', 'бизнес-центров'),
  },
  tc: {
    kind: 'tc',
    basePath: '/minsk/tc',
    siteUrl: 'https://redevelopment.pro/minsk/tc',
    listFile: 'trade-centers.json',
    abbr: 'ТЦ',
    one: 'торговый центр',
    oneGen: 'торгового центра',
    onePrep: 'торговом центре',
    oneIns: 'торговым центром',
    many: 'торговые центры',
    Many: 'Торговые центры',
    manyGen: 'торговых центров',
    manyPrep: 'торговых центрах',
    manyDat: 'торговым центрам',
    catalogTitle: 'Торговые центры Минска',
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
  },
};

/** Каталог по адресу страницы: всё под /minsk/tc — торговые центры. */
export function catalogKindOfPath(pathname: string): CatalogKind {
  return pathname === '/minsk/tc' || pathname.startsWith('/minsk/tc/') ? 'tc' : 'bc';
}

/** Каталог записи: у старых рядов и снимков колонки kind нет — это БЦ. */
export function kindOf(center: { kind?: CatalogKind | null }): CatalogKind {
  return center.kind === 'tc' ? 'tc' : 'bc';
}

const CatalogKindContext = createContext<CatalogKind>('bc');

export function CatalogKindProvider({ kind, children }: { kind: CatalogKind; children: ReactNode }) {
  return <CatalogKindContext.Provider value={kind}>{children}</CatalogKindContext.Provider>;
}

/** Словарь текущего каталога. Вне провайдера — каталог БЦ, как было всегда. */
export function useCatalogKind(): CatalogVocabulary {
  return CATALOG_VOCABULARY[useContext(CatalogKindContext)];
}

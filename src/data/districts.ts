// Районы Минска — куда владелец планирует расширять текстовые SEO-гиды и
// аналитику рынка (см. CLAUDE.md, урл-структура /minsk/...). Список
// открытый в том же духе, что и leadStatuses/objectStatuses: не жёсткий
// enum базы, а известные владельцу районы для навигации по разделам.
//
// guideSlugs/analyticsSlugs — district, для которого УЖЕ есть реальный
// контент (не просто пункт в списке). Пока это только Минск Мир: гид —
// готовая страница DistrictGuidePage, аналитика — работающая сводка по
// market_offers (таблица целиком собрана по Минск Миру, у остальных
// районов данных для сводки пока нет вообще — у market_offers нет даже
// колонки district, весь синк геопривязан к одному микрорайону). Остальные
// три района значатся в списке (владелец назвал их as будущие гиды), но
// без готового контента — показываются в хабах как "скоро", без ссылки, а
// не тонкой страницей-заглушкой.
export interface District {
  slug: string;
  name: string;
}

export const DISTRICTS: District[] = [
  { slug: 'minsk-mir', name: 'Минск Мир' },
  { slug: 'novaya-borovaya', name: 'Новая Боровая' },
  { slug: 'mayak-minska', name: 'Маяк Минска' },
  { slug: 'severny-bereg', name: 'Северный Берег' },
];

export const DISTRICTS_WITH_GUIDE = ['minsk-mir'];
export const DISTRICTS_WITH_ANALYTICS = ['minsk-mir'];

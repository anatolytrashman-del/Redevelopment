// Укрупнённые "корзины" бизнеса для location quotient (lib/locationQuotient.ts) —
// владелец: "того же ПВЗ хватит 1 на пару домов, а вот кофеен может быть
// несколько даже в одном доме" — сравнивать по абсолютному числу точек
// разные категории нельзя, у каждой свой "нормальный" уровень насыщения.
// LQ сам это учитывает (делит долю категории в квартале на её долю по
// району), но категория должна быть одна и та же по обе стороны дроби —
// а сырые категории Яндекс.Карт ("Массажный салон", "Косметология",
// "Подология"...) не совпадают с нашими 14 укрупнёнными категориями
// (data/districtPlaces.ts). Эти корзины — общий знаменатель для обеих
// сторон: и для DISTRICT_PLACE_CATEGORIES (район в целом, неполные данные
// по категориям), и для rawCategory из исчерпывающих поквартирных сборов
// (пока только квартал "Мировые танцы", см. категорию 'quarter-test-full').
export interface BusinessBucket {
  id: string;
  label: string;
}

export const BUSINESS_BUCKETS: BusinessBucket[] = [
  { id: 'beauty-health', label: 'Красота и здоровье' },
  { id: 'fitness', label: 'Спорт и фитнес' },
  { id: 'food', label: 'Общепит' },
  { id: 'retail', label: 'Розница и товары' },
  { id: 'pvz', label: 'Пункты выдачи' },
  { id: 'home-services', label: 'Услуги для дома и техники' },
  { id: 'education', label: 'Образование' },
  { id: 'real-estate-biz', label: 'Недвижимость и бизнес-услуги' },
  { id: 'banks', label: 'Банки' },
];

// Наши 14 категорий (data/districtPlaces.ts) -> корзина. Паркинги сюда
// сознательно не входят — это не "бизнес" в смысле конкуренции за клиента.
const CATEGORY_KEY_TO_BUCKET: Record<string, string> = {
  pharmacy: 'beauty-health',
  beauty: 'beauty-health',
  medicine: 'beauty-health',
  sport: 'fitness',
  food: 'food',
  grocery: 'retail',
  flower: 'retail',
  tobacco: 'retail',
  pvz: 'pvz',
  auto: 'home-services',
  school: 'education',
  kindergarten: 'education',
  bank: 'banks',
};

// Сырые категории Яндекс.Карт (из исчерпывающих поквартирных сборов) ->
// корзина. Ключ — нижний регистр, сравнение без учёта регистра/пробелов.
const RAW_CATEGORY_TO_BUCKET: Record<string, string> = {
  'массажный салон': 'beauty-health',
  'косметология': 'beauty-health',
  'подология': 'beauty-health',
  'салон красоты': 'beauty-health',
  'аптека': 'beauty-health',
  'стретчинг': 'fitness',
  'пилатес': 'fitness',
  'йога': 'fitness',
  'бассейн': 'fitness',
  'школа танцев': 'fitness',
  'кофейня': 'food',
  'мебель для кухни': 'retail',
  'матрасы': 'retail',
  'торговый центр': 'retail',
  'магазин продуктов': 'retail',
  'питомник растений': 'retail',
  'пункт выдачи': 'pvz',
  'ремонт велосипедов': 'home-services',
  'аренда строительной и спецтехники': 'home-services',
  'строительные и отделочные работы': 'home-services',
  'водомат': 'home-services',
  'общеобразовательная школа': 'education',
  'компьютерные курсы': 'education',
  'дополнительное образование': 'education',
  'агентство недвижимости': 'real-estate-biz',
};

export function bucketForCategoryKey(categoryKey: string): string | null {
  return CATEGORY_KEY_TO_BUCKET[categoryKey] ?? null;
}

export function bucketForRawCategory(rawCategory: string): string | null {
  return RAW_CATEGORY_TO_BUCKET[rawCategory.trim().toLowerCase()] ?? null;
}

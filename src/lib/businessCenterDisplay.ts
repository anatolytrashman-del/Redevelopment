import type { BusinessCenter } from '../data/businessCenters';

// Общие мелкие хелперы отображения БЦ — используются и на хабе
// (BusinessCentersMinskPage.tsx), и на отдельной странице конкретного БЦ
// (BusinessCenterDetailPage.tsx), поэтому вынесены в один файл, а не
// продублированы (см. docs/session-journal.md про подобные дубли — тут повода нет,
// страницы всегда монтируются вместе в рамках одного SPA-бандла).
// Владелец, увидев красные пилюли "Класс А" на карточках хаба: "убираем
// красный оттенок тут, не нравится, делай нейтральным" — A перестал быть
// 'primary' (красный/розовый в этой теме), остальные классы не трогал.
// Рейтинг с карт (Яндекс.Карты) — свободный текст в первом highlight с
// icon='rating' (пример: "- Яндекс.Карты: **4,8** из 5 (836 оценок...)"),
// структурного поля под него нет. Общий парсер — раньше жил только внутри
// BusinessCenterDetailPage.tsx (бейдж у заголовка), теперь нужен ещё и
// рейтингу /minsk/bcminsk/reyting, поэтому вынесен сюда как единственный
// источник разбора этой строки.
export function mapRatingFromHighlights(
  highlights: BusinessCenter['highlights'],
): { value: number; label: string; source: string } | null {
  const ratingHighlight = highlights.find((h) => h.icon === 'rating');
  if (!ratingHighlight) return null;
  // ** снимаем перед разбором — иначе "**4,8** из 5" не матчится по числу
  // сразу за "из 5" (между ними остаются сами звёздочки markdown-жирного).
  const line = ratingHighlight.text.split('\n')[0].replace(/\*/g, '');
  const valueMatch = line.match(/(\d+[.,]\d+)\s*из\s*5/);
  if (!valueMatch) return null;
  const sourceMatch = line.match(/^[-\s]*([^:]+):/);
  const label = valueMatch[1];
  return { value: parseFloat(label.replace(',', '.')), label, source: sourceMatch ? sourceMatch[1].trim() : 'карты' };
}

// То же поле 'rating', но для блока «Что говорят» (WhatTheySayBlock):
// mapRatingFromHighlights берёт только первую строку и первое число —
// для большинства БЦ этого достаточно, но у «Порта» (3 корпуса — 3 карточки
// Яндекс.Карт в ОДНОЙ строке через запятую) даёт "source" = целое
// вступительное предложение вместо "Яндекс.Карты" (owner нашёл это
// 2026-09-19, разбирая блок отзывов). Этот парсер проходит все строки
// и все вхождения "N,N из 5" на строке, а не только первое, и опознаёт
// источник по слову "Яндекс"/"2ГИС" в тексте, а не по тому, что стоит
// перед двоеточием. 2ГИС отсюда сознательно исключён — он уже приходит
// отдельным полем center.gisRating (структурный снимок, не свободный
// текст), показывать его ещё раз из текста фактов — задваивать источник.
export interface HighlightRatingEntry {
  source: string;
  value: string; // "4,5" — уже с русской запятой
  totalCount: number | null;
  corpusCount: number;
}

export function parseHighlightRatings(highlights: BusinessCenter['highlights']): HighlightRatingEntry[] {
  const ratingHighlight = highlights.find((h) => h.icon === 'rating');
  if (!ratingHighlight) return [];
  const entries: HighlightRatingEntry[] = [];
  for (const rawLine of ratingHighlight.text.split('\n')) {
    const line = rawLine.replace(/\*/g, '').replace(/^[-–—•\s]+/, '').trim();
    if (!line || /2[гГ][иИ][сС]/.test(line)) continue;
    const valueRe = /(\d[.,]\d)\s*из\s*5/g;
    const positions: { value: string; index: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = valueRe.exec(line))) positions.push({ value: m[1], index: m.index, end: valueRe.lastIndex });
    if (positions.length === 0) continue;
    const values = new Set(positions.map((p) => p.value));
    let totalCount = 0;
    let hasCount = false;
    positions.forEach((pos, i) => {
      const segment = line.slice(pos.end, positions[i + 1]?.index ?? line.length);
      const countMatch = segment.match(/(\d+)\s*оцен/);
      if (countMatch) {
        totalCount += Number(countMatch[1]);
        hasCount = true;
      }
    });
    const value =
      values.size === 1
        ? positions[0].value
        : (Math.round((positions.reduce((s, p) => s + parseFloat(p.value.replace(',', '.')), 0) / positions.length) * 10) / 10)
            .toFixed(1)
            .replace('.', ',');
    entries.push({ source: 'Яндекс.Карты', value, totalCount: hasCount ? totalCount : null, corpusCount: positions.length });
  }
  return entries;
}

// Цитаты из highlight icon='reviews' приходят построчно в формате
// "**Имя** (N★[, пометка]): «текст»" — так набирает владелец в админке.
// Звёзды и/или кавычки — не всегда: без «» это не прямая цитата, а
// пересказ отзыва своими словами ("жалуется на..."), выдавать его за
// цитату в кавычках было бы нечестно перед читателем.
export interface ParsedReviewQuote {
  author: string | null;
  stars: number | null;
  text: string;
  isQuote: boolean;
}

export function parseReviewQuote(raw: string): ParsedReviewQuote {
  const m = raw.match(/^\*\*([^*]+)\*\*\s*(?:\((\d)★[^)]*\))?\s*:\s*(.*)$/);
  if (!m) return { author: null, stars: null, text: raw, isQuote: false };
  const [, authorRaw, starsRaw, rest] = m;
  const quoteMatch = rest.match(/«([^»]+)»/);
  return {
    author: authorRaw.trim(),
    stars: starsRaw ? Number(starsRaw) : null,
    text: (quoteMatch ? quoteMatch[1] : rest).trim(),
    isQuote: quoteMatch != null,
  };
}

// Улица из адреса — чисто синтаксический разбор (не хранится отдельным
// полем в базе): всё до сегмента, начинающегося с цифры (номер дома),
// после удаления города/области/района — та же логика, что и в
// shortAddress. Используется и для группировки хабов по улицам (аудит
// поиска 2026-09-07), и для ссылки «все БЦ на этой улице» на карточке БЦ.
// На адресах без номера дома в принципе (напр. "просп. Мира, район «Минск
// Мир»" у МФЦ — участок ещё не имеет отдельного дома) — берёт всё, кроме
// последнего сегмента, тот же принцип, что и у shortAddress.
export function streetOfAddress(fullAddress: string): string {
  const short = shortAddress(fullAddress);
  const parts = short.split(',').map((p) => p.trim());
  const houseIndex = parts.findIndex((p) => /^\d/.test(p));
  if (houseIndex > 0) return parts.slice(0, houseIndex).join(', ');
  if (houseIndex === 0) return short;
  return parts.length > 1 ? parts.slice(0, -1).join(', ') : short;
}

export const businessClassTone: Record<NonNullable<BusinessCenter['businessClass']>, 'primary' | 'success' | 'neutral'> = {
  A: 'neutral',
  'B+': 'success',
  B: 'neutral',
  C: 'neutral',
};

// Короткое имя без "Бизнес-центр «...»" — для бокового меню, карточек хаба
// и заголовка отдельной страницы (владелец: "БЦ по алфавиту, но без
// «Бизнес-Центр», просто названия").
export function shortName(center: BusinessCenter): string {
  if (center.slug === 'mfc-minsk-mir') return 'МФЦ (Минск Мир)';
  const quoted = center.name.match(/«([^»]+)»/);
  if (quoted) return quoted[1];
  const paren = center.name.match(/\(([^)]+)\)/);
  if (paren) return paren[1];
  return center.name;
}

// Короткий адрес для карточки хаба — владелец: "без «г. Минск», без района,
// только конкретный адрес, улица и дом. Где непонятно, подскажу" (полный
// адрес — на отдельной странице БЦ, там сокращать не нужно). Чисто
// синтаксическая обрезка, без хардкода по конкретным БЦ: снимает ведущий
// "г. Минск, "/"Минская область, ", затем ведущий "<Название> район, " —
// сработало на всех 27 текущих адресах без единого неоднозначного случая
// (включая "Аден" — тот не в Минске вовсе, у него снимается "Минская
// область, Смолевичский район, ", остаётся "индустриальный парк «Великий
// камень», Пекинский проспект, 31"; и МФЦ — стройка без номера дома,
// остаётся "проспект Мира, район «Минск Мир»", это и есть весь адрес).
export function shortAddress(fullAddress: string): string {
  return fullAddress
    .replace(/^г\.\s*Минск,\s*/i, '')
    .replace(/^Минская\s+область,\s*/i, '')
    .replace(/^[А-ЯЁ][а-яё]+\s+район,\s*/, '')
    .trim();
}

// Короткая строка метро для карточки хаба — владелец: "метро сокращаем до
// станции метро ближайшей, всё остальное внутри карточки" (полное значение
// с расстоянием/временем пешком/на транспорте остаётся на отдельной
// странице БЦ). Чисто синтаксическая обрезка, без хардкода по конкретным
// БЦ — берёт текст до первой запятой (там, где сама станция обычно и
// заканчивается: "Уручье, ~4 мин пешком" → "Уручье"), затем снимает
// хвост-уточнение в скобках, если он остался без запятой перед собой
// ("«Академия наук» (рядом)" → "«Академия наук»"). Сработало на всех 23
// текущих непустых значениях metro, кроме одного явно перечисляющего две
// станции без ведущей запятой ("рядом со станциями «А» и «Б»") — для него
// отдельная ветка берёт первую станцию в кавычках (владелец просил именно
// "ближайшую", а не обе).
export function shortMetro(metro: string): string {
  const beforeComma = metro.split(',')[0].trim();
  const cleaned = beforeComma.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/рядом со станциями/i.test(cleaned)) {
    const match = cleaned.match(/«([^»]+)»/);
    if (match) return `«${match[1]}»`;
  }
  return cleaned;
}

// Порядок для навигации "следующий/предыдущий БЦ" на отдельной странице —
// тот же алфавит по короткому имени, что и в боковом меню хаба, чтобы
// стрелки совпадали с порядком, который пользователь уже видел в списке.
// PAGESPEED_PLAN.md, Э9 (каталог БЦ) — фото БЦ в базе хранятся путями к
// закоммиченным JPEG (`/images/business-centers/<slug>.jpg`, 500–1600px,
// в среднем 150 КиБ, до 330 КиБ), а показываются в карточке каталога
// шириной ~380px и на странице БЦ ~700px. Рядом с каждым JPEG в репозитории
// лежат два WebP: `<slug>.webp` (до 1200px, страница БЦ) и `<slug>-card.webp`
// (до 640px, карточка каталога) — см. журнал плана, как их пересобрать.
// JPEG остаётся для og:image (соцсети/мессенджеры не все понимают WebP в
// превью) и как источник. Пути НЕ из этой папки (например, загруженные
// через админку в Supabase Storage) возвращаются как есть.
const LOCAL_BC_PHOTO_RE = /^\/images\/business-centers\/([^/]+)\.jpe?g$/i;

export function businessCenterPhotoSrc(path: string, variant: 'card' | 'detail'): string {
  const m = path.match(LOCAL_BC_PHOTO_RE);
  if (!m) return path;
  return `/images/business-centers/${m[1]}${variant === 'card' ? '-card' : ''}.webp`;
}

// В базе встречаются как главные страницы БЦ, так и вложенные страницы
// конкретного корпуса у застройщика. Такие вложенные URL устаревают чаще
// всего, поэтому публичная карточка всегда ведёт на проверяемую главную
// страницу того же сайта. Поддерживаем и адреса без протокола из админки;
// всё кроме http(s) не превращаем в ссылку.
// Результат ручной проверки всех 55 уникальных доменов каталога
// 2026-09-17. null скрывает заведомо нерабочую ссылку; строки исправляют
// протокол/поддомен там, где сохранённый HTTPS даёт ошибку сертификата, а
// каноническая главная открывается. Это не заменяет данные БЦ, а лишь не
// отправляет посетителя на уже проверенную ошибку.
const BUSINESS_CENTER_WEBSITE_OVERRIDES: Record<string, string | null> = {
  'impersky.by': null,
  'kiroff.by': null,
  'sit.by': null,
  'svplaza.by': null,
  'teamb.by': null,
  'www.bc.by': null,
  'krasavikbc.by': 'http://krasavikbc.by/',
  'www.strateg.by': 'https://strateg.by/',
  'xn--80ajibqcvj.xn--90ais': 'http://xn--80ajibqcvj.xn--90ais/',
};

export function businessCenterHomepageUrl(website: string | null): string | null {
  const trimmed = website?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.host in BUSINESS_CENTER_WEBSITE_OVERRIDES) {
      return BUSINESS_CENTER_WEBSITE_OVERRIDES[url.host];
    }
    return `${url.protocol}//${url.host}/`;
  } catch {
    return null;
  }
}

export function sortByShortName(centers: BusinessCenter[]): BusinessCenter[] {
  return [...centers].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru'));
}

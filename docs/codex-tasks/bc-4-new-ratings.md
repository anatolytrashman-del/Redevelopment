# 4 новые страницы рейтингов БЦ

## Контекст

У нас уже есть `src/pages/BusinessCentersRankingPage.tsx` (`/minsk/bcminsk/rating`) —
«Лучшие бизнес-центры Минска»: класс A, рейтинг Яндекс.Карт от 4,5, не менее 50 оценок
здания. Владелец утвердил ещё 4 страницы того же семейства. Прочитай
`BusinessCentersRankingPage.tsx` целиком ПЕРЕД началом работы — это эталон по стилю
кода, вёрстке, JSON-LD, FAQ и дисклеймеру, все новые страницы должны быть узнаваемо
той же серией, не отдельным дизайном.

Все данные уже приходят на фронт целиком (`fetchBusinessCenters()`,
`fetchLatestMarketSnapshots('ofisy_bc')`) — секретов, миграций и живой базы это
задание не касается, это чистый read-only фронт.

## Шаг 1 — вынести общее в `src/lib/businessCenterRanking.ts`

Сейчас в `BusinessCentersRankingPage.tsx` захардкожен класс `'A'` в нескольких местах.
Новым 4 страницам нужна ровно та же логика, но с другим набором классов/сортировкой.
Вынеси в новый файл `src/lib/businessCenterRanking.ts` (переносишь код 1:1, не
переписывая логику):

- константы `RATING_THRESHOLD = 4.5`, `RATING_THRESHOLD_LABEL = '4,5'`,
  `MIN_RATING_COUNT = 50`;
- `isOutsideMinsk(center)` — сейчас приватная функция в странице, регэксп не трогать;
- `ratingsWord(n)`, `ratingsCount(n)`, `money(value)` — форматирование, без изменений;
- тип `RankedCenter` (`{ center, rating, ratingLabel, ratingCount }`) и
  `ExcludedCenter` (`{ center, reason }`);
- **новую** обобщённую функцию (её сейчас нет, `buildRanking` в странице жёстко
  фильтрует `businessClass === 'A'` — обобщи, не дублируя тело):
  ```ts
  export function buildRankingForClasses(
    centers: BusinessCenter[],
    classes: NonNullable<BusinessCenter['businessClass']>[],
    threshold: number = RATING_THRESHOLD,
    minCount: number = MIN_RATING_COUNT,
  ): RankedCenter[]
  ```
  Условие «сдано» (`status !== 'under_construction'`) и «в черте Минска»
  (`!isOutsideMinsk`) остаются обязательными всегда, класс проверяется через
  `classes.includes(c.businessClass)`. Сортировка — как в оригинале: по рейтингу
  убыв., при равенстве — по числу оценок убыв.
- аналогично `buildExcludedForClasses(centers, classes, threshold, minCount): ExcludedCenter[]`
  (обобщение текущего `buildExcluded`, тот же порядок причин: не в черте Минска →
  рейтинг не распознан → рейтинг ниже порога → число оценок не указано → число оценок
  ниже порога);
- перенеси также `rentLabel(snapshot)` (сейчас в странице — читает `MIN_RELIABLE_N`
  из `data/marketSnapshots`, форматирует «Аренда · N объявл.» / «Аренда · ориент., N
  объявл.») — она нужна как минимум двум новым страницам.

После переноса поправь `BusinessCentersRankingPage.tsx`: импортируй всё это из нового
файла вместо локальных определений. Её собственные `export function buildRanking(centers)`
и `export function buildExcluded(centers)` **должны остаться экспортированы с той же
сигнатурой** (их с алиасом `buildBusinessCenterRanking` импортирует
`BusinessCenterDetailPage.tsx:130` — это должно продолжать работать без изменений
в `BusinessCenterDetailPage.tsx`), но внутри пусть зовут новые обобщённые функции:
```ts
export function buildRanking(centers: BusinessCenter[]): RankedCenter[] {
  return buildRankingForClasses(centers, ['A']);
}
export function buildExcluded(centers: BusinessCenter[]): ExcludedCenter[] {
  return buildExcludedForClasses(centers, ['A']);
}
```
Поведение страницы `/minsk/bcminsk/rating` не должно измениться ни на бит — это
рефакторинг, не переделка.

Добавь `src/lib/businessCenterRanking.test.ts` (по образцу соседних `*.test.ts` в
`src/lib/`, vitest) — тесты на `buildRankingForClasses`/`buildExcludedForClasses`
на синтетических данных (fixture-массив из 4-6 `BusinessCenter` разных классов):
фильтрация по нескольким классам сразу, отсев `under_construction`, отсев вне
Минска, сортировка при равном рейтинге по числу оценок.

## Шаг 2 — общая «строка» рейтинга: `src/components/businessCenters/RankingRow.tsx`

В `BusinessCentersRankingPage.tsx` есть компоненты `Cell` и `RankingRow` (строка
списка: кружок с местом, фото, название/адрес/год, сетка ячеек, стрелка-ссылка).
Вынеси их в `src/components/businessCenters/RankingRow.tsx`, но обобщи так, чтобы
новым страницам не нужно было копировать вёрстку строки — набор ячеек должен быть
параметром, а не хардкодом «рейтинг + аренда + площадь + метро»:

```tsx
export function Cell({ label, children }: { label: string; children: React.ReactNode }) { ... }

export function RankingRow({
  center,
  place,
  cells, // ReactNode — уже готовые <Cell>...</Cell>, page решает, какие и в каком порядке
}: {
  center: BusinessCenter;
  place: number;
  cells: React.ReactNode;
}) { ... }
```

Сохрани один в один текущую вёрстку и классы (кружок места — `bg-primary text-white`
для мест 1-3, `bg-surface-muted text-ink` для остальных; фото `PhotoBlock` вариант
`card`; сетка `grid-cols-2 gap-x-4 gap-y-2.5`; стрелка `ArrowRight`). Обнови
`BusinessCentersRankingPage.tsx`, чтобы его `RankingRow` (там сейчас берёт
`ranked: RankedCenter` и `rent`) собирал `cells` из `<Cell>` и передавал их в общий
компонент — визуально страница не должна измениться.

## Шаг 3 — четыре новые страницы

Общее для всех четырёх (копируй структуру и порядок блоков `BusinessCentersRankingPage.tsx`,
меняя только содержимое):

- хлебные крошки `Минск / Бизнес-центры / <название>`;
- главный блок: иконка + `h1` + список условий методики (в той же карточке, без
  вложенной рамки — как в эталоне);
- список результатов (`RankingRow` с нужными `cells`);
- блок с картой (`CatalogMap`, монтируется по клику — 1:1 как в эталоне);
- `FaqAccordion` — ОБЯЗАТЕЛЬНО описывает вопросами-ответами всё, что есть на
  странице (правило `CLAUDE.md`: «FAQ описывает всё, что есть на странице, вопросов
  для галочки быть не должно, нет данных — нет вопроса»), тексты собираются из
  реальных вычисленных данных (`useMemo`), а не захардкожены — см. как это сделано в
  эталоне (`leader`, `byCount`, `withRent`, `withYear` и т.п.);
- блок «Ещё по бизнес-центрам Минска» — ссылки на: полный каталог `/minsk/bcminsk`,
  главный рейтинг `/minsk/bcminsk/rating`, и на ТРИ других страницы из этой же серии
  (взаимные перелинковки между всеми 4 новыми + основной страницей рейтинга — каждая
  страница ссылается на все остальные 4);
- последний блок — «Источники», `<SourcesTrademarkNote />`, как в эталоне;
- `setGenericPageMeta`/`setArticleJsonLd`/`setBreadcrumbJsonLd`/`setItemListJsonLd`/
  `setFaqJsonLd` — как в эталоне, свои `TITLE`/`DESCRIPTION`/`PAGE_URL`/`PAGE_H1` на
  каждую страницу;
- `<CatalogTopNav centers={centers} width="max-w-3xl" />` вверху, как в эталоне.

`DATE_PUBLISHED` для всех четырёх — сегодняшняя дата сборки (найди в git log дату
последнего коммита, чтобы не гадать, или возьми дату этого ТЗ), `dateModified` — как
в эталоне, `new Date().toISOString().slice(0, 10)`.

Классовая методика (`как определяется класс`) везде ссылается на тот же якорь, что
и в эталоне: `/minsk/bcminsk/gid#klassy`.

---

### 3.1 Самые большие бизнес-центры Минска

- Файл `src/pages/BusinessCentersBiggestPage.tsx`, роут
  `/minsk/bcminsk/rating/samye-bolshie`.
- **Методика:** ВСЕ классы (A/B+/B/C), сдано, в черте Минска (те же два условия, что
  и везде — `status !== 'under_construction'`, `!isOutsideMinsk`), у здания заполнена
  общая площадь (`totalArea != null`). Сортировка — по убыванию `totalArea`. Показать
  **топ-20**.
- В `cells` у каждой строки: класс (`Класс A/B+/B/C`), «Площадь» = `totalArea` (м²), и
  если `officeArea != null` — вторая ячейка «Из них офисов» = `officeArea` (м²); плюс
  год постройки и метро, как в остальных строках. Рейтинг НЕ обязателен как ячейка
  (это не рейтинговая методика по оценкам), но если у здания есть распознанный
  рейтинг — можно показать его отдельной необязательной ячейкой (мелким текстом), не
  обязательно.
- H1: «Самые большие бизнес-центры Минска». Заголовок таба/description упомянуть
  «топ-20 по площади».
- FAQ обязателен по методике (площадь считается по общей площади здания, а не
  офисной — почему; сколько всего зданий с известной площадью против показанных 20;
  лидер списка и его площадь; чем общая площадь отличается от офисной, если у лидера
  они сильно разные — используй реальные числа лидера в тексте, не выдумывай).
- Не хардкодь числа «20 из 130» — считай из фактического массива на каждой сборке.

### 3.2 Рейтинг бизнес-центров класса B+

- Файл `src/pages/BusinessCentersRankingBPlusPage.tsx`, роут
  `/minsk/bcminsk/rating/b-plus`.
- **Методика:** ровно та же, что у класса A (`buildRankingForClasses(centers, ['B+'])`,
  порог 4,5 / 50 оценок из `businessCenterRanking.ts`). Список полный (не топ-N — как
  в эталоне для класса A показываются ВСЕ прошедшие порог, их обычно не десятки).
- Ячейки строки — как в эталоне (рейтинг + число оценок, аренда если есть снимок,
  площадь, метро).
- H1: «Лучшие бизнес-центры класса B+ в Минске».
- FAQ — по образцу эталона (методика; лидер; сколько попало из скольких всего класса
  B+; почему нет класса A/B/C — с явной ссылкой на страницы `/minsk/bcminsk/rating` и
  на страницу 3.3 «класса B и C»; как часто обновляется).

### 3.3 Рейтинг бизнес-центров классов B и C

- Файл `src/pages/BusinessCentersRankingBCPage.tsx`, роут `/minsk/bcminsk/rating/b-c`.
- **Методика:** та же (4,5 / 50), но выводится ДВУМЯ отдельными списками на одной
  странице — сперва класс B (`buildRankingForClasses(centers, ['B'])`), потом класс C
  (`buildRankingForClasses(centers, ['C'])`), каждый под своим `h2` («Класс B» /
  «Класс C») и со своей нумерацией мест (1, 2, 3... в каждом списке заново, не
  сквозной). Обе секции используют одну и ту же `RankingRow`.
- Если один из списков пуст (в текущих данных такого нет, но пиши код без
  предположений) — секция с пустым списком просто не рендерится, без «нет данных».
- H1: «Лучшие бизнес-центры классов B и C в Минске».
- FAQ — по методике объясни, почему B и C — на одной странице (это более бюджетный
  сегмент, объединили ради охвата, а не потому что B и C одно и то же — так и
  написать), плюс по каждому классу: лидер и сколько попало из скольких всего.

### 3.4 Самые доступные бизнес-центры с рейтингом от 4,5

- Файл `src/pages/BusinessCentersAffordablePage.tsx`, роут
  `/minsk/bcminsk/rating/samye-dostupnye`.
- **Методика:** ВСЕ классы. Условия: сдано, в черте Минска, рейтинг Яндекс.Карт от
  4,5 и не менее 50 оценок (те же константы `RATING_THRESHOLD`/`MIN_RATING_COUNT` из
  `businessCenterRanking.ts` — используй `buildRankingForClasses(centers, ['A','B+','B','C'])`),
  И у здания есть медианная ставка аренды по объявлениям
  (`fetchLatestMarketSnapshots('ofisy_bc')`, `buildOfferIndex`, `rentBySlug`). Список —
  ВСЕ прошедшие оба условия, сортировка по возрастанию медианной ставки (самые
  дешёвые — первые). Место (кружок с номером) — по этому порядку.
- Ячейки строки: класс, рейтинг (со счётчиком оценок), ставка аренды (через
  `rentLabel` — сохраняет пометку «ориентировочно» при малой выборке, как в эталоне),
  площадь, метро.
- H1: «Самые доступные бизнес-центры Минска с рейтингом от 4,5».
- FAQ — методика (почему два условия сразу: и рейтинг, и цена — чтобы не попадали
  дешёвые, но плохо оцененные здания); самый дешёвый и самый дорогой в списке (с
  реальными цифрами); оговорка про «ориентировочно» у зданий с малым числом
  объявлений (используй `MIN_RELIABLE_N` для условия, покажи её только если в списке
  реально есть такие здания); сколько всего зданий в списке.

## Шаг 4 — роуты, ссылки, sitemap, пререндер

1. `src/App.tsx` — добавь 4 роута рядом с существующим
   `<Route path="/minsk/bcminsk/rating" element={<BusinessCentersRankingPage />} />`
   (строка ~269), ДО `<Route path="/minsk/bcminsk/:slug" .../>`:
   ```
   /minsk/bcminsk/rating/samye-bolshie   → BusinessCentersBiggestPage
   /minsk/bcminsk/rating/b-plus          → BusinessCentersRankingBPlusPage
   /minsk/bcminsk/rating/b-c             → BusinessCentersRankingBCPage
   /minsk/bcminsk/rating/samye-dostupnye → BusinessCentersAffordablePage
   ```
2. В `BusinessCentersRankingPage.tsx` замени блок «Рейтинги по остальным классам»
   (сейчас две карточки-ссылки на `classHubUrl('B+')`/`classHubUrl('B')`, с текстом
   «их списки соберём отдельными страницами» — это обещание, страницы теперь есть):
   - карточка B+ — ссылка на `/minsk/bcminsk/rating/b-plus` вместо `classHubUrl('B+')`,
     число `bPlusCount` остаётся (используй уже существующий подсчёт через
     `buildRankingForClasses(centers, ['B+'])`);
   - вторая карточка — теперь про классы B и C вместе, ссылка на
     `/minsk/bcminsk/rating/b-c`, число = сумма прошедших по классу B и по классу C
     (`buildRankingForClasses(centers, ['B']).length + buildRankingForClasses(centers, ['C']).length`),
     подпись «БЦ классов B и C с рейтингом от 4,5»;
   - убери из текста параграфа фразу «их списки соберём отдельными страницами» — она
     была про будущее время, страницы уже есть, переформулируй в настоящем времени.
   - в блок «Ещё по бизнес-центрам Минска» внизу эталонной страницы добавь ссылки на
     «Самые большие бизнес-центры Минска» и «Самые доступные бизнес-центры Минска» (обе
     новые страницы, которых там ещё нет).
3. `public/sitemap.xml` — сразу после существующей записи
   `<loc>https://redevelopment.pro/minsk/bcminsk/rating</loc>` (около строки 136)
   добавь 4 новые записи `<url>` в ТОМ ЖЕ формате (`<lastmod>`, `<changefreq>`,
   `<priority>` — скопируй значения из соседней записи `rating`), с URL
   `.../rating/samye-bolshie`, `.../rating/b-plus`, `.../rating/b-c`,
   `.../rating/samye-dostupnye`.
4. `scripts/prerender.mjs` — в массиве `STATIC_PATHS` (около строки 214) сразу после
   `'minsk/bcminsk/rating',` добавь:
   ```js
   'minsk/bcminsk/rating/samye-bolshie',
   'minsk/bcminsk/rating/b-plus',
   'minsk/bcminsk/rating/b-c',
   'minsk/bcminsk/rating/samye-dostupnye',
   ```

## Чего не делать

- не трогать таблицы Supabase, миграции, серверные `api/*.js` — задание чисто
  фронтовое, все данные уже приходят клиенту существующими функциями;
- не хардкодить числа (сколько зданий попало, кто лидер, какая цена) — весь текст
  FAQ и заголовков собирается из реально загруженных данных на каждой сборке;
- не переписывать `BusinessCenterDetailPage.tsx` — его импорт `buildRanking`/
  `buildExcluded` из `BusinessCentersRankingPage.tsx` должен продолжать работать без
  изменений в нём самом;
- не трогать `docs/session-journal.md` — запись в журнал делает Claude при приёмке;
- `npm run build` не запускать (уходит в 20-минутный пререндер) — только
  `npm run build:app`.

## Проверка перед сдачей

```bash
npm run build:app   # tsc -b + vite build + генераторы, чисто
npm test            # vitest, если есть время — не обязателен, но лучше прогнать businessCenterRanking.test.ts
```

Когда закончишь — перечисли все изменённые и новые файлы и коротко, что в каждом
сделано. Если какой-то пункт не удалось выполнить — прямо скажи, что и почему.

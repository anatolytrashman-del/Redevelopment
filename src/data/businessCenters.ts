// Бизнес-центры Минска — данные для публичной справочной страницы
// /minsk/bc. Изначально (2026-09-04) список жил статическим массивом
// прямо в этом файле — владелец попросил завести админку ("Аналитика рынка"
// → вкладка "Бизнес-центры"), поэтому данные переехали в Supabase
// (таблица `business_centers`, RLS: anon select, authenticated — полный
// CRUD, тот же паттерн, что у `objects`). Публичная страница
// (BusinessCentersMinskPage.tsx) и админка (BusinessCentersAdminTab.tsx)
// читают/пишут через lib/businessCentersApi.ts.
//
import type { CatalogKind } from '../lib/catalogKind';
import type { DocumentFile } from './contractorDocuments';

// district=null — "не указано": не выдумывать значение, честно показывать
// как есть, дозаполнять со временем в админке. businessClass у всех 143 БЦ
// каталога заполнен (последний пробел, «Аден», закрыт 2026-09-20 — см.
// journal), но остаётся nullable в типе на случай новой карточки до того,
// как класс определён.
export interface BusinessCenter {
  id: string;
  slug: string;
  name: string;
  // Другие названия ТОГО ЖЕ здания, под которыми его ищут. Завелось из-за
  // БЦ «V» на пр-те Победителей, 59: комплекс «Виктория» управляется КУП
  // «Бизнес-центр "Столица"», и по Wordstat «бизнес центр столица минск»
  // (23 + 9 запросов в месяц) — вторая по частоте позиция во всём топе
  // «бизнес центр минск», а слова «Столица» на странице не было вовсе.
  // Заводить вторую запись нельзя: один адрес, одно здание, дубль карточки.
  altNames: string[];
  address: string;
  // Административный район Минска (Центральный/Советский/Первомайский/...)
  // — открытый список, растёт из AddableSelect в форме. "За городом" — для
  // объектов физически вне Минска (см. "Аден").
  district: string | null;
  // Неформальный минский микрорайон ("Уручье", "Малиновка", ...) — не то же
  // самое, что административный `district` ("Первомайский район"): люди
  // ищут "БЦ Уручье", не "БЦ Первомайский район". Заполняется НЕ вручную —
  // point-in-polygon матчинг координаты (2GIS) против границ в таблице
  // `minsk_microdistricts` (тоже из 2GIS, см. journal 2026-09-07). Пусто —
  // либо координаты нет, либо здание не попало ни в одну из известных
  // границ (в основном это центр города/проспекты — там 2GIS не выделяет
  // "спальные" микрорайоны вовсе, не пробел матчинга).
  microdistrict: string | null;
  businessClass: 'A' | 'B+' | 'B' | 'C' | null;
  totalArea: number | null;
  // Для status='under_construction' — ожидаемый год сдачи, не факт постройки
  // (см. BusinessCentersMinskPage.tsx — подпись меняется в зависимости от status).
  yearBuilt: number | null;
  floors: number | null;
  developer: string | null;
  // Развёрнутая карточка застройщика (логотип, описание, контакты, сайт) —
  // владелец, 2026-09-20: "у половины БЦ застройщики нормальные, с сайтами
  // и тд... сделал бы такой блок на страницах, где возможно", по образцу
  // карточки "Застройщик района" на гиде по Минск Миру
  // (DistrictGuidePage.tsx). В отличие от того гида (захардкожен под один
  // район), тут это данные конкретного БЦ — null, пока карточку не
  // заполнили в админке; тогда `developer` (короткая строка выше, живёт в
  // FAQ и старом месте на карточке) остаётся, а этот блок показывается
  // ДОПОЛНИТЕЛЬНО, отдельной секцией сразу под главным блоком. Разложено по
  // отдельным полям (не markdown-простыня), как RentalInfo ниже — на
  // публичной странице каждое поле рендерится своей строкой со своей
  // иконкой, независимо null, если по нему нечего показать.
  developerInfo: DeveloperInfo | null;
  metro: string | null;
  parking: string | null;
  website: string | null;
  description: string | null;
  // Условия для арендаторов, найденные на официальном сайте БЦ (владелец,
  // 2026-09-05: "по нему нет объявлений на куфаре и realt, но у них на
  // сайте есть информация для арендаторов... пройдись по сайтам БЦ") —
  // собрано веб-поиском по офиц. сайту БЦ (Gemini через ProxyAPI — прямого
  // доступа к большинству таких сайтов из песочницы нет). Разбито на
  // логические разделы (не единый текст-простыня — первая версия была
  // нечитаемой "стеной текста", владелец: "верстка — пиздец, разбей на
  // логические блоки"), каждое поле независимо null, если по этому пункту
  // ничего не нашлось. null у всего объекта — сайта нет, недоступен был
  // при проверке, или на нём вообще нет такой информации (не выдумываем).
  rentalInfo: RentalInfo | null;
  // "Интересные факты" — история объекта, известные арендаторы, награды,
  // рейтинг/отзывы с карт и вообще всё любопытное, что нашлось (владелец,
  // 2026-09-06: "давай подтянем рейтинг из Яндекс.Карт, отзывы, другую
  // инфу про БЦ... чтобы страница была даже понятнее, чем официальный
  // сайт"). Дальше, 2026-09-06 (второй заход, ресерч по всем остальным
  // БЦ): "старайся делать кастомную страницу под каждый БЦ. Если у БЦ нет
  // наград, не делай этот блок вообще. А если есть что-то новое — сделай
  // кастомный новый блок" — набор разделов ПРИНЦИПИАЛЬНО РАЗНЫЙ у разных
  // БЦ, не фиксированная пятёрка полей (было так на "Проспекте" — первом
  // пилоте, ещё до этого требования). Массив вместо объекта с фиксированными
  // ключами — пустой/отсутствующий раздел просто не добавляется в массив,
  // а не хранится как null-поле; появляется что-то нетиповое (скандал,
  // архитектурная деталь, экологичность и т.п.) — просто новый элемент
  // массива с любой подписью и подходящей иконкой из HighlightIconKey.
  // Факты собраны веб-поиском (Gemini+google_search), значимые/удивительные
  // перепроверены отдельным независимым поиском перед публикацией — первая
  // попытка на "Проспекте" дала правдоподобные, но неподтверждённые детали,
  // не взяли на веру с одного ответа модели. Рейтинг/отзывы — сознательно
  // НЕ автоматизировано: прямой доступ к Яндекс.Картам из песочницы
  // заблокирован, а "заземлённый" поиск, честно признавшись "не могу
  // открыть страницу", всё равно выдал правдоподобные цитаты отзывов с
  // именами и датами — то есть выдумал. Рейтинг/отзывы либо не добавляются
  // вовсе, либо приходят из .webarchive, который владелец сохраняет сам
  // (см. BusinessCenter.mapSnapshotFiles) и прикладывает через админку.
  //
  // Перед добавлением факта — проверить, что его не показывает уже другой
  // блок страницы (владелец, 2026-09-21: "добрая половина фактов — дубль
  // другой инфы со страницы"). На практике живут два повторяющихся паттерна:
  // (1) icon:'tenants' почти всегда дублирует "Каталог арендаторов"
  // (TenantDirectory, из Яндекс.Карт/2GIS) — на 2026-09-21 у 82 из 83 БЦ,
  // где такой факт есть, каталог уже заполнен, страница его прячет сама
  // (BusinessCenterDetailPage.tsx, visibleHighlights); (2) конкретное
  // название ближайшей станции метро с шаговой оценкой ("в N минутах
  // пешком от метро Х") — оно и так в шапке страницы (nearestMetroStations/
  // center.metro). Расстояние/количество (площадь, число машиномест,
  // этажность, конкретные арендаторы-якоря вроде банка/ресторана) обычно
  // НЕ дублируется — этих цифр либо нет в других полях вовсе, либо там
  // хранится только производная (напр. коэффициент маш./100м², не абсолютное
  // число мест), так что такие факты добавлять можно.
  highlights: HighlightSection[];
  // Сырые файлы для БУДУЩЕГО ресерча — владелец, 2026-09-06: "сделаешь в
  // интерфейсе редактирования БЦ возможность загрузить файл из Яндекс.Карт,
  // чтобы ты в следующей задаче ресерча уже брал эту инфу". Не парсится на
  // лету в браузере (.webarchive — бинарный Apple-формат, .html/.mhtml тоже
  // не то, что стоит разбирать в React) — просто хранится рядом с БЦ,
  // следующая сессия скачивает файл и разбирает вручную (пример разбора —
  // в журнале docs/session-journal.md, 2026-09-06: plistlib+BeautifulSoup для .webarchive).
  mapSnapshotFiles: DocumentFile[];
  // Публикации в СМИ о здании — отдельный блок, а не строка в highlights
  // (владелец, 2026-09-20). Раньше пресса описывалась текстом вида «об этом
  // писали Forbes и Habr» внутри «Интересных фактов»: без ссылок, без дат и
  // без возможности отличить статью О здании от статьи, где здание названо
  // одной строкой. Пустой массив — блок не рисуется.
  mediaMentions: MediaMention[];
  // Организации внутри здания — владелец, 2026-09-06 (второй заход): "давай
  // сделаем ещё блок арендаторов внутри БЦ... сгруппировать, на первое
  // место ставь места с максимумом отзывов на картах". Источник — тот же
  // веб-архив Яндекс.Карт (карточка "Организации внутри", раздел
  // `.card-places-inside-view`), что уже используется для рейтинга/отзывов
  // самого здания. ВАЖНО: у этого раздела на самой странице Яндекс.Карт нет
  // числа отзывов/рейтинга на каждую отдельную организацию — карусель отдаёт
  // только название и категорию (aria-label). Реальное "по числу отзывов"
  // потребовало бы отдельного веб-архива на КАЖДУЮ организацию — нереалистично
  // при 9-10+ арендаторах на объект. Поэтому сортировка на публичной странице
  // — по размеру группы (категории с большим числом организаций первыми) как
  // ближайший доступный из реальных данных прокси, не выдуманные цифры
  // отзывов на конкретную организацию.
  tenantOrganizations: TenantOrganization[];
  // Число организаций отдельным полем — колонка tenant_count в базе
  // (generated always, миграция 20260922-bc-tenant-count.sql). Нужна там,
  // где на выборку по всем зданиям хватает числа: публичные списки не
  // забирают сам tenant_organizations (266 КБ сжатых из 969 КБ всей
  // таблицы), и tenantOrganizations у них приходит пустым — сравнивать
  // здания по числу арендаторов можно только через это поле.
  tenantCount: number;
  // Структурные технические характеристики — прямой парсинг блоков
  // .bccharacteristics с карточки здания на prometr.by (2026-09-06, владелец:
  // "выведи на страницу вообще все данные, которые ты смог спарсить"). Один
  // элемент массива = один физический корпус со своей страницей на
  // prometr.by; у большинства БЦ корпус ровно один (corpusLabel: null), у
  // уже смерженных в нашей базе многокорпусных комплексов (Riviera Plaza,
  // Парк Плаза) — несколько, каждый со своей подписью и ссылкой на
  // первоисточник. Значения — как есть у источника, включая случаи, где они
  // расходятся с нашими собственными полями (totalArea и т.п., см. журнал
  // docs/session-journal.md от 2026-09-06 — не сглаживаем, честно показываем с атрибуцией
  // "по данным prometr.by"). Пусто — либо БЦ не найден на prometr.by (Аден,
  // МФЦ — ещё стройка), либо адрес не удалось надёжно сопоставить (риск
  // приписать чужие характеристики зданию — оставили пустым, не гадаем).
  technicalParams: TechnicalParamGroup[];
  // Техфакты о здании из источников, ОТЛИЧНЫХ от prometr.by — Kufar, Realt.by,
  // офиц. сайты УК/застройщика, независимая пресса и т.п. Владелец,
  // 2026-09-20: prometr.by — единственный источник почти всего блока
  // «Информация о здании», хочет разбавить его копилкой из разных мест
  // ("сделай единую базу данных о здании, а мы в неё соберём инфу из разных
  // источников"), в том числе чтобы не выглядело как копирование одного
  // сайта. В отличие от technicalParams (одна карточка = один источник,
  // группами по корпусу) — здесь плоский список ОТДЕЛЬНЫХ фактов, у
  // КАЖДОГО свой источник и ссылка, факты из разных мест не смешиваются под
  // одну общую атрибуцию. Пилот — «Centropol» (2026-09-20), дальше копится
  // по остальным БЦ по мере ресёрча. Правится вручную (сессией/ресёрчем),
  // формы в админке под это нет — тот же паттерн, что у technicalParams.
  buildingFacts: BuildingFact[];
  // Ближайшие станции метро — владелец подключает 2GIS API в параллельной
  // ветке (2026-09-06), формат ответа (`nearest_stations`) уже согласован
  // как основа для этого поля (см. журнал docs/session-journal.md). Массив, не одна
  // станция — 2GIS отдаёт несколько, для отображения обычно нужна только
  // ближайшая по distanceMeters (сортируется на месте, не хранится
  // предварительно отсортированным — источник может прислать в любом
  // порядке). distanceMeters — расстояние по прямой (не время пешком и не
  // по дорожной сети), это НЕ заменяет свободный текст `metro` — тот может
  // содержать реально пройденный маршрут из веб-архивов Яндекс.Карт (см.
  // BusinessCenter.metro), более ценный, чем метры по прямой. Оба поля
  // независимы, на карточке показываются оба, если оба заполнены.
  nearestMetroStations: NearestMetroStation[];
  // Вердикт «кому подходит» и плюсы/минусы (Б2). В отличие от всего
  // блока производных колонок ниже, ЭТИ поля редактируемые: авточерновик
  // считается из порогов (lib/businessCenterVerdict.ts) и предлагается в
  // админке, а verdictEdited=true означает «правлено руками, генерацией не
  // перетирать».
  verdict: string | null;
  pros: string[];
  cons: string[];
  verdictEdited: boolean;
  // Галочка в списке БЦ в админке (владелец, 2026-09-21) — "это здание
  // разобрано, Светлане на него больше не нужно заходить": либо отзывы
  // реально собраны (handleSubmit в BusinessCentersAdminTab.tsx ставит
  // автоматически, как только импорт отзывов из веб-архива прошёл
  // успешно), либо это осознанное "неприменимо" для конкретного здания
  // (напр. «Аден» — по факту гостиница, не классический БЦ, отзывов с
  // Яндекс.Карт по нему не будет никогда) — тогда ставится вручную.
  reviewsChecked: boolean;

  // --- Производные колонки (Д1/Д2 плана docs/bc-catalog-redesign-plan.md) ---
  // Всё ниже НЕ редактируется из приложения: считает триггер в базе
  // (supabase/migrations/20260916-bc-structured-tech-params.sql) — из
  // technicalParams для техпараметров и из снимка 2GIS для координат.
  // Смысл: по строкам label/value в technicalParams нельзя ни
  // отфильтровать каталог, ни посчитать медиану класса; jsonb остаётся
  // первоисточником и показывается на карточке с атрибуцией prometr.by, а
  // эти колонки — то, чем оперируют фильтры, сортировки и сравнения.
  // Любое из полей null = у источника этого параметра нет (не ноль и не
  // «неизвестно, значит плохо») — блок/фильтр по такому зданию просто
  // молчит, см. принцип «не выдумываем» в плане.
  floorPlateArea: number | null;
  officeArea: number | null;
  // 'cabinet' | 'block' | 'open_space' — у prometr.by это мультивыбор
  // («Open-space , кабинетная , блочная»), поэтому массив, а не одно значение.
  layoutTypes: BusinessCenterLayoutType[];
  elevators: number | null;
  // Маш./100 м² — как у источника, не абсолютное число мест.
  parkingRatio: number | null;
  // В фактических данных встречаются только 'none' и 'partial'; 'full'
  // разобран на будущее, если источник начнёт отдавать «Да».
  airConditioning: 'none' | 'partial' | 'full' | null;
  // Метры. Значения вне 2–6 м триггер считает ошибкой источника и не
  // записывает (у «Титула» на prometr.by стоит «1.0»).
  ceilingHeight: number | null;
  // 'hoa' — товарищество собственников (много владельцев, условия и торг
  // отличаются по этажам), 'single_uk' — единая управляющая компания.
  managementType: 'hoa' | 'single_uk' | null;
  // Категория удалённости у prometr.by (не метры — для метров есть
  // nearestMetroStations): 'walking' | 'up_to_3_stops' | 'over_3_stops'.
  metroDistanceBucket: 'walking' | 'up_to_3_stops' | 'over_3_stops' | null;
  // Диапазон реально свободных площадей, м². У 113 из 143 зданий источник
  // пишет «подлежат уточнению» — там null, а не 0. Одиночное значение
  // («153.5 м²») даёт min = max.
  freeSpaceMin: number | null;
  freeSpaceMax: number | null;
  // Словарь из 8 значений на всю базу («кафе», «магазин», «банк»,
  // «кофепоинт», «банкомат», «фитнес-центр», «конференц-зал», «салон
  // красоты») — хранится по-русски, как у источника, чтобы показывать без
  // словаря переводов.
  infraInternal: string[];
  infraNearby: string[];
  // Координаты здания. Первоисточник — business_center_2gis_snapshots.point
  // (есть у всех 143), но та таблица закрыта для anon, а карта каталога и
  // «соседи» на карточке БЦ нужны публично — поэтому продублированы сюда
  // триггером, а не читаются join'ом.
  lat: number | null;
  lng: number | null;
  // Рейтинг 2ГИС по ЗДАНИЮ целиком (не по отдельной организации в нём) и
  // число оценок со звёздами. Есть у 47 из 143 — это не «плохой рейтинг у
  // остальных», а просто отсутствие оценок; блок и фильтр по таким зданиям
  // молчат. Отдельно от рейтинга Яндекса, который лежит свободным текстом
  // в highlights (mapRatingFromHighlights) — источники не смешиваем.
  gisRating: number | null;
  gisReviewCount: number | null;
  // Круглосуточный доступ по расписанию 2ГИС (27 зданий).
  is24x7: boolean | null;
  // Элементы доступной среды из 2ГИС («Пандус», «Широкий лифт», ...),
  // 91 здание. Пустой массив = группы «Доступная среда» в снимке нет.
  accessibility: string[];
  photos: string[];
  // 'built' по умолчанию. 'under_construction' — как МФЦ, ещё строится.
  status: 'built' | 'under_construction';
  // Какому каталогу принадлежит запись: 'bc' — бизнес-центры (/minsk/bc),
  // 'tc' — торговые центры (/minsk/tc). Одна таблица на оба каталога, см.
  // src/lib/catalogKind.tsx и миграцию 20260923-catalog-kind.sql.
  kind: CatalogKind;
  // Формат торгового объекта (ТРЦ, ТЦ, универмаг, рынок…) — у ТЦ он вместо
  // делового класса. У бизнес-центров null.
  retailFormat: string | null;
  // Торговые блоки карточки ТЦ (2026-09-23): что на каком этаже, первые в
  // Беларуси и якоря, кино/еда/развлечения, место в рейтинге ТЦ Минска.
  // Заполняет ресёрч ТЦ, в админке не правится (поэтому не входит в
  // BusinessCenterInput — сохранение формы его не затирает). У БЦ — null.
  retailInfo: RetailInfo | null;
  // Порядок на публичной странице (изначально — примерно по частотности
  // поисковых запросов, не алфавитный — алфавит только в боковой навигации).
  // Управляется в админке (см. BusinessCentersAdminTab.tsx).
  sortOrder: number;
  createdAt: string;
}

// Разделы блока "Отдел аренды БЦ" — каждый рендерится своей подписанной
// строкой на BusinessCenterDetailPage.tsx (иконка + текст), а не одним
// абзацем. caveat — важная оговорка источника (сайт недоступен, БЦ на деле
// не сдаёт офисы и т.п.) показывается отдельным акцентным блоком наверху,
// если заполнена. Поля sizes ("площади и типы помещений") больше нет —
// владелец, 2026-09-22: это дублировало totalArea/floors, уже показанные в
// "Параметрах здания", и по сути не про аренду.
export interface RentalInfo {
  caveat: string | null;
  terms: string | null;
  rates: string | null;
  parking: string | null;
  contacts: string | null;
}

// См. комментарий у BusinessCenter.developerInfo выше. Всё независимо
// null — карточка застройщика на публичной странице не рендерится вовсе,
// пока объект целиком null (форма в админке пишет null, если ВСЕ поля
// пустые — тот же принцип, что и у buildRentalInfo).
export interface DeveloperInfo {
  logoUrl: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  hours: string | null;
  website: string | null;
  // LB-2.0 (LINKBUILDING_PLAN.md) — нужен для рассылки писем УК/застройщикам,
  // до этого поля не было вовсе ни у одного БЦ. Показывается на публичной
  // карточке тем же принципом, что и остальные поля этого блока.
  email: string | null;
  // Развёрнутый блок «Кто стоит за ТЦ» (владелец, 2026-09-24: у ТЦ блок
  // застройщика «смотрится бедно, мало инфы»). Все четыре поля
  // необязательные: у 141 БЦ их нет вовсе, и карточка рисуется как раньше.
  // Заполняет ресёрч (бриф tc-catalog/codex/briefs/developer-deep.md),
  // форма админки их не редактирует, но и не стирает — сохраняет как были
  // (buildDeveloperInfo в BusinessCentersAdminTab.tsx). Из базы приходят
  // через normalizeDeveloperInfo (lib/developerProfile.ts): кривые записи
  // отбрасываются там, а не на странице. Контакты главной компании —
  // существующие phone/email/address/website выше, не дублируются.
  companies?: DeveloperCompany[];
  profile?: DeveloperProfile | null;
  portfolio?: DeveloperPortfolioEntry[];
  facts?: DeveloperFact[];
}

/** Участник проекта: инвестор, собственник, генподрядчик, архитектор, УК… */
export interface DeveloperCompany extends RetailSource {
  /** Как в ресёрче: «инвестор и застройщик», «генподрядчик», «управляющая компания». */
  role: string;
  name: string;
  legalName: string | null;
  /** «2011–2014», «2014–н. в.» — строкой, как опубликовано. */
  years: string | null;
  country: string | null;
  website: string | null;
  text: string | null;
  quote: string | null;
}

/** Цифра масштаба главной компании: «25 торговых центров» на дату. */
export interface DeveloperScaleEntry extends RetailSource {
  label: string;
  value: string;
  date: string | null;
}

/** Человек в публичной роли (основатель, директор) — без оценок. */
export interface DeveloperPerson extends RetailSource {
  name: string;
  role: string;
}

export interface DeveloperProfile {
  name: string;
  /** Год или дата основания строкой («1996»). */
  founded: string | null;
  hq: string | null;
  business: string | null;
  scale: DeveloperScaleEntry[];
  people: DeveloperPerson[];
}

/** Другой объект компании (или её группы). */
export interface DeveloperPortfolioEntry extends RetailSource {
  name: string;
  /** Тип: ТЦ, БЦ, жильё, отель… */
  kind: string | null;
  city: string | null;
  year: string | null;
  /** Уже с единицей: число из базы превращается в «12 300 м²». */
  area: string | null;
  note: string | null;
  /** Какой из companies принадлежит — для группировки. */
  owner: string | null;
}

export interface DeveloperFact extends RetailSource {
  label: string | null;
  text: string;
  quote: string | null;
}

// Фиксированный набор иконок для "Интересных фактов" (не сам React-компонент
// — это данные из Supabase, компонент маппится в BusinessCenterDetailPage.tsx
// по этому ключу). 'warning' — единственная особая: рендерится акцентным
// жёлтым блоком (как caveat в RentalInfo), для действительно важных оговорок
// (не текущий владелец здания, судебный спор и т.п.), а не рядовых фактов.
// 'award' — тоже особая: награды, премии и номинации БЦ рисуются НЕ в
// "Интересных фактах", а своим блоком "Награды" списком покрупнее
// (владелец, 2026-09-20: "убрать это из фактов и сделать прям блок
// Награды, если они есть"). Каждая СТРОКА текста такого блока — отдельный
// пункт списка на странице, поэтому пишем одну награду в строку и так,
// чтобы строка читалась сама по себе (подпись раздела на публичной
// странице не показывается — заголовок блока и так "Награды").
export type HighlightIconKey =
  | 'history'
  | 'tenants'
  | 'media'
  | 'award'
  | 'rating'
  | 'reviews'
  | 'design'
  | 'eco'
  | 'warning'
  | 'fact';

export interface HighlightSection {
  icon: HighlightIconKey;
  label: string;
  text: string;
}

// Одна организация из карусели "Организации внутри" на Яндекс.Картах —
// category приходит из текста карточки (не нормализована вручную под
// фиксированный список — категорий на практике десятки и они специфичны для
// конкретного здания, см. комментарий у BusinessCenter.tenantOrganizations).
// rating/reviewCount — тоже с той же карточки (не у всех организаций есть:
// вставные банкоматы/терминалы их не показывают), позволяют сортировать по
// реальному числу отзывов, а не по размеру категории как раньше.
export interface TenantOrganization {
  name: string;
  category: string;
  rating?: number | null;
  reviewCount?: number | null;
  // Скрипт сбора Яндекса кладёт сюда же ссылку, текст карточки и этаж; форма
  // админки их не показывает, но и не должна терять при сохранении.
  floor?: string | null;
}

// См. комментарий у BusinessCenter.technicalParams выше.
export interface TechnicalParam {
  label: string;
  value: string;
}

export interface TechnicalParamGroup {
  corpusLabel: string | null;
  sourceUrl: string;
  params: TechnicalParam[];
}

// См. комментарий у BusinessCenter.buildingFacts выше.
export interface BuildingFact {
  label: string;
  value: string;
  // Человекочитаемое имя источника ("Kufar.by", "Realt.by", "Onliner") —
  // то, что показывается рядом со значением на карточке.
  source: string;
  sourceUrl: string;
  // Для многокорпусных зданий — тот же смысл, что у TechnicalParamGroup.corpusLabel.
  corpusLabel?: string | null;
  // Короткая оговорка/дата снятия факта, если нужна (необязательна).
  note?: string | null;
}

// Одна публикация в СМИ о здании для блока «СМИ о здании». Отбор — по
// docs/bc-media-research-brief.md: материал, где ЗДАНИЕ самостоятельная тема,
// без негатива, из издания, не признанного в Беларуси экстремистским.
//
// Логотипа здесь нет СПЕЦИАЛЬНО: он общий для всех БЦ и лежит в реестре
// src/data/mediaOutlets.ts, ключ — домен из url. Хранить картинку в строке
// значило бы размножить её по 141 карточке и потерять возможность заменить
// логотип издания одной правкой.
export interface MediaMention {
  url: string;
  title: string;
  // YYYY-MM-DD. null — у публикации не проставлена дата (бывает у части
  // белорусских изданий); дату по косвенным признакам не восстанавливаем,
  // в блоке такая строка показывается без даты.
  date: string | null;
  // Как называть издание читателю («БелТА», а не «belta.by») — из домена
  // не выводится. Показывается, только если логотипа для домена нет.
  outlet: string;
}

// См. комментарий у BusinessCenter.nearestMetroStations выше. Поля — прямое
// отображение того, что реально даёт 2GIS (`nearest_stations[i]`), без
// лишних полей вроде `id`/`route_logo`, которые нам не нужны для показа.
export interface NearestMetroStation {
  name: string;
  distanceMeters: number;
  // "Московская линия" — текст линии как есть у источника (2GIS `comment`),
  // не структурированный id линии.
  line: string | null;
  color: string | null;
}

// Торговые блоки карточки ТЦ — jsonb-колонка business_centers.retail_info
// (миграция 20260923-business-centers-retail-info.sql). Ключи camelCase — так
// они и лежат в jsonb. У каждой записи свой источник: блоки собраны из разных
// публикаций, и одна общая ссылка на всю колонку врала бы про половину строк.
// Разбор и нормализация (любой массив может отсутствовать) —
// src/lib/tradeCenterRetail.ts.
export interface RetailSource {
  source: string | null;
  sourceUrl: string | null;
}

export interface RetailFloorEntry extends RetailSource {
  // Как у источника: "-1", "1", "2–3", "6". Порядок на странице — по первому
  // числу строки, сверху вниз (sortFloorsTopDown).
  floor: string;
  text: string;
  date: string | null;
}

// Якорные арендаторы — retail_info.anchors (2026-09-24, бриф
// tc-catalog/codex/briefs/anchors-timeline.md): кто СЕЙЧАС тянет в ТЦ людей.
// Категория — открытый список ресёрча; незнакомая сводится к «другое».
// У старых записей firsts (kind anchor) категории нет — null.
export const RETAIL_ANCHOR_CATEGORIES = [
  'гипермаркет',
  'кинотеатр',
  'fashion',
  'электроника',
  'детские товары',
  'спорт',
  'дом и интерьер',
  'развлечения',
  'фудкорт',
  'фитнес',
  'другое',
] as const;

export type RetailAnchorCategory = (typeof RETAIL_ANCHOR_CATEGORIES)[number];

export interface RetailAnchorEntry extends RetailSource {
  name: string;
  category: RetailAnchorCategory | null;
  // Как у источника: "-1", "1", "2–3".
  floor: string | null;
  // "6 300 м²".
  area: string | null;
  // Год прихода в ТЦ, "2016".
  since: string | null;
  text: string;
  yandexUrl: string | null;
}

// «Чем ТЦ вошёл в историю ритейла» — retail_info.timeline (та же схема).
// Только достижения: уходы брендов и закрытия сюда не пишутся вовсе.
export type RetailTimelineKind = 'first' | 'first_format' | 'record' | 'milestone';

export interface RetailTimelineEntry extends RetailSource {
  // "2019-03-15", "2019-03" или "2019" — запись без года отбрасывается.
  date: string;
  kind: RetailTimelineKind;
  name: string;
  text: string;
  note: string | null;
}

export type RetailLeisureKind = 'cinema' | 'food' | 'kids' | 'sport' | 'other';

export interface RetailLeisureEntry extends RetailSource {
  kind: RetailLeisureKind;
  name: string;
  text: string;
  date: string | null;
}

// «Где поесть» и «Развлечения» — retail_info.food и retail_info.fun
// (2026-09-24): владелец разделил старый блок «Кино, еда, развлечения»
// (leisure) на два. У ТЦ, где есть хоть один из новых ключей, leisure не
// показывается; у остальных — пока как раньше. Разбор —
// normalizeRetailInfo в lib/tradeCenterRetail.
export interface RetailFoodZone extends RetailSource {
  // Фудкорт, ресторанный дворик, гастрозона.
  name: string;
  floor: string | null;
  // Как у источника; число из jsonb приходит строкой: "1200", "около 600".
  area: string | null;
  seats: string | null;
  points: string | null;
  hours: string | null;
  text: string | null;
}

export const RETAIL_FOOD_PLACE_TYPES = ['restaurant', 'cafe', 'fastfood', 'coffee', 'dessert', 'bar'] as const;

export type RetailFoodPlaceType = (typeof RETAIL_FOOD_PLACE_TYPES)[number];

export interface RetailFoodPlace {
  name: string;
  // Незнакомый тип — 'cafe'.
  type: RetailFoodPlaceType;
  cuisine: string | null;
  floor: string | null;
  inFoodcourt: boolean | null;
  yandexUrl: string | null;
  note: string | null;
}

export interface RetailFoodInfo {
  summary: string | null;
  zones: RetailFoodZone[];
  // Все заведения ТЦ, у крупных — 30–90 штук.
  places: RetailFoodPlace[];
}

export const RETAIL_FUN_KINDS = ['cinema', 'ice', 'kids', 'concert', 'games', 'quest', 'sport', 'fitness', 'other'] as const;

export type RetailFunKind = (typeof RETAIL_FUN_KINDS)[number];

export interface RetailFunEntry extends RetailSource {
  name: string;
  // Незнакомый вид — 'other'.
  kind: RetailFunKind;
  floor: string | null;
  area: string | null;
  capacity: string | null;
  // «IMAX», «4DX», «VIP-зал».
  formats: string[];
  hours: string | null;
  // Год открытия в ТЦ, "2016".
  since: string | null;
  text: string | null;
  yandexUrl: string | null;
}

export interface RetailRankingEntry extends RetailSource {
  place: number;
  // "арендопригодная площадь" (у записей до 2026-09-24 значение бывает
  // прямо в скобках: "арендопригодная площадь (52 000 м²)")
  criterion: string;
  // "ТЦ Минска"
  scope: string;
  total: number | null;
  year: number | null;
  // С 2026-09-24 (tc-catalog/codex/briefs/awards.md), у старых записей нет:
  // человеческая формулировка «Крупнейший ТЦ Минска по арендопригодной
  // площади», значение показателя «68 600 м²» и оговорка.
  headline: string | null;
  value: string | null;
  note: string | null;
}

// Награды и конкурсы ТЦ — retail_info.awards (2026-09-24, та же схема).
export type RetailAwardResult = 'winner' | 'diploma' | 'laureate' | 'finalist' | 'nominee' | 'other';

export interface RetailAwardEntry extends RetailSource {
  // Короткое название для читателя: «Realt Golden Key 2014».
  title: string;
  org: string | null;
  // Строкой: у конкурсов бывает «2014–2015».
  year: string | null;
  category: string | null;
  result: RetailAwardResult;
  // Как написать на странице: «диплом I степени». Нет — подпись по result.
  resultText: string | null;
  // За что: здание / проект до открытия / фасад / интерьер / маркетинг.
  subject: string | null;
  // Кто получил, если не сам ТЦ (архитекторы, застройщик).
  recipient: string | null;
  text: string | null;
  // false — только со слов ТЦ или застройщика, независимого подтверждения нет.
  confirmed: boolean;
}

// --- Дополнительные блоки ТЦ (2026-09-23, схема extras-schema.md) ---------
// «Посетителю» (режим, парковка, проезд, удобства, скидки) и «для бизнеса»
// (аудитория, аренда, реклама, цифры, цитаты). Все ключи необязательные в
// jsonb; после normalizeRetailInfo массивы всегда есть (пустые), а
// одиночные объекты — null.

export interface RetailHoursEntry extends RetailSource {
  // «Торговая галерея», «Гипермаркет ГИППО», «Паркинг»
  zone: string;
  // «ежедневно 10:00–22:00»
  value: string;
  note: string | null;
}

export interface RetailLabeledValue {
  label: string;
  value: string;
}

export interface RetailParking extends RetailSource {
  summary: string;
  // «Мест» → «685», «Первые 3 часа» → «5 руб.»
  items: RetailLabeledValue[];
  // Актуальность тарифов.
  date: string | null;
}

export type RetailTransportMode = 'metro' | 'bus' | 'trolleybus' | 'tram' | 'minibus' | 'shuttle' | 'car' | 'walk';

export interface RetailTransportEntry extends RetailSource {
  mode: RetailTransportMode;
  text: string;
}

/**
 * Группа удобства в блоке «Инфраструктура» ТЦ (2026-09-24). В порядке
 * показа. Ресёрч может её не заполнить — тогда её выводит
 * serviceGroupFromName в lib/tradeCenterRetail по названию.
 */
export const RETAIL_SERVICE_GROUPS = ['info', 'comfort', 'family', 'access', 'money', 'car', 'everyday', 'eco'] as const;
export type RetailServiceGroup = (typeof RETAIL_SERVICE_GROUPS)[number];

export interface RetailServiceEntry extends RetailSource {
  name: string;
  text: string | null;
  floor: string | null;
  group: RetailServiceGroup;
}

export interface RetailRuleEntry extends RetailSource {
  text: string;
}

export interface RetailLoyaltyEntry extends RetailSource {
  name: string;
  text: string;
}

export interface RetailEventEntry extends RetailSource {
  name: string;
  text: string;
  date: string | null;
}

/** Цифра с подписью — и «аудитория», и «ТЦ в цифрах». */
export interface RetailFigureEntry extends RetailSource {
  label: string;
  value: string;
  date: string | null;
  // «по данным ТЦ», «из рекламного материала»
  note: string | null;
  // «ТЦ в цифрах» (2026-09-24, бриф numbers.md): одна фраза, почему цифра
  // впечатляет, — сравнение или контекст. У аудитории и старых записей нет.
  text: string | null;
}

/** «Как арендовать» и «реклама в ТЦ» — одна форма. */
export interface RetailPitch extends RetailSource {
  text: string;
  points: string[];
  contacts: string | null;
}

export interface RetailQuoteEntry extends RetailSource {
  who: string;
  text: string;
  date: string | null;
}

/**
 * Свободное помещение из списка самого ТЦ или агентства (2026-09-24, бриф
 * vacancies.md). У крупных ТЦ цены почти всегда «по запросу» — поэтому
 * отдельно от объявлений Kufar/Realt, где цена есть всегда. Владелец
 * выбрал показывать такие помещения списком под объявлениями.
 */
export interface RetailVacancyEntry extends RetailSource {
  deal: 'rent' | 'sale';
  type: string | null;
  size: number;
  // «−1», «средний подземный уровень» — как пишет сам ТЦ
  floor: string | null;
  // USD за м² (аренда — в месяц); нет цены — null
  pricePerSqm: number | null;
  note: string | null;
  checkedAt: string | null;
}

export interface RetailInfo {
  floorsGuide: RetailFloorEntry[];
  anchors: RetailAnchorEntry[];
  timeline: RetailTimelineEntry[];
  leisure: RetailLeisureEntry[];
  food: RetailFoodInfo | null;
  fun: RetailFunEntry[];
  ranking: RetailRankingEntry[];
  awards: RetailAwardEntry[];
  hours: RetailHoursEntry[];
  hoursNote: string | null;
  parking: RetailParking | null;
  transport: RetailTransportEntry[];
  services: RetailServiceEntry[];
  rules: RetailRuleEntry[];
  loyalty: RetailLoyaltyEntry[];
  events: RetailEventEntry[];
  audience: RetailFigureEntry[];
  leasing: RetailPitch | null;
  advertising: RetailPitch | null;
  numbers: RetailFigureEntry[];
  quotes: RetailQuoteEntry[];
  vacancies: RetailVacancyEntry[];
  // Каталог арендаторов показан на странице соседнего корпуса того же
  // комплекса (2026-09-24, «Европа» 57А и «Новая Европа» 57Б: в Яндексе
  // карточка «Европа» на деле собирает магазины 57Б, и срез у обеих страниц
  // совпадал на 212 организаций из 224). Здесь вместо каталога — ссылка туда,
  // чтобы не было двух одинаковых списков.
  tenantsAt: { slug: string; name: string } | null;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. lib/businessCentersApi.ts
export interface BusinessCenterRow {
  id: string;
  slug: string;
  name: string;
  alt_names: string[] | null;
  address: string;
  district: string | null;
  microdistrict: string | null;
  business_class: string | null;
  total_area: number | null;
  year_built: number | null;
  floors: number | null;
  developer: string | null;
  developer_info: DeveloperInfo | null;
  metro: string | null;
  parking: string | null;
  website: string | null;
  description: string | null;
  rental_info: RentalInfo | null;
  highlights: HighlightSection[] | null;
  map_snapshot_files: DocumentFile[] | null;
  media_mentions: MediaMention[] | null;
  tenant_organizations: TenantOrganization[] | null;
  tenant_count: number | null;
  technical_params: TechnicalParamGroup[] | null;
  building_facts: BuildingFact[] | null;
  nearest_metro_stations: NearestMetroStation[] | null;
  floor_plate_area: number | null;
  office_area: number | null;
  layout_types: string[] | null;
  elevators: number | null;
  parking_ratio: number | null;
  air_conditioning: string | null;
  ceiling_height: number | null;
  management_type: string | null;
  metro_distance_bucket: string | null;
  free_space_min: number | null;
  free_space_max: number | null;
  infra_internal: string[] | null;
  infra_nearby: string[] | null;
  lat: number | null;
  lng: number | null;
  gis_rating: number | null;
  gis_review_count: number | null;
  is_24x7: boolean | null;
  accessibility: string[] | null;
  verdict: string | null;
  pros: string[] | null;
  cons: string[] | null;
  verdict_edited: boolean | null;
  reviews_checked: boolean | null;
  photos: string[] | null;
  status: string | null;
  // Необязательные: в снимках сборки, снятых до 2026-09-23, этих колонок нет.
  kind?: string | null;
  retail_format?: string | null;
  // Торговые блоки ТЦ; у БЦ и в снимках до 2026-09-23 — null/нет ключа.
  retail_info?: RetailInfo | null;
  sort_order: number;
  created_at: string;
}

export const BUSINESS_CENTER_CLASSES = ['A', 'B+', 'B', 'C'] as const;

// Форматы торговых объектов (каталог ТЦ, kind = 'tc') — открытый список, как
// остальные растущие поля: в админке можно дописать свой (AddableSelect).
export const RETAIL_FORMATS = [
  'ТРЦ',
  'ТЦ',
  'районный ТЦ',
  'универмаг',
  'аутлет',
  'рынок',
  'гипермаркет с галереей',
  'мебельный центр',
  'строительный центр',
  'автоцентр',
] as const;

export type BusinessCenterLayoutType = 'cabinet' | 'block' | 'open_space';

// Поля, которые считает база (триггер по technical_params и точке 2GIS) —
// приложение их только читает. Вынесено отдельным типом, чтобы
// BusinessCenterInput в lib/businessCentersApi.ts их исключал: иначе форма
// в админке обязана была бы присылать вычисляемые значения, а триггер всё
// равно перезаписал бы их своими.
export type BusinessCenterDerivedField =
  // tenantCount считает сама база (generated always, миграция
  // 20260922-bc-tenant-count.sql) — в payload админки его слать нельзя.
  | 'tenantCount'
  | 'floorPlateArea'
  | 'officeArea'
  | 'layoutTypes'
  | 'elevators'
  | 'parkingRatio'
  | 'airConditioning'
  | 'ceilingHeight'
  | 'managementType'
  | 'metroDistanceBucket'
  | 'freeSpaceMin'
  | 'freeSpaceMax'
  | 'infraInternal'
  | 'infraNearby'
  | 'lat'
  | 'lng'
  | 'gisRating'
  | 'gisReviewCount'
  | 'is24x7'
  | 'accessibility';

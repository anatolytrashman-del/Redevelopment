import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BedDouble,
  Briefcase,
  Bus,
  Building2,
  Car,
  ChevronDown,
  Cigarette,
  CircleHelp,
  CircleParking,
  Clock,
  Coffee,
  CreditCard,
  Dumbbell,
  ExternalLink,
  Flower2,
  Grid2x2,
  HardHat,
  Landmark,
  LayoutGrid,
  Layers,
  MapPin,
  Menu,
  Package,
  Phone,
  Pill,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Store,
  TrainFront,
  TramFront,
  TrendingUp,
  TriangleAlert,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setFaqJsonLd } from '../lib/pageMeta';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import type { FaqItem } from '../components/ui/FaqAccordion';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { fetchMarketOffers } from '../lib/marketOffersApi';
import { AREA_BUCKET_ORDER, areaBucket, MARKET_PROPERTY_TYPES, netSize, netPricePerSqm } from '../data/marketOffers';
import type { MarketOffer } from '../data/marketOffers';
import { DISTRICTS } from '../data/districts';

// Переехала с /rayon-minsk-mir на /minsk/minsk-mir (см. CLAUDE.md, урл-
// структура /minsk/...) — старый адрес редиректит сюда (App.tsx).
const PAGE_URL = 'https://redevelopment.pro/minsk/minsk-mir';
// TITLE — для <title>/og/canonical, не трогаем: уже подобран под целевые
// запросы, длиннее рискует обрезаться в поисковой выдаче. PAGE_H1 — то, что
// реально видит посетитель на странице, может быть многословнее и точнее
// по позиционированию ("гайд и аналитика" — владелец так решил после того,
// как страница обросла блоками с реальными цифрами по каждой категории
// арендаторов, это уже не просто описание района).
const TITLE = 'Офисы и коммерческие помещения в районе Минск Мир';
const PAGE_H1 = 'Коммерческая недвижимость Минск Мира: гайд и аналитика';
const DESCRIPTION =
  'Коммерческая недвижимость в районе Минск Мир: готовая аудитория, транспорт, банки и МФЦ, медицина, форматы помещений под любой бизнес. Гид для арендаторов и собственников.';
const INTRO_TEXT = 'Экспертный разбор коммерческой недвижимости в Минск Мире для инвесторов, собственников и арендаторов.';
// Обновлять вручную при каждом квартальном пересмотре текста (см. SEO_PLAN.md, Э3-1).
const DATE_MODIFIED = '2026-08-22';

// Ссылка от владельца пришла в двух нерабочих как iframe src форматах
// (страница yandex.ru/maps/?um=... и <script src="api-maps.yandex.ru/...">
// — оба не работают как src, см. предупреждение в ObjectMapWidget.tsx и
// CLAUDE.md). Собрано вручную по id конструктора из присланной ссылки в
// рабочий формат — тот же самый, что реально используется в mapEmbedUrl
// объекта Red One (проверено запросом к Supabase).
const MAP_EMBED_URL =
  'https://yandex.ru/map-widget/v1/?um=constructor%3A1d794325dcda320ce9255c449e982037d1332cf776404d4a207b9a3e8bf2f307&source=constructorLink';

// 6 аэрофото района от владельца (ссылки на ibb.co) — скачаны и
// самостоятельно захостены в public/images/district/ (тот же принцип,
// что и с логотипом метро — не зависеть от внешнего хостинга для
// критичной для LCP картинки). У всех фото водяной знак «@PROMIR_BY» —
// владелец подтвердил, что публикация с сохранённым водяным знаком
// нормальна (это открытая публикация автора, не тайком скопированная).
// HeroImageSlider — тот же компонент, что и слайдер рендеров на /one
// (components/objects/HeroImageSlider.tsx), просто переиспользован.
const HERO_IMAGES = [
  '/images/district/hero-1.jpg',
  '/images/district/hero-2.jpg',
  '/images/district/hero-3.jpg',
  '/images/district/hero-4.jpg',
  '/images/district/hero-5.jpg',
  '/images/district/hero-6.jpg',
];

// Источник фактов: Википедия, статья "Минск Мир" (ru.wikipedia.org,
// прислана владельцем 2026-08-22) + веб-поиск (Avia Mall, инфраструктура)
// + Wordstat-выгрузка владельца (спрос на коммерческую инфраструктуру,
// расклассифицирована и очищена от шума — см. журнал SEO_PLAN.md) +
// текст согласован с владельцем и написан через Gemini (см. журнал плана,
// интеграция ProxyAPI) по брифу, собранному на этих данных.

// Второй заход на структуру страницы (2026-08-22) — первая версия была
// нейтральным гидом "про район", вторая переосмыслена под аудиторию
// предпринимателей/собственников коммерции: не "район для жизни", а
// "готовая бизнес-среда". Сроки застройки (2015-2027) и историю сознательно
// убрали — фокус на настоящем, не на прошлом (решение владельца).
const statTiles: { icon: LucideIcon; value: string; label: string }[] = [
  { icon: Users, value: '25–45', label: 'лет — ядро жителей района: семьи, IT-специалисты' },
  { icon: TrainFront, value: '2', label: 'станции метро на территории' },
  { icon: ShoppingBag, value: '138 200 м²', label: 'площадь Avia Mall — крупнейший ТЦ Минска' },
  { icon: Bus, value: '14', label: 'автобусных и троллейбусных маршрутов' },
];

// Блок застройщика — владелец знал имя (Dana Holdings), но не располагал
// фактурой, попросил найти самостоятельно. Собрано веб-поиском, каждый
// факт минимум из одного независимого источника (t-s.by, naviny.by,
// Википедия "Минск Мир"): международная группа компаний, головной офис в
// Швейцарии, работает в Беларуси с 2006 года; основатели — сербские
// братья Богoлюб и Драгомир Карич. Земля под Минск Мир (территория
// бывшего аэропорта Минск-1, 300+ га) получена указом Президента от
// 22.09.2014 без аукциона юрлицом ИООО «Дана Астра» — та самая компания,
// что и упомянута в контактах владельца. Заявленный масштаб проекта на
// момент старта — 320 га, ~30 тыс. квартир, ~$3,5 млрд инвестиций (это
// план 2014 года, не факт текущей стройки — фраза ниже это отражает).
// Другие проекты компании в Минске — Vogue, «Маяк Минска», ЖК «Рахманинов»,
// ЖК «Вивальди». Логотип прислан владельцем (ibb.co), скачан и обработан
// локально (Pillow: побелевший фон JPEG превращён в альфа-канал через
// классический трюк "alpha = 255 − min(R,G,B)" с де-премультипликацией
// цвета) — не смог найти логотип с уже прозрачным фоном официально,
// пришлось вырезать вручную, как и просил владелец.
const DEVELOPER_LOGO_URL = '/images/district/dana-holdings-logo.png';
const DEVELOPER_LINKS = [
  { label: 'minskworld.by', url: 'https://minskworld.by' },
  { label: 'bir.by', url: 'https://bir.by' },
];
const DEVELOPER_CONTACTS = {
  phone: '7675',
  phoneHref: 'tel:7675',
  address: 'Отдел продаж: ул. П. Мстиславца, 9, «Дана Центр», 1 этаж',
  hours: 'Пн–Пт: 8:30–20:30, Сб–Вс: 9:00–20:00',
};

// Портрет аудитории и медицинская инфраструктура — текст от Gemini по брифу,
// собранному на реальных данных: возрастное ядро и «почти нет пенсионеров» —
// от владельца (личное знание района, как и с паркингами выше); аптеки —
// список из 22 точек, полученный от владельца через сохранённую HTML-страницу
// (webarchive) результатов поиска на Яндекс.Картах (спарсено вручную, у самого
// Яндекс.Карт нет доступного из этой среды способа сделать это автоматически —
// см. журнал SEO_PLAN.md); поликлиника/стоматологии/медцентр/ветклиника —
// веб-поиск, адреса перепроверены. Сеть InLek (5 из 22 точек) — тот самый
// нечитаемый бренд "In塗то" из исходного портрета арендаторов ниже, разгадан
// по совпадению с этим списком.
const audienceHighlights: { label: string; text: string }[] = [
  {
    label: 'Ядро аудитории — 25–45 лет.',
    text: 'Основные жители района: молодые семьи, IT-специалисты, предприниматели и квалифицированные специалисты. Доля людей пенсионного возраста стремится к нулю.',
  },
  {
    label: 'Активная модель потребления.',
    text: 'Жители ориентированы на комфорт, ценят время и тратят деньги внутри района: на готовое питание, сервисы у дома, здоровье, спорт и досуг.',
  },
  {
    label: 'Фокус на детскую и семейную инфраструктуру.',
    text: 'Высокая доля семей с детьми формирует постоянный коммерческий спрос на детские центры, профильные магазины, развивающие студии и семейные кафе.',
  },
];

// "Генераторы ежедневного трафика" (владелец, август 2026) — переписан после
// правки по факту: Avia Mall и Международный финансовый центр физически не
// готовы к работе (Avia Mall уже открыт, но ещё заселяется арендаторами;
// финцентр строится) — первая версия блока ошибочно подавала их как уже
// действующие точки притяжения. Текст — бриф владельца через Gemini (см.
// журнал SEO_PLAN.md), пункт про ТЦ/финцентр явно разделяет "уже" и "скоро".
const trafficHighlights: { label: string; text: string }[] = [
  {
    label: '80 000 жителей района.',
    text: 'Минск Мир — огромный и плотно заселённый массив. Высотная застройка создаёт высокую концентрацию людей прямо внутри кварталов. Это готовые клиенты для бизнеса у дома.',
  },
  {
    label: 'Туристы и арендаторы.',
    text: 'Район популярен для краткосрочной аренды из-за свежих квартир и близости к центру. Сюда постоянно приезжают туристы и командированные, которые создают дополнительный спрос.',
  },
  {
    label: 'Гости со всего города.',
    text: 'Сюда регулярно приезжают жители других районов Минска — в гости к друзьям или в конкретные местные заведения, магазины и салоны.',
  },
  {
    label: 'Заселение ТЦ и запуск Финансового центра.',
    text: 'Avia Mall уже открыт, но ещё заселяется арендаторами, а Международный финансовый центр пока строится. Это станет дополнительной точкой притяжения и даст району ещё один буст.',
  },
];

// Плотность населения — отдельный блок ("population-density") прямо перед
// "Плотность бизнеса по нишам" (владелец: "пусть он будет отдельным, как
// раз перед блоком плотности бизнеса" — раньше жил внутри карточки
// "Генераторы трафика"). Первая версия (только норматив 290 vs 427) — цитата
// из статьи Onliner, прислана владельцем 2026-08-24 (доступ к самому домену
// realt.onliner.by из этой среды заблокирован прокси, не перепроверить
// самостоятельно): "по регламентам генплана высокоплотной многоквартирной
// застройкой в Минске считается застройка с... плотностью населения в
// пределах 231—290 человек на 1 гектар. В «Минск-Мире» же... плотность
// населения — 427 человек на гектар".
// Вдогонку владелец прислал ещё подборку цифр (AI-обзор с разномастными
// источниками, не прямая цитата одной статьи) — из неё сознательно НЕ взят
// повторный вариант норматива "60–76 человек/га", хотя он там тоже подписан
// как тот же регламент "Минскградо" с теми же 6000–7600 м²/га: это
// арифметически не бьётся с уже проверенной цитатой (231–290) при типичной
// жилой обеспеченности ~26–30 м² на человека — 6000/28≈214, 7600/28≈271,
// то есть верна цитата с 231–290, а "60–76" похоже на ошибку конкретно
// этого ответа. Взяты значения, которые не противоречат друг другу и
// заодно точнее ложатся в тезис "самая плотная застройка Минска" —
// среднегородская плотность (57 чел/га, сходится с независимым расчётом
// из Википедии о населении Минска, см. более ранний WebSearch этой сессии)
// и самые плотные существующие районы города, Фрунзенский и Московский
// (~100 чел/га, со ссылкой на Главное статистическое управление Минска).
// Усадебную/частную застройку владелец явно попросил не включать — тезис
// про многоквартирную плотность, а не про диапазон города целиком.
const DISTRICT_DENSITY_PER_HECTARE = 427;
const MINSK_HIGH_DENSITY_NORM_MAX = 290;
const MINSK_CITY_AVG_DENSITY = 57;
const MINSK_DENSEST_DISTRICTS_DENSITY = 100;

const densityComparisons: { label: string; value: number }[] = [
  { label: 'Минск, в среднем по городу', value: MINSK_CITY_AVG_DENSITY },
  { label: 'Фрунзенский и Московский районы (плотнее всех в городе)', value: MINSK_DENSEST_DISTRICTS_DENSITY },
  { label: 'Норматив «высокоплотная застройка» (максимум)', value: MINSK_HIGH_DENSITY_NORM_MAX },
  { label: 'Минск Мир', value: DISTRICT_DENSITY_PER_HECTARE },
];

const densityVsAvgRatioLabel = (DISTRICT_DENSITY_PER_HECTARE / MINSK_CITY_AVG_DENSITY).toFixed(1).replace('.', ',');
const densityRatioLabel = (DISTRICT_DENSITY_PER_HECTARE / MINSK_HIGH_DENSITY_NORM_MAX).toFixed(1).replace('.', ',');

const pharmacyTotal = 22;

const medicineHighlights: { label: string; text: string }[] = [
  {
    label: 'Государственный якорь.',
    text: '41-я городская поликлиника (ул. Кижеватова, 5а, открыта в январе 2026 года) обеспечивает первичную медицинскую помощь жителям и генерирует стабильный пешеходный трафик.',
  },
  {
    label: 'Высокая плотность фарм-ритейла.',
    text: `В районе работают ${pharmacyTotal} аптеки. Крупнейшая сеть — InLek (5 филиалов), что подтверждает высокий спрос на товары для здоровья в шаговой доступности.`,
  },
];

const medicinePrivateList: { label: string; text: string }[] = [
  {
    label: 'Стоматологии:',
    text: 'ConstantaClinic (просп. Мира, 1), Dentalove (ул. Аэродромная, 30), Healthy Smile (ул. Братская, 4)',
  },
  { label: 'Многопрофильные услуги:', text: 'медцентр «ИдеалМед» (ул. Аэродромная, 26)' },
  { label: 'Ветеринария:', text: 'ветклиника «Главное Хвост» (ул. Казинца, 46А)' },
];

// Список общепита — владелец сохранил webarchive результатов поиска
// "кафе" на Яндекс.Картах (тот же метод, что и с аптеками выше), 78 строк
// в исходнике → 73 уникальных места (5 дублей от повторного скролла) →
// 60 из них с категорией "кафе" и/или "кофейня" (объединено, чтобы не
// считать дважды заведения с обеими метками). Полный список владельцу не
// нужен, только сводная статистика по типам — см. журнал SEO_PLAN.md.
const foodServiceTotal = 73;
const foodServiceBreakdown: { label: string; count: number }[] = [
  { label: 'Кафе / кофейни', count: 60 },
  { label: 'Рестораны', count: 13 },
  { label: 'Бары', count: 8 },
  { label: 'Фастфуд', count: 8 },
  { label: 'Пекарни', count: 5 },
  { label: 'Пиццерии', count: 4 },
  { label: 'Кондитерские', count: 3 },
];

// Спорт/фитнес — тот же метод (webarchive, поиск "спорт" на Яндекс.Картах),
// 11 строк → 10 уникальных мест (1 дубль). Категории пересекаются (например
// студия с йогой и пилатесом сразу), поэтому суммы по группам не равны
// общему числу мест.
const sportTotal = 10;
const sportBreakdown: { label: string; count: number }[] = [
  { label: 'Тренажёрные залы / фитнес-клубы', count: 7 },
  { label: 'Йога / пилатес / стретчинг', count: 4 },
];

// Банки/банкоматы — первый заход (поиск "банкоматы" одним запросом) не
// разделял отделения и банкоматы — категория в выдаче была пустой у
// большинства точек. Владелец обратил внимание, что не понятно, где что,
// и подсказал, что в районе точно есть БНБ-Банк — его не было в первом
// списке. Пересобрано двумя отдельными запросами ("банкоматы" отдельно,
// "отделения банков" отдельно, категория "Банк" у второго подтверждена) —
// 22+11 строк → 30 уникальных точек, 13 разных банков (БНБ-Банк
// оказался в выдаче под полным юрлицом "Белорусский народный банк" — та
// самая пропущенная сеть, отделение и банкомат в Avia Mall). "Три цены"
// (не банк, магазин) попал в выдачу по отделениям как шум — исключён.
const bankPointsTotal = 30;
const bankNamesCount = 13;
const bankBranchCount = 9;
const bankMatrix: { label: string; hasBranch: boolean; hasAtm: boolean }[] = [
  { label: 'Paritetbank', hasBranch: true, hasAtm: true },
  { label: 'БНБ-Банк', hasBranch: true, hasAtm: true },
  { label: 'Банк ВТБ', hasBranch: true, hasAtm: true },
  { label: 'БелВЭБ', hasBranch: true, hasAtm: true },
  { label: 'Белагропромбанк', hasBranch: true, hasAtm: true },
  { label: 'Беларусбанк', hasBranch: true, hasAtm: true },
  { label: 'Белгазпромбанк', hasBranch: true, hasAtm: true },
  { label: 'МТБанк', hasBranch: true, hasAtm: true },
  { label: 'Приорбанк', hasBranch: true, hasAtm: true },
  { label: 'Альфа-Банк', hasBranch: false, hasAtm: true },
  { label: 'Банк РРБ', hasBranch: false, hasAtm: true },
  { label: 'Белинвестбанк', hasBranch: false, hasAtm: true },
  { label: 'Сбер Банк', hasBranch: false, hasAtm: true },
];

// СТО/автосервисы — webarchive, поиск "автосервис", 67 строк → 64
// уникальных точки. В отличие от прошлых категорий, здесь важен не общий
// счёт, а география: внутри жилых кварталов Минск Мира профильных точек
// почти нет, зато рядом (ул. Казинца, Брестская, Бородинская, Брилевский
// тупик) — плотный автосервисный кластер: 42 из 64 точек, больше 2/3
// выдачи. Ровно то, что и предполагал владелец — подтверждено данными,
// не просто общее наблюдение.
const autoServiceTotal = 64;
const autoServiceClusterCount = 42;
const autoServiceClusterStreets = 'Казинца, Брестской, Бородинской и Брилевском тупике';

// Салоны красоты — webarchive, поиск "салоны красоты", 91 строка → 88
// уникальных мест. Один из самых насыщенных сегментов района — логично
// для портрета аудитории (бьюти-сфера уже отдельная категория в
// tenantProfiles ниже). Показаны только специализации с заметным числом
// точек, у остальных (пирсинг, шугаринг и т.п.) по 1-2 точки — не
// перегружаем блок длинным хвостом.
const beautyTotal = 88;
const beautyBreakdown: { label: string; count: number }[] = [
  { label: 'Ногтевые студии', count: 13 },
  { label: 'Парикмахерские', count: 5 },
  { label: 'Стилисты', count: 5 },
  { label: 'Косметология', count: 5 },
  { label: 'Брови и ресницы', count: 5 },
  { label: 'Барбершопы', count: 3 },
];

// Магазины продуктов — webarchive, поиск "магазин продуктов", 44 строки,
// все уникальны (категории у выдачи почти всегда пустые — считаем по
// названиям). Отдельно посчитаны специализированные лавки (мясные/
// овощные/фермерские — по ключевым словам в названии), не только сети.
const groceryTotal = 44;
const groceryBreakdown: { label: string; count: number }[] = [
  { label: 'Копеечка', count: 6 },
  { label: 'Соседи / Соседи Экспресс', count: 3 },
  { label: 'Санта', count: 3 },
  { label: 'Евроопт Market', count: 2 },
  { label: 'Знічка', count: 2 },
  { label: 'Остров', count: 2 },
  { label: 'Специализированные (мясо, овощи, фермерское)', count: 8 },
];
const groceryMax = Math.max(...groceryBreakdown.map((b) => b.count));

// ПВЗ — webarchive, поиск "пункт выдачи заказов", 46 строк, но владелец
// попросил учитывать только Ozon и Wildberries — в выдачу попали лишние
// организации (Emall.by, Lamoda и другие агрегаторы/магазины с похожей
// категорией, не относящиеся к запросу).
const pvzOzonCount = 11;
const pvzWildberriesCount = 20;
const pvzTotal = pvzOzonCount + pvzWildberriesCount;

// Цветочные магазины — webarchive, поиск "цветы", 36 строк, все уникальны.
const flowerTotal = 36;
const flowerDeliveryCount = 7;

// Табак и вейп-шопы — владелец объединил два отдельных поиска ("табак" и
// "вейп-шоп") в одну категорию и попросил убрать дубли, которые попали в
// обе выдачи (совпадающие по названию+адресу точки — Puff-Lab, ЗаПар,
// Liberty Vape, Изишоп, NovaSens, Vape Lounge, Вейп шоп). 18 + 15 строк →
// 22 уникальные точки.
const tobaccoVapeTotal = 22;
const tobaccoVapeBreakdown: { label: string; count: number }[] = [
  { label: 'Вейп-шопы', count: 15 },
  { label: 'Табачные магазины', count: 7 },
];
const tobaccoVapeMax = Math.max(...tobaccoVapeBreakdown.map((b) => b.count));

// Тепловая карта плотности бизнеса — синтез всех собранных выше чисел по
// категориям, предложено владельцем. Методика (согласована с владельцем
// до вёрстки): считаем только категории, где точки физически внутри
// района (СТО не входит — у него принципиально другая суть, "почти нет
// здесь, зато плотно рядом", свой блок с контрастом уже есть). Три уровня
// по абсолютному числу точек (не проценты, не на душу населения — нет
// достоверной цифры населения района, см. audienceHighlights); границы
// круглые, не строгие терцили, чтобы не резать по живому при равных
// значениях (аптеки/табак — оба по 22): высокая ≥40, средняя 20–39,
// низкая <20.
//
// Цвета прошли три захода: (1) один оттенок красного (ordinal-рамп) —
// владелец: сплошной красный читается как "тревога" везде; (2) статусная
// триада проекта (--color-success/warning/danger из index.css) —
// владелец одобрил зелёный→жёлтый→красный по смыслу, но захотел более
// яркую/насыщенную версию тех же трёх цветов; (3) те же три цвета
// пересчитаны через HSL (насыщенность +25, светлота −8 от пастельного
// черновика, который отдельно показывался на согласование через
// Artifact) — финальная версия. Не токены проекта, отдельные hex, т.к.
// готовая триада success/warning/danger не подошла по яркости, а более
// яркого варианта в дизайн-системе нет. Текст на плитках — везде тёмный
// ink (contrast() из validate_palette.js даёт 7.4–12.9:1 на все три
// цвета, белый текст здесь не нужен).
type DensityTier = 'low' | 'medium' | 'high';

const DENSITY_TIER_STYLE: Record<DensityTier, { bg: string; text: string }> = {
  low: { bg: '#92e7aa', text: '#14151a' },
  medium: { bg: '#fbd47a', text: '#14151a' },
  high: { bg: '#f1887c', text: '#14151a' },
};

const DENSITY_TIER_LABEL: Record<DensityTier, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
};

function densityTier(count: number): DensityTier {
  if (count >= 40) return 'high';
  if (count >= 20) return 'medium';
  return 'low';
}

const densityData: { icon: LucideIcon; label: string; count: number }[] = [
  { icon: Scissors, label: 'Салоны красоты', count: beautyTotal },
  { icon: Coffee, label: 'Общепит', count: foodServiceTotal },
  { icon: ShoppingBasket, label: 'Продукты', count: groceryTotal },
  { icon: Flower2, label: 'Цветы', count: flowerTotal },
  { icon: Package, label: 'ПВЗ', count: pvzTotal },
  { icon: Pill, label: 'Аптеки', count: pharmacyTotal },
  { icon: Cigarette, label: 'Табак / вейп', count: tobaccoVapeTotal },
  { icon: CreditCard, label: 'Банки', count: bankPointsTotal },
  { icon: Dumbbell, label: 'Спорт и фитнес', count: sportTotal },
];

// Строка не показывается, если для текущего типа сделки по ней нет ни
// одного предложения. Сам порядок — MARKET_PROPERTY_TYPES (data/marketOffers.ts),
// общий со страницей верификации /admin/market-offers.
const MARKET_PROPERTY_TYPE_ORDER = MARKET_PROPERTY_TYPES;

interface MarketPivotCell {
  count: number;
  medianPrice: number;
}

interface MarketPivotRow {
  propertyType: string;
  cells: (MarketPivotCell | null)[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Цена помещений с отделкой и без — это принципиально разные рынки (голый
// бетон стоит заметно дешевле готового к въезду), поэтому таблица не
// схлопывает finish_status в общую цифру, а показывает выбранный статус
// отдельно (переключатель ниже). Медиана считается прямо здесь из сырых
// объявлений — не из чужого предпосчитанного агрегата — поэтому правки
// владельца на /admin/market-offers сразу видны и тут.
//
// В таблицу попадают только reviewed=true объявления — сырые данные с
// Kufar/Realt часто путают отделку/тип/площадь (см. комментарии в
// scripts/sync-*-market-offers.mjs), непроверенная строка может исказить
// публичную статистику неправильной ценой. Как только Светлана
// верифицирует объявление на /admin/market-offers, оно на этой же
// перезагрузке страницы появится в сводке — без отдельного шага "включить
// в статистику".
function buildMarketPivot(offers: MarketOffer[], dealType: 'sale' | 'rent', finishStatus: string): MarketPivotRow[] {
  const byType = new Map<string, Map<string, number[]>>();

  for (const offer of offers) {
    if (!offer.reviewed || offer.dealType !== dealType || offer.finishStatus !== finishStatus) continue;
    if (!byType.has(offer.propertyType)) byType.set(offer.propertyType, new Map());
    const byBucket = byType.get(offer.propertyType)!;
    const bucket = areaBucket(netSize(offer));
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(netPricePerSqm(offer));
  }

  return MARKET_PROPERTY_TYPE_ORDER.filter((type) => byType.has(type)).map((propertyType) => {
    const byBucket = byType.get(propertyType)!;
    const cells = AREA_BUCKET_ORDER.map((bucket) => {
      const prices = byBucket.get(bucket);
      return prices ? { count: prices.length, medianPrice: Math.round(median(prices)) } : null;
    });
    return { propertyType, cells };
  });
}

function countSmallFinishedOffices(offers: MarketOffer[], dealType: 'sale' | 'rent'): number {
  return offers.filter(
    (o) =>
      o.reviewed && o.dealType === dealType && o.propertyType === 'Офисы' && netSize(o) < 40 && o.finishStatus === 'с отделкой',
  ).length;
}

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function formatLatestUpdate(offers: MarketOffer[]): string {
  const latest = offers.reduce((max, o) => (o.updatedAt > max ? o.updatedAt : max), offers[0].updatedAt);
  const date = new Date(latest);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const MARKET_FINISH_OPTIONS = ['С отделкой', 'Без отделки', 'Не указано'] as const;
const MARKET_FINISH_TO_DB: Record<(typeof MARKET_FINISH_OPTIONS)[number], string> = {
  'С отделкой': 'с отделкой',
  'Без отделки': 'без отделки',
  'Не указано': 'не указано',
};

const metroStations = ['Ковальская Слобода', 'Аэродромная'];
const busRoutes = ['4', '47с', '53', '56', '73', '84', '100', '107', '124', '172'];
const trolleyRoutes = ['19', '27', '59', '82'];

// Портрет арендаторов — прислан владельцем (2026-08-22), собственный анализ.
// Перегруппирован через Gemini под технические маркеры формата помещения
// (метраж + факторы успеха) вместо оригинального деления "сферы/критерии" —
// владелец согласовал такую структуру. Бренд-примеры из исходного портрета
// сохранены там, где укладываются в новую категорию; для новой категории
// "офисы и клиентские сервисы" (её не было в исходном портрете) — своих
// примеров нет, только факторы. Один пример аптечной сети из присланного
// текста был нечитаем из-за битой кодировки при копировании ("In塗то") —
// разгадан позже как InLek (см. medicineHighlights выше, сеть из 5 аптек
// в районе по данным Яндекс.Карт), добавлен обратно в примеры.
const tenantProfiles: { icon: LucideIcon; title: string; examples: string; footage: string; criteria: string }[] = [
  {
    icon: Store,
    title: 'Сетевой ритейл, аптеки, спецмагазины',
    examples: 'Аптеки (InLek, «Остров здоровья»), алкомаркеты («7 пятниц», «Вино»), кофейни (DOPE, «Варка»)',
    footage: '60–150 м²',
    criteria: 'Первая линия, витринное остекление, свободная планировка, высокий пешеходный трафик',
  },
  {
    icon: Sparkles,
    title: 'Медицина, стоматология, бьюти-сфера',
    examples: 'Салоны красоты, барбершопы, студии пилатеса и йоги, медлаборатории (Synevo, Invitro)',
    footage: '40–100 м²',
    criteria: 'Разводка мокрых точек под каждый кабинет, условия для приточно-вытяжной вентиляции',
  },
  {
    icon: Building2,
    title: 'Офисы и клиентские сервисы',
    examples: '',
    footage: 'от 50 м²',
    criteria: 'Близость к метро для сотрудников, представительская входная группа, open-space или кабинеты',
  },
  {
    icon: Package,
    title: 'ПВЗ и крафтовый бизнес',
    examples: 'Wildberries, Ozon, Европочта, СДЭК; авторские пекарни, цветочные бутики, детские центры',
    footage: '25–60 м²',
    criteria: 'Локация внутри жилых кварталов, соседство с детскими площадками, невысокая ставка',
  },
];

// "Виды коммерческой недвижимости в Минск Мире" (владелец, август 2026) —
// список типов задан явно, тексты по каждому владелец даст отдельно
// ("дам разные вводные, пока заложи блок"), поэтому description пока null
// и рендерится плейсхолдером (см. ниже) — НЕ придумывать формулировки
// заранее, только по факту присланных данных.
// Отдельно от MARKET_PROPERTY_TYPES (data/marketOffers.ts, Офисы/Торговые
// помещения/Кладовые) — та тройка про сырые объявления с Kufar/Realt для
// сводной таблицы цен, здесь же более широкий описательный список,
// включающий форматы, которых в парсинге нет вовсе (бизнес-апартаменты,
// машиноместа, площади в Avia Mall и МФЦ).
interface DistrictPropertyType {
  icon: LucideIcon;
  title: string;
  description: string | null;
}

const districtPropertyTypes: DistrictPropertyType[] = [
  { icon: Store, title: 'Торговые помещения', description: null },
  { icon: BedDouble, title: 'Бизнес-апартаменты', description: null },
  { icon: Briefcase, title: 'Офисные помещения', description: null },
  { icon: Car, title: 'Машиноместа на паркингах', description: null },
  { icon: CircleParking, title: 'Подземные машиноместа', description: null },
  { icon: Archive, title: 'Кладовые', description: null },
  { icon: ShoppingBag, title: 'Помещения в ТЦ Avia Mall', description: null },
  { icon: Landmark, title: 'Офисы в Минском международном финансовом центре', description: null },
];

// FAQ — только проверенные темы (владелец явно исключил "согласование
// вывесок" и "готовность объектов" — по ним нет проверенных фактов).
const districtFaq: FaqItem[] = [
  {
    question: 'Как добраться до коммерческих объектов на общественном транспорте?',
    answer:
      'Две станции метро Зеленолужской линии — «Ковальская Слобода» и «Аэродромная», плюс 14 маршрутов наземного транспорта (10 автобусных, 4 троллейбусных), связывающих район со всеми частями Минска.',
  },
  {
    question: 'Как решён вопрос с парковкой для клиентов и сотрудников?',
    answer: 'В районе есть многоуровневые паркинги и подземные паркинги в жилых домах.',
  },
  {
    question: 'Сколько детских садов и школ рядом?',
    answer:
      'В районе действуют 3 школы и 4 детских сада (строится 5-й). Через дорогу от Red One — ещё 5 детских садов.',
  },
  {
    question: 'Что из крупной торговой инфраструктуры уже работает?',
    answer: 'Avia Mall — 138 200 м², якорный арендатор — сеть гипермаркетов Green.',
  },
  {
    question: 'Где находится Red One относительно района?',
    answer:
      'По соседству с Минск Миром — не на его территории, но в непосредственной близости, с быстрым доступом к метро и основным магистралям района.',
  },
];

// Боковое меню-оглавление (владелец, август 2026) — якоря на все основные
// H2-секции страницы по порядку их появления. id совпадает с якорем в href
// и вешается прямо на обёртку каждой секции (scroll-mt-6 на них — небольшой
// отступ сверху при переходе, чтобы заголовок не упирался в край экрана).
// Показывается только от lg и выше (см. рендер) — на мобильном/планшете
// после узкой колонки контента для него просто нет места сбоку.
// Иконка каждого пункта — та же, что и у заголовка соответствующей секции
// (см. рендер ниже), не своя отдельная: так пункт меню сразу узнаётся на
// самой секции при переходе, а не выглядит как случайно другая картинка.
// У "Частые вопросы"/"Red One" своей иконки в заголовке секции нет (FAQ —
// просто текст, Red One — CTA-блок без иконки), для меню всё равно нужна
// своя — CircleHelp/ArrowRight не заняты нигде на странице.
// Верхнее меню страницы (шапка) — отдельно от бокового оглавления
// SECTION_NAV ниже: то список якорей внутри ЭТОЙ страницы, а тут —
// переходы на другие страницы сайта (лендинг Red One, аналитика по
// районам). Раскрывается и наведением (owner: "должно автоматически
// раскрываться при наведении"), и кликом (совместимость с touch — там
// hover не срабатывает надёжно); закрывается кликом вне себя — тот же
// приём, что и mobileNavOpen ниже, только без затемнения (мелкий
// дропдаун, не полноэкранная шторка).
function AnalyticsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 hover:text-ink">
        Аналитика
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 flex w-52 flex-col gap-0.5 rounded-control border border-border bg-surface p-2 shadow-card">
          {DISTRICTS.map((d) => (
            <Link
              key={d.slug}
              to={`/minsk/analytics/${d.slug}`}
              onClick={() => setOpen(false)}
              className="rounded-control px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {d.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const SECTION_NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'developer', label: 'Застройщик', icon: HardHat },
  { id: 'audience', label: 'Целевая аудитория', icon: Users },
  { id: 'traffic', label: 'Генераторы трафика', icon: Landmark },
  { id: 'population-density', label: 'Плотность населения', icon: Building2 },
  { id: 'business-density', label: 'Плотность бизнеса', icon: Grid2x2 },
  { id: 'property-types', label: 'Виды недвижимости', icon: Layers },
  { id: 'market', label: 'Рынок недвижимости', icon: TrendingUp },
  { id: 'business-analytics', label: 'Аналитика по сферам бизнеса', icon: LayoutGrid },
  { id: 'tenant-profiles', label: 'Решения под бизнес', icon: Store },
  { id: 'transport', label: 'Транспорт и парковка', icon: TrainFront },
  { id: 'map', label: 'Карта района', icon: MapPin },
  { id: 'faq', label: 'Частые вопросы', icon: CircleHelp },
  { id: 'red-one', label: 'Red One', icon: ArrowRight },
];

// Гид для предпринимателей и собственников коммерческой недвижимости, не
// продающая страница объекта (SEO_PLAN.md, Э3-1) — по Wordstat «минск мир»
// это на 99%+ спрос на квартиры (см. журнал плана), узкая коммерческая
// часть держится на паре тысяч показов в месяц, а «район минск мир» —
// отдельная, более осмысленная для нас фраза. Обратной ссылки с /one сюда
// нет осознанно — решение владельца не отвлекать с продающей страницы.
export function DistrictGuidePage() {
  const [marketOffers, setMarketOffers] = useState<MarketOffer[] | null>(null);
  const [marketDealType, setMarketDealType] = useState<'Продажа' | 'Аренда'>('Продажа');
  const [marketFinish, setMarketFinish] = useState<(typeof MARKET_FINISH_OPTIONS)[number]>('С отделкой');

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: '2026-08-22',
      dateModified: DATE_MODIFIED,
    });
    setFaqJsonLd(districtFaq);
  }, []);

  useEffect(() => {
    fetchMarketOffers()
      .then(setMarketOffers)
      .catch(() => setMarketOffers([]));
  }, []);

  // Плавный переход по якорям бокового меню-оглавления (SECTION_NAV ниже) —
  // scroll-behavior работает только на реальном скролл-контейнере страницы
  // (html), не на произвольном div, поэтому включаем/выключаем классом на
  // документе, а не в CSS этой конкретной страницы.
  useEffect(() => {
    document.documentElement.classList.add('scroll-smooth');
    return () => document.documentElement.classList.remove('scroll-smooth');
  }, []);

  // Меню-оглавление держим на position:fixed, а не sticky: body/#root в
  // index.css намеренно носят overflow-x:hidden (фикс мобильного off-canvas
  // сайдбара, см. комментарий там) — по спецификации CSS это принудительно
  // переводит overflow-y в auto ДАЖЕ если он нигде явно не задан и даже если
  // явно прописать overflow-y:visible поверх (проверено вручную), а это в
  // свою очередь ломает position:sticky для любых потомков на всём сайте.
  // fixed этой проблемы не боится (её ломают только transform/filter у
  // предков, которых тут нет) — но сам не привязан к колонке сетки, поэтому
  // width/left измеряем от реального узла aside и держим в стейте.
  const navAsideRef = useRef<HTMLElement>(null);
  const [navBox, setNavBox] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    function measure() {
      const rect = navAsideRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) setNavBox({ left: rect.left, width: rect.width });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Меню-оглавление ниже lg — тот же паттерн шторки, что и в админке
  // (components/layout/Sidebar.tsx/AppLayout.tsx): плавающая кнопка вместо
  // постоянно видимой колонки (для неё просто нет места на узком экране),
  // открывает панель поверх контента с затемнением фона.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-svh bg-bg">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-30 flex items-center gap-2 px-4 py-3 text-sm font-semibold text-ink lg:hidden',
          glassPillClass,
        )}
        style={glassPillShadow}
      >
        <Menu className="h-4 w-4 shrink-0" />
        Содержание гайда
      </button>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-svh w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto border-r border-white/50 bg-white/70 px-5 py-6 backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200 ease-out lg:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Содержание гайда</span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Закрыть меню"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {SECTION_NAV.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={() => setMobileNavOpen(false)}
            className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:text-primary"
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </a>
        ))}
      </aside>

      {/* Шапка выровнена по той же сетке, что и основной контент ниже
          (lg:grid-cols-[200px_1fr]) — но не общим блоком во второй
          колонке (так было в прошлом заходе, владелец поправил разметкой
          на скриншоте: красным обвёл логотип, зелёным — меню). Логотип —
          в ПЕРВОЙ колонке, там же, где ниже начинается боковое
          оглавление; меню "Аналитика"/Red One — во ВТОРОЙ, там же, где
          начинается hero-карточка, прижато к левому краю этой колонки
          (не justify-between до правого края страницы). Ниже lg обе
          колонки становятся одним flex-рядом на всю ширину, как и раньше. */}
      <div className="border-b border-border py-5">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <div className="flex items-center justify-between lg:grid lg:grid-cols-[200px_1fr] lg:items-center lg:gap-10">
            <Link to="/minsk" className="shrink-0 text-lg font-extrabold tracking-wide text-ink">
              <span className="font-black text-primary">RED</span>EVELOPMENT
            </Link>
            <nav className="hidden items-center gap-6 text-sm font-medium text-ink-muted sm:flex">
              <Link to="/minsk/one" className="transition-colors hover:text-ink">
                Деловой центр Red One
              </Link>
              <AnalyticsMenu />
            </nav>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
          <aside ref={navAsideRef} className="hidden lg:block">
            <nav
              className={cn(
                'fixed top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-0.5 overflow-y-auto p-3 text-sm',
                glassCardClass,
              )}
              style={navBox ? { ...glassCardShadow, left: navBox.left, width: navBox.width } : { visibility: 'hidden' }}
            >
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">На странице</p>
              {SECTION_NAV.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-center gap-2 rounded-control px-2 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {/* Единая liquid-glass подложка под заголовком/подзаголовком и фото —
            раньше текст стоял прямо на фоне страницы, а фото было в своей
            отдельной рамке; теперь один блок. Колонки не 50/50
            (sm:grid-cols-2), а 3:2 — заголовку описания больше не тесно,
            фото просто пропорционально сузилось вместе со своей колонкой
            (aspect-[4/5] не трогали). Карточки с цифрами (было четыре
            плитки прямо тут) убраны с первого экрана — переехали ниже,
            за карточку застройщика (см. statTiles). */}
        <div
          className={cn('grid grid-cols-1 gap-6 p-6 sm:grid-cols-[3fr_2fr] sm:items-center sm:p-8', glassCardClass)}
          style={glassCardShadow}
        >
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
            <p className="text-base text-ink-muted">{INTRO_TEXT}</p>
            {/* Пометка свежести — владелец: "чтобы инфа выглядела супер-
                актуальной", спокойный зелёный, не просто блёклый текст.
                BadgeCheck вместо точки/иконки календаря — читается как
                "проверено", не только "когда-то обновлено". */}
            <span className="flex w-fit items-center gap-1.5 rounded-full border border-success/30 bg-success-bg px-3 py-1 text-xs font-semibold text-success">
              <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
              Обновлено: август 2026
            </span>
          </div>
          <div className="mx-auto w-full max-w-xs sm:max-w-none">
            <HeroImageSlider images={HERO_IMAGES} alt="Аэрофото района Минск Мир" aspectClassName="aspect-[4/5]" />
          </div>
        </div>

        <div id="developer" className={cn('flex scroll-mt-6 flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <HardHat className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Застройщик района</h2>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <img src={DEVELOPER_LOGO_URL} alt="Dana Holdings" className="h-9 w-auto object-contain" />
            <div className="flex flex-wrap gap-2">
              {DEVELOPER_LINKS.map(({ label, url }) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-ink hover:bg-border"
                >
                  {label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Dana Holdings</span> — международная группа компаний со штаб-квартирой
            в Швейцарии, на белорусском рынке с 2006 года. В Минске холдингу принадлежат ещё несколько проектов —
            «Маяк Минска», Vogue, «Вивальди», «Рахманинов». Заявленный масштаб Минск Мира — 320 га, около 30 тысяч
            квартир и порядка $3,5 млрд инвестиций.
          </p>
          <div className="flex flex-col gap-1.5 pt-1 text-sm text-ink-muted">
            <a href={DEVELOPER_CONTACTS.phoneHref} className="flex w-fit items-center gap-2 text-ink hover:underline">
              <Phone className="h-4 w-4 shrink-0" />
              {DEVELOPER_CONTACTS.phone}
            </a>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{DEVELOPER_CONTACTS.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{DEVELOPER_CONTACTS.hours}</span>
            </div>
          </div>
        </div>

        {/* Переехали с первого экрана (были прямо под hero) — владелец
            попросил освободить первый экран под чисто главный блок. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTiles.map(({ icon: Icon, value, label }) => (
            <div key={label} className={cn('flex flex-col gap-2 p-4', glassCardClass)} style={glassCardShadow}>
              <span
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center text-ink', glassPillClass)}
                style={glassPillShadow}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="text-lg font-extrabold text-ink">{value}</div>
              <p className="text-xs leading-snug text-ink-muted">{label}</p>
            </div>
          ))}
        </div>

        <div id="audience" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Целевая аудитория и покупательская способность</h2>
          </div>
          <ul className="flex flex-col gap-2">
            {audienceHighlights.map(({ label, text }) => (
              <li key={label} className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">{label}</span> {text}
              </li>
            ))}
          </ul>
        </div>

        <div id="traffic" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Landmark className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Генераторы ежедневного трафика</h2>
          </div>
          <ul className="flex flex-col gap-2">
            {trafficHighlights.map(({ label, text }) => (
              <li key={label} className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">{label}</span> {text}
              </li>
            ))}
          </ul>
        </div>

        <div id="population-density" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Плотность населения</h2>
          </div>
          {densityComparisons.map(({ label, value }) => {
            const isDistrict = value === DISTRICT_DENSITY_PER_HECTARE;
            return (
              <div key={label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn('text-sm', isDistrict ? 'font-semibold text-ink' : 'text-ink-muted')}>
                    {label}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value} чел/га</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={cn('h-full rounded-full', isDistrict ? 'bg-primary' : 'bg-ink/30')}
                    style={{ width: `${Math.round((value / DISTRICT_DENSITY_PER_HECTARE) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-sm text-ink-muted">
            Почти в {densityVsAvgRatioLabel} раза плотнее, чем в среднем по Минску, и почти в {densityRatioLabel} раза
            выше верхней границы норматива «высокоплотной» застройки — высокая концентрация потенциальных клиентов
            прямо внутри жилых кварталов.
          </p>
        </div>

        <div id="business-density" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Grid2x2 className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Плотность бизнеса по нишам</h2>
          </div>
          <p className="text-sm text-ink-muted">Число точек по каждой категории бизнеса в районе.</p>
          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
            {densityData.map(({ icon: Icon, label, count }) => {
              const tier = DENSITY_TIER_STYLE[densityTier(count)];
              return (
                <div
                  key={label}
                  className="flex flex-col gap-2 rounded-control p-3"
                  style={{ backgroundColor: tier.bg, color: tier.text }}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <div className="text-2xl font-black leading-none">{count}</div>
                  <p className="text-xs font-medium leading-snug">{label}</p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {(['low', 'medium', 'high'] as DensityTier[]).map((tier) => (
              <div key={tier} className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: DENSITY_TIER_STYLE[tier].bg }}
                />
                <span className="text-xs text-ink-muted">{DENSITY_TIER_LABEL[tier]}</span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2.5 rounded-control bg-warning-bg px-4 py-3">
            <TriangleAlert className="h-4 w-4 shrink-0 translate-y-0.5 text-warning" />
            <p className="text-sm text-warning">
              Высокая плотность — это не только высокая конкуренция, но и доказательство высокого спроса. Каждую
              нишу стоит оценивать отдельно.
            </p>
          </div>
        </div>

        <div id="property-types" className={cn('flex scroll-mt-6 flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Виды коммерческой недвижимости в Минск Мире</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {districtPropertyTypes.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex flex-col gap-2 rounded-control border border-white bg-white/60 p-4 sm:border-white/50 sm:bg-white/40"
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center text-ink', glassPillClass)} style={glassPillShadow}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-ink">{title}</span>
                <p className="text-xs text-ink-faint">{description ?? 'Текст добавим отдельно'}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="market" className={cn('flex scroll-mt-6 flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 shrink-0 text-ink" />
              <h2 className="text-lg font-bold text-ink">Рынок коммерческой недвижимости</h2>
            </div>
            {marketOffers && marketOffers.length > 0 && (
              <span className="text-xs text-ink-faint">Kufar · {formatLatestUpdate(marketOffers)}</span>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            Действующие предложения продажи и аренды коммерческих помещений в Минск Мире — количество и медианная
            цена за м² по типу помещения и площади. Обновляется раз в месяц.
          </p>

          {marketOffers === null && <p className="text-sm text-ink-faint">Загрузка…</p>}
          {marketOffers !== null && marketOffers.length === 0 && (
            <p className="text-sm text-ink-faint">Данные пока не собраны.</p>
          )}

          {marketOffers && marketOffers.length > 0 && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <ToggleGroup
                  options={['Продажа', 'Аренда']}
                  value={marketDealType}
                  onChange={(value) => setMarketDealType(value as 'Продажа' | 'Аренда')}
                />
                <ToggleGroup
                  label="Отделка"
                  options={[...MARKET_FINISH_OPTIONS]}
                  value={marketFinish}
                  onChange={(value) => setMarketFinish(value as (typeof MARKET_FINISH_OPTIONS)[number])}
                />
              </div>
              <p className="text-xs text-ink-faint">
                Цена с отделкой и без — разные рынки, поэтому не смешиваем их в одной цифре.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 text-left">Тип помещения</th>
                      {AREA_BUCKET_ORDER.map((bucket) => (
                        <th key={bucket} className="py-2 px-2 text-right font-semibold">
                          {bucket}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {buildMarketPivot(
                      marketOffers,
                      marketDealType === 'Продажа' ? 'sale' : 'rent',
                      MARKET_FINISH_TO_DB[marketFinish],
                    ).map((row) => (
                      <tr key={row.propertyType}>
                        <td className="py-2.5 pr-3 font-medium text-ink">{row.propertyType}</td>
                        {row.cells.map((cell, i) => (
                          <td key={i} className="py-2.5 px-2 text-right tabular-nums">
                            {cell ? (
                              <>
                                <div className="font-semibold text-ink">{cell.count}</div>
                                <div className="text-xs text-ink-faint">
                                  {cell.medianPrice} $/м²{marketDealType === 'Аренда' ? '/мес' : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-faint">Сверху — количество предложений, снизу — медианная цена за м².</p>

              <div className="flex items-start gap-2.5 rounded-control border border-success/30 bg-success-bg px-4 py-3">
                <Sparkles className="h-4 w-4 shrink-0 translate-y-0.5 text-success" />
                <p className="text-sm text-ink">
                  Небольших офисов (до 40 м²) с готовой отделкой в районе почти нет:{' '}
                  <span className="font-semibold text-success">
                    {countSmallFinishedOffices(marketOffers, 'sale')} предложение на продажу
                  </span>{' '}
                  и{' '}
                  <span className="font-semibold text-success">
                    {countSmallFinishedOffices(marketOffers, 'rent')} в аренду
                  </span>{' '}
                  на весь Минск Мир. Red One закрывает именно этот дефицит —{' '}
                  <Link to="/minsk/one" className="font-semibold underline">
                    кабинеты с отделкой под ключ
                  </Link>
                  .
                </p>
              </div>
            </>
          )}
        </div>

        <div id="business-analytics" className={cn('flex scroll-mt-6 flex-col', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <LayoutGrid className="h-4 w-4 shrink-0 text-ink-faint" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Аналитика по сферам бизнеса
            </h2>
          </div>
          <div className="flex flex-col divide-y divide-border">
        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Stethoscope className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Медицина и здоровье</h3>
          </div>
          <ul className="flex flex-col gap-2">
            {medicineHighlights.map(({ label, text }) => (
              <li key={label} className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">{label}</span> {text}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-sm font-semibold text-ink">Частная медицина и специализированный бизнес:</p>
            <ul className="flex flex-col gap-1 pl-4">
              {medicinePrivateList.map(({ label, text }) => (
                <li key={label} className="list-disc text-sm text-ink-muted marker:text-ink-faint">
                  <span className="font-semibold text-ink">{label}</span> {text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Coffee className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Общепит: кафе, рестораны, бары</h3>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{foodServiceTotal} заведений общепита</span> в шаговой
            доступности — плотное покрытие с явным перекосом в кафе и кофейни, что логично для портрета аудитории
            района. Локальная сеть Varka («Варка») — 5 точек.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {foodServiceBreakdown.map(({ label, count }) => (
              <span key={label} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink">
                {label} — {count}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Dumbbell className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Спорт и фитнес</h3>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            В районе работает <span className="font-semibold text-ink">{sportTotal} залов и студий</span> — от
            классических тренажёрных залов до узкоспециализированных практик. Большинство,{' '}
            <span className="font-semibold text-ink">{sportBreakdown[0].count}</span>, — тренажёрные залы и
            фитнес-клубы полного цикла; ещё <span className="font-semibold text-ink">{sportBreakdown[1].count}</span>{' '}
            точки — студии с акцентом на растяжку и осознанность: йога, пилатес, стретчинг. Спортивная
            инфраструктура в шаговой доступности уже сформирована — конкуренция за помещение под эту нишу будет
            только расти.
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Банки и банкоматы</h3>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{bankNamesCount} разных банков</span> в районе ({bankPointsTotal}{' '}
            точек) — у {bankBranchCount} есть полноценное отделение, у всех — банкомат.
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 pt-1 sm:grid-cols-2">
            {bankMatrix.map(({ label, hasBranch, hasAtm }) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-border py-1.5">
                <span className="text-sm font-medium text-ink">{label}</span>
                <div className="flex shrink-0 gap-1">
                  {hasBranch && (
                    <span className="flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      <Building2 className="h-2.5 w-2.5 shrink-0" />
                      Отделение
                    </span>
                  )}
                  {hasAtm && (
                    <span className="flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      <Banknote className="h-2.5 w-2.5 shrink-0" />
                      Банкомат
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Wrench className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">СТО и автосервисы</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-control border border-dashed border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">В самом районе</p>
              <p className="text-sm text-ink-muted">
                Профильных точек почти нет — Минск Мир жилой, не под авто-бизнес.
              </p>
            </div>
            <div className="flex flex-col gap-1 rounded-control border border-white bg-white/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">По соседству</p>
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">
                  {autoServiceClusterCount} из {autoServiceTotal} точек
                </span>{' '}
                СТО, шиномонтажа и автозапчастей — на улицах {autoServiceClusterStreets}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Scissors className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Салоны красоты и бьюти-сфера</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-black leading-none text-primary">{beautyTotal}</span>
            <span className="pb-1 text-sm text-ink-muted">
              салонов и студий — один из самых насыщенных сегментов района
            </span>
          </div>
          <p className="text-xs text-ink-faint">
            Лидируют ногтевые студии ({beautyBreakdown[0].count}) и парикмахерские ({beautyBreakdown[1].count});
            также широко представлены стилисты, косметология, брови и ресницы, барбершопы.
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <ShoppingBasket className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Магазины продуктов</h3>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{groceryTotal} точки</span> — от крупных сетей до независимых
            лавок и специализированных магазинов.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {groceryBreakdown.map(({ label, count }) => (
              <div key={label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-muted">{label}</span>
                  <span className="shrink-0 text-xs font-semibold text-ink">{count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-ink/70"
                    style={{ width: `${Math.round((count / groceryMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Пункты выдачи заказов</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-black leading-none text-primary">{pvzTotal}</span>
            <span className="pb-1 text-sm text-ink-muted">
              точка Ozon и Wildberries — сильный спрос на маркетплейсы
            </span>
          </div>
          <p className="text-xs text-ink-faint">
            Wildberries — {pvzWildberriesCount}, Ozon — {pvzOzonCount}
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Flower2 className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Цветочные магазины и флористы</h3>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">{flowerTotal} цветочных точек</span> и флористических студий
            работают в районе — заметная плотность для жилого квартала такого размера. У{' '}
            <span className="font-semibold text-ink">{flowerDeliveryCount} из них</span> есть доставка букетов день
            в день — признак зрелого локального рынка, где конкуренция идёт не только за витрину, но и за скорость
            сервиса.
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 py-6">
          <div className="flex items-center gap-3">
            <Cigarette className="h-5 w-5 shrink-0 text-ink" />
            <h3 className="text-base font-bold text-ink">Табак и вейп-шопы</h3>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{tobaccoVapeTotal} точки</span> в районе.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {tobaccoVapeBreakdown.map(({ label, count }) => (
              <div key={label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-muted">{label}</span>
                  <span className="shrink-0 text-xs font-semibold text-ink">{count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-ink/70"
                    style={{ width: `${Math.round((count / tobaccoVapeMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
          </div>
        </div>

        <div id="tenant-profiles" className={cn('flex scroll-mt-6 flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Готовые решения под ваш тип бизнеса</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tenantProfiles.map(({ icon: Icon, title, examples, footage, criteria }) => (
              <div
                key={title}
                className="flex flex-col gap-2 rounded-control border border-white bg-white/90 p-4 shadow-card backdrop-blur-md sm:border-white/50 sm:bg-white/40 sm:shadow-none"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center text-ink', glassPillClass)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold text-ink">{title}</span>
                </div>
                {examples && <p className="text-xs text-ink-muted">{examples}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink">{footage}</span>
                </div>
                <p className="text-xs text-ink-faint">{criteria}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="transport" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <TrainFront className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Транспорт и парковка</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Рядом — Национальный аэропорт Минск и Южная магистраль, удобный выезд на кольцевую.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-semibold text-ink-muted">
                <img src="/icons/minsk-metro-line3.png" alt="" className="h-4 w-auto" />
                Метро:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {metroStations.map((s) => (
                  <span key={s} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-semibold text-ink-muted">
                <Bus className="h-3.5 w-3.5" />
                Автобусы:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {busRoutes.map((r) => (
                  <span key={r} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-semibold text-ink-muted">
                <TramFront className="h-3.5 w-3.5" />
                Троллейбусы:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {trolleyRoutes.map((r) => (
                  <span key={r} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Car className="h-4 w-4 shrink-0 text-ink-muted" />
            <p className="text-sm text-ink-muted">Многоуровневые и подземные паркинги в жилых домах района.</p>
          </div>
        </div>

        {MAP_EMBED_URL && (
          <div id="map" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-ink" />
              <h2 className="text-lg font-bold text-ink">Карта района</h2>
            </div>
            <div className="overflow-hidden rounded-control border border-border">
              <iframe src={MAP_EMBED_URL} title="Карта района Минск Мир" className="h-80 w-full" loading="lazy" />
            </div>
          </div>
        )}

        <FaqAccordion id="faq" title="Частые вопросы о районе" items={districtFaq} />

        <div id="red-one" className={cn('flex scroll-mt-6 flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Red One — готовый центр коммерческой активности</h2>
          <p className="text-sm text-ink-muted">
            Приватные кабинеты и фиксированные рабочие места в собственном здании по соседству с Минск Миром — с
            дизайнерской отделкой, парковкой и онлайн-бронированием без предоплаты. Через дорогу — 5 детских садов
            и постоянный поток родителей утром и вечером, в районе — 3 школы и 4 детских сада (строится 5-й).
          </p>
          <Link to="/minsk/one" className="w-fit text-sm font-semibold text-primary hover:underline">
            Смотреть кабинеты в Red One →
          </Link>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus,
  Building2,
  Car,
  Cigarette,
  Coffee,
  CreditCard,
  Dumbbell,
  Flower2,
  Landmark,
  MapPin,
  Package,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Store,
  TrainFront,
  TramFront,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setFaqJsonLd } from '../lib/pageMeta';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import type { FaqItem } from '../components/ui/FaqAccordion';

const PAGE_URL = 'https://redevelopment.pro/rayon-minsk-mir';
const TITLE = 'Офисы и коммерческие помещения в районе Минск Мир';
const DESCRIPTION =
  'Коммерческая недвижимость в районе Минск Мир: готовая аудитория, транспорт, банки и МФЦ, медицина, форматы помещений под любой бизнес. Гид для арендаторов и собственников.';
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
const DISTRICT_COORDS = '53°52′04″ с.ш. 27°32′37″ в.д.';

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

const medicineHighlights: { label: string; text: string }[] = [
  {
    label: 'Государственный якорь.',
    text: '41-я городская поликлиника (ул. Кижеватова, 5а, открыта в январе 2026 года) обеспечивает первичную медицинскую помощь жителям и генерирует стабильный пешеходный трафик.',
  },
  {
    label: 'Высокая плотность фарм-ритейла.',
    text: 'В районе работают 22 аптеки. Крупнейшая сеть — InLek (5 филиалов), что подтверждает высокий спрос на товары для здоровья в шаговой доступности.',
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

// Банки/банкоматы — webarchive, поиск "банкоматы", 19 строк → 18 уникальных
// точек (1 дубль) → 11 разных банков (варианты написания вроде "Альфабанк,
// банкомат" объединены с "Альфа-Банк"). В выдаче вперемешку отделения и
// банкоматы — считаем точками присутствия банка, не буквально банкоматами.
const bankPointsTotal = 18;
const bankNamesCount = 11;
const bankBreakdown: { label: string; count: number }[] = [
  { label: 'Приорбанк', count: 2 },
  { label: 'Беларусбанк', count: 2 },
  { label: 'Альфа-Банк', count: 2 },
  { label: 'МТБанк', count: 2 },
  { label: 'Paritetbank', count: 2 },
  { label: 'Белинвестбанк', count: 2 },
  { label: 'Белагропромбанк', count: 2 },
  { label: 'Банк ВТБ', count: 1 },
  { label: 'БелВЭБ', count: 1 },
  { label: 'Белгазпромбанк', count: 1 },
  { label: 'Банк РРБ', count: 1 },
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

// Гид для предпринимателей и собственников коммерческой недвижимости, не
// продающая страница объекта (SEO_PLAN.md, Э3-1) — по Wordstat «минск мир»
// это на 99%+ спрос на квартиры (см. журнал плана), узкая коммерческая
// часть держится на паре тысяч показов в месяц, а «район минск мир» —
// отдельная, более осмысленная для нас фраза. Обратной ссылки с /one сюда
// нет осознанно — решение владельца не отвлекать с продающей страницы.
export function DistrictGuidePage() {
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

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 sm:px-8">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-ink-muted">Обновлено: август 2026</p>
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{TITLE}</h1>
          <p className="text-base text-ink-muted">
            Готовая платёжеспособная аудитория для вашего бизнеса в шаговой доступности от двух станций метро.
            По соседству — деловой центр Red One (Полтавская, 10).
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {DISTRICT_COORDS} · Октябрьский район Минска
          </p>
        </div>

        <HeroImageSlider images={HERO_IMAGES} alt="Аэрофото района Минск Мир" />

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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Landmark className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Генераторы ежедневного трафика</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Avia Mall (138 200 м², якорный арендатор — сеть гипермаркетов Green) — главный торговый центр района,
            межрайонный автомобильный и пешеходный поток. Рядом строится Международный финансовый центр — деловой
            кластер с пешеходными галереями и подземным паркингом, аккумулирует офисный трафик и B2B-сервисы.
          </p>
          <p className="text-sm text-ink-muted">
            Жители района активно ищут поблизости банковские отделения и расчётно-справочные центры (РСЦ) —
            помещения рядом с такими точками получают дополнительный целевой поток.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Stethoscope className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Медицина и здоровье</h2>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Coffee className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Общепит: кафе, рестораны, бары</h2>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Dumbbell className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Спорт и фитнес</h2>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Банки и банкоматы</h2>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{bankPointsTotal} банковских точек</span> в районе —{' '}
            {bankNamesCount} разных банков, от крупных государственных до частных сетевых.
          </p>
          <ol className="flex flex-col divide-y divide-border">
            {bankBreakdown.map(({ label, count }, index) => (
              <li key={label} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-ink-muted">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-ink">{label}</span>
                <span className="text-xs text-ink-faint">
                  {count} {count === 1 ? 'точка' : 'точки'}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Wrench className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">СТО и автосервисы</h2>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Scissors className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Салоны красоты и бьюти-сфера</h2>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <ShoppingBasket className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Магазины продуктов</h2>
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
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.round((count / groceryMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Пункты выдачи заказов</h2>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Flower2 className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Цветочные магазины и флористы</h2>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">{flowerTotal} цветочных точек</span> и флористических студий
            работают в районе — заметная плотность для жилого квартала такого размера. У{' '}
            <span className="font-semibold text-ink">{flowerDeliveryCount} из них</span> есть доставка букетов день
            в день — признак зрелого локального рынка, где конкуренция идёт не только за витрину, но и за скорость
            сервиса.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Cigarette className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Табак и вейп-шопы</h2>
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
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.round((count / tobaccoVapeMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cn('flex flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
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

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
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
          <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-ink" />
              <h2 className="text-lg font-bold text-ink">Карта района</h2>
            </div>
            <div className="overflow-hidden rounded-control border border-border">
              <iframe src={MAP_EMBED_URL} title="Карта района Минск Мир" className="h-80 w-full" loading="lazy" />
            </div>
          </div>
        )}

        <FaqAccordion title="Частые вопросы о районе" items={districtFaq} />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Red One — готовый центр коммерческой активности</h2>
          <p className="text-sm text-ink-muted">
            Приватные кабинеты и фиксированные рабочие места в собственном здании по соседству с Минск Миром — с
            дизайнерской отделкой, парковкой и онлайн-бронированием без предоплаты. Через дорогу — 5 детских садов
            и постоянный поток родителей утром и вечером, в районе — 3 школы и 4 детских сада (строится 5-й).
          </p>
          <Link to="/one" className="w-fit text-sm font-semibold text-primary hover:underline">
            Смотреть кабинеты в Red One →
          </Link>
        </div>
      </div>
    </div>
  );
}

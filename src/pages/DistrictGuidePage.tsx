import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, GraduationCap, TrainFront } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd } from '../lib/pageMeta';

const PAGE_URL = 'https://redevelopment.pro/rayon-minsk-mir';
const TITLE = 'Минск Мир для бизнеса: инфраструктура, транспорт, коммерческая недвижимость';
const DESCRIPTION =
  'Что в районе Минск Мир есть для бизнеса: метро Аэродромная, инфраструктура, деловой квартал. Обзор для тех, кто ищет офис или помещение по соседству.';
// Обновлять вручную при каждом квартальном пересмотре текста (см. SEO_PLAN.md, Э3-1).
const DATE_MODIFIED = '2026-08-22';

// Информационный гид, не продающая страница объекта (SEO_PLAN.md, Э3-1) —
// по Wordstat «минск мир» это на 99%+ спрос на квартиры (см. журнал плана),
// узкая офисная/коммерческая часть держится на паре сотен показов в месяц,
// а «район минск мир» — отдельная, более осмысленная для нас фраза (989/мес).
// Задача страницы — не биться за широкое «минск мир», а закрыть эту нишу и
// вести заинтересованных дальше на /one. Обратной ссылки с /one сюда нет
// осознанно — решение владельца не отвлекать с продающей страницы.
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
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">Бизнес в районе Минск Мир</h1>
          <p className="text-base text-ink-muted">
            Минск Мир — многофункциональный комплекс на месте бывшего аэропорта Минск-1: жильё, деловой квартал,
            парковая зона и крупнейший в Минске торговый центр Avia Mall. По соседству — деловой центр Red One
            (Полтавская, 10). Разберём, что в районе есть для бизнеса.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <TrainFront className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Транспорт</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Станция метро «Аэродромная» (открыта в 2024) расположена прямо на территории комплекса. Рядом —
            Национальный аэропорт Минск, удобный выезд на кольцевую.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Инфраструктура</h2>
          </div>
          <p className="text-sm text-ink-muted">
            В квартале работают три школы и четыре детских сада (строится пятый), детская и взрослая поликлиники.
            По соседству с Red One, через дорогу — ещё пять детских садов: актуально для сотрудников с детьми.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Деловая часть района</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Avia Mall — крупнейший торговый центр Минска, 138 200 м² (Братская, 18), якорный арендатор — сеть
            гипермаркетов Green. Рядом строится Международный финансовый центр — деловой кластер с пешеходными
            галереями и подземным паркингом.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Red One — по соседству с районом</h2>
          <p className="text-sm text-ink-muted">
            Приватные кабинеты и фиксированные рабочие места в собственном здании рядом с Минск Миром — с
            дизайнерской отделкой, парковкой и онлайн-бронированием без предоплаты.
          </p>
          <Link to="/one" className="w-fit text-sm font-semibold text-primary hover:underline">
            Смотреть кабинеты в Red One →
          </Link>
        </div>
      </div>
    </div>
  );
}

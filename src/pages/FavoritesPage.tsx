import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Heart, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/cn';
import { glassPillClass, glassPillShadow } from '../lib/glass';
import type { BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { fetchFavoriteList } from '../lib/favoritesApi';
import { favoritesShareUrl } from '../lib/favoritesContext';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';
import { errorMessage } from '../lib/errorMessage';
import { BusinessCenterCard } from './BusinessCentersMinskPage';

// Избранное без регистрации (владелец, 2026-09-21) — публичная ссылка,
// открывающая тот же список на любом устройстве по короткому id в URL, без
// аккаунта и личного кабинета. Список в поиске быть не должен — это чужая,
// собранная под себя подборка, не редакционная страница каталога.
function ShareLinkCard({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const url = favoritesShareUrl(id);

  function handleCopy() {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <Card className="flex flex-col gap-2 p-4 text-sm text-ink-muted">
      <p>Список доступен по этой ссылке. Сохраните её, если хотите вернуться к подборке.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 max-w-full truncate rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink">{url}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-primary hover:text-primary-hover"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 shrink-0" />
              Скопировано
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 shrink-0" />
              Скопировать
            </>
          )}
        </button>
      </div>
    </Card>
  );
}

export function FavoritesPage() {
  const { id } = useParams<{ id: string }>();
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchFavoriteList(id), fetchBusinessCenters()])
      .then(([list, all]) => {
        if (cancelled) return;
        setSlugs(list?.slugs ?? []);
        setCenters(all);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Не удалось загрузить избранное'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const favorites = centers && slugs ? centers.filter((c) => slugs.includes(c.slug)) : [];

  return (
    <div className="min-h-svh bg-bg">
      {/* Та же сквозная шапка, что и на остальных страницах каталога
          (владелец, 2026-09-22): подборка собирается из каталога, и уходить
          из неё человек будет туда же. Логотип отсюда убран — он в шапке. */}
      <CatalogTopNav centers={centers} width="max-w-5xl" />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight text-ink">
            <Heart className="h-6 w-6 shrink-0 fill-primary text-primary" />
            Избранные бизнес-центры
          </h1>
          <Link
            to="/minsk/bcminsk"
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:text-primary',
              glassPillClass,
            )}
            style={glassPillShadow}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Все бизнес-центры</span>
            <span className="sm:hidden">Все БЦ</span>
          </Link>
        </div>

        {id && <ShareLinkCard id={id} />}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем список...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && favorites.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">
            Список пуст — добавляйте бизнес-центры звёздочкой на карточке в каталоге.
          </Card>
        )}
        {!loading && !loadError && favorites.length > 0 && (
          // ВНИМАНИЕ: здесь намеренно НЕ grid, а flex с плитками фиксированной
          // ширины и без растягивания по высоте. Это третья попытка починить
          // один и тот же баг: в Safari карточка вытягивалась вниз на пол-экрана
          // пустоты при правильном квадратном фото. Первые две правили сетку
          // (сначала auto-fit/minmax, потом `1fr`-треки как в каталоге) — не
          // помогло, потому что дело не в ширине трека, а в двух местах, где
          // высота вообще может быть посчитана неверно, и оба надо убрать:
          //
          //   1. `items-stretch` + `h-full` внутри BusinessCenterCard — это
          //      `height:100%` против ряда, высота которого сама зависит от
          //      карточки. Круговая зависимость; Chrome её разрешает, Safari на
          //      ней плывёт. В каталоге не видно: там в ряду много карточек, и
          //      настоящая высота ряда всё равно больше любой ошибки. Здесь
          //      карточка в ряду одна — ошибка видна целиком.
          //   2. процентный `pt-[100%]` фотоподложки внутри трека, ширина
          //      которого на проходе intrinsic sizing ещё не определена.
          //
          // Плитка фиксированной ширины (320 px, на мобильном — вся ширина)
          // убирает второе: процент считается от заведомо известной ширины.
          // Обычный блок-обёртка вместо растягиваемого grid-элемента убирает
          // первое: `height:100%` против родителя с auto-высотой по спецификации
          // = `auto`, то есть высота по содержимому — самый старый и надёжный
          // путь в CSS, без круговых зависимостей. Цена — карточки в ряду не
          // выравниваются по нижнему краю; это осознанный размен на устойчивость.
          // Не переписывать обратно на grid + items-stretch.
          <div className="flex flex-wrap items-start gap-5">
            {favorites.map((c) => (
              <div key={c.slug} className="w-full sm:w-[320px]">
                <BusinessCenterCard center={c} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

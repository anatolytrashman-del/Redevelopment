import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import type { BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { fetchFavoriteList } from '../lib/favoritesApi';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';
import { errorMessage } from '../lib/errorMessage';
import { BusinessCenterCard } from './BusinessCentersMinskPage';

// Избранное без регистрации (владелец, 2026-09-21) — публичная ссылка,
// открывающая тот же список на любом устройстве по короткому id в URL, без
// аккаунта и личного кабинета. Список в поиске быть не должен — это чужая,
// собранная под себя подборка, не редакционная страница каталога.
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
    <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>

        <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight text-ink">
          <Heart className="h-6 w-6 shrink-0 fill-primary text-primary" />
          Избранные бизнес-центры
        </h1>

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
          <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((c) => (
              <BusinessCenterCard key={c.slug} center={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

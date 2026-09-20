import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Heart, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import type { BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,320px))] items-stretch justify-start gap-5">
            {favorites.map((c) => (
              <BusinessCenterCard key={c.slug} center={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

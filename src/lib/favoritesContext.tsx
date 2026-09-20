import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { cn } from './cn';
import { glassPillClass, glassPillShadow } from './glass';
import { createFavoriteList, fetchFavoriteList, updateFavoriteListSlugs } from './favoritesApi';

// Избранное БЦ без регистрации (владелец, 2026-09-21): список живёт в
// Supabase под коротким id, id — прямо в URL (/favorites/<id>), а не в
// localStorage — открывается на любом устройстве по той же ссылке.
// localStorage здесь хранит только УКАЗАТЕЛЬ "какой id — мой на этом
// браузере" (как cookie), не сам список — источник истины всегда база.
const STORAGE_KEY = 'rdvlp:favoritesId';
const FAVORITES_PATH_RE = /^\/favorites\/([a-zA-Z0-9]+)$/;

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // приватный режим/запрет доступа к хранилищу — избранное просто не
    // переживёт перезагрузку страницы, сама фича при этом работает
  }
}

interface FavoritesContextValue {
  id: string | null;
  slugs: string[];
  isFavorite: (slug: string) => boolean;
  toggleFavorite: (slug: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [id, setId] = useState<string | null>(null);
  const [slugs, setSlugs] = useState<string[]>([]);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const urlId = location.pathname.match(FAVORITES_PATH_RE)?.[1] ?? null;
    const targetId = urlId ?? (loadedIdRef.current === null ? readStoredId() : null);
    if (!targetId || targetId === loadedIdRef.current) return;
    let cancelled = false;
    fetchFavoriteList(targetId).then((list) => {
      if (cancelled) return;
      loadedIdRef.current = targetId;
      setId(targetId);
      setSlugs(list?.slugs ?? []);
      writeStoredId(list ? targetId : null);
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const toggleFavorite = useCallback(
    (slug: string) => {
      const next = slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [...slugs, slug];
      setSlugs(next);
      if (id) {
        updateFavoriteListSlugs(id, next).catch(() => {});
      } else {
        createFavoriteList(next)
          .then((list) => {
            loadedIdRef.current = list.id;
            setId(list.id);
            writeStoredId(list.id);
          })
          .catch(() => {});
      }
    },
    [id, slugs],
  );

  const isFavorite = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  const value = useMemo(() => ({ id, slugs, isFavorite, toggleFavorite }), [id, slugs, isFavorite, toggleFavorite]);

  const onFavoritesPage = FAVORITES_PATH_RE.test(location.pathname);
  const showIndicator = !location.pathname.startsWith('/admin') && !onFavoritesPage && slugs.length > 0 && id;

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      {showIndicator && (
        <Link
          to={`/favorites/${id}`}
          style={glassPillShadow}
          className={cn(
            glassPillClass,
            'fixed bottom-4 right-4 z-40 flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5',
          )}
        >
          <Heart className="h-4 w-4 shrink-0 fill-primary text-primary" />
          Избранное ({slugs.length})
        </Link>
      )}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}

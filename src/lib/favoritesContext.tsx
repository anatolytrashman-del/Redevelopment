import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
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
const TOAST_DURATION_MS = 5000;

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

export function favoritesShareUrl(id: string): string {
  return `${window.location.origin}/favorites/${id}`;
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

  // Владелец, 2026-09-21: при добавлении в избранное ссылка на подборку
  // сразу копируется в буфер — это единственный способ вернуться к списку
  // без аккаунта, поэтому её стоит отдать в руки сразу, а не заставлять
  // искать плашку. Уведомление — 5 секунд, закрывается вручную.
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    },
    [],
  );

  const copyShareLink = useCallback((listId: string) => {
    const url = favoritesShareUrl(listId);
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setToastVisible(true);
        if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = window.setTimeout(() => setToastVisible(false), TOAST_DURATION_MS);
      })
      .catch(() => {
        // буфер обмена недоступен (запрет разрешения/небезопасный контекст) —
        // просто не показываем уведомление про несостоявшееся копирование
      });
  }, []);

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
      const isAdding = !slugs.includes(slug);
      const next = isAdding ? [...slugs, slug] : slugs.filter((s) => s !== slug);
      setSlugs(next);
      if (id) {
        updateFavoriteListSlugs(id, next).catch(() => {});
        if (isAdding) copyShareLink(id);
      } else {
        createFavoriteList(next)
          .then((list) => {
            loadedIdRef.current = list.id;
            setId(list.id);
            writeStoredId(list.id);
            if (isAdding) copyShareLink(list.id);
          })
          .catch(() => {});
      }
    },
    [id, slugs, copyShareLink],
  );

  const isFavorite = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  const value = useMemo(() => ({ id, slugs, isFavorite, toggleFavorite }), [id, slugs, isFavorite, toggleFavorite]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      {toastVisible && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div
            style={glassPillShadow}
            className={cn(
              glassPillClass,
              'pointer-events-auto flex max-w-[95vw] items-center gap-2 whitespace-nowrap px-3.5 py-2 text-[11px] font-normal text-ink sm:text-xs',
            )}
          >
            <span>Ссылка на избранное скопирована в буфер обмена</span>
            <button
              type="button"
              onClick={() => setToastVisible(false)}
              aria-label="Закрыть уведомление"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        </div>
      )}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}

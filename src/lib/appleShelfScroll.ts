/**
 * Горизонтальная полка в духе iPhone (UIScrollView-like).
 * 
 * Основное — нативный скролл + CSS scroll-snap (proximity).
 * Дополнительно: после остановки жеста — мягкое дотягивание к ближайшей карточке.
 * 
 * AUDIT-2026-10: упрощённая версия (см. историю фикса scroll в preview).
 * Убрано агрессивное RAF-лерп на wheel (оно и вызывало "само ездит" и зависания на iPhone).
 * Сейчас: CSS snap + nearest + on scrollend / timeout settle.
 * 
 * Если будут жалобы на скролл — проверять attach в TcBrowseBodyMount и TradeCenterEditorialShelves.
 */

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ближайший scrollLeft, чтобы левый край карточки встал на padding контейнера. */
export function nearestShelfScrollLeft(el: HTMLElement): number {
  const cards = [...el.children] as HTMLElement[];
  if (!cards.length) return el.scrollLeft;

  const padLeft =
    parseFloat(
      (typeof getComputedStyle === 'function' ? getComputedStyle(el).paddingLeft : '') ||
        el.style.paddingLeft ||
        '0',
    ) || 0;
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const targetEdge = el.scrollLeft + padLeft;

  let best = 0;
  let bestDist = Infinity;
  for (const card of cards) {
    const left = card.offsetLeft;
    const dist = Math.abs(left - targetEdge);
    if (dist < bestDist) {
      bestDist = dist;
      best = left - padLeft;
    }
  }
  return Math.min(max, Math.max(0, best));
}

function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

export type AppleShelfScrollHandle = { destroy: () => void };

export function attachAppleShelfScroll(el: HTMLElement): AppleShelfScrollHandle {
  if (prefersReducedMotion()) {
    return { destroy() {} };
  }

  let settleRaf = 0;
  let settleTimer = 0;
  let pointerDown = false;
  let settling = false;
  let destroyed = false;
  const hasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

  const cancelSettleAnim = () => {
    if (settleRaf) {
      cancelAnimationFrame(settleRaf);
      settleRaf = 0;
    }
    settling = false;
  };

  const clearSettleTimer = () => {
    if (settleTimer) {
      window.clearTimeout(settleTimer);
      settleTimer = 0;
    }
  };

  const animateScrollTo = (to: number, durationMs: number) => {
    cancelSettleAnim();
    const from = el.scrollLeft;
    const dist = to - from;
    if (Math.abs(dist) < 0.5) {
      el.scrollLeft = to;
      return;
    }
    settling = true;
    const t0 = performance.now();
    const step = (now: number) => {
      if (destroyed) return;
      const t = Math.min(1, (now - t0) / durationMs);
      el.scrollLeft = from + dist * easeOutQuint(t);
      if (t < 1) {
        settleRaf = requestAnimationFrame(step);
      } else {
        settleRaf = 0;
        el.scrollLeft = to;
        settling = false;
      }
    };
    settleRaf = requestAnimationFrame(step);
  };

  const settle = () => {
    if (pointerDown || destroyed || settling) return;
    const to = nearestShelfScrollLeft(el);
    if (Math.abs(to - el.scrollLeft) < 1) return;
    // Мягкое дотягивание после остановки жеста (как на iOS)
    animateScrollTo(to, 420);
  };

  const scheduleSettle = () => {
    if (settling) return;
    clearSettleTimer();
    settleTimer = window.setTimeout(settle, hasScrollEnd ? 60 : 220);
  };

  const onScrollEnd = () => {
    if (pointerDown || settling) return;
    clearSettleTimer();
    settle();
  };

  const onScroll = () => {
    if (pointerDown || settling) return;
    if (!hasScrollEnd) scheduleSettle();
  };

  const onPointerDown = () => {
    pointerDown = true;
    clearSettleTimer();
    cancelSettleAnim();
  };

  const onPointerUp = () => {
    pointerDown = false;
    if (!hasScrollEnd) scheduleSettle();
  };

  // Лёгкий wheel handler — только чтобы горизонтальный трекпад крутил полку,
  // а не всю страницу. Без своего RAF-аниматора.
  const onWheel = (e: WheelEvent) => {
    const dominantY = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    const delta = dominantY ? e.deltaY : e.deltaX;
    if (delta === 0) return;

    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;

    const atStart = el.scrollLeft <= 0 && delta < 0;
    const atEnd = el.scrollLeft >= max - 0.5 && delta > 0;
    if (atStart || atEnd) return;

    // Не делаем preventDefault + свой lerp — даём нативу работать.
    // Просто отменяем таймеры дотягивания во время жеста.
    clearSettleTimer();
    cancelSettleAnim();
  };

  if (!hasScrollEnd) {
    el.addEventListener('scroll', onScroll, { passive: true });
  }
  el.addEventListener('scrollend', onScrollEnd as EventListener);
  el.addEventListener('pointerdown', onPointerDown, { passive: true });
  el.addEventListener('pointerup', onPointerUp, { passive: true });
  el.addEventListener('pointercancel', onPointerUp, { passive: true });
  el.addEventListener('touchstart', onPointerDown, { passive: true });
  el.addEventListener('touchend', onPointerUp, { passive: true });
  el.addEventListener('touchcancel', onPointerUp, { passive: true });
  el.addEventListener('wheel', onWheel, { passive: true });

  return {
    destroy() {
      destroyed = true;
      clearSettleTimer();
      cancelSettleAnim();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd as EventListener);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('touchstart', onPointerDown);
      el.removeEventListener('touchend', onPointerUp);
      el.removeEventListener('touchcancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
    },
  };
}

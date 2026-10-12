/**
 * Плавная горизонтальная полка в духе Apple (App Store / Music):
 * свободный flick без жёсткого CSS-snap, после остановки — мягкое
 * дотягивание к ближайшей карточке (ease-out quint, ~0.55s).
 * На трекпаде/колёсике — сглаженный горизонтальный скролл.
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
  let wheelRaf = 0;
  let wheelTarget = el.scrollLeft;
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

  const cancelWheelAnim = () => {
    if (wheelRaf) {
      cancelAnimationFrame(wheelRaf);
      wheelRaf = 0;
    }
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
    // Дольше и мягче, чем дефолтный smooth браузера — ближе к UIScrollView.
    animateScrollTo(to, 560);
  };

  const scheduleSettle = () => {
    if (settling) return;
    clearSettleTimer();
    // Ждём окончания нативной инерции, потом дотягиваем.
    settleTimer = window.setTimeout(settle, hasScrollEnd ? 40 : 180);
  };

  const onScrollEnd = () => {
    if (pointerDown || settling) return;
    clearSettleTimer();
    settle();
  };

  const onScroll = () => {
    if (pointerDown || settling) return;
    // Только fallback без scrollend — иначе дерёмся с нативной инерцией.
    scheduleSettle();
  };

  const onPointerDown = () => {
    pointerDown = true;
    clearSettleTimer();
    cancelSettleAnim();
    cancelWheelAnim();
    wheelTarget = el.scrollLeft;
  };

  const onPointerUp = () => {
    pointerDown = false;
    // При наличии scrollend он сам дотянет после инерции.
    if (!hasScrollEnd) scheduleSettle();
  };

  const runWheelLerp = () => {
    wheelRaf = 0;
    if (destroyed || pointerDown) return;
    const cur = el.scrollLeft;
    // Чуть «длиннее» хвост — как decelerationRate у UIScrollView.
    const next = cur + (wheelTarget - cur) * 0.18;
    if (Math.abs(wheelTarget - next) < 0.35) {
      el.scrollLeft = wheelTarget;
      settling = false;
      scheduleSettle();
      return;
    }
    el.scrollLeft = next;
    wheelRaf = requestAnimationFrame(runWheelLerp);
  };

  const onWheel = (e: WheelEvent) => {
    // Трекпад часто шлёт deltaY при горизонтальном жесте — крутим полку, не страницу.
    const dominantY = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    const delta = dominantY ? e.deltaY : e.deltaX;
    if (delta === 0) return;

    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;

    // Не перехватываем, если упёрлись и жест уводит дальше за край.
    const atStart = el.scrollLeft <= 0 && delta < 0;
    const atEnd = el.scrollLeft >= max - 0.5 && delta > 0;
    if (atStart || atEnd) return;

    e.preventDefault();
    clearSettleTimer();
    cancelSettleAnim();
    wheelTarget = Math.min(max, Math.max(0, wheelTarget + delta));
    if (!wheelRaf) wheelRaf = requestAnimationFrame(runWheelLerp);
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
  el.addEventListener('wheel', onWheel, { passive: false });

  return {
    destroy() {
      destroyed = true;
      clearSettleTimer();
      cancelSettleAnim();
      cancelWheelAnim();
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

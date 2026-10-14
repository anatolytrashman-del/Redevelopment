/**
 * AUDIT-2026-10 Task 001 (Cross-cutting) — Системное улучшение изображений
 * 
 * Цель: Создать единую точку для всех изображений в проекте.
 * 
 * Почему это важно системно:
 * - Сейчас изображения разбросаны: <img>, background-image, CSS-арты.
 * - Разный loading, fetchPriority, width/height.
 * - Это одна из главных причин моргания картинок при гидратации (snapshot vs React).
 * - Хотим: красивый вид + зелёный PageSpeed (меньше CLS) + предсказуемое поведение.
 * 
 * Статус (2026-10-14):
 * - Компонент готов, с правильной деструктуризацией.
 * - Мигрировано: HeroImageSlider (LCP), DesignProjects (мозаика + карточки), подготовка в полках.
 * - Исправлен потенциальный баг с дублированием srcSet/sizes.
 * 
 * План:
 * - Постепенная миграция (hero, полки, карточки, лендинги, briefs).
 * - Позже: варианты (HeroImage, ShelfCover) + blur placeholder.
 * 
 * Откат: git checkout rollback-before-task-001-step3
 */

import type { ImgHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  /** 
   * Приоритет загрузки.
   * 'high' — только для LCP картинок первого экрана.
   * 'auto' — по умолчанию (браузер решает).
   */
  priority?: 'high' | 'auto';
  /** 
   * loading стратегия.
   * 'eager' — для важных картинок.
   * 'lazy' — для всего остального (дефолт).
   */
  loadingStrategy?: 'eager' | 'lazy';
  /** Ширина для layout shift защиты (PageSpeed) */
  width?: number;
  /** Высота для layout shift защиты */
  height?: number;
  /** Дополнительные классы */
  className?: string;
  /** Объект fit */
  objectFit?: 'cover' | 'contain' | 'fill';

  // AUDIT-2026-10 Task 001: поддержка responsive + явные поля, чтобы не дублировать в ...rest
  srcSet?: string;
  sizes?: string;
}

export function OptimizedImage({
  src,
  priority = 'auto',
  loadingStrategy = 'lazy',
  width,
  height,
  className,
  objectFit = 'cover',
  alt = '',
  srcSet,
  sizes,
  ...rest
}: OptimizedImageProps) {
  const isHighPriority = priority === 'high';

  // AUDIT-2026-10 Task 001: Единые дефолты + правильная деструктуризация.
  // Раньше srcSet/sizes могли дублироваться через ...rest — фикс.
  // Это должно уменьшить моргания и улучшить PageSpeed (width/height, loading, fetchPriority).
  // Для LCP (hero) — priority="high" + loadingStrategy="eager".
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={isHighPriority ? 'eager' : loadingStrategy}
      fetchPriority={isHighPriority ? 'high' : 'auto'}
      decoding="async" // AUDIT-2026-10: helps reduce decode delay contributing to perceived blinking on replace
      className={cn(
        'max-w-full',
        objectFit === 'cover' && 'object-cover',
        objectFit === 'contain' && 'object-contain',
        className
      )}
      {...rest}
    />
  );
}

/**
 * TODO (следующие шаги в этой задаче):
 * - Добавить поддержку srcSet / sizes
 * - Добавить blur placeholder (опционально)
 * - Создать варианты: HeroImage, ShelfCover, CardImage
 * - Начать миграцию в одном месте (например, в LookbookCard)
 */
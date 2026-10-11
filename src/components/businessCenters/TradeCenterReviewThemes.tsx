import { MessageSquare } from 'lucide-react';
import type { HighlightRatingEntry } from '../../lib/businessCenterDisplay';
import { reviewThemeColumns, reviewThemesShowShares, reviewThemesVisible, reviewThemeWidth, type ReviewThemes } from '../../lib/tradeCenterFactsReviews';
import { reviewThemesPreview } from '../../lib/tradeCenterSpoilerPreview';
import { CategorySpoiler } from '../ui/CategorySpoiler';

export function TradeCenterReviewThemes({ themes, rating, yandexUrl, index }: {
  themes: ReviewThemes;
  rating?: HighlightRatingEntry;
  yandexUrl?: string;
  index?: number;
}) {
  const columns = reviewThemeColumns(themes);
  if (!reviewThemesVisible(themes)) return null;
  const shares = reviewThemesShowShares(themes);
  const count = themes.reviewCount ?? themes.reviews;
  return (
    <CategorySpoiler
      id="reviews"
      title="Что говорят посетители"
      subtitle={reviewThemesPreview(themes, rating)}
      meta={count ? `${count.toLocaleString('ru-RU')} отзывов` : null}
      icon={MessageSquare}
      index={index}
    >
      {rating && (
        <div className="rounded-[20px] border border-border bg-white px-5 py-4 sm:max-w-72">
          <div className="text-[44px] font-extrabold leading-none text-ink">{rating.value}</div>
          <div aria-hidden="true" className="mt-1.5 text-lg tracking-widest text-[#f5b400]">{'★'.repeat(Math.round(Number(rating.value.replace(',', '.'))))}</div>
          <p className="mt-1.5 text-[13px] text-ink-muted">по {(rating.totalCount ?? themes.reviews).toLocaleString('ru-RU')} отзывам в Яндекс Картах</p>
          {yandexUrl && <a href={yandexUrl} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-block text-[13px] text-ink underline underline-offset-4">Все отзывы на Яндекс Картах ↗</a>}
        </div>
      )}
      {/* Без оценки — одна строка: сколько отзывов в Яндексе и ссылка на них. */}
      {!rating && (
        <p className="text-[13px] text-ink-muted">
          По отзывам в Яндекс Картах{themes.reviewCount ? ` (всего ${themes.reviewCount.toLocaleString('ru-RU')})` : ''}
          {yandexUrl && <> · <a href={yandexUrl} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">читать все ↗</a></>}
        </p>
      )}
      <div className={`grid gap-3.5 ${columns.length === 2 ? 'sm:grid-cols-2' : ''}`}>
        {columns.map((column) => (
          <div key={column.key} className="rounded-[20px] border border-border bg-white px-5 py-4">
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />{column.title}</h3>
            <div className="divide-y divide-border">
              {column.items.map((item, index) => (
                <div key={item.theme} className="py-2.5">
                  <div className="flex justify-between gap-2.5 text-sm text-ink"><span>{item.theme}</span>{shares && <span className="shrink-0 text-[13px] text-ink-muted">{item.share}%{index === 0 ? ' отзывов' : ''}</span>}</div>
                  {shares && <div className="mt-1.5 h-[7px] overflow-hidden rounded bg-surface-muted"><div className="h-full rounded" style={{ width: `${reviewThemeWidth(item.share, themes)}%`, backgroundColor: column.color }} /></div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CategorySpoiler>
  );
}

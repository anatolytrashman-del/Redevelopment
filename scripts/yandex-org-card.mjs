// Собственная карточка здания (ТЦ, рынка, БЦ) на Яндекс Картах: общий рейтинг,
// часы, телефоны, ссылки, удобства, рубрики, метро — всё, что Яндекс кладёт в
// state-view страницы /maps/org/<id>/. Владелец, 2026-09-24: «нужны
// арендаторы, отзывы и все остальное, но не места вокруг». Поэтому только
// поля самой организации: блоки «Похожие места» и «Рядом» не читаем.

import { ownItem } from './yandex-tenant-floors.mjs';

const round1 = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
const intOrNull = (value) => (Number.isInteger(value) ? value : null);
const textOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

function featureValue(value) {
  if (Array.isArray(value)) return value.map((entry) => entry?.name ?? entry?.value ?? entry).filter((entry) => typeof entry === 'string');
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  return null;
}

/** Данные карточки организации orgId из HTML её страницы; null — карточки нет. */
export function cardFromOrgHtml(html, orgId) {
  const item = ownItem(html, orgId);
  if (!item) return null;
  const rating = item.ratingData ?? {};
  const sites = [
    ...(Array.isArray(item.urls) ? item.urls : []),
    ...(Array.isArray(item.businessLinks) ? item.businessLinks.map((link) => link?.href ?? link?.url) : []),
  ].filter((url) => typeof url === 'string' && /^https?:\/\//.test(url));
  return {
    orgId: String(item.id),
    name: textOrNull(item.title),
    address: textOrNull(item.fullAddress ?? item.address),
    rating: round1(rating.ratingValue),
    ratingCount: intOrNull(rating.ratingCount),
    reviewCount: intOrNull(rating.reviewCount),
    status: textOrNull(item.status),
    workingTimeText: textOrNull(item.workingTimeText),
    workingTime: Array.isArray(item.workingTime) ? item.workingTime : null,
    phones: (item.phones ?? [])
      .map((phone) => ({ number: textOrNull(phone?.number), value: textOrNull(phone?.value) }))
      .filter((phone) => phone.number || phone.value),
    sites: [...new Set(sites)],
    socialLinks: (item.socialLinks ?? [])
      .filter((link) => typeof link?.href === 'string')
      .map((link) => ({ type: textOrNull(link.type), href: link.href })),
    categories: (item.categories ?? []).map((category) => textOrNull(category?.name)).filter(Boolean),
    features: (item.features ?? [])
      .map((feature) => ({ id: textOrNull(feature?.id), name: textOrNull(feature?.name), value: featureValue(feature?.value) }))
      .filter((feature) => feature.name && feature.value !== null && !(Array.isArray(feature.value) && feature.value.length === 0)),
    metro: (item.metro ?? [])
      .map((station) => ({ name: textOrNull(station?.name), distanceM: Number.isFinite(station?.distanceValue) ? Math.round(station.distanceValue) : null }))
      .filter((station) => station.name),
    photoCount: intOrNull(item.photos?.count),
  };
}

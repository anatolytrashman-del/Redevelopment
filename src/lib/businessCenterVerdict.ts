// Б2 плана docs/bc-catalog-redesign-plan.md — «Кому подходит» и
// плюсы/минусы. Решение владельца 2026-09-16: авточерновик из порогов +
// ручная правка в админке.
//
// Зачем автогенерация, а не ручной текст: описание в прозе есть у 27
// зданий из 143, и написать руками ещё 116 — это отдельный проект. Пороги
// же считаются по уже собранным данным и дают честный черновик, который
// владелец правит там, где формулировка вышла топорной.
//
// Почему пороги, а не «лучше среднего»: каждый плюс и минус — публичное
// утверждение про чужое здание, и его должно быть можно проверить. «Метро
// в 300 м» проверяется, «инфраструктура выше средней» — нет.
//
// Флаг verdictEdited отделяет правленое руками от сгенерированного:
// генерация НИКОГДА не перетирает то, что владелец написал сам.
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import type { CatalogOfferIndex } from './businessCenterCatalogFilter';
import { nearestMetroMeters } from './businessCenterCatalogFilter';
import { median, MIN_COMPARE_N } from './businessCenterMarketPosition';

// Больше пяти пунктов с каждой стороны никто не читает, а список из
// пятнадцати плюсов перестаёт значить что-либо. Порядок добавления ниже и
// есть приоритет: деньги и дорога важнее кофепоинта.
const MAX_ITEMS = 5;

export interface VerdictDraft {
  verdict: string;
  pros: string[];
  cons: string[];
}

function classRentMedian(snapshots: MarketSnapshot[] | null, businessClass: string | null): number | null {
  if (!businessClass) return null;
  return (
    (snapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === 'class' && s.sliceKey === businessClass)?.median ??
    null
  );
}

export function buildVerdictDraft(
  center: BusinessCenter,
  allCenters: BusinessCenter[],
  offers: CatalogOfferIndex,
  snapshots: MarketSnapshot[] | null,
): VerdictDraft {
  const pros: string[] = [];

  const metro = nearestMetroMeters(center);
  const rent = offers.rentBySlug.get(center.slug)?.median ?? null;
  const classMedian = classRentMedian(snapshots, center.businessClass);
  const sameClass = center.businessClass
    ? allCenters.filter((candidate) => candidate.businessClass === center.businessClass)
    : [];
  const classParkingMedian =
    sameClass.length >= MIN_COMPARE_N
      ? median(sameClass.map((candidate) => candidate.parkingRatio).filter((value): value is number => value != null))
      : null;
  const classMetroMedian =
    sameClass.length >= MIN_COMPARE_N
      ? median(sameClass.map(nearestMetroMeters).filter((value): value is number => value != null))
      : null;

  // --- Плюсы -----------------------------------------------------------
  if (rent != null && classMedian != null && classMedian > 0 && rent <= classMedian * 0.9) {
    pros.push(`Ставка ниже медианы класса ${center.businessClass} на ${Math.round((1 - rent / classMedian) * 100)}%`);
  }
  if (metro != null && classMetroMedian != null && classMetroMedian > 0 && metro < classMetroMedian) {
    const metroAdvantage = Math.max(1, Math.round((1 - metro / classMetroMedian) * 100));
    pros.push(
      `До метро на ${metroAdvantage}% ближе, чем у медианного здания класса ${center.businessClass}`,
    );
  }
  if (
    center.parkingRatio != null &&
    classParkingMedian != null &&
    classParkingMedian > 0 &&
    center.parkingRatio > classParkingMedian
  ) {
    const parkingAdvantage = Math.max(
      1,
      Math.round((center.parkingRatio / classParkingMedian - 1) * 100),
    );
    pros.push(
      `Парковочных мест на ${parkingAdvantage}% больше медианы класса ${center.businessClass}`,
    );
  }

  // --- Вердикт ---------------------------------------------------------
  // Собирается из трёх осей: цена относительно класса, дорога и размер
  // типового блока. Каждая ветка соответствует реальному сценарию выбора,
  // а не абстрактной похвале.
  const cheap = rent != null && classMedian != null && rent <= classMedian * 0.9;
  const pricey = rent != null && classMedian != null && rent >= classMedian * 1.15;
  const nearMetro = metro != null && metro <= 700;
  const bigFloor = center.floorPlateArea != null && center.floorPlateArea >= 1500;
  const smallFloor = center.floorPlateArea != null && center.floorPlateArea <= 700;

  let verdict: string;
  if (center.status === 'under_construction') {
    verdict = center.yearBuilt
      ? `Здание ещё строится, сдача заявлена на ${center.yearBuilt} год — снять или купить офис здесь пока нельзя, но можно заранее прицениться.`
      : 'Здание ещё строится — снять или купить офис здесь пока нельзя.';
  } else if (center.businessClass === 'A' && nearMetro) {
    verdict = pricey
      ? `Офис класса A: до ближайшего метро ${metro} м по прямой, ставка выше медианы класса.`
      : `Офис класса A: до ближайшего метро ${metro} м по прямой.`;
  } else if (cheap && !nearMetro) {
    verdict =
      'Ставка ниже медианы своего класса. Расположение и маршрут до метро стоит оценить отдельно.';
  } else if (cheap) {
    verdict = 'Крепкий вариант «цена — расположение»: ставка ниже медианы класса, метро рядом.';
  } else if (bigFloor) {
    verdict =
      'Подойдёт под большой офис одним блоком: типовой этаж позволяет разместить крупное подразделение без дробления по этажам.';
  } else if (smallFloor) {
    verdict = 'Небольшое здание — вариант для команды, которой нужен свой отдельный офис, а не этаж в высотке.';
  } else if (center.businessClass === 'C') {
    verdict = 'Рабочий вариант без переплаты за класс: базовая отделка и сервисы, зато цена метра обычно ниже.';
  } else {
    verdict = `Бизнес-центр класса ${center.businessClass ?? '—'}: по имеющимся данным здание не выделяется по ставке, расположению или размеру блока.`;
  }

  return { verdict, pros: pros.slice(0, MAX_ITEMS), cons: [] };
}

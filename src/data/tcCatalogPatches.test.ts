import { describe, expect, it } from 'vitest';
import {
  applyTcCatalogPatch,
  applyTcCatalogPatchToRow,
  localizedTcPhotoPath,
  resolveTcRetailFormat,
  TC_LOCALIZED_STORAGE_PHOTO_SLUGS,
} from '../data/tcCatalogPatches';
import type { BusinessCenter } from '../data/businessCenters';

function tc(partial: Partial<BusinessCenter> & Pick<BusinessCenter, 'slug'>): BusinessCenter {
  return {
    id: '1',
    name: 'ТЦ',
    altNames: [],
    address: 'адрес',
    district: null,
    microdistrict: null,
    businessClass: null,
    totalArea: null,
    yearBuilt: null,
    floors: null,
    developer: null,
    developerInfo: null,
    metro: null,
    parking: null,
    website: null,
    description: null,
    rentalInfo: null,
    highlights: [],
    mapSnapshotFiles: [],
    mediaMentions: [],
    tenantOrganizations: [],
    tenantCount: 0,
    technicalParams: [],
    buildingFacts: [],
    nearestMetroStations: [],
    floorPlateArea: null,
    officeArea: null,
    layoutTypes: [],
    elevators: null,
    parkingRatio: null,
    airConditioning: null,
    ceilingHeight: null,
    managementType: null,
    metroDistanceBucket: null,
    freeSpaceMin: null,
    freeSpaceMax: null,
    infraInternal: [],
    infraNearby: [],
    lat: null,
    lng: null,
    gisRating: null,
    gisReviewCount: null,
    is24x7: null,
    accessibility: [],
    verdict: null,
    pros: [],
    cons: [],
    verdictEdited: false,
    reviewsChecked: false,
    verifiedByManagementAt: null,
    managementRepliedAt: null,
    photos: [],
    status: 'built',
    kind: 'tc',
    retailFormat: null,
    retailInfo: null,
    sortOrder: 0,
    createdAt: '2026-01-01',
    ...partial,
  };
}

describe('tcCatalogPatches', () => {
  it('нормализует единичные форматы', () => {
    expect(resolveTcRetailFormat('строительный гипермаркет')).toBe('строительный центр');
    expect(resolveTcRetailFormat('аутлет')).toBe('аутлет');
  });

  it('дозаполняет район и площадь', () => {
    const patched = applyTcCatalogPatch(tc({ slug: 'stolitsa' }));
    expect(patched.district).toBe('Центральный');
    expect(applyTcCatalogPatch(tc({ slug: 'metropol-tc' })).totalArea).toBe(28000);
  });

  it('переписывает Storage-фото на локальный путь', () => {
    const slug = TC_LOCALIZED_STORAGE_PHOTO_SLUGS[0];
    const patched = applyTcCatalogPatch(
      tc({
        slug,
        photos: [`https://iohcdylttyuhwovztrbk.supabase.co/storage/v1/object/public/object-photos/tc-catalog/${slug}.webp`],
      }),
    );
    expect(patched.photos).toEqual([localizedTcPhotoPath(slug)]);
  });

  it('патчит сырую строку списка', () => {
    const row = applyTcCatalogPatchToRow({
      kind: 'tc',
      slug: 'diamond-city',
      district: null,
      nearest_metro_stations: [] as { name: string; distanceMeters: number; line: string | null; color: string | null }[],
      retail_format: 'ТРЦ',
    });
    const stations = row.nearest_metro_stations as { name: string }[];
    expect(stations).toHaveLength(1);
    expect(stations[0].name).toBe('Малиновка');
  });

  it('открывает ресерч четырёх бывших скрытых ТЦ', () => {
    expect(applyTcCatalogPatch(tc({ slug: 'radzivillovskiy' })).totalArea).toBe(8612);
    expect(applyTcCatalogPatch(tc({ slug: 'radzivillovskiy' })).yearBuilt).toBe(1986);
    expect(applyTcCatalogPatch(tc({ slug: 'schaste' })).yearBuilt).toBe(1979);
    expect(applyTcCatalogPatch(tc({ slug: 'schaste' })).floors).toBe(2);
    expect(applyTcCatalogPatch(tc({ slug: 'sudmalisa-1g' })).retailFormat).toBe('районный ТЦ');
    expect(applyTcCatalogPatch(tc({ slug: 'sudmalisa-1g' })).floors).toBe(1);
    expect(applyTcCatalogPatch(tc({ slug: 'very-horuzhey-25' })).floors).toBe(4);
    expect(TC_LOCALIZED_STORAGE_PHOTO_SLUGS).toEqual(
      expect.arrayContaining(['radzivillovskiy', 'schaste', 'sudmalisa-1g', 'very-horuzhey-25']),
    );
  });
});

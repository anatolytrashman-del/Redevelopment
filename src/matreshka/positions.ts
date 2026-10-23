// positions.ts — конфиг должностей для «Матрешка» (блок 4).
// code → visible sections. Внешние (external) видят только свои записи (TODO где нет owner в модели).
// Используется в ClientAdminApp для фильтрации табов/данных.

export type Section = 'requests' | 'suppliers' | 'staff' | 'sales' | 'documents';

export interface PositionConfig {
  title: string;
  code: string;
  isExternal: boolean;
  sections: Section[];
}

export const POSITIONS: Record<string, PositionConfig> = {
  administrator: {
    title: 'Администратор',
    code: 'administrator',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  zakupshchik: {
    title: 'Закупщик',
    code: 'zakupshchik',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  biznes_asistent: {
    title: 'Бизнес-ассистент',
    code: 'biznes_asistent',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  rukovoditel: {
    title: 'Руководитель',
    code: 'rukovoditel',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  vladelets: {
    title: 'Владелец',
    code: 'vladelets',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  direktor: {
    title: 'Директор',
    code: 'direktor',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  direktor_po_razvitiyu: {
    title: 'Директор по развитию (маркетинг/IT)',
    code: 'direktor_po_razvitiyu',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  rukovoditel_otdela_prodazh: {
    title: 'Руководитель отдела продаж',
    code: 'rukovoditel_otdela_prodazh',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  vnutrenniy_broker: {
    title: 'Внутренний брокер',
    code: 'vnutrenniy_broker',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  vneshniy_broker: {
    title: 'Внешний брокер',
    code: 'vneshniy_broker',
    isExternal: true,
    sections: ['requests', 'suppliers', 'sales', 'documents'], // staff? no for external
  },
  buhgalter_prosmotr: {
    title: 'Бухгалтер — просмотр',
    code: 'buhgalter_prosmotr',
    isExternal: false,
    sections: ['requests', 'suppliers', 'documents'],
  },
  buhgalter_provedenie: {
    title: 'Бухгалтер — проведение',
    code: 'buhgalter_provedenie',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'documents'],
  },
  buhgalter_polnyy: {
    title: 'Бухгалтер — полный',
    code: 'buhgalter_polnyy',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  yurist: {
    title: 'Юрист',
    code: 'yurist',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'documents'],
  },
  otdel_ekspluatatsii: {
    title: 'Отдел эксплуатации',
    code: 'otdel_ekspluatatsii',
    isExternal: false,
    sections: ['requests', 'suppliers', 'documents'],
  },
  rukovoditel_otdela_stroitelstva: {
    title: 'Руководитель отдела строительства',
    code: 'rukovoditel_otdela_stroitelstva',
    isExternal: false,
    sections: ['requests', 'suppliers', 'staff', 'sales', 'documents'],
  },
  rukovoditel_napravleniya_fasad: {
    title: 'Руководитель направления «Фасад»',
    code: 'rukovoditel_napravleniya_fasad',
    isExternal: false,
    sections: ['requests', 'suppliers', 'documents'],
  },
  rukovoditel_napravleniya_krovlya: {
    title: 'Руководитель направления «Кровля»',
    code: 'rukovoditel_napravleniya_krovlya',
    isExternal: false,
    sections: ['requests', 'suppliers', 'documents'],
  },
  podryadchik: {
    title: 'Подрядчик (внешний)',
    code: 'podryadchik',
    isExternal: true,
    sections: ['requests', 'documents'], // limited, own only
  },
};

export function getPositionConfig(codeOrTitle: string | null | undefined): PositionConfig | null {
  if (!codeOrTitle) return null;
  if (POSITIONS[codeOrTitle]) return POSITIONS[codeOrTitle];
  const t = codeOrTitle.trim().toLowerCase();
  return Object.values(POSITIONS).find(p => p.title.toLowerCase() === t) || null;
}

export function getVisibleSections(codeOrTitle: string | null | undefined): Section[] {
  const cfg = getPositionConfig(codeOrTitle);
  return cfg ? cfg.sections : ['requests', 'suppliers']; // default minimal
}

export function isExternalPosition(code: string | null | undefined): boolean {
  const cfg = getPositionConfig(code);
  return !!cfg?.isExternal;
}

// NOTE: external "see only own records" — TODO where data model lacks owner/created_by filtering
// (e.g. on client_requests without assignee/created_by match for external; suppliers notes etc.)
// For now UI gates tabs; backend RLS still client-wide (add owner col later if needed).

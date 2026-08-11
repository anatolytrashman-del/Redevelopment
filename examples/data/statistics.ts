import type { TreeRow } from '../../src/components/ui/TreeTable';

export const statisticsColumns = ['Дата / объект', 'В работе', 'Подтверждено', 'Отклонено', 'Заработано'];

export const statisticsRows: TreeRow[] = [
  {
    id: 'nov-2025',
    label: 'Ноябрь 2025',
    count: 3,
    inProgress: 12,
    confirmed: 8,
    rejected: 4,
    earned: '1 240 000 ₽',
    children: [
      {
        id: 'business-centers',
        label: 'Бизнес-центры',
        count: 2,
        inProgress: 7,
        confirmed: 5,
        rejected: 2,
        earned: '870 000 ₽',
        children: [
          { id: 'merkuriy-nov', label: 'БЦ «Меркурий»', inProgress: 4, confirmed: 3, rejected: 1, earned: '520 000 ₽' },
          { id: 'atrium-nov', label: 'БЦ «Атриум»', inProgress: 3, confirmed: 2, rejected: 1, earned: '350 000 ₽' },
        ],
      },
      {
        id: 'warehouses',
        label: 'Складские комплексы',
        count: 1,
        inProgress: 5,
        confirmed: 3,
        rejected: 2,
        earned: '370 000 ₽',
        children: [
          { id: 'vostok-nov', label: 'Склад-логоцентр «Восток-7»', inProgress: 5, confirmed: 3, rejected: 2, earned: '370 000 ₽' },
        ],
      },
    ],
  },
  {
    id: 'oct-2025',
    label: 'Октябрь 2025',
    count: 2,
    inProgress: 9,
    confirmed: 6,
    rejected: 5,
    earned: '910 000 ₽',
    children: [
      {
        id: 'retail',
        label: 'Торговые центры',
        count: 1,
        inProgress: 6,
        confirmed: 4,
        rejected: 3,
        earned: '620 000 ₽',
        children: [
          { id: 'yuzhnye-oct', label: 'ТЦ «Южные ворота»', inProgress: 6, confirmed: 4, rejected: 3, earned: '620 000 ₽' },
        ],
      },
      {
        id: 'sport',
        label: 'Спортивные объекты',
        count: 1,
        inProgress: 3,
        confirmed: 2,
        rejected: 2,
        earned: '290 000 ₽',
        children: [
          { id: 'priboy-oct', label: 'ФОК «Прибой»', inProgress: 3, confirmed: 2, rejected: 2, earned: '290 000 ₽' },
        ],
      },
    ],
  },
];

export const statisticsTotal = {
  label: 'Итого',
  inProgress: 21,
  confirmed: 14,
  rejected: 9,
  earned: '2 150 000 ₽',
};

// Пресеты RAL Classic для мини-палитры выбора оттенка (см.
// RalColorPickerModal.tsx) — только серые и красные, как просил
// пользователь под перекраску фасада. hex — приблизительное соответствие
// для превью в интерфейсе, не эталон печати: перед заказом краски цвет
// сверяют по бумажному вееру RAL, а не по экрану.
export interface RalPreset {
  code: string;
  name: string;
  hex: string;
  group: 'grey' | 'red';
}

export const RAL_PRESETS: RalPreset[] = [
  { code: 'RAL 7047', name: 'Телегрей 4', hex: '#CFD0CF', group: 'grey' },
  { code: 'RAL 7035', name: 'Светло-серый', hex: '#D7D7D7', group: 'grey' },
  { code: 'RAL 7040', name: 'Оконно-серый', hex: '#9DA1AA', group: 'grey' },
  { code: 'RAL 7024', name: 'Графитово-серый', hex: '#474A51', group: 'grey' },
  { code: 'RAL 7016', name: 'Антрацитово-серый', hex: '#383E42', group: 'grey' },
  { code: 'RAL 7021', name: 'Чёрно-серый', hex: '#23282B', group: 'grey' },
  { code: 'RAL 3020', name: 'Транспортно-красный', hex: '#C1121C', group: 'red' },
  { code: 'RAL 3000', name: 'Огненно-красный', hex: '#A82C21', group: 'red' },
  { code: 'RAL 3009', name: 'Оксид красный', hex: '#6D342D', group: 'red' },
  { code: 'RAL 3011', name: 'Коричнево-красный', hex: '#7E292C', group: 'red' },
  { code: 'RAL 3005', name: 'Винно-красный', hex: '#591F26', group: 'red' },
];

// Иконки оборудования здания по канонической подписи (tenantAmenityLabel в
// lib/tenantCategories.ts) — общие для BuildingAmenities (БЦ) и
// TradeCenterInfrastructure (ТЦ). Отдельным файлом, а не в компоненте:
// файл с компонентами экспортирует только компоненты (fast refresh).
// Подпись без иконки рисуется с общей LayoutGrid.
import type { RetailServiceGroup } from '../../data/businessCenters';
import {
  Accessibility,
  ArrowLeftRight,
  ArrowUpDown,
  Armchair,
  Baby,
  Banknote,
  BatteryCharging,
  Bike,
  Bitcoin,
  CircleParking,
  Coffee,
  CreditCard,
  Car,
  CupSoda,
  Droplets,
  EvCharger,
  Gift,
  KeyRound,
  Leaf,
  Info,
  LayoutGrid,
  Luggage,
  PackageCheck,
  PartyPopper,
  Pill,
  Plane,
  Recycle,
  Rotate3d,
  Scissors,
  Shirt,
  Sofa,
  Ticket,
  Toilet,
  Wallet,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const AMENITY_ICONS: Record<string, LucideIcon> = {
  Туалет: Toilet,
  Банкомат: Banknote,
  Криптомат: Bitcoin,
  'Кофейный автомат': Coffee,
  'Вендинговый автомат': CupSoda,
  'Платёжный терминал': CreditCard,
  Постамат: PackageCheck,
  'Зарядка электромобилей': EvCharger,
  'Зарядная станция': BatteryCharging,
  Велопарковка: Bike,
  Парковка: CircleParking,
  'Камера хранения': Luggage,
  Инфоцентр: Info,
  Гардероб: Shirt,
  'Комната матери и ребёнка': Baby,
};

export function amenityIcon(label: string): LucideIcon {
  return AMENITY_ICONS[label] ?? LayoutGrid;
}

/** Иконки подзаголовков групп блока «Инфраструктура» ТЦ. */
export const SERVICE_GROUP_ICONS: Record<RetailServiceGroup, LucideIcon> = {
  info: Info,
  comfort: Sofa,
  family: Baby,
  access: Accessibility,
  money: Wallet,
  car: Car,
  everyday: Wrench,
  eco: Leaf,
};

// Удобство с сайта ТЦ без пары в Яндексе — иконка по названию, а не узнали —
// иконка группы.
const SERVICE_ICON_RULES: [RegExp, LucideIcon][] = [
  [/wi-?fi|вай-?фай|интернет/iu, Wifi],
  [/виртуальн|панорам/iu, Rotate3d],
  [/билет/iu, Ticket],
  [/лифт|траволатор|эскалатор/iu, ArrowUpDown],
  [/инвалид|маломобил|доступн/iu, Accessibility],
  [/туалет/iu, Toilet],
  [/именинник|праздник/iu, PartyPopper],
  [/обмен|валют/iu, ArrowLeftRight],
  [/банк/iu, Banknote],
  [/мойк/iu, Droplets],
  [/батаре|переработ|приём\p{L}* техник|сбор/iu, Recycle],
  [/химчист|гардероб|раздевал/iu, Shirt],
  [/аптек/iu, Pill],
  [/ключ/iu, KeyRound],
  [/ремонт|ателье/iu, Wrench],
  [/турагент/iu, Plane],
  [/салон|красот|парикмахер/iu, Scissors],
  [/упаковк|подар/iu, Gift],
  [/камер\p{L}* хранения/iu, Luggage],
  [/зарядк/iu, BatteryCharging],
  [/отдых|диван|кресл/iu, Armchair],
];

export function serviceIcon(name: string, group: RetailServiceGroup): LucideIcon {
  return SERVICE_ICON_RULES.find(([re]) => re.test(name))?.[1] ?? SERVICE_GROUP_ICONS[group];
}

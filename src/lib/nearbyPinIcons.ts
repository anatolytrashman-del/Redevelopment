// SVG-контуры иконок для МЕТОК ЯНДЕКС-КАРТЫ в блоке «Что рядом».
// Внутри карты нельзя отрендерить <Icon /> из lucide-react: метку рисует сам
// ymaps через templateLayoutFactory, то есть HTML-строкой, а не React-деревом.
// Поэтому контуры тех же иконок лежат здесь строками. Источник — lucide-react
// (train-front, bus-front, shopping-bag, pill, landmark, banknote, coffee,
// utensils, dumbbell, map-pin), сняты один раз из node_modules: меняется иконка
// категории в списке — меняется и строка здесь, автоматической связи нет.
import type { NearbyPlaceCategory } from '../data/businessCenterNearbyPlaces';

export const NEARBY_ICON_PATHS: Record<NearbyPlaceCategory, string> = {
  metro: "<path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\"/><path d=\"m9 15-1-1\"/><path d=\"m15 15 1-1\"/><path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\"/><path d=\"m8 19-2 3\"/><path d=\"m16 19 2 3\"/>",
  transport_stop: "<path d=\"M4 6 2 7\"/><path d=\"M10 6h4\"/><path d=\"m22 7-2-1\"/><rect width=\"16\" height=\"16\" x=\"4\" y=\"3\" rx=\"2\"/><path d=\"M4 11h16\"/><path d=\"M8 15h.01\"/><path d=\"M16 15h.01\"/><path d=\"M6 19v2\"/><path d=\"M18 21v-2\"/>",
  grocery: "<path d=\"M16 10a4 4 0 0 1-8 0\"/><path d=\"M3.103 6.034h17.794\"/><path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\"/>",
  pharmacy: "<path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\"/><path d=\"m8.5 8.5 7 7\"/>",
  bank: "<path d=\"M10 18v-7\"/><path d=\"M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z\"/><path d=\"M14 18v-7\"/><path d=\"M18 18v-7\"/><path d=\"M3 22h18\"/><path d=\"M6 18v-7\"/>",
  atm: "<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/>",
  coffee: "<path d=\"M10 2v2\"/><path d=\"M14 2v2\"/><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\"/><path d=\"M6 2v2\"/>",
  cafe: "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\"/><path d=\"M7 2v20\"/><path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/>",
  fitness: "<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\"/><path d=\"m2.5 21.5 1.4-1.4\"/><path d=\"m20.1 3.9 1.4-1.4\"/><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\"/><path d=\"m9.6 14.4 4.8-4.8\"/>",
  shop: "<path d=\"M16 10a4 4 0 0 1-8 0\"/><path d=\"M3.103 6.034h17.794\"/><path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\"/>",
  other: "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>",
};

export const NEARBY_PIN_SIZE = 32;

// Метка — тёмный кружок с белой иконкой внутри. Стили инлайновые: шаблон метки
// живёт в DOM карты, и классы Tailwind туда тянуть незачем (да и собранный CSS
// не знает про классы, которых нет в исходниках компонентов).
export function nearbyPinHtml(category: NearbyPlaceCategory, color: string): string {
  const paths = NEARBY_ICON_PATHS[category] ?? NEARBY_ICON_PATHS.other;
  const size = NEARBY_PIN_SIZE;
  return (
    '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;">' +
      '<div style="position:absolute;inset:0;border-radius:9999px;background:' + color +
        ';border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);"></div>' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff"' +
        ' stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"' +
        ' style="position:absolute;left:50%;top:50%;width:17px;height:17px;transform:translate(-50%,-50%);">' +
        paths +
      '</svg>' +
    '</div>'
  );
}

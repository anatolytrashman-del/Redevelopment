import { Navigate } from 'react-router-dom';
import { getCurrentProfile } from '../lib/accessProfile';
import { VISIBLE_PAGE_KEYS, findPage } from '../data/pages';

// Раньше индекс /admin вёл прямо на Задачи. С профилями доступа так уже
// нельзя — гостю без доступа к Задачам сразу после входа показало бы
// "страница недоступна" вместо чего-то полезного. Ведём на первую
// страницу, разрешённую именно этому профилю (по порядку меню).
export function AdminIndex() {
  const profile = getCurrentProfile();
  const firstAllowedKey = profile.pages === 'all' ? 'tasks' : VISIBLE_PAGE_KEYS.find((key) => profile.pages.includes(key));
  return <Navigate to={firstAllowedKey ? findPage(firstAllowedKey).to : '/admin/tasks'} replace />;
}

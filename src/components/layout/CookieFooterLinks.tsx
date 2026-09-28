import { Link } from 'react-router-dom';
import { reopenCookieBanner } from './CookieBanner';

// Пара ссылок для подвала публичных страниц (владелец, 2026-09-25):
// "Политика конфиденциальности" и "Настройки cookie" (переоткрывает
// CookieBanner). Вынесено отдельным компонентом, чтобы вставлять в разных
// местах (SourcesTrademarkNote — карточки каталога БЦ; ObjectLandingPage;
// MinskHub) одинаково, не дублируя разметку.
export function CookieFooterLinks() {
  return (
    <p className="text-xs text-ink-muted">
      <Link to="/privacy" className="underline hover:text-ink">
        Политика конфиденциальности
      </Link>
      {' · '}
      <button type="button" onClick={reopenCookieBanner} className="underline hover:text-ink">
        Настройки cookie
      </button>
    </p>
  );
}

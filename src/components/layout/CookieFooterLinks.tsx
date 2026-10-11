import { Link } from 'react-router-dom';
import { reopenCookieBanner } from './CookieBanner';

// Пара ссылок для подвала публичных страниц (владелец, 2026-09-25):
// "Политика конфиденциальности" и "Настройки cookie" (переоткрывает
// CookieBanner). С 2026-10-11 — строка реквизитов ИП (только имя и ИНН,
// по центру). Вынесено отдельным компонентом, чтобы вставлять в разных
// местах одинаково, не дублируя разметку.

/** Базовые реквизиты оператора для подвала. */
export const SITE_OPERATOR_REQUISITES = {
  name: 'ИП Трэшмен Анатолий',
  inn: '671408354802',
} as const;

export function CookieFooterLinks() {
  const r = SITE_OPERATOR_REQUISITES;
  return (
    <div className="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">
      <p className="leading-relaxed font-normal">
        {r.name}
        {' · '}
        ИНН {r.inn}
      </p>
      <p>
        <Link to="/privacy" className="underline hover:text-ink">
          Политика конфиденциальности
        </Link>
        {' · '}
        <button type="button" onClick={reopenCookieBanner} className="underline hover:text-ink">
          Настройки cookie
        </button>
      </p>
    </div>
  );
}

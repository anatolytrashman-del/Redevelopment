import { Link } from 'react-router-dom';
import { reopenCookieBanner } from './CookieBanner';

// Пара ссылок для подвала публичных страниц (владелец, 2026-09-25):
// "Политика конфиденциальности" и "Настройки cookie" (переоткрывает
// CookieBanner). С 2026-10-11 — ещё базовые реквизиты ИП (из карточки
// организации; банк — Т‑Банк, бывш. Тинькофф). Вынесено отдельным
// компонентом, чтобы вставлять в разных местах (SourcesTrademarkNote —
// карточки каталога БЦ; ObjectLandingPage; MinskHub; PlatformHomePage)
// одинаково, не дублируя разметку.

/** Базовые реквизиты оператора для подвала. */
export const SITE_OPERATOR_REQUISITES = {
  name: 'ИП Трэшмен Анатолий',
  inn: '671408354802',
  ogrnip: '321673300043226',
  bank: 'АО «Т‑Банк»',
  account: '40802810400002921845',
  bik: '044525974',
} as const;

export function CookieFooterLinks() {
  const r = SITE_OPERATOR_REQUISITES;
  return (
    <div className="flex flex-col gap-2 text-xs text-ink-muted">
      <p className="leading-relaxed">
        <span className="font-semibold text-ink">{r.name}</span>
        {' · '}
        ИНН {r.inn}
        {' · '}
        ОГРНИП {r.ogrnip}
        <br />
        {r.bank}
        {' · '}
        р/с {r.account}
        {' · '}
        БИК {r.bik}
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

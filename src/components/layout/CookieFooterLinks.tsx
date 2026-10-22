import { Link } from 'react-router-dom';
import { deployedSiteMode, platformOrigin } from '../../lib/sites';
import { reopenCookieBanner } from './CookieBanner';

// Пара ссылок для подвала публичных страниц (владелец, 2026-09-25):
// "Политика конфиденциальности" и "Настройки cookie" (переоткрывает
// CookieBanner). С 2026-10-11 — строка реквизитов ИП (только имя и ИНН,
// по центру). Вынесено отдельным компонентом, чтобы вставлять в разных
// местах одинаково, не дублируя разметку.
//
// 2026-10-11: на officelist/malllist — «продукт компании» с лого
// REDEVELOPMENT (RED красным); реквизиты ИП там не показываем (владелец).

/** Базовые реквизиты оператора для подвала. */
export const SITE_OPERATOR_REQUISITES = {
  name: 'ИП Трэшмен Анатолий',
  inn: '671408354802',
} as const;

function RedevelopmentProductCredit() {
  return (
    <p className="leading-relaxed">
      Продукт компании{' '}
      <a
        href={platformOrigin()}
        // data-platform-home: prerender rewrite (SITE→PUBLIC origin) не должен
        // подменять ссылку на officelist/malllist — см. rewriteSnapshotForPublicOrigin.
        data-platform-home=""
        className="inline-block font-extrabold tracking-wide text-ink hover:opacity-90"
        rel="noopener noreferrer"
      >
        <span className="font-black text-primary rd-logo-accent">RED</span>EVELOPMENT
      </a>
    </p>
  );
}

export function CookieFooterLinks() {
  const r = SITE_OPERATOR_REQUISITES;
  const mode = deployedSiteMode();
  const catalogSite = mode === 'offices' || mode === 'malls';
  return (
    <div className="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">
      {catalogSite && <RedevelopmentProductCredit />}
      {!catalogSite && (
        <p className="leading-relaxed font-normal">
          {r.name}
          {' · '}
          ИНН {r.inn}
        </p>
      )}
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

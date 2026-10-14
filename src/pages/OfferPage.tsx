import { useEffect } from 'react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import {
  setArticleJsonLd,
  setBreadcrumbJsonLd,
  setGenericPageMeta,
  setOrganizationJsonLd,
} from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import offerHtml from '../content/legal/offer.html?raw';

const TITLE = 'Лицензионное соглашение (оферта) — redevelopment.pro';
const DESCRIPTION =
  'Публичная оферта на использование онлайн-платформы redevelopment.pro. Условия лицензии, модули, тарифы и обработка данных.';
const URL = 'https://redevelopment.pro/offer';
const LAST_UPDATED = '2026-10-14';

/**
 * Публичная оферта (/offer). Текст — из docs/legal (HTML с сохранённым <strong>),
 * реквизиты-заглушки оставляем как в исходнике. Шапка с логотипом, как у /privacy.
 */
export function OfferPage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: URL, ogType: 'article' });
    setOrganizationJsonLd(false);
    setBreadcrumbJsonLd([{ name: 'Лицензионное соглашение (оферта)' }]);
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: URL,
      datePublished: LAST_UPDATED,
      dateModified: LAST_UPDATED,
    });
  }, []);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 sm:px-8">
          <SiteBrandLogo />
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-8">
        <div
          className={cn(
            'legal-doc flex flex-col gap-3 p-6 text-sm leading-relaxed text-ink sm:p-8',
            glassCardClass,
          )}
          style={glassCardShadow}
          dangerouslySetInnerHTML={{ __html: offerHtml }}
        />
      </main>
    </div>
  );
}

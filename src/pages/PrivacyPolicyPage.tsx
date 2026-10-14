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
import docHtml from '../content/legal/privacy.html?raw';

const TITLE = 'Политика конфиденциальности — redevelopment.pro';
const DESCRIPTION =
  'Как redevelopment.pro обрабатывает персональные данные: какие данные, зачем, кому передаются и как долго хранятся. Редакция от 14.10.2026.';
const URL = 'https://redevelopment.pro/privacy';
const LAST_UPDATED = '2026-10-14';

/**
 * Политика конфиденциальности (o/privacy). Текст — финальный docx из docs/legal, HTML с сохранённым <strong>.
 */
export function PrivacyPolicyPage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: URL, ogType: 'article' });
    setOrganizationJsonLd(false);
    setBreadcrumbJsonLd([{ name: 'Политика конфиденциальности' }]);
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
          dangerouslySetInnerHTML={{ __html: docHtml }}
        />
      </main>
    </div>
  );
}

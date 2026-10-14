import { useEffect } from 'react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { clearNoIndex, setGenericPageMeta, setNoIndex } from '../lib/pageMeta';
import licenseHtml from '../content/legal/license-zuev.html?raw';

const TITLE = 'Лицензионный договор (ИП Зуев) — redevelopment.pro';
const DESCRIPTION = 'Индивидуальный лицензионный договор на использование платформы redevelopment.pro.';
const URL = 'https://redevelopment.pro/license/zuev';

/**
 * Индивидуальный договор с ИП Зуевым (/license/zuev).
 * noindex, без меню и логотипа сайта. Не включать в sitemap.
 * Текст — HTML с сохранённым жирным из исходного docx.
 */
export function LicenseZuevPage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: URL, ogType: 'article' });
    setNoIndex();
    return () => {
      clearNoIndex();
    };
  }, []);

  return (
    <div className="min-h-svh bg-bg">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-8">
        <div
          className={cn(
            'legal-doc flex flex-col gap-3 p-6 text-sm leading-relaxed text-ink sm:p-8',
            glassCardClass,
          )}
          style={glassCardShadow}
          dangerouslySetInnerHTML={{ __html: licenseHtml }}
        />
      </main>
    </div>
  );
}

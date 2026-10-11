import { describe, it, expect } from 'vitest';
import {
  ensureCatalogProductCredit,
  restorePlatformHomeHrefs,
} from './catalogFooterCredit.mjs';

const PLATFORM = 'https://redevelopment.pro';
const OFFICES = 'https://officelist.pro';

const FOOTER_WITHOUT = `<div class="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">
      <p class="leading-relaxed font-normal">
        ИП Трэшмен Анатолий
        ·
        ИНН 671408354802
      </p>
    </div>`;

const FOOTER_WITH_WRONG_HREF = `<div class="flex flex-col items-center gap-2 text-center text-xs text-ink-muted">
      <p class="leading-relaxed">Продукт компании <a href="${OFFICES}" data-platform-home="" class="inline-block font-extrabold tracking-wide text-ink hover:opacity-90" rel="noopener noreferrer"><span class="font-black text-primary">RED</span>EVELOPMENT</a></p>
      <p class="leading-relaxed font-normal">ИП Трэшмен Анатолий · ИНН 671408354802</p>
    </div>`;

describe('catalogFooterCredit', () => {
  it('injects product credit into cookie footer', () => {
    const out = ensureCatalogProductCredit(FOOTER_WITHOUT, PLATFORM);
    expect(out).toContain('Продукт компании');
    expect(out).toContain(`href="${PLATFORM}"`);
    expect(out).toContain('data-platform-home');
    expect(out).toContain('ИП Трэшмен');
  });

  it('restores platform href after origin rewrite', () => {
    const out = restorePlatformHomeHrefs(FOOTER_WITH_WRONG_HREF, PLATFORM);
    expect(out).toContain(`href="${PLATFORM}"`);
    expect(out).not.toContain(`href="${OFFICES}"`);
  });

  it('ensure also fixes wrong href when credit already present', () => {
    const out = ensureCatalogProductCredit(FOOTER_WITH_WRONG_HREF, PLATFORM);
    expect(out).toContain(`href="${PLATFORM}"`);
    expect(out.match(/Продукт компании/g)?.length).toBe(1);
  });
});

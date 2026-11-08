import { describe, expect, it } from 'vitest';
import { innerHtmlOfRoot, isMalllistBrowseHomeUrl } from './tcSnapshotHydration';

describe('innerHtmlOfRoot', () => {
  it('снимает один корневой div, не путая вложенные', () => {
    const outer = '<div id="faq" class="a"><div>внутри</div><p>ещё</p></div>';
    expect(innerHtmlOfRoot(outer, 'div')).toBe('<div>внутри</div><p>ещё</p>');
  });

  it('не принимает чужой тег', () => {
    expect(innerHtmlOfRoot('<section id="faq">x</section>', 'div')).toBeNull();
  });
});

describe('isMalllistBrowseHomeUrl', () => {
  it('гидрирует корень и хаб', () => {
    expect(isMalllistBrowseHomeUrl('/', '')).toBe(true);
    expect(isMalllistBrowseHomeUrl('/minsk/tc', '')).toBe(true);
    expect(isMalllistBrowseHomeUrl('/minsk/tc/', '?x=1')).toBe(true);
  });

  it('не гидрирует список и карточку', () => {
    expect(isMalllistBrowseHomeUrl('/minsk/tc', '?view=list')).toBe(false);
    expect(isMalllistBrowseHomeUrl('/', 'view=list')).toBe(false);
    expect(isMalllistBrowseHomeUrl('/minsk/tc/4-sezona-bedy', '')).toBe(false);
  });
});

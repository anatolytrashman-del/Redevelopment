import { describe, expect, it } from 'vitest';
import { innerHtmlOfRoot } from './tcSnapshotHydration';

describe('innerHtmlOfRoot', () => {
  it('снимает один корневой div, не путая вложенные', () => {
    const outer = '<div id="faq" class="a"><div>внутри</div><p>ещё</p></div>';
    expect(innerHtmlOfRoot(outer, 'div')).toBe('<div>внутри</div><p>ещё</p>');
  });

  it('не принимает чужой тег', () => {
    expect(innerHtmlOfRoot('<section id="faq">x</section>', 'div')).toBeNull();
  });
});

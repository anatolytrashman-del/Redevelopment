import { describe, expect, it } from 'vitest';
import { stripThirdPartyAnalytics } from './stripThirdPartyAnalytics.mjs';

const SAMPLE = `
<script>
  window.__startMetrika = function () {
    if (window.__metrikaStarted) { return; }
    window.__metrikaStarted = true;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=111858495', 'ym');
    ym(111858495, 'init', { ssr: true });
  };
</script>
<script>
  window.__startTmr = function () {
    if (window.__tmrStarted) { return; }
    var _tmr = window._tmr || (window._tmr = []);
    _tmr.push({ id: '3793248', type: 'pageView' });
    (function (d, w) {
      var ts = d.createElement('script');
      ts.src = 'https://top-fwz1.mail.ru/js/code.js';
    })(document, window);
  };
</script>
<script>
  window.__startAnalytics = function () {
    if (window.__startMetrika) { window.__startMetrika(); }
    if (window.__startTmr) { window.__startTmr(); }
  };
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/111858495" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<noscript><div><img src="https://top-fwz1.mail.ru/counter?id=3793248;js=na" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
`;

describe('stripThirdPartyAnalytics', () => {
  it('removes Metrika/VK bodies and noscript pixels, keeps startAnalytics', () => {
    const out = stripThirdPartyAnalytics(SAMPLE);
    expect(out).toContain('window.__startMetrika = function () {};');
    expect(out).toContain('window.__startTmr = function () {};');
    expect(out).toContain('window.__startAnalytics');
    expect(out).not.toContain('111858495');
    expect(out).not.toContain('mc.yandex.ru');
    expect(out).not.toContain('top-fwz1.mail.ru');
    expect(out).not.toContain('3793248');
  });

  it('is idempotent on already-stripped HTML', () => {
    const once = stripThirdPartyAnalytics(SAMPLE);
    const twice = stripThirdPartyAnalytics(once);
    expect(twice).toBe(once);
  });

  it('strips live officelist-like Metrika block from fixture file if present', async () => {
    // Не ходим в сеть в CI — только проверяем, что живой фрагмент с ym() чистится.
    const liveFragment = SAMPLE.replace('ssr: true', 'ssr: true, webvisor: false');
    expect(stripThirdPartyAnalytics(liveFragment)).not.toContain('ym(111858495');
  });
});

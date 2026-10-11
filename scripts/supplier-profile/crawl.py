#!/usr/bin/env python3
"""Обход сайтов поставщиков для профиля «завод или перекуп» (тред «Закупки», 2026-09-28).

Снимки supplier_site_snapshots хранят только 3000 знаков главной и меню — марок
и продуктов там нет (у Краскофф не было ни «Вотерстоуна», ни половины линеек).
Этот обход сохраняет по каждому сайту сырьё для разбора: тексты страниц «о
компании», контактов, производства, дилеров, доставки, названия товаров из
каталога, телефоны, почты, ссылки на прайсы и соцсети. Разбор сырья в профиль —
отдельный шаг (extract), в базу пишет сессия Claude.

Запуск: python3 scripts/supplier-profile/crawl.py hosts.txt OUT_DIR [--workers 8] [--browser]
hosts.txt — строки «host<TAB>website_url» (или просто host). Уже удачно обойдённые
(есть OUT_DIR/<host>.json со страницами) пропускает, неудачные повторяет.
Сеть — через curl: он сам берёт прокси и сертификаты окружения.

--browser — страницы открывает Chrome через Playwright, по одному сайту за раз.
Нужен сайтам за защитой от ботов (DDoS-Guard, Qrator, «проверка браузера»):
curl они отдают 401/403 даже с российского адреса. Ставится один раз:
pip3 install playwright; если Google Chrome на машине нет — ещё
python3 -m playwright install chromium.
"""
import concurrent.futures as cf
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import urljoin, urlparse

MAX_PAGES = 45
MAX_TEXT = 12000
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

# Какие внутренние страницы брать в первую очередь: смысловые (о компании,
# контакты, производство…) — все, каталог — сколько влезет в лимит.
INFO_RE = re.compile(
    r'(about|o-?kompan|o-?nas|company|kompaniya|contact|kontakt|proizvod|production|manufactur|zavod|fabrik|'
    r'dealer|diler|partner|gde-?kupit|where|dostavk|delivery|oplat|price|prais|prajs|sertifikat|certif|'
    r'brand|brend|rekvizit|opt|wholesale|sotrudnich|filial|sklad|vacanc)',
    re.I,
)
CATALOG_RE = re.compile(r'(catalog|katalog|product|produk[ct]|produc|shop|goods|tovar|collection|kollekc|seriya|series|assortiment|izdeli|nomenklatur|model)', re.I)
SKIP_RE = re.compile(
    r'\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|zip|rar|mp4|avi|woff2?|ttf)(\?|$)|/(cart|basket|korzina|login|auth|register|'
    r'personal|compare|wishlist|search|poisk|news|novosti|stati|articles?|blog|press|akci|sale|otzyv|review|wp-json|feed)|\?(sort|page|filter|PAGEN|order)=|mailto:|tel:|javascript:',
    re.I,
)
FILE_RE = re.compile(r'\.(pdf|xlsx?|docx?)(\?|$)', re.I)
SOCIAL_RE = re.compile(r'https?://(www\.)?(vk\.com|t\.me|telegram\.me|youtube\.com|rutube\.ru|ok\.ru|dzen\.ru|wa\.me|api\.whatsapp\.com)/[^\s"\'<>]+', re.I)
PHONE_RE = re.compile(r'(?:\+7|8)[\s\-\(]*\d{3}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\+375[\s\-\(]*\d{2}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}')
EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}')
INN_RE = re.compile(r'ИНН[\s:№]*(\d{10}|\d{12})')
OGRN_RE = re.compile(r'ОГРН(?:ИП)?[\s:№]*(\d{13}|\d{15})')


BROWSER = None  # страница Playwright в режиме --browser
JAR_DIR = tempfile.mkdtemp(prefix='crawl-cookies-')
CHALLENGE_RE = re.compile(r'ddos-guard|just a moment|checking your browser|проверка браузера|qrator|вы не робот|are you human|captcha', re.I)


def fetch_browser(url, retry=True):
    try:
        # Иначе при сорванном переходе content() вернёт прошлую страницу — чужой сайт.
        try:
            BROWSER.goto('about:blank')
        except Exception:  # noqa: BLE001 — дозагрузка прошлой страницы, не важно
            pass
        try:
            r = BROWSER.goto(url, timeout=30000, wait_until='domcontentloaded')
        except Exception as e:  # noqa: BLE001
            # Защита сама перебрасывает на себя же — это не ошибка, ждём итоговую страницу.
            if 'interrupted by another navigation' not in str(e) and 'ERR_ABORTED' not in str(e):
                raise
            r = None
        # Проверка «вы не бот» проходит сама за несколько секунд и перезагружает страницу.
        for _ in range(4):
            BROWSER.wait_for_timeout(2500)
            try:
                title = BROWSER.title()
                body = BROWSER.inner_text('body', timeout=3000)
            except Exception:  # noqa: BLE001 — страница как раз перезагружается
                continue
            if not CHALLENGE_RE.search(title + ' ' + body[:500]) and len(body) > 200:
                break
        if BROWSER.url.startswith('about:'):
            return None, None, 'страница не открылась'
        page_html = BROWSER.content()
        status = r.status if r else 0
        text = strip_html(page_html)
        if CHALLENGE_RE.search(text[:500]) or len(text) < 200:
            return None, BROWSER.url, f'http {status} (проверка не пройдена)'
        return page_html, BROWSER.url, None
    except Exception as e:  # noqa: BLE001
        if retry:  # сетевой сбой бывает разовым — второй заход часто проходит
            return fetch_browser(url, retry=False)
        return None, None, str(e).split('\n')[0][:200]


def fetch(url):
    if BROWSER is not None:
        return fetch_browser(url)
    # Куки на хост: часть защит ставит куку первым ответом и ждёт её назад,
    # без неё отдаёт 301 на себя же или 401.
    jar = os.path.join(JAR_DIR, re.sub(r'[^\w.-]', '_', urlparse(url).hostname or 'x'))
    try:
        r = subprocess.run(
            ['curl', '-sSL', '--compressed', '--max-time', '12', '--connect-timeout', '6', '-A', UA,
             '-b', jar, '-c', jar, '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
             '-H', 'Accept-Language: ru-RU,ru;q=0.9,en;q=0.5', '-H', 'Upgrade-Insecure-Requests: 1', '-w', '\n__EFFECTIVE__%{url_effective} %{http_code} %{content_type}', url],
            capture_output=True, timeout=20,
        )
    except subprocess.TimeoutExpired:
        return None, None, 'timeout'
    out = r.stdout
    tail = out.rfind(b'\n__EFFECTIVE__')
    if tail < 0:
        return None, None, (r.stderr.decode('utf-8', 'ignore').strip() or 'no response')[:200]
    meta = out[tail + len(b'\n__EFFECTIVE__'):].decode('utf-8', 'ignore').split(' ', 2)
    body = out[:tail]
    if len(meta) < 2 or not meta[1].startswith('2'):
        return None, meta[0] if meta else None, f'http {meta[1] if len(meta) > 1 else "?"}'
    ctype = meta[2] if len(meta) > 2 else ''
    if 'html' not in ctype and ctype:
        return None, meta[0], f'type {ctype}'
    m = re.search(rb'charset=["\']?([\w-]+)', body[:3000])
    enc = (m.group(1).decode() if m else 'utf-8').lower()
    if 'charset=' in ctype:
        enc = ctype.split('charset=')[-1].strip().lower()
    try:
        text = body.decode(enc, 'ignore')
    except LookupError:
        text = body.decode('utf-8', 'ignore')
    return text, meta[0], None


def strip_html(h):
    h = re.sub(r'(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>', ' ', h)
    h = re.sub(r'(?is)<!--.*?-->', ' ', h)
    h = re.sub(r'(?i)<br\s*/?>|</(p|div|li|h\d|tr|td|section|article)>', '\n', h)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', h))
    t = re.sub(r'[ \t\xa0]+', ' ', t)
    t = re.sub(r'\n\s*\n+', '\n', t)
    return t.strip()


def links(h, base):
    out = []
    for m in re.finditer(r'(?is)<a\b[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', h):
        href = html.unescape(m.group(1).strip())
        text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', m.group(2)))).strip()
        try:
            out.append((urljoin(base, href), text[:150]))
        except ValueError:
            # Битая ссылка вида http://[461…] — urlparse падает на ней целиком.
            continue
    return out


def same_site(url, host):
    try:
        h = (urlparse(url).hostname or '').lower()
    except ValueError:
        return False
    h = h[4:] if h.startswith('www.') else h
    return h == host or h.endswith('.' + host)


def norm(url):
    p = urlparse(url)
    return f'{p.scheme}://{p.netloc.lower()}{p.path.rstrip("/") or "/"}' + (f'?{p.query}' if p.query else '')


def crawl(host, start_url):
    start = start_url if start_url.startswith('http') else f'https://{host}/'
    home, eff, err = fetch(start)
    if home is None and not start.startswith('http://'):
        home, eff, err = fetch(f'http://{host}/')
    res = {'host': host, 'start_url': start, 'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'error': None, 'pages': [],
           'product_links': [], 'files': [], 'social': [], 'phones': [], 'emails': [], 'inn': [], 'ogrn': []}
    if home is None:
        res['error'] = err
        return res
    base = eff or start
    seen = {norm(base)}
    queue_info, queue_cat, queue_other = [], [], []
    product_links = {}
    raw_all = []

    def absorb(page_html, page_url, kind):
        raw_all.append(page_html)
        title = re.search(r'(?is)<title[^>]*>(.*?)</title>', page_html)
        desc = re.search(r'(?is)<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', page_html)
        res['pages'].append({
            'url': page_url, 'kind': kind,
            'title': html.unescape(re.sub(r'\s+', ' ', title.group(1))).strip()[:300] if title else '',
            'description': html.unescape(desc.group(1)).strip()[:500] if desc else '',
            'text': strip_html(page_html)[:MAX_TEXT],
        })
        for url, text in links(page_html, page_url):
            if FILE_RE.search(url):
                res['files'].append({'url': url, 'text': text})
                continue
            if not same_site(url, host) or SKIP_RE.search(url):
                continue
            n = norm(url)
            path = urlparse(url).path
            # Ссылка с осмысленной подписью в глубине каталога — скорее всего товар.
            if text and len(text) > 3 and path.count('/') >= 3 and (CATALOG_RE.search(path) or kind != 'home'):
                product_links.setdefault(n, text)
            if n in seen:
                continue
            seen.add(n)
            if INFO_RE.search(path) or INFO_RE.search(text or ''):
                queue_info.append(url)
            elif CATALOG_RE.search(path) and path.count('/') <= 4:
                queue_cat.append(url)
            elif path.count('/') <= 3:
                # Каталог без говорящего слова в адресе (/negoryuchie-potolki/) —
                # берём в последнюю очередь, если лимит ещё не выбран.
                queue_other.append(url)

    absorb(home, base, 'home')
    fetched = 1
    # Потолок на сайт: медленный сервер (12 с на страницу × 45) держал поток
    # по 10 минут и тормозил весь обход.
    deadline = time.time() + (300 if BROWSER is not None else 150)
    # Сначала все смысловые страницы (до 20), потом каталог.
    for kind, queue, cap in (('info', queue_info, 20), ('catalog', queue_cat, MAX_PAGES), ('other', queue_other, 15)):
        i = 0
        while i < len(queue) and fetched < MAX_PAGES and i < cap and time.time() < deadline:
            url = queue[i]
            i += 1
            time.sleep(0.4)
            page, eff2, _ = fetch(url)
            fetched += 1
            if page:
                absorb(page, eff2 or url, kind)

    blob = '\n'.join(raw_all)
    text_blob = '\n'.join(p['text'] for p in res['pages'])
    res['product_links'] = [{'url': u, 'text': t} for u, t in list(product_links.items())[:600]]
    res['social'] = sorted({m.group(0).rstrip('/').split('?')[0] for m in SOCIAL_RE.finditer(blob)})[:30]
    res['phones'] = sorted({re.sub(r'[^\d+]', '', p) for p in PHONE_RE.findall(text_blob)})[:30]
    res['emails'] = sorted({e.lower() for e in EMAIL_RE.findall(blob) if not re.search(r'\.(png|jpg|gif|webp|svg)$|example|sentry|wixpress', e, re.I)})[:30]
    res['inn'] = sorted(set(INN_RE.findall(text_blob)))
    res['ogrn'] = sorted(set(OGRN_RE.findall(text_blob)))
    seen_files = set()
    res['files'] = [f for f in res['files'] if not (f['url'] in seen_files or seen_files.add(f['url']))][:60]
    return res


def main():
    hosts_file, out_dir = sys.argv[1], sys.argv[2]
    workers = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 8
    os.makedirs(out_dir, exist_ok=True)
    pw = None
    if '--browser' in sys.argv:
        global BROWSER
        from playwright.sync_api import sync_playwright
        pw = sync_playwright().start()
        opts = {'headless': '--headless' in sys.argv, 'args': ['--disable-blink-features=AutomationControlled']}
        if os.environ.get('HTTPS_PROXY'):
            opts['proxy'] = {'server': os.environ['HTTPS_PROXY']}
        try:
            if os.environ.get('CHROME_PATH'):
                b = pw.chromium.launch(executable_path=os.environ['CHROME_PATH'], **opts)
            else:
                b = pw.chromium.launch(channel='chrome', **opts)  # установленный Google Chrome
        except Exception:  # noqa: BLE001
            b = pw.chromium.launch(**opts)
        ctx = b.new_context(locale='ru-RU', user_agent=UA, ignore_https_errors=True, viewport={'width': 1366, 'height': 900})
        BROWSER = ctx.new_page()
    jobs = []
    for line in open(hosts_file, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if not parts[0]:
            continue
        host = parts[0].strip().lower()
        done_file = os.path.join(out_dir, f'{host}.json')
        if os.path.exists(done_file):
            try:
                if json.load(open(done_file, encoding='utf-8')).get('pages'):
                    continue
            except (OSError, ValueError):
                pass
        jobs.append((host, parts[1].strip() if len(parts) > 1 else ''))
    print(f'к обходу: {len(jobs)}', flush=True)
    done = 0

    def save(h, r):
        nonlocal done
        with open(os.path.join(out_dir, f'{h}.json'), 'w', encoding='utf-8') as fp:
            json.dump(r, fp, ensure_ascii=False)
        done += 1
        print(f'{done}/{len(jobs)} {h} стр={len(r.get("pages", []))} тов={len(r.get("product_links", []))} {r.get("error") or ""}', flush=True)

    if pw:
        # Playwright привязан к потоку, где запущен, — браузерный обход идёт в главном.
        for h, u in jobs:
            try:
                r = crawl(h, u)
            except Exception as e:  # noqa: BLE001
                r = {'host': h, 'error': f'crash: {e}', 'pages': []}
            save(h, r)
    else:
        with cf.ThreadPoolExecutor(workers) as ex:
            futs = {ex.submit(crawl, h, u): h for h, u in jobs}
            for f in cf.as_completed(futs):
                h = futs[f]
                try:
                    r = f.result()
                except Exception as e:  # noqa: BLE001 — один сайт не должен ронять обход
                    r = {'host': h, 'error': f'crash: {e}', 'pages': []}
                save(h, r)
    if pw:
        pw.stop()


if __name__ == '__main__':
    main()

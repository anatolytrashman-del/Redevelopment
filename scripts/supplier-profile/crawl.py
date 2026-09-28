#!/usr/bin/env python3
"""Обход сайтов поставщиков для профиля «завод или перекуп» (тред «Закупки», 2026-09-28).

Снимки supplier_site_snapshots хранят только 3000 знаков главной и меню — марок
и продуктов там нет (у Краскофф не было ни «Вотерстоуна», ни половины линеек).
Этот обход сохраняет по каждому сайту сырьё для разбора: тексты страниц «о
компании», контактов, производства, дилеров, доставки, названия товаров из
каталога, телефоны, почты, ссылки на прайсы и соцсети. Разбор сырья в профиль —
отдельный шаг (extract), в базу пишет сессия Claude.

Запуск: python3 scripts/supplier-profile/crawl.py hosts.txt OUT_DIR [--workers 8]
hosts.txt — строки «host<TAB>website_url». Уже обойдённые (есть OUT_DIR/<host>.json) пропускает.
Сеть — через curl: он сам берёт прокси и сертификаты окружения.
"""
import concurrent.futures as cf
import html
import json
import os
import re
import subprocess
import sys
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


def fetch(url):
    try:
        r = subprocess.run(
            ['curl', '-sSL', '--compressed', '--max-time', '25', '-A', UA, '-w', '\n__EFFECTIVE__%{url_effective} %{http_code} %{content_type}', url],
            capture_output=True, timeout=40,
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
        out.append((urljoin(base, href), text[:150]))
    return out


def same_site(url, host):
    h = (urlparse(url).hostname or '').lower()
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
    # Сначала все смысловые страницы (до 20), потом каталог.
    for kind, queue, cap in (('info', queue_info, 20), ('catalog', queue_cat, MAX_PAGES), ('other', queue_other, 15)):
        i = 0
        while i < len(queue) and fetched < MAX_PAGES and i < cap:
            url = queue[i]
            i += 1
            time.sleep(0.7)
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
    jobs = []
    for line in open(hosts_file, encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if not parts[0]:
            continue
        host = parts[0].strip().lower()
        if os.path.exists(os.path.join(out_dir, f'{host}.json')):
            continue
        jobs.append((host, parts[1].strip() if len(parts) > 1 else ''))
    print(f'к обходу: {len(jobs)}', flush=True)
    done = 0
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(crawl, h, u): h for h, u in jobs}
        for f in cf.as_completed(futs):
            h = futs[f]
            try:
                r = f.result()
            except Exception as e:  # noqa: BLE001 — один сайт не должен ронять обход
                r = {'host': h, 'error': f'crash: {e}', 'pages': []}
            with open(os.path.join(out_dir, f'{h}.json'), 'w', encoding='utf-8') as fp:
                json.dump(r, fp, ensure_ascii=False)
            done += 1
            print(f'{done}/{len(jobs)} {h} стр={len(r.get("pages", []))} тов={len(r.get("product_links", []))} {r.get("error") or ""}', flush=True)


if __name__ == '__main__':
    main()

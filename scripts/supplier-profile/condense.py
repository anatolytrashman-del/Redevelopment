#!/usr/bin/env python3
"""Сжимает сырьё обхода (crawl.py) до выжимки для разбора моделью.

Сырьё сайта — до мегабайта (45 страниц текста), модели столько не нужно:
берём смысловые страницы целиком (до 5000 знаков), с каталожных — только
заголовок, уникальные названия товаров из ссылок, телефоны, почты, файлы.
Запуск: python3 condense.py RAW_DIR OUT_DIR [host ...]
"""
import json
import os
import re
import sys

INFO_TEXT = 5000
HOME_TEXT = 6000
MAX_PRODUCTS = 350


def dedupe_lines(text, seen):
    out = []
    for line in text.split('\n'):
        k = line.strip()
        if len(k) < 3 or k in seen:
            continue
        seen.add(k)
        out.append(k)
    return '\n'.join(out)


def condense(raw):
    seen_lines = set()
    pages = []
    # Меню и подвал повторяются на каждой странице — строка, уже встреченная
    # на предыдущей странице, второй раз не попадает.
    for p in raw.get('pages', []):
        if p['kind'] == 'home':
            text = dedupe_lines(p['text'], seen_lines)[:HOME_TEXT]
        elif p['kind'] == 'info':
            text = dedupe_lines(p['text'], seen_lines)[:INFO_TEXT]
        else:
            text = dedupe_lines(p['text'], seen_lines)[:600]
        pages.append({'url': p['url'], 'kind': p['kind'], 'title': p['title'], 'description': p.get('description', ''), 'text': text})
    products, seen_p = [], set()
    for pl in raw.get('product_links', []):
        t = re.sub(r'\s+', ' ', pl['text']).strip()
        k = t.lower()
        if k in seen_p or len(t) < 4:
            continue
        seen_p.add(k)
        products.append(t)
        if len(products) >= MAX_PRODUCTS:
            break
    return {
        'host': raw['host'],
        'error': raw.get('error'),
        'phones': raw.get('phones', []),
        'emails': raw.get('emails', []),
        'inn': raw.get('inn', []),
        'ogrn': raw.get('ogrn', []),
        'social': raw.get('social', []),
        'files': raw.get('files', [])[:40],
        'products': products,
        'pages': pages,
    }


def main():
    raw_dir, out_dir = sys.argv[1], sys.argv[2]
    hosts = sys.argv[3:]
    os.makedirs(out_dir, exist_ok=True)
    names = [f'{h}.json' for h in hosts] if hosts else sorted(os.listdir(raw_dir))
    for n in names:
        raw = json.load(open(os.path.join(raw_dir, n), encoding='utf-8'))
        if raw.get('error') and not raw.get('pages'):
            continue
        c = condense(raw)
        with open(os.path.join(out_dir, n), 'w', encoding='utf-8') as fp:
            json.dump(c, fp, ensure_ascii=False, indent=0)


if __name__ == '__main__':
    main()

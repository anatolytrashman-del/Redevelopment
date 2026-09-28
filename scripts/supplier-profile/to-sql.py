#!/usr/bin/env python3
"""Профили из разбора (extract-brief.md) → SQL обновления suppliers.

Запуск: python3 to-sql.py OUT_DIR [host ...] > update.sql
Пишет по website_host. Уверенность low — только site_profile, без типа и марок:
по сомнительному разбору позиции к заводу не поведём. Однобуквенные приставки
и общие слова-серии вычищаются ещё раз — на случай, если разбор их пропустил.
"""
import json
import os
import sys

GENERIC = {'классика', 'стандарт', 'универсал', 'эконом', 'премиум', 'люкс', 'комфорт', 'гладкий', 'ламинированный',
           'smart', 'thermo', 'standard', 'classic', 'lux', 'premium', 'эко', 'eco', 'pro', 'проф', 'разметка'}
KINDS = {'manufacturer', 'brand_owner', 'dealer', 'retail', 'contractor'}


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def arr(xs):
    xs = [x for x in dict.fromkeys(str(x).strip() for x in xs or []) if x]
    return ('array[' + ','.join(q(x) for x in xs) + ']::text[]') if xs else "'{}'::text[]"


def main():
    out_dir = sys.argv[1]
    hosts = sys.argv[2:] or [f[:-5] for f in sorted(os.listdir(out_dir)) if f.endswith('.json')]
    for h in hosts:
        try:
            d = json.load(open(os.path.join(out_dir, f'{h}.json'), encoding='utf-8'))
        except (OSError, json.JSONDecodeError) as e:
            print(f'-- {h}: пропуск ({e})')
            continue
        profile = q(json.dumps(d, ensure_ascii=False)) + '::jsonb'
        kind = d.get('supplier_kind')
        note = f"{d.get('kind_evidence') or ''} (разбор сайта 2026-09-28, уверенность {d.get('confidence')})".strip()
        if d.get('confidence') == 'low' or kind not in KINDS:
            print(f"update suppliers set site_profile={profile}, profiled_at=now() where website_host={q(h)} and deleted_at is null;")
            continue
        own = [b for b in d.get('own_brands') or [] if len(b.strip()) > 1 and b.strip().lower() not in GENERIC]
        pre = [p for p in d.get('article_prefixes') or [] if len(p.strip()) >= 2]
        print(
            f"update suppliers set supplier_kind={q(kind)}, own_brands={arr(own)}, article_prefixes={arr(pre)}, "
            f"product_kinds={arr(d.get('product_kinds'))}, resold_brands={arr(d.get('resold_brands'))}, "
            f"profile_note={q(note)}, site_profile={profile}, profiled_at=now() "
            f"where website_host={q(h)} and deleted_at is null;"
        )


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Read-only GSC/Bing/Vercel collector. Credentials stay on the collecting machine.

pip install google-api-python-client google-auth
GSC_SERVICE_ACCOUNT_JSON: JSON or path; BING_WEBMASTER_API_KEY;
VERCEL_ANALYTICS_TOKEN. --secrets-file: JSON file with the keys under "card" (never committed).
No credentials or upstream error bodies are ever written to the snapshot/log.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'data/metrics-sources.json').read_text())


def read_json(url, headers=None):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f'HTTP {e.code}') from None
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise RuntimeError('network-error') from None
        time.sleep(2 ** attempt)


def host_filter(field, hosts):
    # Exact hosts, plus www. No substring matching (chatgpt.com.spam is excluded).
    values = sorted({v for h in hosts for v in ((h,) if field == 'utmSource' else (h, 'www.' + h))})
    return field + ' in (' + ','.join("'" + h + "'" for h in values) + ')'


def traffic_filters(utm=True):
    ai = '(' + host_filter('referrerHostname', CONFIG['aiHosts'])
    if utm:
        ai += ' or ' + host_filter('utmSource', CONFIG['aiHosts'])
    ai += ')'
    search = '(' + host_filter('referrerHostname', CONFIG['searchHosts']) + ') and not ' + ai
    return {'search': search, 'ai': ai}


def collect(args):
    secrets = json.loads(Path(args.secrets_file).read_text()).get('card', {}) if args.secrets_file else {}
    def credential(name):
        return os.environ.get(name) or secrets.get(name)
    today = dt.datetime.now(dt.timezone.utc).date()
    end = today.isoformat()
    start = (today - dt.timedelta(days=480)).isoformat()  # GSC's 16-month history
    out = {'version': 1, 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
           'searchStart': start, 'searchEnd': end, 'sites': []}
    raw = credential('GSC_SERVICE_ACCOUNT_JSON')
    gsc = None
    if raw:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        info = json.loads(raw) if raw.lstrip().startswith('{') else json.loads(Path(raw).read_text())
        creds = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/webmasters.readonly'])
        gsc = build('searchconsole', 'v1', credentials=creds, cache_discovery=False)
    bing_key = credential('BING_WEBMASTER_API_KEY')
    token = credential('VERCEL_ANALYTICS_TOKEN')
    old = json.loads(args.output.read_text()) if args.output.exists() else {'sites': []}
    for site in CONFIG['sites']:
        result = {**site, 'gsc': {'status': 'not-configured', 'daily': []},
                  'bing': {'status': 'not-configured', 'daily': []},
                  'analytics': {'status': 'not-configured', 'daily': []}}
        if gsc:
            try:
                rows = gsc.searchanalytics().query(siteUrl='sc-domain:' + site['domain'], body={
                    'startDate': start, 'endDate': end, 'dimensions': ['date'],
                    'type': 'web', 'dataState': 'final', 'rowLimit': 25000,
                }).execute(num_retries=2).get('rows', [])
                result['gsc'] = {'status': 'ok', 'daily': sorted([{
                    'day': r['keys'][0], 'clicks': int(r['clicks']), 'impressions': int(r['impressions']),
                    'ctr': r['ctr'], 'position': r['position'],
                } for r in rows], key=lambda r: r['day'])}
            except Exception:
                result['gsc']['status'] = 'unavailable'
        if bing_key:
            try:
                params = urllib.parse.urlencode({'apikey': bing_key, 'siteUrl': 'https://' + site['domain'] + '/'})
                rows = read_json('https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?' + params)['d'] or []
                daily = []
                for r in rows:
                    stamp = re.search(r'/Date\((\d+)', r['Date'])
                    day = dt.datetime.fromtimestamp(int(stamp[1]) / 1000, dt.timezone.utc).date().isoformat() if stamp else r['Date'][:10]
                    daily.append({'day': day, 'clicks': int(r['Clicks']), 'impressions': int(r['Impressions'])})
                result['bing'] = {'status': 'ok', 'daily': sorted(daily, key=lambda r: r['day'])}
            except Exception:
                result['bing']['status'] = 'unavailable'
        if token and site.get('project'):
            try:
                analytics_start = (today - dt.timedelta(days=60)).isoformat()
                daily = {}
                filters = traffic_filters()
                utm_status = 'ok'
                for channel in ('ai', 'search'):
                    expression = filters[channel]
                    assert len(expression) <= 2048
                    params = urllib.parse.urlencode({'teamId': CONFIG['teamId'], 'projectId': site['project'],
                        'by': 'day', 'limit': 100, 'since': analytics_start,
                        'until': end, 'filter': expression})
                    try:
                        response = read_json('https://api.vercel.com/v1/query/web-analytics/visits/aggregate?' + params,
                                             {'Authorization': 'Bearer ' + token})
                    except RuntimeError as error:
                        if channel != 'ai' or str(error) != 'HTTP 402':
                            raise
                        # UTM is a paid add-on on this team. Keep referrer data without buying it.
                        utm_status = 'unavailable-plan'
                        filters = traffic_filters(utm=False)
                        params = urllib.parse.parse_qs(params)
                        params['filter'] = [filters[channel]]
                        response = read_json('https://api.vercel.com/v1/query/web-analytics/visits/aggregate?' + urllib.parse.urlencode(params, doseq=True),
                                             {'Authorization': 'Bearer ' + token})
                    for r in response['data']:
                        day = r['timestamp'][:10]
                        if not analytics_start <= day <= end:
                            continue
                        daily.setdefault(day, {'day': day, 'search': 0, 'ai': 0})[channel] = int(r['visitors'])
                result['analytics'] = {'status': 'ok', 'since': analytics_start, 'until': end,
                    'metric': 'daily-visitors', 'utmStatus': utm_status, 'daily': sorted(daily.values(), key=lambda r: r['day'])}
            except Exception:
                result['analytics']['status'] = 'unavailable'
        if site.get('historical'):
            result['analytics']['status'] = 'no-separate-source'
        previous = next((s for s in old['sites'] if s['id'] == site['id']), {})
        for source in ('gsc', 'bing', 'analytics'):
            current = result[source]
            before = previous.get(source, {})
            if current['status'] == 'ok':
                # Keep older history; replace the refetched window (including deleted rows).
                cutoff = current.get('since', start) if source != 'bing' else (current['daily'][0]['day'] if current['daily'] else end)
                preserved = [r for r in before.get('daily', []) if r['day'] < cutoff]
                current['daily'] = preserved + current['daily']
                current['updatedAt'] = out['generatedAt']
            elif before.get('daily'):
                result[source] = {**before, 'status': 'stale'}
        out['sites'].append(result)
        print(site['domain'] + ': ' + ', '.join(f'{s}={result[s]["status"]} ({len(result[s]["daily"])})' for s in ('gsc', 'bing', 'analytics')))
    # Atomic replacement: a failed run must never leave truncated JSON.
    with tempfile.NamedTemporaryFile(mode='w', dir=args.output.parent, delete=False) as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        temp = f.name
    os.replace(temp, args.output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--secrets-file')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/search-metrics.json')
    collect(parser.parse_args())

// Фильтр ботов и ИИ-агентов для Vercel Web Analytics (30.10.2026, владелец:
// «максимум фильтровать посещения ИИ-агентов и ботов в аналитике»).
//
// Web Analytics не отдаёт сырой User-Agent и IP — только browserName, osName,
// deviceType, referrerHostname, country. Поэтому фильтр строится из того, что
// есть, правилами из data/metrics-sources.json → botRules:
//   • names  — браузер/ОС с признаками бота, краулера, headless-браузера,
//              HTTP-библиотеки или ИИ-агента (botNamePattern);
//   • filter — готовое OData-условие (рой без реферера, Linux-десктоп как
//              признак сервера и т. п.).
// Канал «ИИ» (люди, пришедшие из ChatGPT и др.) остаётся: отсекаются только
// визиты, подпадающие под правила, — из любого канала.

export function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Имена браузеров/ОС, похожие на ботов, из разбивок by=browserName/osName. */
export function botNames(rows, key, pattern) {
  const re = new RegExp(pattern, 'i');
  return [...new Set(rows.map((r) => String(r[key] ?? '')).filter((name) => name && name !== 'Others' && re.test(name)))].sort();
}

/**
 * OData-условие «это бот». null — правил нет.
 * names: { browserName: string[], osName: string[] } — найденные по шаблону.
 */
export function botExpression(rules, names = { browserName: [], osName: [] }) {
  const parts = [];
  for (const rule of rules ?? []) {
    if (rule.match === 'names') {
      for (const key of ['browserName', 'osName']) {
        const list = names[key] ?? [];
        if (list.length) parts.push(`${key} in (${list.map(quote).join(',')})`);
      }
    } else if (rule.filter) {
      parts.push(`(${rule.filter})`);
    }
  }
  return parts.length ? parts.join(' or ') : null;
}

export function withoutBots(filter, bots) {
  if (!bots) return filter || null;
  return filter ? `(${filter}) and not (${bots})` : `not (${bots})`;
}

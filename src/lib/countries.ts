// Страны в «Показателях» по-русски и с флагом (30.10.2026, владелец: «страны
// сделай понятными и с флагами»). Vercel Web Analytics отдаёт ISO 3166-1
// alpha-2 («US», «DE»); название — из Intl (без своих словарей), флаг —
// из пары символов-«региональных индикаторов».

let names: Intl.DisplayNames | null = null;
try {
  names = new Intl.DisplayNames(['ru'], { type: 'region' });
} catch {
  names = null;
}

export function countryFlag(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🌐';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// Короткие привычные названия вместо официальных из Intl.
const SHORT: Record<string, string> = { US: 'США', AE: 'ОАЭ', GB: 'Великобритания', CZ: 'Чехия' };

export function countryName(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return 'Не определена';
  if (SHORT[cc]) return SHORT[cc];
  try {
    const name = names?.of(cc);
    return name && name !== cc ? name : cc;
  } catch {
    return cc;
  }
}

export function countryLabel(code: string): string {
  return `${countryFlag(code)} ${countryName(code)}`;
}

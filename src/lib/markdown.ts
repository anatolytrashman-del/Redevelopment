import { marked } from 'marked';

// GFM (таблицы, зачёркивание и т.п.) включён в marked по умолчанию — как раз
// нужен для саммери встреч (там таблицы с цифрами). breaks: true — одиночный
// перевод строки уже перенос, без него нужно было бы явно оставлять пустую
// строку между абзацами, как в "чистом" markdown, а исходники сюда обычно
// вставляют как есть.
marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false });
}

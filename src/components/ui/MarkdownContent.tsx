import { renderMarkdown } from '../../lib/markdown';
import { cn } from '../../lib/cn';

// Общий рендер markdown (саммери встреч и т.п.) — prose из
// @tailwindcss/typography, чтобы таблицы/заголовки/списки не пришлось
// стилизовать вручную под каждое новое использование.
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn('prose prose-sm max-w-none prose-headings:text-ink prose-p:text-ink-muted prose-li:text-ink-muted', className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

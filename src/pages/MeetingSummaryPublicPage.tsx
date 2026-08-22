import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { MarkdownContent } from '../components/ui/MarkdownContent';
import type { MeetingSummary } from '../data/meetingSummaries';
import { fetchMeetingSummaryByToken } from '../lib/meetingSummariesApi';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Публичная ссылка на саммери встречи — без пароля админки, чтобы можно
// было просто скинуть ссылку второй стороне разговора почитать. Тот же
// приём, что у BriefPublicPage на /tz/:token.
export function MeetingSummaryPublicPage() {
  const { token } = useParams();
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    if (summary) document.title = summary.title;
    return () => {
      document.title = previousTitle;
    };
  }, [summary]);

  // Ссылка на саммери встречи — рассылается напрямую участникам разговора,
  // в поиске быть не должна (см. setNoIndex).
  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    fetchMeetingSummaryByToken(token)
      .then(setSummary)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить саммери')))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем саммери...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

        {!loading && !loadError && summary && (
          <Card className="flex flex-col gap-4 p-6">
            <h1 className="text-xl font-bold text-ink">{summary.title}</h1>
            <MarkdownContent content={summary.content} />
          </Card>
        )}
      </div>
    </div>
  );
}

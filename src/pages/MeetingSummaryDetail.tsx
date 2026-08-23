import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Copy, Check, Eye, Pencil, Mic, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { MarkdownContent } from '../components/ui/MarkdownContent';
import type { MeetingSummary } from '../data/meetingSummaries';
import { fetchMeetingSummary, updateMeetingSummary } from '../lib/meetingSummariesApi';
import { transcribeAudioFile, summarizeTranscript, type TranscribeProgress } from '../lib/meetingTranscribeApi';
import { cn } from '../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function MeetingSummaryDetail() {
  const { id } = useParams();
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [transcript, setTranscript] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchMeetingSummary(id)
      .then((s) => {
        setSummary(s);
        setTitle(s.title);
        setContent(s.content);
        setTranscript(s.transcript);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить саммери')))
      .finally(() => setLoading(false));
  }, [id]);

  const dirty =
    summary != null && (title !== summary.title || content !== summary.content || transcript !== summary.transcript);

  async function handleSave() {
    if (!summary || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMeetingSummary(summary.id, {
        title: title.trim() || 'Без названия',
        content,
        transcript,
      });
      setSummary(updated);
      setTitle(updated.title);
      setContent(updated.content);
      setTranscript(updated.transcript);
    } catch (err) {
      setSaveError(errorMessage(err, 'Не удалось сохранить саммери'));
    } finally {
      setSaving(false);
    }
  }

  // Расшифровка сохраняется в базу СРАЗУ по завершении (не ждёт общей кнопки
  // "Сохранить") — потерять результат многоминутной оплачиваемой расшифровки
  // из-за забытого клика больнее всего; тот же принцип, что немедленное
  // сохранение фото в дизайн-проектах.
  async function handleAudioSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (audioInputRef.current) audioInputRef.current.value = '';
    if (!file || !summary || transcribing) return;
    setTranscribing(true);
    setTranscribeError(null);
    setProgress(null);
    try {
      const text = await transcribeAudioFile(file, setProgress);
      if (!text.trim()) throw new Error('Распознавание вернуло пустой текст — проверьте запись');
      setTranscript(text);
      setShowTranscript(true);
      const updated = await updateMeetingSummary(summary.id, { title: summary.title, content: summary.content, transcript: text });
      setSummary(updated);
    } catch (err) {
      setTranscribeError(errorMessage(err, 'Не удалось расшифровать запись'));
    } finally {
      setTranscribing(false);
      setProgress(null);
    }
  }

  async function handleSummarize() {
    if (!transcript.trim() || summarizing) return;
    if (content.trim() && !window.confirm('Текст саммери уже заполнен — заменить его сгенерированным?')) return;
    setSummarizing(true);
    setTranscribeError(null);
    try {
      const generated = await summarizeTranscript(transcript);
      setContent(generated);
      setTab('preview');
    } catch (err) {
      setTranscribeError(errorMessage(err, 'Не удалось сгенерировать саммери'));
    } finally {
      setSummarizing(false);
    }
  }

  async function handleCopy() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/summary/${summary.shareToken}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // намеренно молча — ссылку видно текстом и так, просто не скопируется
    }
  }

  return (
    <>
      <PageHeader title="Саммери встречи" />

      <Link
        to="/admin/meeting-summaries"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Все саммери
      </Link>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем саммери...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && summary && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-lg font-bold text-ink">Запись встречи</div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.ogg"
              className="hidden"
              onChange={handleAudioSelected}
            />
            <Button
              type="button"
              variant="secondary"
              icon={transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              onClick={() => audioInputRef.current?.click()}
              disabled={transcribing}
            >
              {transcribing
                ? progress?.stage === 'preparing'
                  ? 'Готовим аудио...'
                  : progress && progress.chunkCount > 1
                    ? `Расшифровка: часть ${progress.chunkIndex} из ${progress.chunkCount}...`
                    : 'Расшифровка...'
                : transcript.trim()
                  ? 'Расшифровать другую запись'
                  : 'Загрузить запись и расшифровать'}
            </Button>
            <Button
              type="button"
              icon={summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              onClick={handleSummarize}
              disabled={!transcript.trim() || summarizing || transcribing}
            >
              {summarizing ? 'Генерируем саммери...' : 'Сделать саммери из расшифровки'}
            </Button>
          </div>
          {transcribeError && <p className="text-sm text-danger">{transcribeError}</p>}
          {transcript.trim() && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="w-fit text-sm font-medium text-ink-muted hover:text-primary"
              >
                {showTranscript ? 'Скрыть расшифровку' : 'Показать расшифровку'}
              </button>
              {showTranscript && (
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="Расшифровка записи"
                />
              )}
            </div>
          )}
        </Card>
      )}

      {!loading && !loadError && summary && (
        <Card className="flex flex-col gap-4 p-5">
          <Input label="Название" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-full border border-border p-1">
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
                  tab === 'edit' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
                Правка
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
                  tab === 'preview' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                Просмотр
              </button>
            </div>

            <Button
              type="button"
              variant="secondary"
              icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={handleCopy}
            >
              {copied ? 'Скопировано' : 'Скопировать ссылку'}
            </Button>
          </div>

          {tab === 'edit' ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={24}
              placeholder="Текст саммери (поддерживается markdown — заголовки, списки, таблицы, жирный текст)..."
              className="font-mono text-xs"
            />
          ) : content.trim() ? (
            <div className="rounded-control border border-border p-4">
              <MarkdownContent content={content} />
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ink-faint">Текста пока нет</p>
          )}

          {saveError && <p className="text-sm text-danger">{saveError}</p>}

          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

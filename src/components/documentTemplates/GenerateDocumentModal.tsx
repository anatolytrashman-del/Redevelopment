import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import type { DocumentTemplate } from '../../data/documentTemplates';
import { generateDocument } from '../../lib/generateDocumentApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface GenerateDocumentModalProps {
  template: DocumentTemplate | null;
  onClose: () => void;
}

export function GenerateDocumentModal({ template, onClose }: GenerateDocumentModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    setValues({});
    setSubmitError(null);
    setResultUrl(null);
  }, [template]);

  if (!template) return null;

  const canSubmit = template.fields.every((f) => (values[f.key] ?? '').trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!template || !canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const { url } = await generateDocument(template.id, values);
      setResultUrl(url);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сгенерировать документ'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!template} onClose={onClose} title={`Заполнить: ${template.name}`}>
      {resultUrl ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">Документ готов — открылась копия шаблона с подставленными данными.</p>
          <a
            href={resultUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Открыть документ
            <ExternalLink className="h-4 w-4" />
          </a>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : template.fields.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            У этого шаблона не настроены поля для заполнения. Добавьте их через редактирование шаблона.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {template.fields.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              type={field.type === 'date' ? 'date' : 'text'}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              required
            />
          ))}

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Генерируем...' : 'Сгенерировать'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

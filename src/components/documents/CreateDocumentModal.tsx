import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { ToggleGroup } from '../ui/ToggleGroup';
import type { DocumentTemplate } from '../../data/documentTemplates';
import type { Lead } from '../../data/leads';
import type { GeneratedDocument } from '../../data/generatedDocuments';
import { generateDocument } from '../../lib/generateDocumentApi';
import { insertGeneratedDocument } from '../../lib/generatedDocumentsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function leadLabel(l: Lead) {
  return `${l.name} — ${l.contact}`;
}

interface CreateDocumentModalProps {
  open: boolean;
  onClose: () => void;
  templates: DocumentTemplate[];
  leads: Lead[];
  onCreated: (doc: GeneratedDocument) => void;
}

export function CreateDocumentModal({ open, onClose, templates, leads, onCreated }: CreateDocumentModalProps) {
  const [templateId, setTemplateId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setLeadId('');
    setValues({});
    setSubmitError(null);
    setResultUrl(null);
  }, [open]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const selectedLead = leads.find((l) => l.id === leadId) ?? null;

  useEffect(() => {
    setValues({});
  }, [templateId]);

  const canSubmit = !!template && !!leadId && template.fields.every((f) => (values[f.key] ?? '').trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!template || !leadId || !canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const { url, title } = await generateDocument(template.id, values);
      const doc = await insertGeneratedDocument({ templateId: template.id, leadId, title, url });
      onCreated(doc);
      setResultUrl(url);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сгенерировать документ'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Новый документ">
      {resultUrl ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">Документ готов и добавлен в список со статусом «Готов к отправке».</p>
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
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select
            label="Шаблон"
            options={templates.map((t) => t.name)}
            value={template?.name ?? ''}
            onChange={(v) => setTemplateId(templates.find((t) => t.name === v)?.id ?? '')}
          />
          <Select
            label="Лид"
            options={leads.map(leadLabel)}
            value={selectedLead ? leadLabel(selectedLead) : ''}
            onChange={(v) => setLeadId(leads.find((l) => leadLabel(l) === v)?.id ?? '')}
          />

          {template && template.fields.length === 0 && (
            <p className="text-sm text-ink-muted">
              У этого шаблона нет полей для заполнения — настройте их в «Шаблонах документов».
            </p>
          )}

          {template?.fields.map((field) =>
            field.type === 'gender' ? (
              <ToggleGroup
                key={field.key}
                label={field.label}
                options={['Мужчина', 'Женщина']}
                value={values[field.key] ?? ''}
                onChange={(v) => setValues((val) => ({ ...val, [field.key]: v }))}
              />
            ) : (
              <Input
                key={field.key}
                label={field.label}
                type={field.type === 'date' ? 'date' : 'text'}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                required
              />
            ),
          )}

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

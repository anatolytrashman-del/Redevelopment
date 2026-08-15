import { useState } from 'react';
import { Download, FileCheck2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ToggleGroup } from '../ui/ToggleGroup';
import { requestAgreementOtp, verifyAgreementOtp } from '../../lib/agreementSigningApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

const emptyForm = {
  buyerName: '',
  buyerGender: 'Мужчина' as 'Мужчина' | 'Женщина',
  buyerPassport: '',
  buyerPassportIssued: '',
  buyerAddress: '',
  email: '',
};

interface AgreementSigningFlowProps {
  leadId: string;
  objectId: string;
  zoneId: string;
  zoneArea: number;
  zoneFloorLabel: string;
  zoneLabel: string;
  isWorkstation: boolean;
}

// Идёт сразу после успешной брони (см. PublicPlanAndUnits) — необязательный,
// но предлагаемый следующий шаг: клиент вводит паспортные данные, получает
// код на email (api/agreement-otp-request.js) и подтверждает его
// (api/agreement-otp-verify.js), который заполняет гугл-шаблон соглашения,
// экспортирует в PDF и сохраняет в Supabase Storage.
export function AgreementSigningFlow({
  leadId,
  objectId,
  zoneId,
  zoneArea,
  zoneFloorLabel,
  zoneLabel,
  isWorkstation,
}: AgreementSigningFlowProps) {
  const [step, setStep] = useState<'closed' | 'form' | 'code' | 'done'>('closed');
  const [form, setForm] = useState(emptyForm);
  const [code, setCode] = useState('');
  const [signatureId, setSignatureId] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmitForm =
    form.buyerName.trim() && form.buyerPassport.trim() && form.buyerAddress.trim() && form.email.trim();

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitForm || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { signatureId: id } = await requestAgreementOtp({
        leadId,
        objectId,
        zoneId,
        zoneArea,
        zoneFloorLabel,
        zoneLabel,
        isWorkstation,
        buyerName: form.buyerName.trim(),
        buyerGender: form.buyerGender,
        buyerPassport: form.buyerPassport.trim(),
        buyerPassportIssued: form.buyerPassportIssued.trim(),
        buyerAddress: form.buyerAddress.trim(),
        email: form.email.trim(),
      });
      setSignatureId(id);
      setStep('code');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось отправить код'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signatureId || !code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { documentUrl: url } = await verifyAgreementOtp(signatureId, code.trim());
      setDocumentUrl(url);
      setStep('done');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось подтвердить код'));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'closed') {
    return (
      <Button type="button" variant="secondary" icon={<FileCheck2 className="h-4 w-4" />} onClick={() => setStep('form')} className="w-fit">
        Подписать соглашение о намерениях
      </Button>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-2 rounded-control border border-success/30 bg-success-bg p-4">
        <p className="text-sm font-medium text-success">Соглашение подписано.</p>
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-ink hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Скачать PDF
          </a>
        )}
      </div>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3 rounded-control border border-border p-4">
        <p className="text-sm text-ink-muted">
          Мы отправили код на {form.email}. Введите его, чтобы подтвердить подписание.
        </p>
        <Input label="Код из письма" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={!code.trim() || submitting} className="w-fit">
          {submitting ? 'Проверяем...' : 'Подтвердить'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 rounded-control border border-border p-4">
      <Input
        label="ФИО"
        value={form.buyerName}
        onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))}
        required
        autoFocus
      />
      <ToggleGroup
        label="Пол"
        options={['Мужчина', 'Женщина']}
        value={form.buyerGender}
        onChange={(v) => setForm((f) => ({ ...f, buyerGender: v as 'Мужчина' | 'Женщина' }))}
      />
      <Input
        label="Паспорт (серия и номер)"
        value={form.buyerPassport}
        onChange={(e) => setForm((f) => ({ ...f, buyerPassport: e.target.value }))}
        required
      />
      <Input
        label="Кем и когда выдан"
        value={form.buyerPassportIssued}
        onChange={(e) => setForm((f) => ({ ...f, buyerPassportIssued: e.target.value }))}
      />
      <Input
        label="Адрес проживания"
        value={form.buyerAddress}
        onChange={(e) => setForm((f) => ({ ...f, buyerAddress: e.target.value }))}
        required
      />
      <Input
        label="Email — на него придёт код подтверждения"
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        required
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={!canSubmitForm || submitting} className="w-fit">
        {submitting ? 'Отправляем код...' : 'Получить код на email'}
      </Button>
    </form>
  );
}

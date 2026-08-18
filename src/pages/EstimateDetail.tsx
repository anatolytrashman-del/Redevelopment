import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, X, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { cn } from '../lib/cn';
import type { Estimate, EstimateQuestion, EstimateSection } from '../data/estimates';
import type { RealtyObject } from '../data/objects';
import type { BuildingPlanZone } from '../data/buildingPlans';
import { fetchEstimate, updateEstimate } from '../lib/estimatesApi';
import { fetchObject } from '../lib/objectsApi';
import { fetchZonesForPlan } from '../lib/buildingPlansApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatArea(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

export function EstimateDetail() {
  const { id } = useParams();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [savingSection, setSavingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [newQuestion, setNewQuestion] = useState('');
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchEstimate(id)
      .then((e) => {
        setEstimate(e);
        return fetchObject(e.objectId);
      })
      .then((o) => {
        setObject(o);
        if (o.buildingPlanIds.length === 0) return;
        return Promise.all(o.buildingPlanIds.map((planId) => fetchZonesForPlan(planId))).then((lists) =>
          setZones(lists.flat()),
        );
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить смету')))
      .finally(() => setLoading(false));
  }, [id]);

  const roomZones = zones.filter((z) => z.zoneType === 'room');
  const roomCount = roomZones.length;
  const roomArea = roomZones.reduce((sum, z) => sum + (z.area ?? 0), 0);

  async function saveEstimatePatch(patch: Partial<Pick<Estimate, 'sections' | 'questions'>>) {
    if (!estimate) throw new Error('Смета не загружена');
    const updated = await updateEstimate(estimate.id, {
      sections: patch.sections ?? estimate.sections,
      questions: patch.questions ?? estimate.questions,
    });
    setEstimate(updated);
    return updated;
  }

  function startEditSection(section: EstimateSection) {
    setEditingSectionId(section.id);
    setTitleDraft(section.title);
    setBodyDraft(section.body);
    setSectionError(null);
  }

  async function saveSection() {
    if (!estimate || !editingSectionId) return;
    setSavingSection(true);
    setSectionError(null);
    try {
      const sections = estimate.sections.map((s) =>
        s.id === editingSectionId ? { ...s, title: titleDraft.trim() || 'Без названия', body: bodyDraft } : s,
      );
      await saveEstimatePatch({ sections });
      setEditingSectionId(null);
    } catch (err) {
      setSectionError(errorMessage(err, 'Не удалось сохранить раздел'));
    } finally {
      setSavingSection(false);
    }
  }

  async function addSection() {
    if (!estimate) return;
    const section: EstimateSection = { id: crypto.randomUUID(), title: 'Новый раздел', body: '' };
    try {
      await saveEstimatePatch({ sections: [...estimate.sections, section] });
      startEditSection(section);
    } catch (err) {
      setSectionError(errorMessage(err, 'Не удалось добавить раздел'));
    }
  }

  async function deleteSection(sectionId: string) {
    if (!estimate) return;
    if (!window.confirm('Удалить раздел вместе с содержимым?')) return;
    try {
      await saveEstimatePatch({ sections: estimate.sections.filter((s) => s.id !== sectionId) });
    } catch (err) {
      setSectionError(errorMessage(err, 'Не удалось удалить раздел'));
    }
  }

  async function addQuestion() {
    if (!estimate || !newQuestion.trim() || savingQuestions) return;
    setSavingQuestions(true);
    setQuestionsError(null);
    try {
      const question: EstimateQuestion = { id: crypto.randomUUID(), text: newQuestion.trim(), resolved: false };
      await saveEstimatePatch({ questions: [...estimate.questions, question] });
      setNewQuestion('');
    } catch (err) {
      setQuestionsError(errorMessage(err, 'Не удалось добавить вопрос'));
    } finally {
      setSavingQuestions(false);
    }
  }

  async function toggleQuestion(q: EstimateQuestion) {
    if (!estimate) return;
    setQuestionsError(null);
    try {
      await saveEstimatePatch({
        questions: estimate.questions.map((x) => (x.id === q.id ? { ...x, resolved: !x.resolved } : x)),
      });
    } catch (err) {
      setQuestionsError(errorMessage(err, 'Не удалось обновить вопрос'));
    }
  }

  async function deleteQuestion(questionId: string) {
    if (!estimate) return;
    setQuestionsError(null);
    try {
      await saveEstimatePatch({ questions: estimate.questions.filter((x) => x.id !== questionId) });
    } catch (err) {
      setQuestionsError(errorMessage(err, 'Не удалось удалить вопрос'));
    }
  }

  const specs = object?.buildingSpecs;

  return (
    <>
      <PageHeader title="Смета" />

      <Link to="/admin/estimates" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Все сметы
      </Link>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем смету...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && estimate && object && (
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <div className="text-lg font-bold text-ink">{object.name || object.address}</div>
              {object.name && <div className="text-sm text-ink-muted">{object.address}</div>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {object.area > 0 && (
                <Stat label="Общая площадь" value={`${formatArea(object.area)} м²`} />
              )}
              {specs?.normativeArea != null && <Stat label="Норм. площадь" value={`${formatArea(specs.normativeArea)} м²`} />}
              {specs?.floorsCount != null && <Stat label="Этажность" value={`${specs.floorsCount} эт.`} />}
              {specs?.walls && <Stat label="Стены" value={specs.walls} />}
              {specs?.roof && <Stat label="Кровля" value={specs.roof} />}
              {specs?.yearBuilt != null && (
                <Stat label="Год постройки" value={specs.yearRenovated ? `${specs.yearBuilt} (рен. ${specs.yearRenovated})` : String(specs.yearBuilt)} />
              )}
              {roomCount > 0 && <Stat label="Кабинетов на планах" value={`${roomCount} шт.`} />}
              {roomArea > 0 && <Stat label="Площадь кабинетов" value={`${formatArea(roomArea)} м² суммарно`} />}
            </div>
            <p className="text-xs text-ink-faint">
              Резерв на скрытые условия существующего здания — закладывать 25–30% сверх итога сметы.
            </p>
          </Card>

          {estimate.sections.map((section) => (
            <Card key={section.id} className="flex flex-col gap-3 p-5">
              {editingSectionId === section.id ? (
                <div className="flex flex-col gap-3">
                  <Input label="Название раздела" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
                  <Textarea
                    label="Содержимое"
                    value={bodyDraft}
                    onChange={(e) => setBodyDraft(e.target.value)}
                    rows={10}
                    placeholder="Состав работ, материалы, количества, открытые вопросы по разделу..."
                  />
                  {sectionError && <p className="text-sm text-danger">{sectionError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setEditingSectionId(null)}>
                      Отмена
                    </Button>
                    <Button type="button" onClick={saveSection} disabled={savingSection}>
                      {savingSection ? 'Сохраняем...' : 'Сохранить'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-ink">{section.title}</div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditSection(section)}
                        aria-label="Редактировать раздел"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSection(section.id)}
                        aria-label="Удалить раздел"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                    {section.body || 'Раздел пока пустой — нажмите на карандаш, чтобы заполнить.'}
                  </p>
                </>
              )}
            </Card>
          ))}

          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={addSection}>
            Добавить раздел
          </Button>

          <Card className="flex flex-col gap-3 p-5">
            <div className="font-bold text-ink">Открытые вопросы</div>
            {questionsError && <p className="text-sm text-danger">{questionsError}</p>}
            <div className="flex flex-col gap-2">
              {estimate.questions.map((q) => (
                <div key={q.id} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleQuestion(q)}
                    aria-label={q.resolved ? 'Отметить как открытый' : 'Отметить как решённый'}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      q.resolved ? 'border-success bg-success text-white' : 'border-border text-transparent',
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <span className={cn('flex-1 text-sm', q.resolved ? 'text-ink-faint line-through' : 'text-ink')}>
                    {q.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteQuestion(q.id)}
                    aria-label="Удалить вопрос"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {estimate.questions.length === 0 && <p className="text-sm text-ink-faint">Открытых вопросов нет</p>}
            </div>
            <div className="flex gap-2">
              <input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
                placeholder="Новый вопрос..."
                className="flex-1 rounded-control border border-transparent bg-surface-muted px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
              />
              <Button type="button" variant="secondary" onClick={addQuestion} disabled={!newQuestion.trim() || savingQuestions}>
                Добавить
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

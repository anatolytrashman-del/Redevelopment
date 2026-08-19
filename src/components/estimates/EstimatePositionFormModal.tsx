import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, X, Plus, ImageOff, LibraryBig, Palette, Ruler } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { CatalogPickerModal } from './CatalogPickerModal';
import { RalColorPickerModal } from './RalColorPickerModal';
import type { EstimatePosition, EstimateProductRef, RalColor, FacadeDimension } from '../../data/estimates';
import type { EstimateCatalogItem } from '../../data/estimateCatalog';
import { uploadObjectImage } from '../../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function positionToForm(p: EstimatePosition) {
  return { title: p.title, opsText: p.ops.join('\n'), products: p.products, colors: p.colors, dimensions: p.dimensions };
}

const emptyForm = {
  title: '',
  opsText: '',
  products: [] as EstimateProductRef[],
  colors: [] as RalColor[],
  dimensions: [] as FacadeDimension[],
};

interface EstimatePositionFormModalProps {
  open: boolean;
  position: EstimatePosition | null;
  // Каталог типовых позиций (см. CatalogPickerModal) — выбор из каталога
  // разом заполняет название и состав работ, чтобы не сочинять их с нуля.
  catalogItems: EstimateCatalogItem[];
  onClose: () => void;
  onSaved: (position: EstimatePosition) => Promise<void>;
  onCatalogItemCreated: (item: EstimateCatalogItem) => void;
}

// Позиция сметы — название + референсы на товары (фото + ссылка, "Дверь",
// "Замок" и т.п. — сколько нужно) + состав работ. Фото референсов грузятся в
// тот же публичный бакет, что и фото объекта (uploadObjectImage) — свой
// отдельный бакет под сметы пока не нужен, это тоже просто публичная картинка.
export function EstimatePositionFormModal({
  open,
  position,
  catalogItems,
  onClose,
  onSaved,
  onCatalogItemCreated,
}: EstimatePositionFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  // Ошибка загрузки фото привязана к конкретному товару — иначе при рендере
  // одним блоком в самом низу формы (под "Состав работ") её не видно рядом
  // с кнопкой "Загрузить фото", и выглядит это как "ничего не происходит".
  const [uploadError, setUploadError] = useState<{ productId: string; message: string } | null>(null);
  // Ошибка самого сохранения (не фото) — сеть может оборваться при отправке;
  // форма при этом не закрывается, чтобы ничего не терялось молча (см. ниже).
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  // Слот, для которого сейчас открыт пикер оттенка — null, когда закрыт.
  const [colorPickerSlotId, setColorPickerSlotId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (open) {
      setForm(position ? positionToForm(position) : emptyForm);
      setUploadError(null);
      setSubmitError(null);
    }
  }, [open, position]);

  // Выбор из каталога заменяет название и состав работ целиком — это способ
  // начать позицию с готовой заготовки, а не дописать что-то к уже начатому.
  // Товары (фото/ссылки) каталог не знает — их всё равно вносить руками.
  function fillFromCatalog(item: EstimateCatalogItem) {
    setForm((f) => ({ ...f, title: item.title, opsText: item.ops.join('\n') }));
    setCatalogOpen(false);
  }

  function addProduct() {
    setForm((f) => ({
      ...f,
      products: [
        ...f.products,
        {
          id: crypto.randomUUID(),
          label: '',
          manufacturer: '',
          model: '',
          priceByn: null,
          priceRub: null,
          priceUsd: null,
          photoUrl: '',
          link: '',
        },
      ],
    }));
  }

  function removeProduct(id: string) {
    setForm((f) => ({ ...f, products: f.products.filter((p) => p.id !== id) }));
  }

  function updateProduct(id: string, patch: Partial<EstimateProductRef>) {
    setForm((f) => ({ ...f, products: f.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }

  function addColorSlot() {
    setForm((f) => ({ ...f, colors: [...f.colors, { id: crypto.randomUUID(), code: '', name: '', hex: null }] }));
  }

  function removeColorSlot(id: string) {
    setForm((f) => ({ ...f, colors: f.colors.filter((c) => c.id !== id) }));
  }

  function applyColorPick(id: string, picked: Omit<RalColor, 'id'>) {
    setForm((f) => ({ ...f, colors: f.colors.map((c) => (c.id === id ? { ...c, ...picked } : c)) }));
  }

  function addDimension() {
    setForm((f) => ({
      ...f,
      dimensions: [...f.dimensions, { id: crypto.randomUUID(), label: '', width: null, height: null, windowsArea: null }],
    }));
  }

  function removeDimension(id: string) {
    setForm((f) => ({ ...f, dimensions: f.dimensions.filter((d) => d.id !== id) }));
  }

  function updateDimension(id: string, patch: Partial<FacadeDimension>) {
    setForm((f) => ({ ...f, dimensions: f.dimensions.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  }

  const dimensionsTotalArea = form.dimensions.reduce(
    (sum, d) => sum + Math.max(0, d.width != null && d.height != null ? d.width * d.height - (d.windowsArea ?? 0) : 0),
    0,
  );

  async function handlePhotoSelect(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProductId(id);
    setUploadError(null);
    try {
      const url = await uploadObjectImage(file);
      updateProduct(id, { photoUrl: url });
    } catch (err) {
      setUploadError({ productId: id, message: errorMessage(err, 'Не удалось загрузить фото') });
    } finally {
      setUploadingProductId(null);
      const input = fileInputRefs.current[id];
      if (input) input.value = '';
    }
  }

  const canSubmit = form.title.trim().length > 0;

  // Форма закрывается только после подтверждённого сохранения — раньше
  // onClose() вызывался сразу, не дожидаясь ответа сервера, и при обрыве
  // сети (см. ту же природу бага с фото) правки тихо терялись: форма уже
  // закрылась, а сохранить не успело — снаружи выглядело как "заголовок
  // остался старым, будто ничего не произошло".
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const ops = form.opsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const saved: EstimatePosition = {
      id: position?.id ?? crypto.randomUUID(),
      title: form.title.trim(),
      ops,
      products: form.products,
      colors: form.colors,
      dimensions: form.dimensions,
    };
    try {
      await onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить позицию'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={position ? 'Редактировать позицию' : 'Новая позиция'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary"
          >
            <LibraryBig className="h-3.5 w-3.5" />
            Заполнить из каталога
          </button>
        </div>

        <Input
          label="Название работы"
          placeholder="Например, Замена входных дверей"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Товары/референсы (фото + ссылка)</span>
          {form.products.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 rounded-control border border-border p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff className="h-6 w-6 text-ink-faint" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input
                    placeholder="Например, Дверь или Замок"
                    value={p.label}
                    onChange={(e) => updateProduct(p.id, { label: e.target.value })}
                  />
                  <input
                    ref={(el) => {
                      fileInputRefs.current[p.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoSelect(p.id, e)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    icon={uploadingProductId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    onClick={() => fileInputRefs.current[p.id]?.click()}
                    disabled={uploadingProductId === p.id}
                    className="w-fit"
                  >
                    {uploadingProductId === p.id ? 'Загружаем...' : p.photoUrl ? 'Заменить фото' : 'Загрузить фото'}
                  </Button>
                  {uploadError?.productId === p.id && (
                    <p className="text-xs text-danger">{uploadError.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeProduct(p.id)}
                  aria-label="Удалить товар"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Производитель"
                  value={p.manufacturer}
                  onChange={(e) => updateProduct(p.id, { manufacturer: e.target.value })}
                />
                <Input
                  placeholder="Модель"
                  value={p.model}
                  onChange={(e) => updateProduct(p.id, { model: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  placeholder="Цена, BYN"
                  value={p.priceByn ?? ''}
                  onChange={(e) => updateProduct(p.id, { priceByn: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <Input
                  type="number"
                  placeholder="Цена, ₽"
                  value={p.priceRub ?? ''}
                  onChange={(e) => updateProduct(p.id, { priceRub: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <Input
                  type="number"
                  placeholder="Цена, $"
                  value={p.priceUsd ?? ''}
                  onChange={(e) => updateProduct(p.id, { priceUsd: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <Input
                placeholder="Ссылка на товар (https://...)"
                value={p.link}
                onChange={(e) => updateProduct(p.id, { link: e.target.value })}
              />
            </div>
          ))}
          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={addProduct}>
            Добавить товар
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Варианты оттенков</span>
          <div className="flex flex-wrap gap-3">
            {form.colors.map((c) => (
              <div key={c.id} className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setColorPickerSlotId(c.id)}
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-control border border-border"
                  style={c.hex ? { backgroundColor: c.hex } : undefined}
                >
                  {!c.hex && <Palette className="h-5 w-5 text-ink-faint" />}
                </button>
                <span className="max-w-16 truncate text-center text-xs font-medium text-ink">{c.code || 'Выбрать'}</span>
                <button
                  type="button"
                  onClick={() => removeColorSlot(c.id)}
                  aria-label="Удалить оттенок"
                  className="text-xs text-ink-faint hover:text-danger"
                >
                  Удалить
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addColorSlot}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border text-ink-faint hover:border-primary hover:text-primary"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Ruler className="h-3.5 w-3.5" />
            Размеры фасада
          </div>
          {form.dimensions.map((d) => {
            const gross = d.width != null && d.height != null ? d.width * d.height : null;
            const net = gross != null ? Math.max(0, gross - (d.windowsArea ?? 0)) : null;
            return (
              <div key={d.id} className="flex flex-col gap-2 rounded-control border border-border p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      placeholder="Например, Главный фасад"
                      value={d.label}
                      onChange={(e) => updateDimension(d.id, { label: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDimension(d.id)}
                    aria-label="Удалить размер"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      placeholder="Ширина, м"
                      value={d.width ?? ''}
                      onChange={(e) => updateDimension(d.id, { width: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      placeholder="Высота, м"
                      value={d.height ?? ''}
                      onChange={(e) => updateDimension(d.id, { height: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <Input
                      type="number"
                      placeholder="Окна, м²"
                      value={d.windowsArea ?? ''}
                      onChange={(e) => updateDimension(d.id, { windowsArea: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <span className="text-xs text-ink-muted">
                    {net != null
                      ? `${gross!.toLocaleString('ru-RU')} м²${d.windowsArea ? ` − окна ${d.windowsArea.toLocaleString('ru-RU')} м²` : ''} = ${net.toLocaleString('ru-RU')} м² чистой`
                      : ''}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={addDimension}>
              Добавить размер
            </Button>
            {form.dimensions.length > 0 && (
              <span className="text-sm font-semibold text-ink">
                Итого чистой (предварительный расчёт): {dimensionsTotalArea.toLocaleString('ru-RU')} м²
              </span>
            )}
          </div>
        </div>

        <Textarea
          label="Состав работ (каждый пункт с новой строки)"
          placeholder={'Демонтаж старой двери\nМонтаж новой двери\nГерметизация примыканий'}
          value={form.opsText}
          onChange={(e) => setForm((f) => ({ ...f, opsText: e.target.value }))}
          rows={6}
        />

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting} icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {submitting ? 'Сохраняем...' : position ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>

      <CatalogPickerModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        items={catalogItems}
        onInsert={fillFromCatalog}
        onCreated={onCatalogItemCreated}
      />

      <RalColorPickerModal
        open={colorPickerSlotId !== null}
        onClose={() => setColorPickerSlotId(null)}
        onPick={(picked) => {
          if (colorPickerSlotId) applyColorPick(colorPickerSlotId, picked);
        }}
      />
    </Modal>
  );
}

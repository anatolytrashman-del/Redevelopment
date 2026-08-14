import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import type { BuildingSpecs } from '../../data/objects';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface SpecsFormState {
  buildingName: string;
  buildingPurpose: string;
  yearBuilt: string;
  yearRenovated: string;
  floorsCount: string;
  totalArea: string;
  normativeArea: string;
  roomsCount: string;
  officesCount: string;
  bathroomsCount: string;
  otherRooms: string;
  foundation: string;
  walls: string;
  ceilings: string;
  structure: string;
  roof: string;
  flooring: string;
  windows: string;
  phone: string;
  electricity: string;
  water: string;
  sewerage: string;
  heating: string;
  landArea: string;
  landPurpose: string;
}

const emptyForm: SpecsFormState = {
  buildingName: '',
  buildingPurpose: '',
  yearBuilt: '',
  yearRenovated: '',
  floorsCount: '',
  totalArea: '',
  normativeArea: '',
  roomsCount: '',
  officesCount: '',
  bathroomsCount: '',
  otherRooms: '',
  foundation: '',
  walls: '',
  ceilings: '',
  structure: '',
  roof: '',
  flooring: '',
  windows: '',
  phone: '',
  electricity: '',
  water: '',
  sewerage: '',
  heating: '',
  landArea: '',
  landPurpose: '',
};

function specsToForm(s: BuildingSpecs | null): SpecsFormState {
  if (!s) return emptyForm;
  return {
    buildingName: s.buildingName,
    buildingPurpose: s.buildingPurpose,
    yearBuilt: s.yearBuilt != null ? String(s.yearBuilt) : '',
    yearRenovated: s.yearRenovated != null ? String(s.yearRenovated) : '',
    floorsCount: s.floorsCount != null ? String(s.floorsCount) : '',
    totalArea: s.totalArea != null ? String(s.totalArea) : '',
    normativeArea: s.normativeArea != null ? String(s.normativeArea) : '',
    roomsCount: s.roomsCount != null ? String(s.roomsCount) : '',
    officesCount: s.officesCount != null ? String(s.officesCount) : '',
    bathroomsCount: s.bathroomsCount != null ? String(s.bathroomsCount) : '',
    otherRooms: s.otherRooms,
    foundation: s.foundation,
    walls: s.walls,
    ceilings: s.ceilings,
    structure: s.structure,
    roof: s.roof,
    flooring: s.flooring,
    windows: s.windows,
    phone: s.phone,
    electricity: s.electricity,
    water: s.water,
    sewerage: s.sewerage,
    heating: s.heating,
    landArea: s.landArea != null ? String(s.landArea) : '',
    landPurpose: s.landPurpose,
  };
}

function num(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function formToSpecs(f: SpecsFormState): BuildingSpecs {
  return {
    buildingName: f.buildingName.trim(),
    buildingPurpose: f.buildingPurpose.trim(),
    yearBuilt: num(f.yearBuilt),
    yearRenovated: num(f.yearRenovated),
    floorsCount: num(f.floorsCount),
    totalArea: num(f.totalArea),
    normativeArea: num(f.normativeArea),
    roomsCount: num(f.roomsCount),
    officesCount: num(f.officesCount),
    bathroomsCount: num(f.bathroomsCount),
    otherRooms: f.otherRooms.trim(),
    foundation: f.foundation.trim(),
    walls: f.walls.trim(),
    ceilings: f.ceilings.trim(),
    structure: f.structure.trim(),
    roof: f.roof.trim(),
    flooring: f.flooring.trim(),
    windows: f.windows.trim(),
    phone: f.phone.trim(),
    electricity: f.electricity.trim(),
    water: f.water.trim(),
    sewerage: f.sewerage.trim(),
    heating: f.heating.trim(),
    landArea: num(f.landArea),
    landPurpose: f.landPurpose.trim(),
  };
}

interface BuildingSpecsModalProps {
  open: boolean;
  onClose: () => void;
  specs: BuildingSpecs | null;
  onSave: (specs: BuildingSpecs) => Promise<unknown>;
}

export function BuildingSpecsModal({ open, onClose, specs, onSave }: BuildingSpecsModalProps) {
  const [form, setForm] = useState<SpecsFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(specsToForm(specs));
    setError(null);
  }, [open, specs]);

  function set<K extends keyof SpecsFormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(formToSpecs(form));
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить характеристики'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Характеристики здания">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="text-sm font-semibold text-ink">Общие сведения</div>
        <Input label="Наименование" value={form.buildingName} onChange={(e) => set('buildingName', e.target.value)} />
        <Input label="Назначение" value={form.buildingPurpose} onChange={(e) => set('buildingPurpose', e.target.value)} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="Год постройки" type="number" value={form.yearBuilt} onChange={(e) => set('yearBuilt', e.target.value)} />
          <Input
            label="Год реконструкции"
            type="number"
            value={form.yearRenovated}
            onChange={(e) => set('yearRenovated', e.target.value)}
          />
          <Input label="Этажность" type="number" value={form.floorsCount} onChange={(e) => set('floorsCount', e.target.value)} />
        </div>

        <div className="mt-2 text-sm font-semibold text-ink">Площади и помещения</div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Общая площадь, м²"
            type="number"
            step="0.01"
            value={form.totalArea}
            onChange={(e) => set('totalArea', e.target.value)}
          />
          <Input
            label="Нормируемая площадь, м²"
            type="number"
            step="0.01"
            value={form.normativeArea}
            onChange={(e) => set('normativeArea', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Всего помещений" type="number" value={form.roomsCount} onChange={(e) => set('roomsCount', e.target.value)} />
          <Input label="Кабинетов" type="number" value={form.officesCount} onChange={(e) => set('officesCount', e.target.value)} />
          <Input
            label="Санузлов"
            type="number"
            value={form.bathroomsCount}
            onChange={(e) => set('bathroomsCount', e.target.value)}
          />
        </div>
        <Input
          label="Прочие помещения"
          placeholder="Коридоры, вестибюли, лестничный марш"
          value={form.otherRooms}
          onChange={(e) => set('otherRooms', e.target.value)}
        />

        <div className="mt-2 text-sm font-semibold text-ink">Конструктив</div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Фундамент" value={form.foundation} onChange={(e) => set('foundation', e.target.value)} />
          <Input label="Стены" value={form.walls} onChange={(e) => set('walls', e.target.value)} />
          <Input label="Перекрытия" value={form.ceilings} onChange={(e) => set('ceilings', e.target.value)} />
          <Input label="Конструкция здания" value={form.structure} onChange={(e) => set('structure', e.target.value)} />
          <Input label="Крыша" value={form.roof} onChange={(e) => set('roof', e.target.value)} />
          <Input label="Окна" value={form.windows} onChange={(e) => set('windows', e.target.value)} />
        </div>
        <Input
          label="Полы"
          placeholder="Плитка, доска, бетон, паркет, линолеум"
          value={form.flooring}
          onChange={(e) => set('flooring', e.target.value)}
        />

        <div className="mt-2 text-sm font-semibold text-ink">Инженерные сети</div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Электроснабжение" value={form.electricity} onChange={(e) => set('electricity', e.target.value)} />
          <Input label="Водопровод" value={form.water} onChange={(e) => set('water', e.target.value)} />
          <Input label="Канализация" value={form.sewerage} onChange={(e) => set('sewerage', e.target.value)} />
          <Input label="Отопление" value={form.heating} onChange={(e) => set('heating', e.target.value)} />
        </div>
        <Input label="Телефонизация" placeholder="Есть / Нет" value={form.phone} onChange={(e) => set('phone', e.target.value)} />

        <div className="mt-2 text-sm font-semibold text-ink">Земельный участок</div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Площадь участка, га"
            type="number"
            step="0.0001"
            value={form.landArea}
            onChange={(e) => set('landArea', e.target.value)}
          />
          <Input label="Назначение участка" value={form.landPurpose} onChange={(e) => set('landPurpose', e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

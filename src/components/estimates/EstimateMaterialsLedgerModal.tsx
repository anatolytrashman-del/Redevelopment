import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { MaterialsTable, groupMaterials } from './MaterialsTable';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { cn } from '../../lib/cn';
import type { EstimateMaterial, EstimateSection } from '../../data/estimates';

interface EstimateMaterialsLedgerModalProps {
  open: boolean;
  sections: EstimateSection[];
  onClose: () => void;
  onEditMaterial: (sectionId: string, material: EstimateMaterial) => void;
  onDeleteMaterial: (sectionId: string, material: EstimateMaterial) => void;
  onOpenComments: (sectionId: string, material: EstimateMaterial) => void;
  onAddMaterial: (sectionId: string) => void;
}

// Единая ведомость материалов на всю смету — владелец, 2026-09-01: "мне
// нужна одна единая ведомость материалов, но разбитая на разделы, как
// сейчас, но в одной таблице". Материалы каждого раздела ("Фасад",
// "Первый этаж" и т.п.) остаются собственностью этого раздела — правки,
// удаление, комментарии и добавление здесь идут через те же обработчики,
// что и в EstimateMaterialsPanel самого раздела (просто с явным sectionId
// на каждый вызов), поэтому это не отдельное хранилище данных, а другой
// способ посмотреть и отредактировать тот же самый список.
//
// Обычная Modal (ui/Modal.tsx) рассчитана на узкие формы (max-w-lg) — здесь
// нужна широкая прокручиваемая раскладка под несколько таблиц подряд,
// поэтому свой оверлей по образцу DocumentPreviewModal.tsx, а не Modal.
export function EstimateMaterialsLedgerModal({
  open,
  sections,
  onClose,
  onEditMaterial,
  onDeleteMaterial,
  onOpenComments,
  onAddMaterial,
}: EstimateMaterialsLedgerModalProps) {
  if (!open) return null;

  return createPortal(
    // z-40, не z-50 — из этой ведомости можно открыть форму редактирования/
    // комментариев материала (EstimateMaterialFormModal/
    // EstimateMaterialCommentsModal, оба обычный ui/Modal на z-50), она
    // должна лечь поверх ведомости независимо от порядка портала в DOM.
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={cn('relative flex max-h-[90vh] w-full max-w-5xl flex-col gap-5 overflow-y-auto p-6', glassCardClass)}
        style={glassCardShadow}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words text-xl font-extrabold text-ink">Ведомость материалов</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-8">
          {sections.map((section) => {
            const { ungrouped, groups } = groupMaterials(section.materials);
            return (
              <div key={section.id} className="flex flex-col gap-3">
                <span className="text-lg font-bold text-ink">{section.title}</span>

                {section.materials.length === 0 && (
                  <p className="text-sm text-ink-faint">Материалов пока нет.</p>
                )}

                {ungrouped.length > 0 && (
                  <MaterialsTable
                    materials={ungrouped}
                    onEdit={(m) => onEditMaterial(section.id, m)}
                    onDelete={(m) => onDeleteMaterial(section.id, m)}
                    onOpenComments={(m) => onOpenComments(section.id, m)}
                  />
                )}

                {groups.map((g) => (
                  <div key={g.name} className="flex flex-col gap-2">
                    <span className="w-fit rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {g.name}
                    </span>
                    <MaterialsTable
                      materials={g.materials}
                      onEdit={(m) => onEditMaterial(section.id, m)}
                      onDelete={(m) => onDeleteMaterial(section.id, m)}
                      onOpenComments={(m) => onOpenComments(section.id, m)}
                    />
                  </div>
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  icon={<Plus className="h-4 w-4" />}
                  className="w-fit"
                  onClick={() => onAddMaterial(section.id)}
                >
                  Добавить материал в «{section.title}»
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

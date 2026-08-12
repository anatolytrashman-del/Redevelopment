import { useState } from 'react';
import { Input } from './Input';
import { Select } from './Select';

interface AddableSelectProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  addLabel?: string;
  newPlaceholder?: string;
  placeholder?: string;
}

// Выпадающий список с пунктом "+ Добавить..." в конце: выбор переключает
// поле на свободный текстовый ввод нового значения. Используется там, где
// список вариантов открытый (категории, источники платежа и т.п.).
export function AddableSelect({
  label,
  options,
  value,
  onChange,
  addLabel = '+ Добавить',
  newPlaceholder = 'Введите значение',
  placeholder,
}: AddableSelectProps) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <Input label={label} placeholder={newPlaceholder} value={value} onChange={(e) => onChange(e.target.value)} autoFocus required />
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            onChange('');
          }}
          className="w-fit text-xs text-ink-muted underline underline-offset-2 hover:text-primary"
        >
          Выбрать из списка
        </button>
      </div>
    );
  }

  return (
    <Select
      label={label}
      placeholder={placeholder}
      options={[...options, addLabel]}
      value={value}
      onChange={(v) => {
        if (v === addLabel) {
          setAdding(true);
          onChange('');
        } else {
          onChange(v);
        }
      }}
    />
  );
}

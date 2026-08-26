import { useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { DistrictBusinessesTab } from '../components/marketOffers/DistrictBusinessesTab';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';

// Публичная (без PasswordGate) ссылка на вкладку "Дома" — владелец отдаёт
// эту задачу на фрилансе, доступ по паролю через /admin/* усложнил бы
// постановку задачи. Не новая дыра в безопасности: RLS на
// district_business_points и так открыт на запись анонимным ключом (см.
// комментарий в data/districtBusinessPoints.ts и общий принцип
// "пароль — не авторизация" в CLAUDE.md) — эта страница просто даёт прямой
// путь к уже открытому функционалу, ничего не открывает заново. noindex —
// рабочий инструмент для одного исполнителя, не контент для поиска.
export function BusinessUploadPublicPage() {
  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 shrink-0 text-primary" />
        <h1 className="text-xl font-bold text-ink">Организации по домам — Минск Мир</h1>
      </div>
      <p className="text-sm text-ink-muted">
        Для каждого дома ниже нужно собрать список организаций с Яндекс.Карт и загрузить файл в карточке дома.
      </p>
      <DistrictBusinessesTab />
    </div>
  );
}

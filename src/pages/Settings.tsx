import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ACCESS_PROFILES } from '../data/accessProfiles';
import { ADMIN_PAGES } from '../data/pages';

// Список профилей доступа — единственное место, где можно посмотреть, у
// кого какой пароль и что ему открыто, не заглядывая в код. Сама страница
// доступна только владельцу: ни один гостевой профиль её не получает в
// своём списке pages (см. data/accessProfiles.ts), так что даже показ
// серым пунктом в сайдбаре ничего не раскрывает, кроме факта, что раздел
// существует.
export function Settings() {
  return (
    <>
      <PageHeader title="Настройки" />

      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Доступы в платформу — у каждого свой пароль и свой список открытых страниц. Новый доступ или изменение
          списка страниц — это правка кода (файл data/accessProfiles.ts) и деплой, здесь только просмотр.
        </p>

        {ACCESS_PROFILES.map((profile) => (
          <Card key={profile.id} className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-lg font-bold text-ink">{profile.displayName}</span>
              <span className="rounded-full bg-surface-muted px-3 py-1 font-mono text-sm text-ink">
                {profile.password}
              </span>
            </div>

            {profile.pages === 'all' ? (
              <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Полный доступ ко всем страницам
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.pages.map((key) => (
                  <span
                    key={key}
                    className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success"
                  >
                    {ADMIN_PAGES.find((p) => p.key === key)?.label ?? key}
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

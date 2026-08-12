import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';

export function Home() {
  return (
    <>
      <PageHeader title="Redevelopment" />
      <Card className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
        <span className="text-lg font-bold text-ink">Страниц пока нет</span>
        <p className="max-w-md text-sm text-ink-muted">
          Дизайн-система готова: шрифт, цвета, сайдбар и UI-компоненты (Button, Card, Badge, Input,
          Select, TreeTable...) подключены. Добавляйте страницы по одной в src/pages.
        </p>
      </Card>
    </>
  );
}

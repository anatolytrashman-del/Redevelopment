import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';

interface PlaceholderProps {
  title: string;
  description: string;
}

export function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
        <span className="text-lg font-bold text-ink">Раздел в разработке</span>
        <p className="max-w-md text-sm text-ink-muted">{description}</p>
      </Card>
    </>
  );
}

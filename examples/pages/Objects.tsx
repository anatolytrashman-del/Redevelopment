import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../src/components/layout/PageHeader';
import { InfoBanner } from '../../src/components/layout/InfoBanner';
import { SearchInput } from '../../src/components/ui/SearchInput';
import { Select } from '../../src/components/ui/Select';
import { Badge } from '../../src/components/ui/Badge';
import { Card } from '../../src/components/ui/Card';
import { deals } from '../data/deals';

export function Objects() {
  return (
    <>
      <PageHeader title="Объекты" notifications={2} />
      <InfoBanner>
        До 30 января открыт приём заявок по БЦ «Меркурий» — комиссия партнёру увеличена до 750 000 ₽
      </InfoBanner>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchInput placeholder="Поиск по объектам" />
        </div>
        <Select placeholder="Тип объекта" options={['Бизнес-центр', 'Торговый центр', 'Склад', 'ФОК']} pill />
        <Select placeholder="Тип сделки" options={['Аренда', 'Продажа', 'Редевелопмент']} pill />
        <Select placeholder="Город" options={['Москва', 'Санкт-Петербург', 'Краснодар']} pill />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {deals.map((deal) => (
          <Card key={deal.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-ink">{deal.name}</div>
                <div className="text-sm text-ink-muted">{deal.category}</div>
                <div className="text-xs text-ink-faint">{deal.address}</div>
              </div>
              <Star
                className={deal.favorite ? 'h-5 w-5 fill-primary text-primary' : 'h-5 w-5 text-ink-faint'}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{deal.dealType}</Badge>
              <Badge tone="neutral">
                {deal.exposureStart} — {deal.exposureEnd}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <div className="text-ink-muted">% в сделку</div>
                <div className="font-semibold">{deal.conversionToDeal}%</div>
              </div>
              <div>
                <div className="text-ink-muted">% подтверждений</div>
                <div className="font-semibold">{deal.confirmationRate}%</div>
              </div>
              <div>
                <div className="text-ink-muted">Комиссия</div>
                <div className="font-semibold">{deal.commission.toLocaleString('ru-RU')} ₽</div>
              </div>
            </div>

            <Link
              to={`/objects/${deal.id}`}
              className="mt-1 inline-flex w-fit items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Подробнее
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}

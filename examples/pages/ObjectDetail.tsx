import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Star } from 'lucide-react';
import { PageHeader } from '../../src/components/layout/PageHeader';
import { InfoBanner } from '../../src/components/layout/InfoBanner';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { deals } from '../data/deals';

export function ObjectDetail() {
  const { id } = useParams();
  const deal = deals.find((d) => d.id === id) ?? deals[0];

  return (
    <>
      <PageHeader title="Объекты" notifications={2} />
      <InfoBanner>
        До 30 января открыт приём заявок по БЦ «Меркурий» — комиссия партнёру увеличена до 750 000 ₽
      </InfoBanner>

      <Link to="/objects" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Все объекты
      </Link>

      <div className="grid grid-cols-[360px_1fr] items-start gap-5">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="text-lg font-bold text-ink">{deal.name}</span>
              </div>
              <Star className={deal.favorite ? 'h-5 w-5 fill-primary text-primary' : 'h-5 w-5 text-ink-faint'} />
            </div>

            <div>
              <div className="text-sm text-ink-muted">Срок экспозиции лота:</div>
              <div className="font-semibold text-ink">
                {deal.exposureStart} – {deal.exposureEnd}
              </div>
            </div>
            <div>
              <div className="text-sm text-ink-muted">Целевой сегмент:</div>
              <div className="font-semibold text-ink">{deal.targetSegment}</div>
            </div>

            <Button className="w-full">Взять в работу</Button>
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <div className="text-sm text-ink-muted">Тип сделки</div>
              <div className="font-semibold text-ink">{deal.dealType}</div>
            </div>
            <div>
              <div className="text-sm text-ink-muted">Комиссия партнёру</div>
              <div className="text-xl font-extrabold text-ink">{deal.commission.toLocaleString('ru-RU')} ₽</div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="text-sm text-ink-muted">Каналы продвижения лота:</div>
            <ul className="flex flex-col gap-2 text-sm text-ink">
              {deal.channels.map((channel) => (
                <li key={channel} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {channel}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="text-sm text-ink-muted">Статистика по лоту:</div>
            <div className="flex justify-between">
              <div>
                <div className="text-sm text-ink-muted">% в сделку</div>
                <div className="text-xl font-extrabold">{deal.conversionToDeal}%</div>
              </div>
              <div>
                <div className="text-sm text-ink-muted">% подтверждений</div>
                <div className="text-xl font-extrabold">{deal.confirmationRate}%</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-2 font-bold text-ink">Описание проекта:</div>
            <p className="text-sm leading-relaxed text-ink-muted">{deal.description}</p>
          </Card>

          <Card>
            <div className="mb-2 font-bold text-ink">Бонус для партнёров Lobsters:</div>
            <p className="text-sm leading-relaxed text-ink-muted">{deal.partnerBonus}</p>
          </Card>

          <Card>
            <div className="mb-2 font-bold text-ink">Экономика сделки:</div>
            <p className="text-sm leading-relaxed text-ink-muted">{deal.economics}</p>
          </Card>

          <Card>
            <div className="mb-3 font-bold text-ink">Условия для арендатора и особенности объекта:</div>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-ink-muted">
              {deal.tenantConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ol>
          </Card>

          <Card>
            <div className="mb-3 font-bold text-ink">Фото объекта для публикации:</div>
            <div className="flex h-48 items-center justify-center rounded-control bg-surface-muted text-sm text-ink-faint">
              Изображение объекта
            </div>
          </Card>

          <Card>
            <div className="mb-3 font-bold text-ink">Запрещено к упоминанию в публикациях:</div>
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
              {deal.restrictions.map((restriction) => (
                <li key={restriction}>{restriction}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

import { CalendarDays, Download } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { InfoBanner } from '../components/layout/InfoBanner';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { LobsterMark } from '../components/ui/LobsterMark';
import { dashboardMetrics } from '../data/dashboard';
import { deals } from '../data/deals';
import { Link } from 'react-router-dom';

export function Dashboard() {
  return (
    <>
      <PageHeader title="Дашборд" notifications={2} />
      <InfoBanner>
        До 30 января открыт приём заявок по БЦ «Меркурий» — комиссия партнёру увеличена до 750 000 ₽
      </InfoBanner>

      <div className="grid grid-cols-3 gap-5">
        <Card className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-ink-muted">
            <CalendarDays className="h-4 w-4" />
            {dashboardMetrics.period}
          </span>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-ink-muted">Новые заявки</div>
              <div className="text-2xl font-extrabold">{dashboardMetrics.newDeals}</div>
            </div>
            <div>
              <div className="text-sm text-ink-muted">Закрытые сделки</div>
              <div className="text-2xl font-extrabold">{dashboardMetrics.closedDeals}</div>
            </div>
          </div>
          <div>
            <div className="text-sm text-ink-muted">Заработок</div>
            <div className="text-2xl font-extrabold">{dashboardMetrics.earnings}</div>
          </div>
        </Card>

        <Card className="flex flex-col gap-5">
          <span className="text-base font-bold">Баланс</span>
          <div>
            <div className="text-sm text-ink-muted">Готово к выплате</div>
            <div className="text-2xl font-extrabold">{dashboardMetrics.readyForPayout}</div>
          </div>
          <div>
            <div className="text-sm text-ink-muted">На проверке у девелопера</div>
            <div className="text-2xl font-extrabold">{dashboardMetrics.onReview}</div>
          </div>
        </Card>

        <Card className="relative flex flex-col gap-5 overflow-hidden">
          <LobsterMark className="pointer-events-none absolute -right-3 -top-3 h-14 w-14 opacity-20" />
          <span className="relative text-base font-bold">Доход</span>
          <div className="relative">
            <div className="text-sm text-ink-muted">За месяц</div>
            <div className="text-2xl font-extrabold">{dashboardMetrics.incomeMonth}</div>
          </div>
          <div className="relative">
            <div className="text-sm text-ink-muted">За год</div>
            <div className="text-2xl font-extrabold">{dashboardMetrics.incomeYear}</div>
          </div>
          <div className="relative">
            <div className="text-sm text-ink-muted">За всё время</div>
            <div className="text-2xl font-extrabold">{dashboardMetrics.incomeAllTime}</div>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-0">
        <div className="flex items-center justify-between px-6 pt-6">
          <span className="text-xl font-extrabold">Топ объектов</span>
        </div>
        <div className="flex flex-col">
          <div className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Объект</span>
            <span>Сделка</span>
            <span>% в сделку</span>
            <span>% подтверждений</span>
            <span>Комиссия</span>
            <span />
          </div>
          {deals.map((deal) => (
            <div
              key={deal.id}
              className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_1fr_auto] items-center gap-4 border-t border-border px-6 py-4 text-sm"
            >
              <div>
                <div className="font-semibold text-ink">{deal.name}</div>
                <div className="text-xs text-ink-muted">{deal.category}</div>
              </div>
              <span className="text-ink-muted">{deal.dealType}</span>
              <span>{deal.conversionToDeal}%</span>
              <span>{deal.confirmationRate}%</span>
              <Badge tone="primary">{deal.commission.toLocaleString('ru-RU')} ₽</Badge>
              <Link
                to={`/objects/${deal.id}`}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink hover:border-primary hover:text-primary"
              >
                Подробнее
              </Link>
            </div>
          ))}
        </div>
        <div className="border-t border-border px-6 py-4">
          <button className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink hover:border-primary hover:text-primary">
            <Download className="h-4 w-4" />
            Памятка по работе с объектами
          </button>
        </div>
      </Card>
    </>
  );
}

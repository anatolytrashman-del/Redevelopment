import { useRef, useState, type ElementType } from 'react';
import { Card } from '../ui/Card';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { BuildingPlanCanvas, BuildingPlanLegend, BuildingPlanTabs } from './BuildingPlanCanvas';
import { AvailableUnitsTable } from './AvailableUnitsTable';
import { AgreementSigningFlow } from './AgreementSigningFlow';
import {
  zoneStatusBadgeClass,
  zoneTypeLabels,
  zoneDownPayment,
  zonePrice,
  workstationsRemaining,
  WORKSTATION_PRICE,
  type BuildingPlan,
  type BuildingPlanZone,
} from '../../data/buildingPlans';
import type { RealtyObject } from '../../data/objects';
import { insertLead } from '../../lib/leadsApi';
import { updateZone } from '../../lib/buildingPlansApi';
import { cn } from '../../lib/cn';

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyBookingForm = { name: '', contact: '', comment: '' };

interface PublicPlanAndUnitsProps {
  object: RealtyObject;
  plans: BuildingPlan[];
  zones: BuildingPlanZone[];
  // Бронь сразу переводит зону в "Забронировано" и привязывает нового лида
  // (та же связка zone.leadId/status, что менеджер иначе ставит вручную из
  // ZoneDetailModal в админке) — родитель обновляет свой массив zones, чтобы
  // план и таблица тут же отразили изменение без перезагрузки страницы.
  onZoneUpdated: (zone: BuildingPlanZone) => void;
  // Только для черновика продающей страницы (/:slug/draft) — см.
  // src/lib/glass.ts. По умолчанию выключено: этот компонент используется
  // ещё в /plan/:token, на уже одобренной клиентской /:slug и в админке.
  glass?: boolean;
}

// Планировка + таблица доступных кабинетов — общий блок для всех публичных
// поверхностей объекта (/plan/:token, продающая страница /:slug и её
// черновик /:slug/draft), чтобы подсветка, переключение этажей, кнопка
// "Посмотреть на плане" и бронирование кабинета вели себя одинаково и не
// расходились между копиями.
export function PublicPlanAndUnits({ object, plans, zones, onZoneUpdated, glass }: PublicPlanAndUnitsProps) {
  const PlanWrapper: ElementType = glass ? 'div' : Card;
  const [activePlanId, setActivePlanId] = useState<string | null>(object.buildingPlanIds[0] ?? null);
  const [selectedZone, setSelectedZone] = useState<BuildingPlanZone | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [pinnedZoneId, setPinnedZoneId] = useState<string | null>(null);
  const planCardRef = useRef<HTMLDivElement>(null);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingDone, setBookingDone] = useState(false);
  const [bookedLeadId, setBookedLeadId] = useState<string | null>(null);

  function resetBookingState(nextOpen: boolean) {
    setBookingOpen(nextOpen);
    setBookingForm(emptyBookingForm);
    setBookingError(null);
    setBookingDone(false);
    setBookedLeadId(null);
  }

  const objectPlans = object.buildingPlanIds
    .map((planId) => plans.find((p) => p.id === planId))
    .filter((p): p is BuildingPlan => !!p);
  const plan = objectPlans.find((p) => p.id === activePlanId) ?? null;
  const isRoom = selectedZone?.zoneType === 'room';
  const isWorkstation = selectedZone?.workstationCount != null;
  const workstationsLeft = selectedZone ? workstationsRemaining(selectedZone) : 0;
  const highlightZoneId = selectedZone?.id ?? pinnedZoneId ?? hoveredZoneId;

  function handleZoneSelect(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setSelectedZone(zone);
    resetBookingState(false);
  }

  // Кнопка "Забронировать" прямо в таблице доступных кабинетов — то же
  // самое, что открыть карточку кабинета и нажать "Забронировать" внутри,
  // но в один клик: сразу открывает модалку с формой брони, а не с кнопкой.
  function handleBookClick(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setSelectedZone(zone);
    resetBookingState(true);
  }

  function handleLocateOnPlan(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setPinnedZoneId(zone.id);
    planCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedZone || !bookingForm.name.trim() || !bookingForm.contact.trim() || bookingSubmitting) return;
    const bookingWorkstation = selectedZone.workstationCount != null;
    if (bookingWorkstation && workstationsRemaining(selectedZone) <= 0) return;
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const lead = await insertLead({
        name: bookingForm.name.trim(),
        source: 'Сайт',
        businessType: '',
        area: bookingWorkstation ? 'Фиксированное рабочее место' : selectedZone.area != null ? `${selectedZone.area} м²` : '',
        requirement: bookingForm.comment.trim(),
        contact: bookingForm.contact.trim(),
        status: 'Заявка на бронирование',
        isWarm: true,
        objectId: object.id,
      });
      // Рабочие места продаются по одному внутри одной зоны — вместо
      // whole-zone брони (status+leadId) увеличиваем счётчик проданных мест
      // и переводим зону в "Продано" только когда закончились все места.
      const updatedZone = bookingWorkstation
        ? await updateZone(selectedZone.id, {
            workstationsSold: selectedZone.workstationsSold + 1,
            status: selectedZone.workstationsSold + 1 >= (selectedZone.workstationCount as number) ? 'Продано' : 'Свободно',
          })
        : await updateZone(selectedZone.id, { status: 'Забронировано', leadId: lead.id });
      setSelectedZone(updatedZone);
      onZoneUpdated(updatedZone);
      setBookedLeadId(lead.id);
      setBookingDone(true);
    } catch (err) {
      setBookingError(errorMessage(err, 'Не удалось отправить заявку'));
    } finally {
      setBookingSubmitting(false);
    }
  }

  return (
    <>
      <div ref={planCardRef}>
        <PlanWrapper
          className={cn('flex flex-col gap-3 p-5', glass && glassCardClass)}
          style={glass ? glassCardShadow : undefined}
        >
          <div className="font-bold text-ink">Планировка и доступные кабинеты</div>

          {objectPlans.length === 0 ? (
            <p className="text-sm text-ink-muted">Планировка для этого объекта пока не добавлена.</p>
          ) : (
            <>
              <BuildingPlanTabs plans={objectPlans} activePlanId={activePlanId} onSelect={setActivePlanId} />
              {plan && (
                <>
                  <BuildingPlanCanvas
                    plan={plan}
                    zones={zones}
                    onZoneClick={handleZoneSelect}
                    highlightZoneId={highlightZoneId}
                  />
                  <BuildingPlanLegend />
                </>
              )}
            </>
          )}
        </PlanWrapper>
      </div>

      {objectPlans.length > 0 && (
        <AvailableUnitsTable
          plans={objectPlans}
          zones={zones}
          highlightedZoneId={highlightZoneId}
          onRowClick={handleZoneSelect}
          onRowHover={(zone) => setHoveredZoneId(zone?.id ?? null)}
          onLocateClick={handleLocateOnPlan}
          onBookClick={handleBookClick}
          glass={glass}
        />
      )}

      <Modal
        open={!!selectedZone}
        onClose={() => setSelectedZone(null)}
        title={selectedZone ? zoneTypeLabels[selectedZone.zoneType] : ''}
      >
        {selectedZone && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xl font-bold text-ink">{selectedZone.label || '—'}</span>
              {isRoom && (
                isWorkstation ? (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                      workstationsLeft > 0 ? 'bg-success-bg text-success' : 'bg-danger/15 text-danger',
                    )}
                  >
                    {workstationsLeft > 0 ? `Свободно ${workstationsLeft} из ${selectedZone.workstationCount}` : 'Все места заняты'}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                      zoneStatusBadgeClass[selectedZone.status],
                    )}
                  >
                    {selectedZone.status}
                  </span>
                )
              )}
            </div>

            {isRoom && (
              <>
                {isWorkstation ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-control bg-surface-muted px-3 py-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-muted">Формат</span>
                      <span className="font-medium text-ink">Фиксированное рабочее место</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-muted">Свободно мест</span>
                      <span className="font-medium text-ink">
                        {workstationsLeft} из {selectedZone.workstationCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-muted">Цена за место</span>
                      <span className="font-medium text-ink">{formatMoney(WORKSTATION_PRICE)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-control bg-surface-muted px-3 py-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-muted">Площадь</span>
                      <span className="font-medium text-ink">{selectedZone.area != null ? `${selectedZone.area} м²` : '—'}</span>
                    </div>
                    {selectedZone.area != null && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-muted">Стоимость</span>
                          <span className="font-medium text-ink">{formatMoney(zonePrice(selectedZone.area))}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-muted">Первый взнос</span>
                          <span className="font-medium text-ink">{formatMoney(zoneDownPayment(selectedZone.area))}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {selectedZone.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedZone.features.map((f) => (
                      <span key={f} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink">
                        {f}
                      </span>
                    ))}
                  </div>
                )}

                {((isWorkstation ? workstationsLeft > 0 : selectedZone.status === 'Свободно') || bookingDone) && (
                  <div className="flex flex-col gap-3 border-t border-border pt-3">
                    {bookingDone && bookedLeadId ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm font-medium text-success">
                          Забронировано! Мы скоро свяжемся с вами для подтверждения.
                        </p>
                        <AgreementSigningFlow
                          leadId={bookedLeadId}
                          objectId={object.id}
                          zoneId={selectedZone.id}
                          zoneArea={selectedZone.area ?? 0}
                          zoneFloorLabel={plan?.name ?? ''}
                        />
                      </div>
                    ) : bookingOpen ? (
                      <form onSubmit={handleBookingSubmit} className="flex flex-col gap-3">
                        <Input
                          label="Имя"
                          placeholder="Как к вам обращаться"
                          value={bookingForm.name}
                          onChange={(e) => setBookingForm((f) => ({ ...f, name: e.target.value }))}
                          required
                          autoFocus
                        />
                        <Input
                          label="Телефон или Telegram"
                          placeholder="+375 29 ..."
                          value={bookingForm.contact}
                          onChange={(e) => setBookingForm((f) => ({ ...f, contact: e.target.value }))}
                          required
                        />
                        <Textarea
                          label="Комментарий (необязательно)"
                          rows={2}
                          value={bookingForm.comment}
                          onChange={(e) => setBookingForm((f) => ({ ...f, comment: e.target.value }))}
                        />
                        {bookingError && <p className="text-sm text-danger">{bookingError}</p>}
                        <Button type="submit" disabled={bookingSubmitting} className="w-fit">
                          {bookingSubmitting ? 'Отправляем...' : 'Подтвердить бронь'}
                        </Button>
                      </form>
                    ) : (
                      <Button type="button" onClick={() => setBookingOpen(true)} className="w-fit">
                        Забронировать
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

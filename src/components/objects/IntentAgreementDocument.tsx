import type { ReactNode } from 'react';

// Стилизованная вёрстка шаблона соглашения о намерениях — заменяет
// нативный PDF-просмотрщик Chrome (нечитаемый, долго грузится) на
// компонент в типографике сайта. Текст пунктов зафиксирован здесь же:
// это шаблон одного и того же документа для любого объекта, а не
// данные конкретной сделки — бланки (___) остаются пустыми полями,
// которые стороны заполняют на бумаге при подписании.

function Blank({ width = '5rem' }: { width?: string }) {
  return <span className="mx-1 inline-block border-b border-dashed border-ink-faint align-bottom" style={{ minWidth: width }}>&nbsp;</span>;
}

// Персональные данные продавца скрыты блюром — страница пойдёт в рекламу и
// будет доступна широкой аудитории, а не только тем, кто уже бронирует.
function Blurred({ children }: { children: ReactNode }) {
  return (
    <span className="select-none rounded-sm" style={{ filter: 'blur(5px)' }} aria-hidden="true">
      {children}
    </span>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-sm font-extrabold uppercase tracking-wide text-ink">
        {number}. {title}
      </div>
      <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

function SignatureBlock({ role, name }: { role: string; name: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-control border border-border p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{role}</div>
      <div className="text-sm text-ink">ФИО: {name}</div>
      <div className="text-sm text-ink-muted">
        Подпись: <Blank width="8rem" />
      </div>
    </div>
  );
}

export function IntentAgreementDocument() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-card border border-border bg-surface p-6 text-ink sm:p-10">
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-lg font-extrabold uppercase tracking-wide text-ink">Соглашение о намерениях</h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>г. Минск</span>
        <span>
          «<Blank width="1.5rem" />» <Blank width="6rem" /> 2026 г.
        </span>
      </div>

      <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-muted">
        <p>
          Гражданин РБ <Blurred>Трэшмен Анатолий Владимирович, ID-карта BY3490446, выданная 24.10.2022</Blurred>, проживающий
          по адресу: <Blurred>Минский район, д. Копище, ул. Пилотная, д. 30, кв. 94</Blurred> (далее —{' '}
          <strong className="text-ink">Продавец</strong>),
        </p>
        <p className="text-center text-ink-faint">и</p>
        <p>
          Гражданин(ка) РБ <Blank />, паспорт <Blank />, выдан <Blank />, проживающий(ая) по адресу: <Blank width="8rem" />{' '}
          (далее — <strong className="text-ink">Покупатель</strong>),
        </p>
        <p>совместно именуемые «Стороны», заключили настоящее Соглашение о нижеследующем:</p>
      </div>

      <div className="h-px bg-border" />

      <Section number="1" title="Предмет и цель">
        <p>1.1. Стороны выражают взаимную заинтересованность в совершении в будущем сделки купли-продажи изолированного помещения (кабинета).</p>
        <p>1.2. Ориентировочные характеристики Помещения:</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-control bg-surface-muted p-4 text-sm">
          <dt className="text-ink-faint">Локация</dt>
          <dd className="font-medium text-ink">микрорайон Козырево, Минск</dd>
          <dt className="text-ink-faint">Предполагаемая площадь</dt>
          <dd className="text-ink">
            <Blank width="4rem" /> кв. м.
          </dd>
          <dt className="text-ink-faint">Этаж (по проекту)</dt>
          <dd className="text-ink">
            <Blank width="3rem" />
          </dd>
          <dt className="text-ink-faint">Целевое назначение</dt>
          <dd className="font-medium text-ink">административно-хозяйственное</dd>
        </dl>
      </Section>

      <Section number="2" title="Предварительные условия сделки">
        <p>
          2.1. Ориентировочная стоимость Помещения рассчитывается исходя из ставки 2100 долларов США за 1 кв. метр площади
          Помещения. Итоговая стоимость определяется умножением указанной ставки на фактическую площадь Помещения (согласно
          данным ведомости технических характеристик / технического паспорта) и оплачивается в белорусских рублях по курсу
          Национального банка Республики Беларусь на день оплаты.
        </p>
        <p>
          2.2. Продавец намеревается приобрести здание, осуществить его конструктивный раздел с присвоением Помещению
          отдельного изолированного кадастрового номера и оформить необходимые права на недвижимость.
        </p>
        <p>
          2.3. После оформления Продавцом (или подконтрольным ему юридическим лицом) права собственности на Помещение
          Стороны обязуются обсудить возможность заключения Договора купли-продажи.
        </p>
      </Section>

      <Section number="3" title="Правовой статус и отсутствие обязательств">
        <p>
          3.1. Настоящее Соглашение отражает лишь намерение Сторон к сотрудничеству, не является предварительным договором
          и не создает для Сторон юридических или финансовых обязательств.
        </p>
        <p>3.2. Ни одна из Сторон не берет на себя обязательств по обязательному заключению договора купли-продажи в будущем.</p>
        <p className="rounded-control border border-success/30 bg-success-bg px-4 py-3 font-medium text-ink">
          3.3. В рамках настоящего Соглашения денежные средства (аванс, задаток, платежи за бронирование) не передаются.
        </p>
        <p>
          3.4. Стороны не несут ответственности друг перед другом за нереализацию намерений, задержку сроков или отказ от
          заключения сделки на любом этапе.
        </p>
      </Section>

      <Section number="4" title="Подписи сторон">
        <div className="grid gap-4 sm:grid-cols-2">
          <SignatureBlock role="Продавец" name={<Blurred>Трэшмен Анатолий Владимирович</Blurred>} />
          <SignatureBlock role="Покупатель" name={<Blank width="8rem" />} />
        </div>
      </Section>
    </div>
  );
}

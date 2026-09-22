import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { GENERAL_DATA_SOURCES } from '../../data/businessCenterSources';
import { fetchCatalogSiteSources, type SourceSite } from '../../lib/businessCenterSourcesApi';

// Владелец, 2026-09-22: не хочет отдельных кликабельных плашек на каждый
// конкретный сайт прямо на странице БЦ/каталога — сайт застройщика или
// агрегатора не должен выглядеть так, будто дал заметную долю данных.
// Вместо плашек — одна фраза с товарными знаками + слово-ссылка,
// открывающая попап с общим (не привязанным к конкретному БЦ) списком.
// Список в попапе одинаковый на любой странице каталога — грузится лениво,
// только при открытии попапа, чтобы не тянуть весь business_centers на
// каждый заход.
function SourceLinks({ sites }: { sites: SourceSite[] }) {
  return (
    <p className="text-sm leading-relaxed text-ink-muted">
      {sites.map((site, i) => (
        <span key={site.href}>
          <a href={site.href} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
            {site.label}
          </a>
          {i < sites.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </p>
  );
}

export function SourcesTrademarkNote() {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<SourceSite[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  function handleOpen() {
    setOpen(true);
    if (sites === null && !loadFailed) {
      fetchCatalogSiteSources()
        .then(setSites)
        .catch(() => setLoadFailed(true));
    }
  }

  return (
    <>
      <p className="text-xs text-ink-muted">
        Упомянутые на странице названия компаний, товарные знаки и логотипы принадлежат их
        правообладателям, приводятся исключительно в информационных целях для идентификации объектов и
        не означают партнёрства, спонсорства или иной аффилированности с сайтом redevelopment.pro.
        Характеристики объектов и ставки, собранные из открытых источников, приведены справочно и не
        являются публичной офертой (ст. 407 Гражданского кодекса Республики Беларусь).{' '}
        <button
          type="button"
          onClick={handleOpen}
          className="font-semibold text-primary underline hover:text-primary-hover"
        >
          Полный список источников →
        </button>
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title="Источники">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Информация в каталоге собирается из открытых источников: карт и справочников, агрегаторов
            объявлений, официальных сайтов бизнес-центров и застройщиков. Не каждый источник относится к
            каждому конкретному зданию.
          </p>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Карты, справочники, агрегаторы объявлений
            </span>
            <SourceLinks sites={GENERAL_DATA_SOURCES.map((s) => ({ label: s.label, href: s.href }))} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Сайты бизнес-центров и застройщиков
            </span>
            {loadFailed && (
              <p className="text-sm text-ink-muted">Не удалось загрузить список — попробуйте ещё раз позже.</p>
            )}
            {!loadFailed && sites === null && <p className="text-sm text-ink-muted">Загрузка…</p>}
            {sites !== null && sites.length > 0 && <SourceLinks sites={sites} />}
          </div>
        </div>
      </Modal>
    </>
  );
}

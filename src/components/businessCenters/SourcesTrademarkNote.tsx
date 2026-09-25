import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { DATA_SOURCE_GROUPS } from '../../data/businessCenterSources';
import { fetchCatalogSiteSources, type CatalogSources, type SourceSite } from '../../lib/businessCenterSourcesApi';
import { useCatalogKind } from '../../lib/catalogKind';
import { CookieFooterLinks } from '../layout/CookieFooterLinks';

// Владелец, 2026-09-22: не хочет отдельных кликабельных плашек на каждый
// конкретный сайт прямо на странице БЦ/каталога — сайт застройщика или
// агрегатора не должен выглядеть так, будто дал заметную долю данных.
// Вместо плашек — одна фраза с товарными знаками + слово-ссылка,
// открывающая попап с общим (не привязанным к конкретному БЦ) списком.
// Список в попапе одинаковый на любой странице каталога — грузится лениво,
// только при открытии попапа, чтобы не тянуть весь business_centers на
// каждый заход.
//
// Владелец, 2026-09-22 (позже в тот же день): «дополни список всеми
// источниками данных на сайте вообще, даже если это onliner или wikipedia».
// Поэтому в попапе теперь не только каталожные агрегаторы: постоянные
// источники сгруппированы по роли (карты, площадки, аналитика,
// энциклопедии — DATA_SOURCE_GROUPS), а сайты зданий/застройщиков и
// издания подтягиваются из базы. Попап открывается с каталожных страниц,
// но описывает весь сайт целиком — включая страницы аналитики рынка и гид
// по району, где своего такого списка нет.
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

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{children}</span>
  );
}

export function SourcesTrademarkNote() {
  const V = useCatalogKind();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<CatalogSources | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  function handleOpen() {
    setOpen(true);
    if (loaded === null && !loadFailed) {
      fetchCatalogSiteSources()
        .then(setLoaded)
        .catch(() => setLoadFailed(true));
    }
  }

  return (
    <>
      <p className="text-xs text-ink-muted">
        Информацию о {V.manyPrep} мы собираем из открытых источников и стараемся поддерживать её в
        актуальном состоянии; точные условия уточняйте у управляющей компании объекта или автора
        объявления. Названия компаний и логотипы упомянуты для удобной идентификации объектов и
        принадлежат их правообладателям. Все сведения носят справочный характер.{' '}
        <button
          type="button"
          onClick={handleOpen}
          className="font-semibold text-ink-muted underline hover:text-ink"
        >
          Полный список источников →
        </button>
      </p>
      <CookieFooterLinks />
      <Modal open={open} onClose={() => setOpen(false)} title="Источники">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Здесь перечислены все внешние источники, которыми мы пользуемся на сайте: карты и
            справочники, площадки объявлений, отраслевая аналитика и официальная статистика,
            энциклопедии, СМИ, сайты самих зданий и застройщиков. Список общий для всего сайта — не
            каждый источник относится к каждой странице и к каждому конкретному зданию.
          </p>
          {DATA_SOURCE_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <GroupTitle>{group.title}</GroupTitle>
              <ul className="flex flex-col gap-1 text-sm leading-relaxed text-ink-muted">
                {group.sources.map((source) => (
                  <li key={source.href}>
                    <a
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary"
                    >
                      {source.label}
                    </a>{' '}
                    — {source.note}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <GroupTitle>СМИ и публикации, на которые ссылаются карточки зданий</GroupTitle>
            {loadFailed && (
              <p className="text-sm text-ink-muted">Не удалось загрузить список — попробуйте ещё раз позже.</p>
            )}
            {!loadFailed && loaded === null && <p className="text-sm text-ink-muted">Загрузка…</p>}
            {loaded !== null && loaded.publications.length > 0 && <SourceLinks sites={loaded.publications} />}
          </div>
          <div className="flex flex-col gap-2">
            <GroupTitle>Сайты {V.manyGen} и застройщиков</GroupTitle>
            {loadFailed && (
              <p className="text-sm text-ink-muted">Не удалось загрузить список — попробуйте ещё раз позже.</p>
            )}
            {!loadFailed && loaded === null && <p className="text-sm text-ink-muted">Загрузка…</p>}
            {loaded !== null && loaded.sites.length > 0 && <SourceLinks sites={loaded.sites} />}
          </div>
        </div>
      </Modal>
    </>
  );
}

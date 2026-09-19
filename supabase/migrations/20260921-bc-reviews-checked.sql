-- Галочка "отзывы разобраны" в списке БЦ в админке (BusinessCentersAdminTab.tsx).
-- Ставится сама, когда сохранение реально прогрузило отзывы из веб-архива, и
-- вручную кликом — для случаев вроде "Аден" (по факту гостиница, не
-- классический БЦ, отзывов с Яндекс.Карт по нему не будет никогда), где
-- владелец 2026-09-21 сначала просил убрать из списка, потом — оставить, но
-- пометить.
alter table business_centers add column if not exists reviews_checked boolean not null default false;

-- Бэкфилл: у кого отзывы в business_center_review_snapshots уже реально
-- есть на момент этой миграции (минимум "Порт") — считаем разобранными, плюс
-- "Аден" вручную (см. комментарий выше).
update business_centers
set reviews_checked = true
where slug in (select distinct business_center_slug from business_center_review_snapshots)
   or slug = 'aden';

NOTIFY pgrst, 'reload schema';

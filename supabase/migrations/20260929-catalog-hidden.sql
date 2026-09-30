-- Скрытые здания каталога (2026-09-29). Владелец: ТЦ без обложки уходят во
-- вторую очередь и пока не показываются на сайте. Флаг читают публичные
-- выборки (генератор файлов сборки и запасные запросы *Api.ts); админка
-- видит все строки, как и раньше.
alter table business_centers add column if not exists is_hidden boolean not null default false;

-- ТЦ без обложки в утверждённом стиле: всё, кроме 86 готовых.
update business_centers set is_hidden = true
where kind = 'tc' and slug not in ('4-sezona-bedy','4-sezona-skripnikova','aeroport','all-dolginovskiy-trakt','almi-dzerzhinskogo','almi-pritytskogo','arena-city','atlantik','avia-mall','avtozapchasti-na-leschinskogo','bazis','bonus','boro','chervenskiy','coolman','dana-mall','diamond-city','domashniy-ochag','esplanada','evropa-tc','expobel','galileo','galleria-minsk','gippo-na-gorodetskoy','globo','grad','green-city-tc','gudvil','gum','impuls','kamelot','karavan','korona-na-kalvariyskoy','korona-v-uruche','kvadro','leningrad','magnit-dzerzhinskogo','maksimus-malinovka','materik','mega-park','metropol-tc','minsk-city-mall','momo','monetka','moskovskiy-rynok','na-nemige','nekrasovskiy','nemiga-3','novaya-evropa','ocean','orbita-moll','outleto','ozertso','palazzo','parking-kuybysheva','perekrestok','pershy-natsyyanalny-gandlevy-dom','pikasso','podzemnyy-gorod','prazdnik','prizma-tc','pro-dom','promenad','prospekt-tc','prostore-na-dzerzhinskogo','rakovskiy-kirmash','riga','senitsa','sigma-tc','siluet-tc','skala','spektr','stolitsa','suharevo','titan-tc','tivali','top-burdeynogo','tryum','tsum','univermag-belarus','valeryanovo','vostok','yarkiy','zamok','zerkalo','zhdanovichi');

NOTIFY pgrst, 'reload schema';

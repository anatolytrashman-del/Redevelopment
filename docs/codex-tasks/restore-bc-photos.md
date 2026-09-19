# Вернуть в репозиторий обновлённые фото бизнес-центров

## Что случилось

Ты собирал пакет фото БЦ с вывесками на ветке `codex/bc-photo-parus-victoria-v`
(коммиты «Обновить пакет фото бизнес-центров с вывесками» и «Сбросить кэш фото
бизнес-центров»). Ветку удалили, её коммиты GitHub больше не отдаёт, и в
`preview`/прод эта работа НИКОГДА не вливалась. На сайте сейчас старые фото.

Живым остался только деплой Vercel — по нему и сверено, чего не хватает.

## Что нужно сделать

Положить недостающие файлы в `public/images/business-centers/` на ветке от
СВЕЖЕГО `preview` и открыть PR в `preview`. Ничего, кроме картинок, не трогать:
ни кода, ни данных, ни базы.

Затронуто 56 зданий, 165 файлов изменены и 3 новых.
У каждого здания три файла: `<slug>.jpg`, `<slug>.webp`, `<slug>-card.webp`.

### Слаги зданий

amtel, bk-capital-palace, bonhotel, campus, caspian-plaza, centropol, d16, dana-center, delphi, ekspobel, engelsa-34a, farengeyt, flagman, fortune, forum-plaza, futuris, imperskiy, info, kamennogorsky, kapital, kaskad-alfa, kolizey, komkon, kontur, krasavik, levada, parus, pr-t-dzerzhinskogo-8, shanter-hill, shik, titan, titul, traktsentr-b-s-a-t, ul-amuratorskaya-4, ul-bogdanovicha-155b, ul-briketa-30, ul-internatsionalnaya-36, ul-korolya-51, ul-krasnozvezdnaya-18b, ul-levkova-43, ul-lobanka-79, ul-myasnikova-70, ul-narochanskaya-11, ul-naturalistov-3, ul-olshevskogo-22, ul-orlovskaya-40-a, ul-pinskaya-28a, ul-platonova-20b, ul-skryganova-6a, ul-sverdlova-2, ul-tolbuhina-3a, ul-volodko-24a, ul-zheleznodorozhnaya-33a, ul-zhukovskogo-11a, v, victoria-plaza

### Новые файлы (их в репозитории нет вовсе)

- `public/images/business-centers/v-card.webp`
- `public/images/business-centers/v.jpg`
- `public/images/business-centers/v.webp`

## Важно: `v.*` против `stolitsa.*`

Здание на пр-те Победителей, 59 в базе теперь называется «Бизнес-центр
«Столица»» (слаг остался `v`), и колонка `photos` у него указывает на
`/images/business-centers/stolitsa.jpg`. Файл `stolitsa.jpg` в репозитории
есть и в твоём деплое он НЕ менялся — то есть новое фото с вывеской, судя по
всему, лежит в `v.jpg`.

Положи оба набора (`v.*` и оставь `stolitsa.*` как есть), а в описании PR
напиши прямо, какой из файлов — новый снимок с вывеской. Колонку `photos` в
базе НЕ меняй: базу правит Claude, у тебя к ней доступа нет.

## Формат сдачи

Обычный PR в `preview` с файлами в репозитории — это и есть самый удобный
формат, ничего архивировать не нужно. В описании PR перечисли, для каких
зданий фото обновлены.

## Чего НЕ делать

- не пересжимать и не пережимать заново уже лежащие в репозитории картинки:
  268 файлов из твоего же пакета совпадают с текущими побайтово, их трогать
  не надо;
- не переименовывать существующие файлы — на пути в `photos` завязана база;
- не править `business_centers`, миграции и код.

# Lobsters — платформа управления редевелопментом коммерческой недвижимости

Прототип платформы для компании, занимающейся редевелопментом коммерческой недвижимости.
Дизайн-система (логотип, шрифт Yandex Sans Text, цвета, компоненты) перенесена 1:1 из
макетов Figma бренда Lobsters. Страницы собираются по одной поверх готовой дизайн-системы.

## Стек

- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4
- react-router-dom
- lucide-react (иконки)

## Запуск

```bash
npm install
npm run dev
```

## Деплой

При каждом пуше в `claude/redevelopment-platform-prototype-oodobu` или `main` GitHub Actions
(`.github/workflows/deploy-pages.yml`) собирает проект и публикует на GitHub Pages:
https://anatolytrashman-del.github.io/Lobsters-Real-Estate/

## Структура

- `src/components/ui` — базовые UI-компоненты (Button, Card, Badge, Input, Select, TreeTable...)
- `src/components/layout` — сайдбар, шапка страницы, инфо-баннер, общий layout
- `src/pages` — активные страницы приложения (сейчас — только заглушка `Home`)
- `src/assets` — логотип и лобстер-маскот (PNG)
- `public/fonts` — шрифт Yandex Sans Text (self-hosted, CDN Яндекса недоступен)
- `examples/` — референс-страницы из первого прохода прототипа, не подключены к сборке.
  См. `examples/README.md` — как использовать при добавлении новых страниц.

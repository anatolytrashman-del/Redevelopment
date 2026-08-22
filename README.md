# Redevelopment — платформа управления редевелопментом коммерческой недвижимости

Прототип платформы для компании, занимающейся редевелопментом коммерческой недвижимости.
Страницы собираются по одной поверх готовой дизайн-системы (шрифт Montserrat, цвета,
UI-компоненты).

## Стек

- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4
- react-router-dom
- Supabase (`@supabase/supabase-js`) — хранение данных
- lucide-react (иконки)

## Запуск

```bash
npm install
npm run dev
```

## Деплой

Прод — Vercel (redevelopment.pro), собирается автоматически при пуше в
`claude/redevelopment-platform-prototype-oodobu` (git-интеграция Vercel, вне репозитория).
Зеркало на GitHub Pages отключено (2026-08-22).

## Структура

- `src/components/ui` — базовые UI-компоненты (Button, Card, Badge, Input, Select,
  AddableSelect, ToggleGroup, Modal, TreeTable...)
- `src/components/layout` — сайдбар, шапка страницы, инфо-баннер, общий layout
- `src/pages` — активные страницы приложения (Дашборд, Транзакции)
- `src/data` — доменные типы и справочники (валюты, категории, партнёры, источники платежа)
- `src/lib` — клиент Supabase и функции работы с транзакциями
- `public/fonts` — шрифт Montserrat (self-hosted)
- `examples/` — референс-страницы из первого прохода прототипа, не подключены к сборке.
  См. `examples/README.md` — как использовать при добавлении новых страниц.

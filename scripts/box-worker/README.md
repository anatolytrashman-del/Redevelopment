# ИИ-воркер на боксе (счета и встречи)

Очередь `ai_box_jobs`, миграция `supabase/migrations/20261014-ai-box-worker-queue.sql`.

- `kind = invoice_recognition`, payload `{ fileUrl, fileName, emailContext? }`. Результат в том же формате, что `recognizeInvoice` (`normalizeRecognized`) плюс `recognizedAt` и `recognizedBy: 'box-worker'`.
- `kind = meeting_summary`, payload `{ transcript, prompt? }`. Результат `{ summary }`, формат промпта взят из `api/meeting-ai.js`.

Ставит задания серверный код через `ai_box_enqueue` (service_role). Воркер видит только `ai_box_claim` / `ai_box_complete` / `ai_box_fail`, под ролью `ai_box_worker`.

## Доступ воркера

JWT с `{"role":"ai_box_worker"}`, подписанный JWT-секретом проекта (Supabase → Settings → API). Выпускает владелец, срок на своё усмотрение. На боксе нужны:

```
SUPABASE_URL=...  SUPABASE_ANON_KEY=...  AI_BOX_WORKER_JWT=...
node scripts/box-worker/worker.mjs          # цикл
node scripts/box-worker/worker.mjs --once   # одно задание
```

Модель: Grok через opencode, вход OAuth, `XAI_API_KEY` не используется. По умолчанию `xai/grok-4.20-0309-non-reasoning`, меняется переменной `BOX_WORKER_MODEL`.

## Лимиты и повторы

- Не больше `BOX_WORKER_RPM` (по умолчанию 6) вызовов модели в минуту и не чаще одного раза в 3 с.
- Задание повторяется при 429 (с паузой из Retry-After), при 403 «регион» (переподключение VPN), при 5xx и при сетевых ошибках. Пауза 1, 2, 4… мин, максимум час; не больше `max_attempts` попыток (по умолчанию 4). Её считает `ai_box_fail`.
- Задание, которое висит в `running` дольше 15 минут, возвращается в работу.
- Если база недоступна, воркер опрашивает её реже, пауза растёт до 10 минут.

## Проверка без базы

```
node scripts/box-worker/worker.mjs --local invoice счёт1.pdf счёт2.pdf
node scripts/box-worker/worker.mjs --local meeting расшифровка.txt
```

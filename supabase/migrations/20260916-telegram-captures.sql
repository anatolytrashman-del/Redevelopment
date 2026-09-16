-- Копилка Telegram: то, что владелец пересылает боту из личных диалогов
-- (юрист, сторител, блогеры) — сообщение с текстом и/или файлом падает сюда,
-- проходит через модель и ждёт разбора человеком на вкладке "Telegram"
-- страницы "Почта".
--
-- Владелец, 2026-09-16: "Есть смысл запариваться ради переписки с 5
-- блогерами? Но еще я общаюсь там и со сторителем, и с юристом, по идее
-- система могла бы из диалогов получать много инфы + вложения" — и, после
-- разбора вариантов, "Давай делать бот-копилку".
--
-- Почему копилка, а не полноценная интеграция личного аккаунта (Telegram
-- Business + бот): при восьми живых диалогах лента переписки в CRM была бы
-- пустым зеркалом, а Premium, доступ бота ко ВСЕМ личным чатам и риск
-- утечки личной переписки в базу — реальными. Пересылка в бота фильтрует
-- на входе: в систему попадает только то, что владелец сам счёл важным.
--
-- Почему не автозапись в карточки: тот же паттерн, что уже принят для
-- supplier_contact_captures (2026-09-14) — снятое падает в отдельную
-- таблицу и ждёт подтверждения. Для разговорной речи это обязательно:
-- модель хорошо читает счёт и плохо — фразу "ну давай тогда к пятнице".
create table if not exists telegram_captures (
  id uuid primary key default gen_random_uuid(),
  -- Идемпотентность: Telegram повторяет доставку апдейта, пока не получит
  -- 200, а функция делает и скачивание файла, и вызов модели — то есть
  -- вполне может не уложиться в отведённое ему время. Без этой пары
  -- колонок и уникального индекса по ним один пересланный договор лёг бы в
  -- копилку двумя-тремя строками.
  chat_id bigint not null,
  message_id bigint not null,
  -- Кто переслал (сам владелец). Чужих бот не слушает — см.
  -- TELEGRAM_ALLOWED_USER_IDS в api/_telegramCapture.js.
  sender_user_id bigint,
  sender_name text not null default '',
  -- forward — переслано из чужого диалога, direct — написано боту напрямую
  -- (заметка себе, файл со своего компьютера).
  source_kind text not null default 'direct' check (source_kind in ('forward','direct')),
  -- Исходный автор пересланного сообщения. Пустая строка — это НЕ баг: у
  -- собеседника может стоять запрет на ссылку при пересылке, тогда Telegram
  -- отдаёт только имя без id, а иногда (forward_origin.type = 'hidden_user')
  -- и вовсе ничего. Проставляется руками в интерфейсе.
  source_name text not null default '',
  source_username text not null default '',
  source_date timestamptz,
  text text not null default '',
  -- [{ fileName, url, contentType, size }] — тот же бакет object-documents и
  -- тот же uploadAttachment, что у вложений писем.
  files jsonb not null default '[]'::jsonb,
  -- Разбор моделью (Haiku через ProxyAPI). Пустые значения — нормальное
  -- состояние: модель могла быть недоступна, а сообщение всё равно сохранено.
  kind text not null default '',
  summary text not null default '',
  facts jsonb not null default '[]'::jsonb,
  due_date date,
  counterparty text not null default '',
  status text not null default 'new' check (status in ('new','accepted','dismissed')),
  -- Мягкая привязка к карточке: collaboration | object (без FK — копилка
  -- переживает удаление карточки, висящая ссылка просто не находит имя).
  linked_type text not null default '',
  linked_id uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists telegram_captures_message_idx on telegram_captures (chat_id, message_id);
create index if not exists telegram_captures_created_at_idx on telegram_captures (created_at desc);
create index if not exists telegram_captures_status_idx on telegram_captures (status);

alter table telegram_captures enable row level security;
drop policy if exists authenticated_all on telegram_captures;
create policy authenticated_all on telegram_captures for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

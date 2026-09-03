// Раз в месяц, 25-го числа (см. .github/workflows/monthly-svetlana-tasks.yml)
// ставит Светлане две задачи-напоминания — владелец, 2026-09-03: "25 числа
// каждого месяца в списке задач на Светлану ставятся две задачи: Обновить
// список организаций Минск Мир и Актуализация объявлений Kufar и Realt".
// Это не сами синки (те уже автоматические — sync-district-business-points.yml
// 2-го числа, sync-market-offers-stats.yml 1-го числа), а напоминание про
// РУЧНОЙ разбор того, что синки насобирали за месяц: справочник организаций
// по домам (карточки района, ручная сверка/поправка) и очередь верификации
// объявлений на /admin/market-offers (дубли, отделка, "Не подходит" и т.п.).
// 25-е — с запасом до конца месяца, чтобы Светлана успела разобрать.
//
// Идемпотентно: если запуск за этот день уже создал обе задачи (повторный
// запуск workflow_dispatch, ретрай), второй раз не дублирует — проверяет по
// точному совпадению title+start_date перед вставкой.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_SERVICE_ROLE_KEY && !DRY_RUN) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY (или запусти с --dry-run)');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ASSIGNEE = 'Светлана';
const TASK_TITLES = ['Обновить список организаций Минск Мир', 'Актуализация объявлений Kufar и Realt'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const today = todayIso();
  console.log(`Дата: ${today}`);

  for (const title of TASK_TITLES) {
    if (DRY_RUN) {
      console.log(`[dry-run] Создал бы задачу "${title}" на ${today} для ${ASSIGNEE}`);
      continue;
    }

    const { data: existing, error: selectError } = await supabase
      .from('tasks')
      .select('id')
      .eq('title', title)
      .eq('start_date', today);
    if (selectError) throw selectError;

    if (existing && existing.length > 0) {
      console.log(`Уже есть задача "${title}" на ${today} — пропускаю`);
      continue;
    }

    const { error: insertError } = await supabase.from('tasks').insert({
      title,
      description: '',
      start_date: today,
      end_date: today,
      assignees: [ASSIGNEE],
      is_priority: false,
      is_done: false,
      result: '',
    });
    if (insertError) throw insertError;
    console.log(`Создана задача "${title}" на ${today} для ${ASSIGNEE}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

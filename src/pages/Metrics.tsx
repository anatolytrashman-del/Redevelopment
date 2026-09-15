import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { fetchActivityLog } from '../lib/activityLogApi';
import type { ActivityLogEntry } from '../data/activityLog';
import {
  fetchIncomingInvoiceMetrics,
  fetchOutgoingEmailMetrics,
  type IncomingInvoiceMetric,
  type OutgoingEmailMetric,
} from '../lib/supplierOfferEmailsApi';
import { fetchSupplierWebSearchJobMetrics, type SupplierWebSearchJobMetric } from '../lib/supplierWebSearchApi';
import { fetchAutoReplyLogMetrics, type AutoReplyLogMetric } from '../lib/emailAutoReplyApi';
import { fetchDeploymentMetrics, type DeploymentMetric } from '../lib/deploymentsApi';
import { formatActivityTime } from '../lib/aiAgentsApi';
import { ClaudeLogo } from '../components/contractors/ClaudeLogo';
import { AUTO_REPLY_SENDER_NAME } from '../data/emailAutoReply';

// Владелец, 2026-09-05: "давай трекать Альмиру" (по аналогии с Activity Log
// Светланы — см. data/activityLog.ts/ActivityLog.tsx). Страница НЕ в меню и
// не в data/pages.ts (владелец: "не выводи в меню, дай просто ссылку") —
// доступ только по прямому урлу /admin/metrics, гейт RequireSuperAdmin (см.
// App.tsx), тот же принцип, что и у /admin/activity-log.
//
// Верификация/ручное добавление поставщика — события, у которых нет своего
// поля в базе (verified:true ставится в обоих случаях, см. комментарий в
// Suppliers.tsx у submitOffer), поэтому считаем их через activity_log, как и
// у Светланы (market_offer_verified — тот же лог, действие только другое).
// Письма, наоборот, НЕ логируем отдельно — вся переписка уже хранится в
// supplier_offer_emails с адресом получателя, этого достаточно, чтобы
// посчитать и общее число, и число уникальных получателей напрямую.
//
// 2026-09-05, доработка по фидбеку владельца: (1) статистика Светланы не
// была видна вовсе — на этой странице считался только action'ы Альмиры,
// хотя market_offer_verified пишется в тот же activity_log; (2) блоки не
// были подписаны, кто есть кто; (3) добавлена разбивка по периоду —
// сегодня/неделя/этот месяц/любой выбранный месяц, раньше был только один
// показатель "за всё время".
//
// 2026-09-10 — реальный пробел, найденный по жалобе владельца ("не могу
// понять, система не трекает или Альмира реально ничего не делает"):
// "Верифицировано поставщиков" логируется ТОЛЬКО в submitOffer
// (Suppliers.tsx) — то есть только когда карточку открывают и сохраняют
// через форму "Подробнее". Самый частый на практике путь работы с уже
// идущей перепиской — кнопка "Подтвердить и заполнить карточку" на
// автораспознанном счёте прямо в письме (SupplierCorrespondenceTab.tsx,
// applyExtractionToOffer/applyExtractionToOrder) — минует submitOffer
// полностью и до этой правки не логировалась вообще, поэтому такая работа
// была не "недосчитана", а полностью невидима. Добавлено отдельное
// событие supplier_invoice_confirmed на эту кнопку — не смешано с
// supplier_offer_verified (то по-прежнему означает "первая ручная
// верификация карточки, добавленной веб-поиском"), у него другой смысл
// ("уже N-е подтверждение присланного счёта/КП по переписке").
//
// 2026-09-12 — владелец: "добавь учёт действий Светланы по добавлению новых
// поставщиков", "добавь учёт моих действий по поставщикам и письмам".
// Реальная проблема, которую это вскрыло: до этой правки страница считала
// события ПО ТИПУ ДЕЙСТВИЯ, а не по сотруднику — тип действия работал
// заглушкой вместо человека ("supplier_* значит Альмира"). Пока поставщиками
// занимался ровно один человек, это совпадало; как только их стало трое,
// цифры поехали — в блоке Альмиры в тот же день лежали 11 верификаций
// владельца и лежали бы все добавления Светланы. Теперь КАЖДЫЙ счётчик
// фильтруется по profile_name залогировавшего профиля, а блоки строятся по
// людям (TRACKED_PEOPLE + все прочие профили, реально встретившиеся в логе,
// чтобы ничья работа не осталась невидимой), с одинаковым набором плиток —
// никаких предположений "кто чем занимается" в коде больше нет.
//
// Три новых источника данных, которых не хватало для этого:
//  1. supplier_web_search_jobs.created_by_name — кто запустил веб-поиск;
//     рядом лежит added_count (сколько поставщиков реально добавилось), то
//     есть "добавлено поиском" считается по факту, а не по числу запусков.
//  2. activity_log 'supplier_web_search_started' — само действие "запустил
//     поиск" (Suppliers.tsx), видно сразу, не дожидаясь результата.
//  3. supplier_offer_emails.sent_by_name — автор исходящего письма. Раньше
//     письма нельзя было разделить по сотрудникам в принципе (в таблице не
//     было автора), поэтому весь их объём висел на Альмире. Заполняется
//     сервером по вошедшему пользователю (api/purchase-send-email.js) и
//     автором задания у массовой рассылки; историю разобрали бэкфиллом по
//     подписи в теле письма (см. docs/session-journal.md, 2026-09-12).

// 2026-09-14 — владелец: "я настроил автоматические ответы на письма
// поставщиков. Добавь на страницу метрики юзера ИИ-закупщик, трекай
// автоматические ответы и все сегодняшние верификации поставщиков под его
// юзернеймом". ИИ-закупщик — не профиль в access_profiles, а почасовая
// Routine в аккаунте владельца (см. docs/auto-reply-routine.md), поэтому:
//  1. Он в TRACKED_PEOPLE под тем же именем, которым SQL-функция
//     auto_reply_apply подписывает исходящие (AUTO_REPLY_SENDER_NAME) —
//     значит, его письма попадают в общие плитки "писем отправлено" сами,
//     через sent_by_name, без отдельного учёта.
//  2. К общему набору плиток у него добавлен четвёртый источник —
//     email_auto_reply_log: сколько входящих разобрано, сколько ответов
//     ушло автоматически, сколько черновиков ждёт/прошло проверку и сколько
//     писем пропущено как спорные. Эти плитки только у него: у людей такого
//     лога нет по определению, ноль там был бы не "ничего не делал", а
//     "не к нему вопрос".
//  3. Верификации за 2026-09-14 (14 записей supplier_offer_verified,
//     лежали под "Трэшмен") переписаны в activity_log на profile_name
//     "ИИ-закупщик" с profile_id = null — по прямому указанию владельца,
//     SQL-обновлением в живой базе, кода это не касается.

// 2026-09-15 — владелец: "все письма прогоняй через ИИ-закупщика" (на вопрос
// об охвате выбрано: его письма — те, где участвовал ИИ). Считать их
// по-прежнему нечего: всё решает sent_by_name, менялись не метрики, а то, кто
// проставляется автором письма:
//  1. Ответ, отправленный по подсказке владельца в разборе почты, раньше
//     уходил с sent_by_name = подпись из настроек ("Анатолий Трэшмен") и
//     числился за человеком — auto_reply_answer передавала в очередь подпись
//     вместо имени автора. Теперь автор агент (миграция
//     20260915-ai-buyer-sender-name.sql, там же бэкфилл шести таких писем);
//     подпись в тексте письма не изменилась.
//  2. Черновик автоответа, отправленный кнопкой "Отправить" без правок, тоже
//     уходит от агента: клиент шлёт asAiBuyer (SupplierCorrespondenceTab →
//     api/purchase-send-email.js). Нажали "Изменить" и правили текст — автор
//     снова человек.
// Письма, которые владелец пишет с нуля из интерфейса, остались за ним.

// 2026-09-15 — владелец: "можем вывести метрику по количеству деплоев на
// страницу метрики для ИИ-сотрудника Claude Code". Claude Code (ИИ-кодер из
// "Команды", см. data/aiAgents.ts) отличается от всех остальных блоков этой
// страницы тем, что в activity_log его нет вовсе: он не жмёт кнопки в
// админке, а пишет код и публикует релизы. Единственное его измеримое
// действие в проде — деплой, поэтому у него свой блок и свой источник —
// таблица deployments (строку пишет последним шагом прод-сборки
// scripts/record-deployment.mjs, история до 15.09 залита бэкфиллом из
// Vercel API). Общие плитки людей ему не показываем по той же причине, по
// которой блок ИИ-закупщика не смешан с людьми: ноль там означал бы не
// "ничего не делал", а "не к нему вопрос".
//
// Считаем только успешные (state = 'READY') прод-деплои: на сайт выехало
// ровно столько раз. Упавшие и отменённые сборки в таблице есть, но только
// в записях бэкфилла — билд-скрипт до записи просто не доживает, если
// сборка упала, поэтому плитку "неуспешных" не рисуем: после 15.09 она
// всегда показывала бы ноль независимо от реальности.

// 2026-09-12 — владелец: "можем автоматически обновлять цифры раз в минуту
// без необходимости перезагружать страницу?". Страница теперь сама
// перезапрашивает данные каждые REFRESH_INTERVAL_MS, не сбрасывая при этом
// показанные цифры (никакого мигания "Загрузка…" на фоновом заходе). Ради
// этого же оба тяжёлых источника читаются облегчёнными запросами
// (fetchOutgoingEmailMetrics / fetchSupplierWebSearchJobMetrics) — раньше
// тянулись `select('*')`, то есть body каждого письма и весь JSON
// результатов каждого поиска; на разовом открытии страницы это было
// незаметно, на ежеминутном опросе — уже нет.

type Period = 'today' | 'week' | 'month' | 'custom';

// Раз в минуту — как просил владелец. Тик пропускается, когда вкладка
// скрыта (см. useEffect ниже).
const REFRESH_INTERVAL_MS = 60_000;

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Сегодня',
  week: 'Неделя',
  month: 'Этот месяц',
  custom: 'Другой месяц',
};
const PERIOD_OPTIONS = Object.values(PERIOD_LABELS);
const LABEL_TO_PERIOD = Object.fromEntries(Object.entries(PERIOD_LABELS).map(([k, v]) => [v, k as Period])) as Record<
  string,
  Period
>;

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "Неделя" — последние 7 календарных дней, включая сегодняшний (владелец,
// 2026-09-14: "при нажатии «Неделя» выводи 7 последних календарных дней").
// Раньше это была текущая календарная неделя с понедельника, то есть в
// понедельник утром кнопка показывала почти пустой период, а в воскресенье —
// семь дней; теперь длина окна всегда одна и та же.
function startOfLast7Days(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - 6);
  return start;
}

// [start, end) — весь диапазон отдаётся полными календарными границами
// (не "до текущего момента"), будущего внутри диапазона просто не бывает
// записей, поэтому это не завышает счётчики.
function periodRange(period: Period, customMonth: string): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (period === 'week') {
    const start = startOfLast7Days(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }
  const [y, m] = customMonth.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, 1);
  const end = new Date(y, m || 1, 1);
  return { start, end };
}

function formatPeriodCaption(period: Period, start: Date, end: Date): string {
  if (period === 'today') {
    return start.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  if (period === 'week') {
    const endInclusive = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return `${start.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })} – ${endInclusive.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })} (последние 7 дней, включая сегодня)`;
  }
  return start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

interface StatTileProps {
  label: string;
  // Строка — для плиток, где показатель не счётчик, а момент времени
  // ("Последний релиз"); числа по-прежнему форматируются по-русски.
  value: number | string;
  hint?: string;
}

function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className={cn('flex flex-col gap-1 p-4', glassCardClass)} style={glassCardShadow}>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-3xl font-semibold text-ink">
        {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
      </p>
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function PersonSection({
  name,
  subtitle,
  icon,
  tileColsClass = 'lg:grid-cols-4',
  children,
}: {
  name: string;
  subtitle: string;
  // Только у ИИ-агентов — чтобы блок Claude Code читался так же, как его
  // карточка в "Команде" (ContractorCard/AiAgentCard). У людей иконки нет.
  icon?: ReactNode;
  // Блоки ИИ-сотрудников стоят по двое в ряд (половина ширины каждый),
  // поэтому у них плитки идут в две колонки, а не в четыре, как у людей на
  // всю ширину.
  tileColsClass?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <h2 className="text-base font-semibold text-ink">{name}</h2>
          <p className="text-xs text-ink-faint">{subtitle}</p>
        </div>
      </div>
      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', tileColsClass)}>{children}</div>
    </Card>
  );
}

// Сотрудники, чей блок показывается всегда — даже если за период у них нули:
// ноль здесь несёт смысл ("трекается, но человек ничего не делал"), именно
// из-за невозможности отличить его от "действие вообще не логируется" была
// правка 2026-09-10 (см. комментарий в начале файла). Все прочие профили,
// реально встретившиеся в данных за период, дописываются к списку сами.
const TRACKED_PEOPLE = ['Светлана', 'Трэшмен'];

// Один человек — один блок. Владелец, 2026-09-14: "тут дубль, это всё я" —
// на странице рядом стояли «Трэшмен» (профиль в access_profiles) и «Анатолий
// Трэшмен» (подпись автоответов, DEFAULT_AUTO_REPLY_SIGNATURE — ею бэкфилл
// пометил четыре письма). Сами четыре строки в базе переписаны на имя
// профиля, но алиас остаётся здесь: подпись в письме и display_name живут
// порознь, и следующее расхождение иначе снова разъедет блок надвое.
const PROFILE_NAME_ALIASES: Record<string, string> = {
  'Анатолий Трэшмен': 'Трэшмен',
};

function canonicalName(name: string | null): string | null {
  if (!name) return null;
  return PROFILE_NAME_ALIASES[name] ?? name;
}

// Владелец, 2026-09-14: "Альмиру скрывай из действий". Её блок не
// показывается вовсе — ни как постоянный, ни как дописанный по факту из
// лога; сами записи в activity_log и в переписке остаются нетронутыми, это
// только про вывод на странице.
const HIDDEN_PEOPLE = ['Альмира'];

// 2026-09-14, вторая правка за день (владелец: "оставь для Claude 2
// плиточки, как сейчас, а слева, также на 2 плиточки, добавь ИИ-закупщика"):
// ИИ-закупщик переехал из общего списка людей наверх, в ряд ИИ-сотрудников
// рядом с Claude Code, и показывает ровно две цифры — верификации
// поставщиков и письма, ушедшие автоматически, без участия человека. Поэтому
// его больше нет ни в TRACKED_PEOPLE, ни среди профилей, дописываемых по
// факту из лога (иначе блок дублировался бы дважды на одной странице).
// Остальные цифры автоответов (разобрано входящих, пропущено) никуда не
// делись — они ушли в подписи этих двух плиток.
const AI_BUYER_NAME = AUTO_REPLY_SENDER_NAME;

// ИИ-кодер — не профиль в access_profiles и не строка activity_log, поэтому
// в TRACKED_PEOPLE он не входит: у него отдельный блок и единственный
// источник (таблица deployments). Имя то же, что у карточки в "Команде"
// (data/aiAgents.ts, id 'claude-code').
const AI_CODER_NAME = 'Claude Code';

// Начало истории деплоев: 15 августа 2026 — дальше вглубь Vercel свою
// историю уже не отдавал в день бэкфилла (2026-09-15), поэтому за более
// ранние месяцы ноль означает "не сохранилось", а не "не деплоили". Пишем
// это прямо в блоке, чтобы пустой июль не читался как реальный простой.
const DEPLOY_HISTORY_START = new Date(2026, 7, 15);

// display_name владельца в профиле — рабочий никнейм ("в платформе имя не
// меняй", 2026-09-03); на этой странице, которую видит только он сам,
// показываем полное имя — та же узкая подмена, что и в подписи писем
// (emailSignature в SupplierCorrespondenceTab.tsx), сам профиль не трогаем.
function personTitle(name: string): string {
  return name === 'Трэшмен' ? 'Анатолий (Трэшмен)' : name;
}

function personSubtitle(name: string): string {
  return `Действия, залогированные под профилем «${name}»`;
}

interface PersonStats {
  name: string;
  marketOffersVerified: number;
  suppliersAddedManually: number;
  supplierSearchesStarted: number;
  suppliersAddedBySearch: number;
  suppliersVerified: number;
  invoicesConfirmed: number;
  emailsTotal: number;
  emailsUnique: number;
}

// Сводка по email_auto_reply_log — есть только у ИИ-закупщика.
interface AutoReplyStats {
  processed: number;
  sentAuto: number;
  draftsPending: number;
  draftsReviewed: number;
  skipped: number;
}

export function Metrics() {
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  const [emails, setEmails] = useState<OutgoingEmailMetric[] | null>(null);
  const [searchJobs, setSearchJobs] = useState<SupplierWebSearchJobMetric[] | null>(null);
  const [autoReplyLog, setAutoReplyLog] = useState<AutoReplyLogMetric[] | null>(null);
  const [incomingInvoices, setIncomingInvoices] = useState<IncomingInvoiceMetric[] | null>(null);
  const [deployments, setDeployments] = useState<DeploymentMetric[] | null>(null);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const [period, setPeriod] = useState<Period>('today');
  const [customMonth, setCustomMonth] = useState(currentMonthStr());

  const { start, end } = useMemo(() => periodRange(period, customMonth), [period, customMonth]);

  // Одна загрузка всех трёх источников — и при открытии страницы, и на каждом
  // тике автообновления. Показанные данные при этом не сбрасываются в null:
  // на фоновом заходе цифры не должны мигать "Загрузка…", а при неудачном
  // запросе (тот же холодный старт Supabase, из-за которого существует
  // withRetry) — не должны пропадать вовсе, поэтому старое значение остаётся
  // на экране, а ошибка показывается строкой сверху.
  const load = useCallback(async () => {
    if (inFlight.current) return; // предыдущий заход ещё идёт — пропускаем тик, а не копим параллельные запросы
    inFlight.current = true;
    setRefreshing(true);
    try {
      const [logEntries, offerEmails, jobs, replyLog, invoices, deploys] = await Promise.all([
        fetchActivityLog(),
        fetchOutgoingEmailMetrics(),
        fetchSupplierWebSearchJobMetrics(),
        fetchAutoReplyLogMetrics(),
        fetchIncomingInvoiceMetrics(),
        // Единственный источник, который тянется не целиком, а диапазоном:
        // деплоев в день десятки, за всё время их уже тысячи, а нужен всегда
        // только выбранный период (фильтр inRange ниже всё равно применяется).
        fetchDeploymentMetrics(start.toISOString()),
      ]);
      setEntries(logEntries);
      setEmails(offerEmails);
      setSearchJobs(jobs);
      setAutoReplyLog(replyLog);
      setIncomingInvoices(invoices);
      setDeployments(deploys);
      setLastUpdatedAt(new Date());
      setError('');
    } catch {
      setError('Не удалось загрузить метрики.');
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [start]);

  useEffect(() => {
    void load();
    // Пока вкладка скрыта, базу не дёргаем вообще (в фоне цифры всё равно
    // никто не смотрит, да и таймеры в неактивной вкладке браузер троттлит
    // сам) — вместо этого обновляемся сразу при возврате на вкладку, чтобы
    // первый же взгляд на страницу видел свежие данные, а не часовой давности.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  const inRange = useMemo(() => {
    const startMs = start.getTime();
    const endMs = end.getTime();
    return (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= startMs && t < endMs;
    };
  }, [start, end]);

  const entriesInRange = useMemo(() => (entries ?? []).filter((e) => inRange(e.createdAt)), [entries, inRange]);

  // Направление письма отфильтровано уже в запросе (direction = 'out'),
  // здесь остаётся только период.
  const outgoingEmailsInRange = useMemo(() => (emails ?? []).filter((e) => inRange(e.createdAt)), [emails, inRange]);

  // Задание веб-поиска относим к периоду по времени ПОСТАНОВКИ В ОЧЕРЕДЬ —
  // это и есть момент действия человека. Обработчик дописывает added_count
  // минутами позже, но в ту же строку, поэтому поиск, запущенный в конце
  // периода, не теряется и не задваивается.
  const searchJobsInRange = useMemo(
    () => (searchJobs ?? []).filter((j) => inRange(j.createdAt)),
    [searchJobs, inRange],
  );

  // Решение по входящему относим к периоду по времени разбора — это и есть
  // момент "действия" ИИ-закупщика; само письмо могло прийти и раньше.
  const autoReplyStats: AutoReplyStats = useMemo(() => {
    const rows = (autoReplyLog ?? []).filter((r) => inRange(r.createdAt));
    const drafts = rows.filter((r) => r.decision === 'draft');
    return {
      processed: rows.length,
      sentAuto: rows.filter((r) => r.decision === 'sent').length,
      draftsPending: drafts.filter((r) => !r.reviewedAction).length,
      draftsReviewed: drafts.filter((r) => Boolean(r.reviewedAction)).length,
      skipped: rows.filter((r) => r.decision === 'skipped').length,
    };
  }, [autoReplyLog, inRange]);

  // Две цифры ИИ-закупщика для его блока в ряду ИИ-сотрудников.
  // "Верифицировано поставщиков" — те же supplier_offer_verified, что и у
  // людей, но залогированные под его именем. "Писем отправлено" — исходящие
  // с sent_by_name = «ИИ-закупщик»: письма, которые отправил он сам
  // (автоответы), по подсказке владельца в разборе почты и его же черновики,
  // отправленные кнопкой без правок (см. блок 2026-09-15 в шапке файла). У
  // массовой рассылки и у писем, написанных человеком с нуля, в sent_by_name
  // стоит имя человека — такие сюда не попадают.
  const aiBuyerStats = useMemo(() => {
    const actions = entriesInRange.filter((e) => canonicalName(e.profileName) === AI_BUYER_NAME);
    const sent = outgoingEmailsInRange.filter((e) => canonicalName(e.sentByName) === AI_BUYER_NAME);
    // Доля входящих, закрытых без человека: знаменатель — все разобранные
    // письма (включая пропущенные как спорные), то есть весь поток, который
    // прошёл через ИИ-закупщика. Пока лога нет вовсе, показываем прочерк, а
    // не 0% — ноль означал бы "ни на одно не ответил сам".
    const processed = autoReplyStats.processed;
    // Счета и КП, распознанные во входящих за период. Считаем сами КП, а не
    // письма: в одном ответе поставщика их бывает несколько.
    const proposalsReceived = (incomingInvoices ?? [])
      .filter((r) => inRange(r.createdAt))
      .reduce((sum, r) => sum + r.invoiceCount, 0);
    return {
      suppliersVerified: actions.filter((e) => e.action === 'supplier_offer_verified').length,
      invoicesConfirmed: actions.filter((e) => e.action === 'supplier_invoice_confirmed').length,
      emailsSent: sent.length,
      emailsUnique: new Set(sent.map((e) => e.toAddress.trim().toLowerCase())).size,
      autoReplyShare: processed ? autoReplyStats.sentAuto / processed : null,
      proposalsReceived,
    };
  }, [entriesInRange, outgoingEmailsInRange, autoReplyStats, incomingInvoices, inRange]);

  // Деплои ИИ-кодера за период. Только успешные (state = 'READY'): именно
  // столько раз сайт реально обновился. Строки приходят отсортированными по
  // возрастанию, но последний релиз берём явным максимумом — порядок выборки
  // не то, на чём стоит держать цифру в отчёте.
  const deployStats = useMemo(() => {
    const rows = (deployments ?? []).filter((d) => d.state === 'READY' && inRange(d.deployedAt));
    const days = new Set(rows.map((d) => new Date(d.deployedAt).toDateString()));
    const last = rows.reduce<DeploymentMetric | null>(
      (acc, row) => (!acc || new Date(row.deployedAt) > new Date(acc.deployedAt) ? row : acc),
      null,
    );
    return {
      total: rows.length,
      days: days.size,
      perDay: days.size ? rows.length / days.size : 0,
      lastAt: last?.deployedAt ?? null,
      lastMessage: last?.commitMessage ?? '',
    };
  }, [deployments, inRange]);

  const people: PersonStats[] = useMemo(() => {
    const names = TRACKED_PEOPLE.filter((n) => !HIDDEN_PEOPLE.includes(n));
    const seen = [
      ...entriesInRange.map((e) => canonicalName(e.profileName)),
      ...outgoingEmailsInRange.map((e) => canonicalName(e.sentByName)),
      ...searchJobsInRange.map((j) => canonicalName(j.createdByName)),
    ];
    for (const name of seen) {
      if (!name || name === AI_BUYER_NAME || HIDDEN_PEOPLE.includes(name)) continue;
      if (!names.includes(name)) names.push(name);
    }
    return names.map((name) => {
      const actions = entriesInRange.filter((e) => canonicalName(e.profileName) === name);
      const countAction = (action: string) => actions.filter((e) => e.action === action).length;
      const sent = outgoingEmailsInRange.filter((e) => canonicalName(e.sentByName) === name);
      return {
        name,
        marketOffersVerified: countAction('market_offer_verified'),
        suppliersAddedManually: countAction('supplier_offer_added_manually'),
        supplierSearchesStarted: countAction('supplier_web_search_started'),
        suppliersAddedBySearch: searchJobsInRange
          .filter((j) => canonicalName(j.createdByName) === name)
          .reduce((sum, j) => sum + (j.addedCount ?? 0), 0),
        suppliersVerified: countAction('supplier_offer_verified'),
        invoicesConfirmed: countAction('supplier_invoice_confirmed'),
        emailsTotal: sent.length,
        emailsUnique: new Set(sent.map((e) => e.toAddress.trim().toLowerCase())).size,
      };
    });
  }, [entriesInRange, outgoingEmailsInRange, searchJobsInRange]);

  // Письма без автора — отправленные до появления колонки sent_by_name и не
  // разобранные бэкфиллом по подписи. Показываем их отдельной строкой, а не
  // растворяем в чьих-то плитках: приписать их наугад = ровно та ошибка,
  // из-за которой эта страница и переделывалась.
  const emailsWithoutAuthor = useMemo(
    () => outgoingEmailsInRange.filter((e) => !e.sentByName).length,
    [outgoingEmailsInRange],
  );

  // Рядом блоки ИИ-сотрудников стоят только там, где у обоих по две плитки, —
  // то есть в периоде "Сегодня" (см. комментарий у самого ряда ниже).
  const sideBySideAiRow = period === 'today';
  const aiTileColsClass = sideBySideAiRow ? 'lg:grid-cols-2' : 'lg:grid-cols-4';

  const loading =
    entries === null ||
    emails === null ||
    searchJobs === null ||
    autoReplyLog === null ||
    incomingInvoices === null ||
    deployments === null;

  return (
    <>
      <PageHeader title="Метрики" />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading && !error && (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToggleGroup
              label="Период"
              options={PERIOD_OPTIONS}
              value={PERIOD_LABELS[period]}
              onChange={(label) => setPeriod(LABEL_TO_PERIOD[label])}
            />
            {period === 'custom' && (
              <Input
                type="month"
                label="Месяц"
                value={customMonth}
                max={currentMonthStr()}
                onChange={(e) => setCustomMonth(e.target.value)}
                className="w-fit"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
            <span>{formatPeriodCaption(period, start, end)}</span>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
              {lastUpdatedAt
                ? `обновлено в ${lastUpdatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · автоматически раз в минуту`
                : 'обновление…'}
            </span>
          </div>

          {/* Ряд ИИ-сотрудников: в периоде "Сегодня" у обоих ровно по две
              плитки, поэтому они стоят рядом — закупщик слева, кодер справа.
              За неделю/месяц у кодера добавляются ещё две плитки (дни с
              релизами, среднее за день), вчетвером в половине ширины они уже
              не читаются, поэтому там блоки идут друг под другом на всю
              ширину, как у людей (владелец, 2026-09-14: "за сегодня выводи
              как я сказал, а за неделю и 30 дней друг под другом"). На узком
              экране блоки встают друг под друга в любом случае. */}
          <div className={cn('grid grid-cols-1 gap-4', sideBySideAiRow && 'lg:grid-cols-2')}>
            <PersonSection
              name={AI_BUYER_NAME}
              subtitle="ИИ-закупщик: переписка с поставщиками — сам и по вашим подсказкам"
              tileColsClass={aiTileColsClass}
              icon={
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </span>
              }
            >
              <StatTile
                label="Верифицировано поставщиков"
                value={aiBuyerStats.suppliersVerified}
                hint={
                  aiBuyerStats.invoicesConfirmed
                    ? `Карточки, подтверждённые им самим · счетов и КП по переписке: ${aiBuyerStats.invoicesConfirmed.toLocaleString('ru-RU')}`
                    : 'Карточки поставщиков, подтверждённые им самим'
                }
              />
              <StatTile
                label="Писем отправлено"
                value={aiBuyerStats.emailsSent}
                hint={`Отправил сам и по вашим подсказкам · адресатов: ${aiBuyerStats.emailsUnique.toLocaleString('ru-RU')} · разобрано входящих: ${autoReplyStats.processed.toLocaleString('ru-RU')}, пропущено: ${autoReplyStats.skipped.toLocaleString('ru-RU')}`}
              />
              {/* Владелец, 2026-09-14: "при открытии статы за неделю/месяц —
                  для ИИ-закупщика выводим +2 показателя". В периоде "Сегодня"
                  блок остаётся на две плитки, как он и просил до этого. */}
              {period !== 'today' && (
                <>
                  <StatTile
                    label="% автоматических ответов"
                    value={
                      aiBuyerStats.autoReplyShare === null
                        ? '—'
                        : `${(aiBuyerStats.autoReplyShare * 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}%`
                    }
                    hint={`Доля входящих, закрытых без человека · ${autoReplyStats.sentAuto.toLocaleString('ru-RU')} из ${autoReplyStats.processed.toLocaleString('ru-RU')}`}
                  />
                  <StatTile
                    label="Итого получено КП"
                    value={aiBuyerStats.proposalsReceived}
                    hint="Счета и КП, распознанные во входящих письмах за период"
                  />
                </>
              )}
            </PersonSection>

            <PersonSection
              name={AI_CODER_NAME}
              subtitle="ИИ-кодер: разработка платформы и публикация релизов на прод"
              tileColsClass={aiTileColsClass}
              icon={
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d97757]/15 text-[#d97757]">
                  <ClaudeLogo className="h-5 w-5" />
                </span>
              }
            >
              <StatTile
                label="Деплоев на прод"
                value={deployStats.total}
                hint="Успешные сборки, выехавшие на redevelopment.pro"
              />
              {/* В периоде "Сегодня" эти две плитки были бы копией первой
                  (дней всегда 1, среднее равно общему числу) — показываем их
                  только там, где в периоде больше одного дня. */}
              {period !== 'today' && (
                <>
                  <StatTile
                    label="Дней с релизами"
                    value={deployStats.days}
                    hint="Разных дней периода, когда что-то выезжало"
                  />
                  <StatTile
                    label="В среднем за день"
                    value={deployStats.perDay.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
                    hint="Считается по дням, когда релизы были"
                  />
                </>
              )}
              <StatTile
                label="Последний релиз"
                value={deployStats.lastAt ? formatActivityTime(deployStats.lastAt) : '—'}
                hint={deployStats.lastMessage || 'За период релизов не было'}
              />
            </PersonSection>
          </div>

          {start < DEPLOY_HISTORY_START && (
            <p className="text-xs text-ink-faint">
              Деплои сохраняются с 15 августа 2026 — за более ранние периоды в счётчике ноль потому, что история не
              сохранилась, а не потому, что релизов не было.
            </p>
          )}

          {people.map((p) => (
            <PersonSection
              key={p.name}
              name={personTitle(p.name)}
              subtitle={personSubtitle(p.name)}
            >
              <StatTile
                label="Верифицировано объявлений"
                value={p.marketOffersVerified}
                hint="Аналитика рынка, /admin/market-offers"
              />
              <StatTile
                label="Добавлено поставщиков вручную"
                value={p.suppliersAddedManually}
                hint="Новая карточка, заполненная через форму с нуля"
              />
              <StatTile
                label="Запущено веб-поисков"
                value={p.supplierSearchesStarted}
                hint="Кнопка «Найти в сети» в категории на вкладке «Поставщики»"
              />
              <StatTile
                label="Добавлено поставщиков поиском"
                value={p.suppliersAddedBySearch}
                hint="Реально созданные карточки по запущенным им поискам"
              />
              <StatTile
                label="Верифицировано поставщиков"
                value={p.suppliersVerified}
                hint="Подтверждены данные у поставщика, добавленного веб-поиском"
              />
              <StatTile
                label="Подтверждено счетов/КП"
                value={p.invoicesConfirmed}
                hint="Автораспознанный счёт в письме, подтверждён кнопкой"
              />
              <StatTile
                label="Уникальных писем отправлено"
                value={p.emailsUnique}
                hint="Разных адресов получателей"
              />
              <StatTile label="Писем отправлено всего" value={p.emailsTotal} hint="Включая повторные письма" />
            </PersonSection>
          ))}

          {emailsWithoutAuthor > 0 && (
            <p className="text-xs text-ink-faint">
              Писем за период без автора: {emailsWithoutAuthor} — отправлены до того, как отправитель начал
              записываться в саму переписку (и не опознались по подписи в теле письма).
            </p>
          )}
        </div>
      )}
    </>
  );
}

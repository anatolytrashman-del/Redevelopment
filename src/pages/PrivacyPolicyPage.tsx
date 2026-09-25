import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setArticleJsonLd, setBreadcrumbJsonLd, setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';

const TITLE = 'Политика обработки персональных данных';
const DESCRIPTION =
  'Какие данные мы собираем на redevelopment.pro, зачем, кому передаём и как долго храним. Редакция от 25 сентября 2026 года.';
const URL = 'https://redevelopment.pro/privacy';
const LAST_UPDATED = '2026-09-25';

// Текст страницы — финальная формулировка владельца (юридическая часть,
// см. docs/legal), верстаем 1:1, не пересказываем и не сокращаем. Разметка —
// тот же паттерн, что у AnalyticsMethodologyPage.tsx (простая текстовая
// публичная страница без каталога/лендинга): шапка-логотип + одна
// glass-карточка с текстом.
export function PrivacyPolicyPage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: URL, ogType: 'article' });
    setOrganizationJsonLd(false);
    setBreadcrumbJsonLd([{ name: 'Политика обработки персональных данных' }]);
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: URL,
      datePublished: LAST_UPDATED,
      dateModified: LAST_UPDATED,
    });
  }, []);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 sm:px-8">
          <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </Link>
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Политика обработки персональных данных</h1>
          <p className="text-sm text-ink-muted">Редакция от 25 сентября 2026 года.</p>
        </div>

        <div
          className={cn('flex flex-col gap-6 p-6 text-sm leading-relaxed text-ink sm:p-8', glassCardClass)}
          style={glassCardShadow}
        >
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">1. Кто обрабатывает данные</h2>
            <p>
              Оператор — физическое лицо Трэшмен Анатолий Владимирович.
              Сайт: redevelopment.pro. Связь по любым вопросам о персональных данных:{' '}
              <a href="mailto:a@redevelopment.pro" className="text-primary-hover hover:underline">
                a@redevelopment.pro
              </a>
              .
            </p>
            <p>
              Политика составлена по Закону Республики Беларусь от 7 мая 2021 г. № 99-З
              «О защите персональных данных».
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ink">2. Какие данные мы собираем и зачем</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-semibold text-ink">Что</th>
                    <th className="py-2 pr-3 font-semibold text-ink">Когда</th>
                    <th className="py-2 pr-3 font-semibold text-ink">Зачем</th>
                    <th className="py-2 font-semibold text-ink">Основание</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">Файлы cookie, IP-адрес, данные о браузере и действиях на сайте</td>
                    <td className="py-2 pr-3">Вы нажали «Принять» в уведомлении о cookie</td>
                    <td className="py-2 pr-3">Считать посещаемость, улучшать сайт и показывать рекламу</td>
                    <td className="py-2">Ваше согласие</td>
                  </tr>
                  <tr className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">Email и текст письма</td>
                    <td className="py-2 pr-3">Вы пишете нам на почту</td>
                    <td className="py-2 pr-3">Ответить вам</td>
                    <td className="py-2">Ваше согласие, выраженное отправкой письма</td>
                  </tr>
                  <tr className="align-top">
                    <td className="py-2 pr-3">Технические данные об ошибках (браузер, адрес страницы, IP)</td>
                    <td className="py-2 pr-3">Если на странице произошла ошибка</td>
                    <td className="py-2 pr-3">Находить и исправлять ошибки</td>
                    <td className="py-2">Наш законный интерес в работе сайта</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>Мы не принимаем решений о вас только автоматически и не продаём данные.</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">3. Cookie</h2>
            <p>
              Необходимые cookie и записи в браузере нужны для работы сайта, например чтобы
              запомнить ваш выбор в уведомлении о cookie и список избранного. Их нельзя отключить.
            </p>
            <p>
              Аналитические и рекламные cookie ставят сервисы Яндекс.Метрика (ООО «Яндекс», Россия)
              и Top.Mail.Ru / VK Реклама (ООО «ВК», Россия). Они включаются только если вы нажали
              «Принять» в уведомлении. Изменить выбор можно в любой момент ссылкой
              «Настройки cookie» внизу страницы или очистив cookie в браузере.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">4. Кто ещё получает данные</h2>
            <p>Мы пользуемся сервисами, которые хранят или передают данные по нашему поручению:</p>
            <ul className="flex flex-col gap-1 pl-5 text-ink list-disc">
              <li>Supabase — база данных сайта (например, списки избранного), серверы во Франции;</li>
              <li>Vercel — хостинг сайта, США;</li>
              <li>Resend — почта, США;</li>
              <li>Sentry — отчёты об ошибках, США;</li>
              <li>Яндекс и VK — аналитика и реклама, Россия.</li>
            </ul>
            <p>
              Часть сервисов находится в США, где уровень защиты персональных данных не признан надлежащим по законодательству Беларуси. Мы передаём туда только данные, нужные для целей из раздела 2.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">5. Сколько храним</h2>
            <ul className="flex flex-col gap-1 pl-5 text-ink list-disc">
              <li>Переписку — до 3 лет после последнего письма.</li>
              <li>Данные аналитики — по правилам Яндекс.Метрики и VK, у нас на сайте не хранятся.</li>
              <li>Отчёты об ошибках — до 90 дней.</li>
            </ul>
            <p>
              Если вы отзовёте согласие, мы удалим данные в течение 15 дней, кроме случаев,
              когда закон обязывает их хранить.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">6. Ваши права</h2>
            <p>Вы можете:</p>
            <ul className="flex flex-col gap-1 pl-5 text-ink list-disc">
              <li>отозвать согласие;</li>
              <li>узнать, какие данные о вас мы храним и как их обрабатываем;</li>
              <li>попросить исправить неточные данные;</li>
              <li>узнать, кому мы передавали ваши данные;</li>
              <li>потребовать прекратить обработку и удалить данные;</li>
              <li>
                обжаловать наши действия в Национальный центр защиты персональных данных
                (cpd.by) или в суд.
              </li>
            </ul>
            <p>
              Напишите на{' '}
              <a href="mailto:a@redevelopment.pro" className="text-primary-hover hover:underline">
                a@redevelopment.pro
              </a>
              , укажите ФИО и суть запроса. Ответим в течение 15 дней.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">7. Как защищаем</h2>
            <p>
              Доступ к данным есть только у оператора. Соединение с сайтом шифруется (HTTPS),
              доступ к базе ограничен правилами на уровне самой базы.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-ink">8. Изменения</h2>
            <p>
              Новая редакция публикуется на этой странице с датой. Если изменения касаются
              данных, на обработку которых вы уже дали согласие, мы попросим его заново.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

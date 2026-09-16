import { describe, expect, it } from 'vitest';
import { stripQuotedReply } from './_emailText.js';
import { normalizeRecognized } from './_invoiceRecognition.js';

// Все письма ниже — сокращённые, но дословные куски РЕАЛЬНОЙ переписки из
// supplier_offer_emails (выборка 2026-09-16, 125 входящих). Именно на них
// проверялось, что цитата режется: без этого модель читает наш собственный
// запрос с ведомостью как предложение поставщика.
describe('stripQuotedReply', () => {
  it('режет шапку процитированного письма в русской локали (Zimbra)', () => {
    const { text, cut } = stripQuotedReply(
      [
        'Добрый день. Напишите пожалуйста Ваш номер и контактный номер телефона.',
        'На такой объём просим Вас заполнить бланк защиты (во вложении)',
        '',
        'От: "Redevelopment Закупки" <zakupki+9ee0e@redevelopment.pro>',
        'Кому: info@plitka-sdvk.ru',
        'Отправленные: Суббота, 12 Сентябрь 2026 г 18:02:03',
        'Тема: Керамогранит Alma серая',
        '',
        'Добрый день. Ранее присылали вам ведомость материала для заказа. Просьба прислать коммерческое предложение/счёт.',
      ].join('\n'),
    );
    expect(cut).toBe('шапка процитированного письма');
    expect(text).toContain('бланк защиты');
    expect(text).not.toContain('ведомость');
  });

  it('режет шапку в английской локали (Outlook)', () => {
    const { text } = stripQuotedReply(
      [
        'Добрый день! Выставляем счет по Вашему запросу.',
        'Счет действителен до 14,09,2026',
        '',
        'From: Redevelopment Закупки <zakupki+19b04@redevelopment.pro>',
        'Sent: Wednesday, September 9, 2026 6:09 PM',
        'To: info@csvt.ru',
        'Subject: Грильято 100х100',
        '',
        'Добрый день. Прикладываем ведомость материалов.',
      ].join('\n'),
    );
    expect(text).toContain('Счет действителен');
    expect(text).not.toContain('ведомость');
  });

  it('режет разделитель пересылки', () => {
    const { text, cut } = stripQuotedReply(
      [
        'Добрый день!',
        'Ваша заявка принята и передана в работу!',
        '',
        '---------- Пересланное сообщение ----------',
        'От: zakupki+e521e@redevelopment.pro',
        'Тема: Поставка материалов',
        'Просьба прислать коммерческое предложение/счёт по позициям.',
      ].join('\n'),
    );
    expect(cut).toBe('разделитель пересылки');
    expect(text).toContain('передана в работу');
    expect(text).not.toContain('Просьба прислать');
  });

  // The Bat!/Mail.ru: глагол в начале строки, а двоеточие в конце
  // принадлежит времени — на этом письме первая версия эвристики и
  // спотыкалась (единственная утечка нашей цитаты на 125 живых письмах).
  it('режет преамбулу «Вы писали …, 17:09:03:»', () => {
    const { text, cut } = stripQuotedReply(
      [
        'Здравствуйте.',
        'Указанного в заявке плинтуса в нашем ассортименте нет.',
        '',
        'Вы писали 12 сентября 2026 г., 17:09:03:',
        '',
        'Добрый день. Планируем закупку материала согласно ведомости.',
      ].join('\n'),
    );
    expect(cut).toBe('преамбула «… писал(а):»');
    expect(text).toContain('в нашем ассортименте нет');
    expect(text).not.toContain('ведомости');
  });

  it('режет обычную цитату со знаками «>» вместе с преамбулой над ней', () => {
    const { text } = stripQuotedReply(
      ['Цена 1200 руб/м2, в наличии.', '', 'On Thu, 11 Sep 2026 at 10:00, Закупки <zakupki@redevelopment.pro> wrote:', '> Просьба прислать КП'].join(
        '\n',
      ),
    );
    expect(text).toBe('Цена 1200 руб/м2, в наличии.');
  });

  it('не режет письмо, где цитаты нет вовсе', () => {
    const { text, cut } = stripQuotedReply('Добрый день! Плитка Alma 1 200 ₽/м², есть на складе.');
    expect(cut).toBeNull();
    expect(text).toBe('Добрый день! Плитка Alma 1 200 ₽/м², есть на складе.');
  });

  it('одинокая строка «Тема: …» цитатой не считается', () => {
    const { text, cut } = stripQuotedReply('Тема: счёт на оплату\nСумма 120 000 ₽, доставка бесплатно.');
    expect(cut).toBeNull();
    expect(text).toContain('Сумма 120 000');
  });

  it('режет подпись по стандартному разделителю «-- »', () => {
    const { text, cut } = stripQuotedReply('Цена 890 ₽ за штуку.\n\n-- \nКудрявцева Елена\n+7(495) 649-60-45');
    expect(cut).toBe('подпись');
    expect(text).toBe('Цена 890 ₽ за штуку.');
  });

  it('письмо из одной цитаты даёт пустой текст, а не остатки нашего запроса', () => {
    const { text } = stripQuotedReply('> Добрый день. Просьба прислать коммерческое предложение.');
    expect(text).toBe('');
  });
});

describe('normalizeRecognized: уверенность', () => {
  it('берёт число из диапазона 0-1', () => {
    expect(normalizeRecognized({ isInvoice: true, confidence: 0.82 }).confidence).toBe(0.82);
  });

  it('мусор и выход за диапазон дают null, а не ноль', () => {
    // null означает «уверенность не спрашивали» (ответы до 2026-09-16) —
    // такие счета записываются без порога, а ноль запретил бы запись.
    expect(normalizeRecognized({ isInvoice: true }).confidence).toBeNull();
    expect(normalizeRecognized({ isInvoice: true, confidence: '0.9' }).confidence).toBeNull();
    expect(normalizeRecognized({ isInvoice: true, confidence: 1.4 }).confidence).toBeNull();
  });
});

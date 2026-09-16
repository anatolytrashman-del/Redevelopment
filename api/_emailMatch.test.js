import { describe, expect, it } from 'vitest';
import { isPurchasingInbox, isSharedMailbox, headerValue, referencedMessageIds } from './_emailMatch.js';

describe('isPurchasingInbox', () => {
  it('пропускает закупочный ящик и с кодом, и без', () => {
    expect(isPurchasingInbox('zakupki+805b3@redevelopment.pro')).toBe(true);
    expect(isPurchasingInbox('zakupki@redevelopment.pro')).toBe(true);
    // research+ остался как совместимость со старыми отправленными письмами.
    expect(isPurchasingInbox('research+4687a@redevelopment.pro')).toBe(true);
  });

  it('узнаёт адрес внутри заголовка вида "Имя <адрес>"', () => {
    expect(isPurchasingInbox('"\'Анатолий Трэшмен\'" <zakupki+805b3@redevelopment.pro>')).toBe(true);
  });

  it('не пускает остальную почту домена — MX стоит на весь домен, спам в ручной разбор не нужен', () => {
    expect(isPurchasingInbox('info@redevelopment.pro')).toBe(false);
    expect(isPurchasingInbox('anatoly@redevelopment.pro')).toBe(false);
    expect(isPurchasingInbox('')).toBe(false);
    expect(isPurchasingInbox(null)).toBe(false);
  });
});

describe('isSharedMailbox', () => {
  it('узнаёт общий ящик компании — голый, с plus-адресацией и внутри заголовка', () => {
    expect(isSharedMailbox('a@redevelopment.pro')).toBe(true);
    expect(isSharedMailbox('a+rassylka@redevelopment.pro')).toBe(true);
    expect(isSharedMailbox('"Общий ящик" <a@redevelopment.pro>')).toBe(true);
  });

  it('видит общий ящик в списке получателей (копия) — Resend отдаёт "to" массивом', () => {
    expect(isSharedMailbox(['postavshik@example.com', 'a@redevelopment.pro'])).toBe(true);
  });

  it('не путает с другими адресами домена — иначе закупочная почта уедет в общий ящик', () => {
    expect(isSharedMailbox('zakupki@redevelopment.pro')).toBe(false);
    expect(isSharedMailbox('zakupki+805b3@redevelopment.pro')).toBe(false);
    // Локальная часть должна быть ровно "a", а не заканчиваться на неё.
    expect(isSharedMailbox('alfa@redevelopment.pro')).toBe(false);
    expect(isSharedMailbox('anatoly@redevelopment.pro')).toBe(false);
    expect(isSharedMailbox('a@example.com')).toBe(false);
    expect(isSharedMailbox('')).toBe(false);
    expect(isSharedMailbox(null)).toBe(false);
  });
});

describe('headerValue', () => {
  it('читает словарь (реальная форма ответа Resend), регистр не важен', () => {
    const headers = { 'in-reply-to': '<a@ses>', References: '<b@ses>' };
    expect(headerValue(headers, 'In-Reply-To')).toBe('<a@ses>');
    expect(headerValue(headers, 'references')).toBe('<b@ses>');
  });

  it('читает и форму массива [{name, value}]', () => {
    expect(headerValue([{ name: 'In-Reply-To', value: '<a@ses>' }], 'in-reply-to')).toBe('<a@ses>');
  });

  it('нет заголовков или нет такого заголовка — пустая строка, не исключение', () => {
    expect(headerValue(null, 'in-reply-to')).toBe('');
    expect(headerValue({}, 'in-reply-to')).toBe('');
  });
});

describe('referencedMessageIds', () => {
  it('прямой родитель (In-Reply-To) идёт первым', () => {
    const ids = referencedMessageIds({
      'in-reply-to': '<parent@ses>',
      references: '<oldest@ses> <middle@ses> <parent@ses>',
    });
    expect(ids[0]).toBe('<parent@ses>');
  });

  it('References разбирается от свежего к старому и без повторов', () => {
    const ids = referencedMessageIds({
      'in-reply-to': '<parent@ses>',
      references: '<oldest@ses> <middle@ses> <parent@ses>',
    });
    expect(ids).toEqual(['<parent@ses>', '<middle@ses>', '<oldest@ses>']);
  });

  it('реальный заголовок письма от поставщика (Resend отправляет через SES)', () => {
    // Живое письмо «RE: Плинтус», 2026-09-16: In-Reply-To ссылается НЕ на
    // uuid Resend, а на Message-ID, выданный Amazon SES, — ровно поэтому
    // матчинг идёт по message_id_header, а не по resend_message_id.
    const ids = referencedMessageIds({
      'in-reply-to': '<010201a09f7ca7fa-be907951-30cf-4d3d-8c3e-f7c62fb56ad1-000000@eu-west-1.amazonses.com>',
    });
    expect(ids).toEqual(['<010201a09f7ca7fa-be907951-30cf-4d3d-8c3e-f7c62fb56ad1-000000@eu-west-1.amazonses.com>']);
  });

  it('письмо без заголовков цепочки — пустой список, не падение', () => {
    expect(referencedMessageIds(null)).toEqual([]);
    expect(referencedMessageIds({ subject: 'Привет' })).toEqual([]);
  });
});

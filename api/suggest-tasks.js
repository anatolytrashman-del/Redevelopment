// Vercel serverless function: извлечение поручений из расшифровки встречи —
// предложения задач с ответственными (см. TaskSuggestion в
// data/meetingSummaries.ts). Клиент передаёт список допустимых
// ответственных (люди с is_task_assignee из таблицы people) — модель
// обязана выбирать только из него: произвольное имя из разговора не
// может стать ответственным в системе, у неё просто нет такого человека.
// Решение одобрить/отклонить каждое предложение остаётся за владельцем
// в интерфейсе — эта функция сама задач НЕ создаёт.

import { proxyApiKeyProblem } from './_proxyapi.js';

const MODEL = 'gpt-4o';

function buildSystemPrompt(assignees, alreadySuggested) {
  return `Ты извлекаешь задачи-поручения из расшифровки деловой встречи (в ней
есть метки времени [мм:сс]). Верни JSON-объект вида:
{"tasks": [{"title": "...", "description": "...", "assignee": "..." | null}]}

Правила:
- Задача = конкретное действие, о котором на встрече договорились или
  которое кто-то взял на себя. Не выдумывай задач, которых не звучало.
- "title" — короткая формулировка в повелительной форме («Уточнить условия
  кредита в банках»), без имён и дат.
- "description" — контекст: что именно сделать, срок (если прозвучал),
  таймкод места в разговоре. 1–3 предложения.
- "assignee" — СТРОГО одно значение из списка ответственных ниже, если по
  разговору понятно, кто делает. Если исполнитель не из списка или неясен —
  null (и упомяни в description, кто должен делать по разговору).
- Список допустимых ответственных: ${JSON.stringify(assignees)}.
${alreadySuggested.length > 0 ? `- Эти задачи уже предлагались раньше — НЕ повторяй их и близкие к ним: ${JSON.stringify(alreadySuggested)}.` : ''}
- Если поручений в разговоре нет — верни {"tasks": []}.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const keyProblem = proxyApiKeyProblem();
  if (keyProblem) {
    res.status(500).json({ error: keyProblem });
    return;
  }

  const { transcript, assignees, alreadySuggested } = req.body ?? {};
  if (typeof transcript !== 'string' || !transcript.trim()) {
    res.status(400).json({ error: 'Пустая расшифровка' });
    return;
  }
  const validAssignees = Array.isArray(assignees) ? assignees.filter((a) => typeof a === 'string') : [];
  const priorTitles = Array.isArray(alreadySuggested)
    ? alreadySuggested.filter((t) => typeof t === 'string').slice(0, 50)
    : [];

  try {
    const resp = await fetch('https://api.proxyapi.ru/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PROXYAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(validAssignees, priorTitles) },
          { role: 'user', content: `Расшифровка встречи:\n\n${transcript}` },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ошибка извлечения задач (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    let parsed;
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    } catch {
      throw new Error('Модель вернула некорректный JSON');
    }

    // Нормализация: чужие поля отбрасываем, ответственного вне списка — в
    // пустой массив (модель иногда игнорирует ограничение списка).
    const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
      .filter((t) => t && typeof t.title === 'string' && t.title.trim())
      .map((t) => ({
        title: t.title.trim(),
        description: typeof t.description === 'string' ? t.description.trim() : '',
        assignees: validAssignees.includes(t.assignee) ? [t.assignee] : [],
      }));

    res.status(200).json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось извлечь задачи' });
  }
}

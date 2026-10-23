// Запись в security_log (блок 1). Пишется service_role'ом.

import { dbPost, rest } from './_osnovaDb.js';

export async function logSecurity(eventType, details = {}, { ip = '', userId = null, clientId = null } = {}) {
  try {
    await dbPost(
      rest('security_log'),
      {
        event_type: eventType,
        user_id: userId,
        client_id: clientId,
        ip,
        details,
        created_at: new Date().toISOString(),
      },
      null,
      true,
      { 'Prefer': 'return=minimal' },
    );
  } catch {
    // не роняем запрос из-за лога
  }
}

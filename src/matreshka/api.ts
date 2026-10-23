// Клиентский API для «Матрешка» (блок 1). Все запросы к /api/matreshka?route=...
// Токен — из supabase.auth.getSession (после setSession).

import { matreshkaSupabase } from './supabaseClient';
import { isPlatformRootLogin } from '../lib/tenant';
import { MATRESHKA_ROOT_LOGIN_HEADER } from '../lib/matreshkaHosts.js';

const BASE = '/api/matreshka';

async function call(route: string, init?: RequestInit, clientSlug?: string, extraQuery?: Record<string, string>) {
  const { data } = await matreshkaSupabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Вход на «/» платформы: просим API работать в контексте клиента «Матрешка».
  if (isPlatformRootLogin()) headers[MATRESHKA_ROOT_LOGIN_HEADER] = '1';
  let url = `${BASE}?route=${encodeURIComponent(route)}`;
  if (clientSlug) url += `&client=${encodeURIComponent(clientSlug)}`;
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) if (v != null) url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  }
  const res = await fetch(url, {
    ...init,
    headers,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || res.statusText);
    (err as any).status = res.status;
    (err as any).code = json?.error;
    throw err;
  }
  return json;
}

export const matreshkaApi = {
  async login(email: string, password: string) {
    return call('auth.login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  async providers() {
    return call('auth.providers', { method: 'GET' });
  },
  async me(clientSlug?: string) {
    return call('auth.me', { method: 'GET' }, clientSlug);
  },
  async changePassword(current_password: string, new_password: string) {
    return call('auth.change_password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) });
  },
  async logoutAll() {
    return call('auth.logout_all', { method: 'POST' });
  },

  // client (pass clientSlug only on platform switcher)
  async clientMe(clientSlug?: string) {
    return call('client.me', { method: 'GET' }, clientSlug);
  },
  async clientMembers(clientSlug?: string) {
    return call('client.members.list', { method: 'GET' }, clientSlug);
  },
  async requestsList(status?: string, clientSlug?: string) {
    return call('client.requests.list', { method: 'GET' }, clientSlug, status ? { status } : undefined);
  },
  async requestsCreate(data: any, clientSlug?: string) {
    return call('client.requests.create', { method: 'POST', body: JSON.stringify(data) }, clientSlug);
  },
  async requestsUpdateStatus(id: string, status: string, clientSlug?: string) {
    return call('client.requests.update_status', { method: 'POST', body: JSON.stringify({ id, status }) }, clientSlug);
  },
  async suppliersList(searchOrOpts?: string | { search?: string; limit?: number; offset?: number }, clientSlug?: string) {
    const q: Record<string, string> = {};
    if (typeof searchOrOpts === 'string') {
      if (searchOrOpts) q.search = searchOrOpts;
    } else if (searchOrOpts && typeof searchOrOpts === 'object') {
      if (searchOrOpts.search) q.search = searchOrOpts.search;
      if (searchOrOpts.limit != null) q.limit = String(searchOrOpts.limit);
      if (searchOrOpts.offset != null) q.offset = String(searchOrOpts.offset);
    }
    return call('client.suppliers.list', { method: 'GET' }, clientSlug, Object.keys(q).length ? q : undefined);
  },
  async suppliersAdd(data: any, clientSlug?: string) {
    return call('client.suppliers.add', { method: 'POST', body: JSON.stringify(data) }, clientSlug);
  },
  async supplierNotesList(supplierRef: string, clientSlug?: string) {
    return call('client.supplier_notes.list', { method: 'GET' }, clientSlug, { supplier_ref: supplierRef });
  },
  async supplierNotesAdd(data: any, clientSlug?: string) {
    return call('client.supplier_notes.add', { method: 'POST', body: JSON.stringify(data) }, clientSlug);
  },
  async supplierPricesList(supplierRef: string, clientSlug?: string) {
    return call('client.supplier_prices.list', { method: 'GET' }, clientSlug, { supplier_ref: supplierRef });
  },
  async supplierPricesAdd(data: any, clientSlug?: string) {
    return call('client.supplier_prices.add', { method: 'POST', body: JSON.stringify(data) }, clientSlug);
  },
  async filesUploadUrl(data: any, clientSlug?: string) {
    return call('client.files.upload_url', { method: 'POST', body: JSON.stringify(data) }, clientSlug);
  },
  async filesSign(data: any, clientSlug?: string) {
    return call('client.files.sign', { method: 'POST', body: JSON.stringify(data) }, clientSlug);
  },
  async filesList(requestId: string, clientSlug?: string) {
    return call('client.files.list', { method: 'GET' }, clientSlug, requestId ? { request_id: requestId } : undefined);
  },

  // approvals + requests (block 4)
  async approvalRulesList(clientSlug?: string) {
    return call('client.approval_rules.list', { method: 'GET' }, clientSlug);
  },
  async approvalRulesUpsert(rule: any, clientSlug?: string) {
    return call('client.approval_rules.upsert', { method: 'POST', body: JSON.stringify({ rule }) }, clientSlug);
  },
  async approvalRulesDelete(id: string, clientSlug?: string) {
    return call('client.approval_rules.delete', { method: 'POST', body: JSON.stringify({ id }) }, clientSlug);
  },
  async requestsApprove(id: string, clientSlug?: string) {
    return call('client.requests.approve', { method: 'POST', body: JSON.stringify({ id }) }, clientSlug);
  },
  async requestsReject(id: string, clientSlug?: string) {
    return call('client.requests.reject', { method: 'POST', body: JSON.stringify({ id }) }, clientSlug);
  },
  async requestsMarkBitrix(id: string, ref?: string, note?: string, clientSlug?: string) {
    return call('client.requests.mark_bitrix_approved', { method: 'POST', body: JSON.stringify({ id, ref, note }) }, clientSlug);
  },
  async requestsEventsList(requestId: string, clientSlug?: string) {
    return call('client.requests.events.list', { method: 'GET' }, clientSlug, { request_id: requestId });
  },

  // platform (owner only)
  async platformClients() {
    return call('platform.clients.list', { method: 'GET' });
  },
  async platformClientsCreate(data: any) {
    return call('platform.clients.create', { method: 'POST', body: JSON.stringify(data) });
  },
  async platformClientsUpdate(client_id: string, status: string) {
    return call('platform.clients.update', { method: 'POST', body: JSON.stringify({ client_id, status }) });
  },
  async platformUsers() {
    return call('platform.users.list', { method: 'GET' });
  },
  async platformUsersCreate(data: any) {
    return call('platform.users.create', { method: 'POST', body: JSON.stringify(data) });
  },
  async platformUsersUpdate(data: any) {
    return call('platform.users.update', { method: 'POST', body: JSON.stringify(data) });
  },
  async platformResetPassword(user_id: string, client_id?: string) {
    return call('platform.users.reset_password', { method: 'POST', body: JSON.stringify({ user_id, client_id }) });
  },
  async platformSecurityLog(filters: any = {}) {
    const q: Record<string, string> = {};
    if (filters.client_id) q.client_id = filters.client_id;
    if (filters.event_type) q.event_type = filters.event_type;
    if (filters.limit) q.limit = String(filters.limit);
    return call('platform.security_log.list', { method: 'GET' }, undefined, q);
  },
  async platformModerationList() {
    return call('platform.suppliers.moderation.list', { method: 'GET' });
  },
  async platformModerationApprove(id: string) {
    return call('platform.suppliers.moderation.approve', { method: 'POST', body: JSON.stringify({ id }) });
  },
  async platformModerationReject(id: string) {
    return call('platform.suppliers.moderation.reject', { method: 'POST', body: JSON.stringify({ id }) });
  },
};

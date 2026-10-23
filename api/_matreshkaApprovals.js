// _matreshkaApprovals.js — хелперы для согласований (блок 4).
// Pure matchApprover + approve/reject/mark logic.
// client.* calls use USER JWT. platform updates allowed via owner.
// No legacy touches. Deletion of rules allowed (new data).

import { dbGet, dbPatch, dbPost, dbDelete, rest } from './_matreshkaDb.js';
import { writeRequestEvent } from './_matreshkaClient.js';

export function matchApprover(rules, supplyKind) {
  if (!Array.isArray(rules) || !supplyKind) return null;
  const norm = String(supplyKind).trim().toLowerCase();
  // sort by priority asc (lower first), then pick first match
  const sorted = [...rules].sort((a, b) => (a.priority || 100) - (b.priority || 100));
  for (const r of sorted) {
    if (!r || String(r.supply_kind || '').trim().toLowerCase() !== norm) continue;
    if (r.approver_user_id) return { type: 'user', id: r.approver_user_id };
    if (r.approver_position_id) return { type: 'position', id: r.approver_position_id };
  }
  return null;
}

// helper: load rules for client (user token)
async function loadApprovalRules(clientId, token) {
  const q = `?client_id=eq.${clientId}&select=*&order=priority.asc,created_at.asc`;
  const r = await dbGet(rest('client_approval_rules', q), token);
  return r.ok ? (r.data || []) : [];
}

// load client settings (user token ok via membership)
async function loadClientSettings(clientId, token) {
  const q = `?id=eq.${clientId}&select=settings,slug,name&limit=1`;
  const r = await dbGet(rest('clients', q), token);
  const row = r.ok && r.data && r.data[0] ? r.data[0] : null;
  const settings = (row && row.settings) || {};
  return { settings, client: row };
}

// decide on create: if client.settings.approval_required && rule matches supply_kind -> 'pending' else 'not_required'
export async function computeInitialApprovalStatus(clientId, supplyKind, token) {
  const { settings } = await loadClientSettings(clientId, token);
  const approvalRequired = !!(settings && settings.approval_required);
  if (!approvalRequired) return 'not_required';
  const rules = await loadApprovalRules(clientId, token);
  const match = matchApprover(rules, supplyKind || '');
  if (match) return 'pending';
  return 'not_required';
}

// check if caller can approve/reject this request: is client_admin or matches approver (user or his position)
export async function canApproveRequest(clientId, request, userId, token) {
  // load membership role
  const memQ = `?client_id=eq.${clientId}&user_id=eq.${userId}&limit=1&select=role,position_id`;
  const mem = await dbGet(rest('client_members', memQ), token);
  const role = mem.ok && mem.data && mem.data[0] ? mem.data[0].role : null;
  if (role === 'client_admin') return { ok: true, by: 'admin' };
  if (!role) return { ok: false };

  const rules = await loadApprovalRules(clientId, token);
  const match = matchApprover(rules, request.supply_kind || '');
  if (!match) return { ok: false };

  if (match.type === 'user' && match.id === userId) return { ok: true, by: 'user' };
  if (match.type === 'position' && mem.ok && mem.data[0] && mem.data[0].position_id === match.id) {
    return { ok: true, by: 'position' };
  }
  return { ok: false };
}

export async function approveRequest(reqId, clientId, userId, token, ipForLog /*unused*/) {
  const now = new Date().toISOString();
  // set on request
  const patch = await dbPatch(
    rest(`client_requests?id=eq.${reqId}&client_id=eq.${clientId}`),
    { approval_status: 'approved', approved_by: userId, approved_at: now, approval_method: 'platform' },
    token
  );
  if (!patch.ok) throw new Error('not_found_or_forbidden');
  // write event
  await writeRequestEvent(reqId, clientId, userId, 'approved', { method: 'platform', by: userId, at: now }, token);
  return { ok: true, status: 'approved' };
}

export async function rejectRequest(reqId, clientId, userId, token) {
  const now = new Date().toISOString();
  const patch = await dbPatch(
    rest(`client_requests?id=eq.${reqId}&client_id=eq.${clientId}`),
    { approval_status: 'rejected', approved_by: userId, approved_at: now, approval_method: 'platform' },
    token
  );
  if (!patch.ok) throw new Error('not_found_or_forbidden');
  await writeRequestEvent(reqId, clientId, userId, 'approved', { method: 'platform', by: userId, at: now, rejected: true }, token);
  return { ok: true, status: 'rejected' };
}

export async function markBitrixApproved(reqId, clientId, userId, ref, note, token) {
  if (!ref && !(note || '').trim()) throw new Error('ref_or_note_required');
  const now = new Date().toISOString();
  const payload = {
    approval_status: 'approved',
    approved_by: userId,
    approved_at: now,
    approval_method: 'bitrix24_manual',
    bitrix_approval_ref: ref || null,
    bitrix_approval_note: (note || '').trim() || null,
  };
  const patch = await dbPatch(rest(`client_requests?id=eq.${reqId}&client_id=eq.${clientId}`), payload, token);
  if (!patch.ok) throw new Error('not_found_or_forbidden');
  await writeRequestEvent(reqId, clientId, userId, 'approved', {
    method: 'bitrix24_manual',
    by: userId,
    at: now,
    ref: ref || null,
    note: payload.bitrix_approval_note,
  }, token);
  return { ok: true, status: 'approved', method: 'bitrix24_manual' };
}

// list events for a request (for history in UI)
export async function listRequestEvents(reqId, clientId, token) {
  const q = `?request_id=eq.${reqId}&client_id=eq.${clientId}&select=*&order=created_at.asc&limit=100`;
  const r = await dbGet(rest('client_request_events', q), token);
  return r.ok ? (r.data || []) : [];
}

// approval rules CRUD (client_admin or owner)
export async function listApprovalRules(clientId, token) {
  const rules = await loadApprovalRules(clientId, token);
  return { rules };
}

export async function upsertApprovalRule(clientId, rule, userId, token) {
  // rule = {id?, supply_kind, approver_user_id?, approver_position_id?, priority? }
  if (!rule || !rule.supply_kind) throw new Error('supply_kind_required');
  if (!rule.approver_user_id && !rule.approver_position_id) throw new Error('approver_required');
  const payload = {
    client_id: clientId,
    supply_kind: String(rule.supply_kind).trim(),
    approver_user_id: rule.approver_user_id || null,
    approver_position_id: rule.approver_position_id || null,
    priority: rule.priority != null ? Number(rule.priority) : 100,
  };
  let res;
  if (rule.id) {
    res = await dbPatch(rest(`client_approval_rules?id=eq.${rule.id}&client_id=eq.${clientId}`), payload, token);
  } else {
    res = await dbPost(rest('client_approval_rules'), payload, token);
  }
  if (!res.ok) throw new Error('upsert_failed');
  return { rule: res.data?.[0] || payload };
}

export async function deleteApprovalRule(clientId, ruleId, token) {
  const delPath = rest(`client_approval_rules?id=eq.${ruleId}&client_id=eq.${clientId}`);
  const res = await dbDelete(delPath, token);
  if (!res.ok) throw new Error('delete_failed');
  return { ok: true, id: ruleId };
}

// Files helpers for client.files.* (block 3 isolation).
// All calls use USER JWT (token) against storage/v1 so that storage policies apply.
// Server-side enforces path starts with clients/<clientId>/ ; rejects traversal etc -> 403.
// No changes to legacy api files.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iohcdylttyuhwovztrbk.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

export function sanitizeFileName(name) {
  if (typeof name !== 'string' || !name) return 'file.bin';
  let n = name.replace(/.*[/\\]/, ''); // basename only
  n = n.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return n || 'file.bin';
}

export function validateStoragePathForClient(path, clientId) {
  if (typeof path !== 'string' || typeof clientId !== 'string') return false;
  const prefix = `clients/${clientId}/`;
  if (!path.startsWith(prefix)) return false;
  if (path.includes('..')) return false;
  if (path.includes('//')) return false;
  // no traversal even encoded
  if (path.includes('%2e%2e') || path.includes('%2E%2E')) return false;
  return true;
}

export async function getSignedUploadUrl(clientId, requestId, filename, token) {
  if (!UUID_RE.test(String(requestId))) {
    const err = new Error('bad_request_id');
    err.status = 400;
    throw err;
  }
  const safeName = sanitizeFileName(filename);
  const path = `clients/${clientId}/requests/${requestId}/${safeName}`;
  if (!validateStoragePathForClient(path, clientId)) {
    const err = new Error('forbidden_path');
    err.status = 403;
    throw err;
  }
  const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/client-files/${encodePath(path)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!resp.ok) {
    await resp.text().catch(() => '');
    const err = new Error('upload_sign_failed');
    err.status = resp.status || 403;
    throw err;
  }
  const data = await resp.json().catch(() => ({}));
  let signedUrl = data.signedUrl || data.url || '';
  if (signedUrl && !signedUrl.startsWith('http')) {
    signedUrl = `${SUPABASE_URL}${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`;
  }
  return { uploadUrl: signedUrl || null, path, token: data.token || null };
}

export async function getSignedDownloadUrl(clientId, objectPath, token) {
  if (!validateStoragePathForClient(objectPath, clientId)) {
    const err = new Error('forbidden_path');
    err.status = 403;
    throw err;
  }
  const url = `${SUPABASE_URL}/storage/v1/object/sign/client-files/${encodePath(objectPath)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!resp.ok) {
    const err = new Error('sign_failed');
    err.status = 403;
    throw err;
  }
  const data = await resp.json().catch(() => ({}));
  let signedUrl = data.signedUrl || data.url || '';
  if (signedUrl && !signedUrl.startsWith('http')) {
    signedUrl = `${SUPABASE_URL}${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`;
  }
  return { signedUrl: signedUrl || null };
}

export async function listRequestFiles(clientId, requestId, token) {
  if (!UUID_RE.test(String(requestId))) return { files: [] };
  const prefix = `clients/${clientId}/requests/${requestId}/`;
  const url = `${SUPABASE_URL}/storage/v1/object/list/client-files`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
  });
  if (!resp.ok) {
    return { files: [] };
  }
  const items = await resp.json().catch(() => []);
  const arr = Array.isArray(items) ? items : (items?.items || []);
  return {
    files: arr.map((it) => ({
      name: it.name,
      path: prefix + it.name,
      id: it.id,
      updated_at: it.updated_at,
      metadata: it.metadata || {},
    })),
  };
}

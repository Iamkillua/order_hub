const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store.cjs');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
];
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const NICKNAME_TAB = 'OrderHub_SKU_Nicknames';

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------- OAuth (installed-app loopback flow with PKCE) ----------

let pendingSignIn = null;

function cancelSignIn() {
  if (pendingSignIn) pendingSignIn.cancel();
}

function signIn() {
  const { clientId } = store.load();
  if (!clientId) throw new AppError('NO_CREDENTIALS', 'Add your Google OAuth client ID first.');
  cancelSignIn();

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer();
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      pendingSignIn = null;
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(
      () => finish(new AppError('SIGNIN_TIMEOUT', 'Sign-in timed out. Try again.')),
      5 * 60 * 1000,
    );
    pendingSignIn = { cancel: () => finish(new AppError('SIGNIN_CANCELLED', 'Sign-in cancelled.')) };

    server.on('request', async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const page = (title, body) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>Order Hub</title>` +
            `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#313338;color:#dbdee1;font:16px 'Segoe UI',system-ui,sans-serif">` +
            `<div style="text-align:center"><h1 style="color:#f2f3f5;font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#b5bac1;margin:0">${body}</p></div>`,
        );
      };
      const error = url.searchParams.get('error');
      if (error) {
        page('Sign-in was not completed', 'You can close this tab and try again from Order Hub.');
        finish(new AppError('SIGNIN_DENIED', `Google returned: ${error}`));
        return;
      }
      if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
        page('Something went wrong', 'This sign-in link is not valid. Return to Order Hub and try again.');
        finish(new AppError('SIGNIN_STATE', 'Sign-in response did not match. Try again.'));
        return;
      }
      page('You’re signed in', 'Close this tab and return to Order Hub.');
      try {
        const port = server.address().port;
        const tokens = await tokenRequest({
          grant_type: 'authorization_code',
          code: url.searchParams.get('code'),
          redirect_uri: `http://127.0.0.1:${port}`,
          code_verifier: verifier,
        });
        const saved = saveTokens(tokens);
        const account = await fetchProfile(saved.access_token);
        store.save({ account });
        finish(null, account);
      } catch (err) {
        finish(err);
      }
    });

    server.on('error', (err) => finish(new AppError('SIGNIN_SERVER', err.message)));
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent',
      });
      shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });
}

async function tokenRequest(fields) {
  const { clientId, clientSecret } = store.load();
  const body = new URLSearchParams({ client_id: clientId, ...fields });
  if (clientSecret) body.set('client_secret', clientSecret);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === 'invalid_grant') {
      store.save({ tokens: null });
      throw new AppError('AUTH_EXPIRED', 'Your Google session expired. Sign in again.');
    }
    if (json.error === 'invalid_client') {
      throw new AppError('BAD_CLIENT', 'Google rejected the client ID or secret. Check them in Settings.');
    }
    throw new AppError('TOKEN_FAILED', json.error_description || json.error || `Token request failed (${res.status}).`);
  }
  return json;
}

function saveTokens(tokens) {
  const prev = store.load().tokens || {};
  const next = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || prev.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
  store.save({ tokens: next });
  return next;
}

async function accessToken() {
  const { tokens } = store.load();
  if (!tokens) throw new AppError('AUTH_REQUIRED', 'Sign in with Google to continue.');
  if (tokens.access_token && tokens.expires_at - 60_000 > Date.now()) return tokens.access_token;
  if (!tokens.refresh_token) throw new AppError('AUTH_EXPIRED', 'Your Google session expired. Sign in again.');
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  return saveTokens(fresh).access_token;
}

async function fetchProfile(token) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const p = await res.json().catch(() => ({}));
  return { email: p.email || '', name: p.name || p.email || 'Google user', picture: p.picture || '' };
}

function signOut() {
  const { tokens } = store.load();
  if (tokens && tokens.refresh_token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, {
      method: 'POST',
    }).catch(() => {});
  }
  store.save({ tokens: null, account: null });
}

// ---------- Sheets ----------

async function api(path, init = {}) {
  const token = await accessToken();
  let res;
  try {
    res = await fetch(`${SHEETS}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  } catch {
    throw new AppError('OFFLINE', 'Can’t reach Google. Check your internet connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `Google Sheets error (${res.status}).`;
    if (res.status === 401) {
      store.save({ tokens: { ...store.load().tokens, expires_at: 0 } });
      throw new AppError('AUTH_EXPIRED', 'Your Google session expired. Sign in again.');
    }
    if (res.status === 403) throw new AppError('FORBIDDEN', 'This Google account can’t edit that sheet. Ask the owner to share it with edit access.');
    if (res.status === 404) throw new AppError('NOT_FOUND', 'Spreadsheet not found. Check the link.');
    if (res.status === 429) throw new AppError('RATE_LIMIT', 'Google is rate-limiting requests. Wait a few seconds and try again.');
    throw new AppError('SHEETS_ERROR', msg);
  }
  return json;
}

const quote = (tab) => `'${String(tab).replace(/'/g, "''")}'`;
const enc = (range) => encodeURIComponent(range);

function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseSpreadsheetId(input) {
  const text = String(input || '').trim();
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{25,}$/.test(text)) return text;
  throw new AppError('BAD_URL', 'That doesn’t look like a Google Sheets link. Copy the URL from your browser’s address bar.');
}

async function inspectSpreadsheet(input) {
  const id = parseSpreadsheetId(input);
  const json = await api(`/${id}?fields=properties.title,sheets.properties(sheetId,title,hidden,gridProperties.rowCount)`);
  return {
    spreadsheetId: id,
    title: json.properties.title,
    tabs: json.sheets
      .map((s) => s.properties)
      .filter((p) => !p.hidden && p.title !== NICKNAME_TAB)
      .map((p) => ({ title: p.title, rowCount: (p.gridProperties && p.gridProperties.rowCount) || 0 })),
  };
}

async function readTab(spreadsheetId, tab) {
  const params = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS';
  const json = await api(`/${spreadsheetId}/values/${enc(quote(tab))}?${params}`);
  return json.values || [];
}

const norm = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');

function findCol(headers, name) {
  return headers.findIndex((h) => norm(h) === name);
}

async function loadOrders() {
  const { sheet } = store.load();
  if (!sheet) throw new AppError('NO_SHEET', 'Choose your orders sheet first.');
  const values = await readTab(sheet.spreadsheetId, sheet.tab);
  return { headers: values[0] || [], rows: values.slice(1), fetchedAt: Date.now() };
}

/**
 * items: [{ row, orderId, sku, shipped }] — `row` is the 1-based sheet row the renderer saw.
 * Rows are re-verified against Order ID + SKU so a re-sorted sheet never gets the wrong tick.
 */
async function setShipped(items) {
  const { sheet } = store.load();
  if (!sheet) throw new AppError('NO_SHEET', 'Choose your orders sheet first.');
  const values = await readTab(sheet.spreadsheetId, sheet.tab);
  const headers = values[0] || [];
  const idCol = findCol(headers, 'order id');
  const skuCol = findCol(headers, 'sku');
  const shippedCol = findCol(headers, 'shipped');
  if (idCol < 0 || skuCol < 0 || shippedCol < 0) {
    throw new AppError('BAD_HEADERS', 'The sheet no longer has Order ID, SKU and Shipped columns.');
  }
  const matches = (r, item) =>
    r && String(r[idCol] ?? '').trim() === item.orderId && String(r[skuCol] ?? '').trim() === item.sku;

  const used = new Set();
  const data = [];
  const results = [];
  for (const item of items) {
    let row = item.row;
    if (!matches(values[row - 1], item) || used.has(row)) {
      const idx = values.findIndex((r, i) => i > 0 && !used.has(i + 1) && matches(r, item));
      row = idx < 0 ? -1 : idx + 1;
    }
    if (row < 0) {
      results.push({ ...item, ok: false, error: 'Order not found in the sheet any more.' });
      continue;
    }
    used.add(row);
    data.push({ range: `${quote(sheet.tab)}!${colLetter(shippedCol)}${row}`, values: [[!!item.shipped]] });
    results.push({ ...item, row, ok: true });
  }
  if (data.length) {
    await api(`/${sheet.spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    });
  }
  return results;
}

// ---------- SKU nicknames (hidden tab in the same spreadsheet) ----------

async function loadNicknames() {
  const { sheet } = store.load();
  if (!sheet) return [];
  try {
    const values = await readTab(sheet.spreadsheetId, NICKNAME_TAB);
    return values
      .slice(1)
      .filter((r) => r[0])
      .map((r) => ({ sku: String(r[0]).trim(), nickname: String(r[1] || '').trim(), color: String(r[2] || '').trim() }));
  } catch (err) {
    if (err.code === 'SHEETS_ERROR' && /Unable to parse range/i.test(err.message)) return [];
    throw err;
  }
}

async function saveNicknames(list) {
  const { sheet } = store.load();
  if (!sheet) throw new AppError('NO_SHEET', 'Choose your orders sheet first.');
  const meta = await api(`/${sheet.spreadsheetId}?fields=sheets.properties(title)`);
  const exists = meta.sheets.some((s) => s.properties.title === NICKNAME_TAB);
  if (!exists) {
    await api(`/${sheet.spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: NICKNAME_TAB, hidden: true, gridProperties: { rowCount: 500, columnCount: 3 } } } }],
      }),
    });
  }
  const rows = [['SKU', 'Nickname', 'Color'], ...list.filter((n) => n.sku).map((n) => [n.sku, n.nickname || '', n.color || ''])];
  await api(`/${sheet.spreadsheetId}/values/${enc(`${quote(NICKNAME_TAB)}!A:C`)}:clear`, { method: 'POST', body: '{}' });
  await api(`/${sheet.spreadsheetId}/values/${enc(`${quote(NICKNAME_TAB)}!A1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: rows }),
  });
  return loadNicknames();
}

module.exports = {
  AppError,
  signIn,
  cancelSignIn,
  signOut,
  inspectSpreadsheet,
  readTab,
  loadOrders,
  setShipped,
  loadNicknames,
  saveNicknames,
  colLetter,
  parseSpreadsheetId,
};

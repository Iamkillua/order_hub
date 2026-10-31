const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  clientId: '',
  clientSecret: '',
  tokens: null,
  account: null,
  sheet: null,
  refreshSeconds: 60,
};

const SECRET_KEYS = ['clientSecret', 'tokens'];

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function encrypt(value) {
  if (value == null || value === '') return value;
  const json = JSON.stringify(value);
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: safeStorage.encryptString(json).toString('base64') };
  }
  return { plain: json };
}

function decrypt(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    if (value.enc) return JSON.parse(safeStorage.decryptString(Buffer.from(value.enc, 'base64')));
    if (value.plain) return JSON.parse(value.plain);
  } catch {
    return null;
  }
  return value;
}

let cache = null;

function load() {
  if (cache) return cache;
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    raw = {};
  }
  const out = { ...DEFAULTS, ...raw };
  for (const key of SECRET_KEYS) out[key] = decrypt(raw[key]) ?? DEFAULTS[key];
  cache = out;
  return cache;
}

function save(patch) {
  const next = { ...load(), ...patch };
  cache = next;
  const onDisk = { ...next };
  for (const key of SECRET_KEYS) onDisk[key] = encrypt(next[key]);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(onDisk, null, 2));
  return next;
}

module.exports = { load, save };

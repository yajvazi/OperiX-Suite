#!/usr/bin/env node
// Minimal Supabase stand-in for visual QA. It serves just enough of the auth and
// PostgREST protocols for the web app to render signed-in screens with fictional data.
// It never talks to a real database.
//
//   node qa/mock-supabase.mjs [--port 55321]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtures, RELATIONS, rpcHandlers, USER } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 55321;
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const unknownLog = path.join(outDir, 'unknown-requests.log');
fs.writeFileSync(unknownLog, '');

const db = buildFixtures();
const seenUnknown = new Set();
const noteUnknown = (kind, name) => {
  const key = `${kind}:${name}`;
  if (seenUnknown.has(key)) return;
  seenUnknown.add(key);
  fs.appendFileSync(unknownLog, `${key}\n`);
};

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, prefer, range, accept, accept-profile, content-profile, x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range');
}
const send = (res, status, body, headers = {}) => {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(payload);
};
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});

const jwt = () => {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', email: USER.email, exp: 4102444800 })}.qa-signature`;
};
const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 31536000, expires_at: 4102444800, refresh_token: 'qa-refresh-token', user: USER });

// ---- PostgREST-ish query helpers ----------------------------------------------------
function splitTop(text, separator = ',') {
  const parts = []; let depth = 0; let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === separator && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  if (current) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}
function parseSelect(select) {
  const embeds = [];
  for (const part of splitTop(select || '*')) {
    const match = part.match(/^(?:([a-z_0-9]+):)?([a-z_0-9]+)(?:!inner)?\((.*)\)$/s);
    if (match) embeds.push({ alias: match[1] || match[2], table: match[2], select: match[3] });
  }
  return embeds;
}
function embedRows(table, rows, select, depth = 0) {
  if (depth > 3) return rows;
  const embeds = parseSelect(select);
  if (!embeds.length) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const embed of embeds) {
      const relation = RELATIONS[table]?.[embed.alias] || RELATIONS[table]?.[embed.table];
      if (!relation) { noteUnknown('relation', `${table}.${embed.alias}`); continue; }
      const target = db[relation.table] || [];
      if (relation.many) {
        copy[embed.alias] = embedRows(relation.table, target.filter((item) => item[relation.fk] === row.id), embed.select, depth + 1);
      } else {
        const found = target.find((item) => item.id === row[relation.fk]) || null;
        copy[embed.alias] = found ? embedRows(relation.table, [found], embed.select, depth + 1)[0] : null;
      }
    }
    return copy;
  });
}
function coerce(value) { return value === 'null' ? null : value === 'true' ? true : value === 'false' ? false : value; }
function matches(row, column, expression) {
  let op = expression; let negate = false;
  if (op.startsWith('not.')) { negate = true; op = op.slice(4); }
  const dot = op.indexOf('.');
  const kind = dot === -1 ? 'eq' : op.slice(0, dot);
  const raw = dot === -1 ? op : op.slice(dot + 1);
  const cell = row[column];
  let result;
  switch (kind) {
    case 'eq': result = String(cell) === String(coerce(raw)); break;
    case 'neq': result = String(cell) !== String(coerce(raw)); break;
    case 'gt': result = cell > raw; break;
    case 'gte': result = cell >= raw; break;
    case 'lt': result = cell < raw; break;
    case 'lte': result = cell <= raw; break;
    case 'is': result = raw === 'null' ? cell == null : String(cell) === raw; break;
    case 'in': result = splitTop(raw.replace(/^\(|\)$/g, '')).map((item) => item.replace(/^"|"$/g, '')).includes(String(cell)); break;
    case 'like': case 'ilike': {
      const pattern = new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, kind === 'ilike' ? 'i' : '');
      result = pattern.test(String(cell ?? '')); break;
    }
    default: result = true;
  }
  return negate ? !result : result;
}
function select(table, params, headers) {
  let rows = [...(db[table] || [])];
  if (!(table in db)) noteUnknown('table', table);
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
    if (key === 'or' || key === 'and') continue;
    rows = rows.filter((row) => matches(row, key, value));
  }
  const order = params.get('order');
  if (order) {
    const [column, direction = 'asc'] = order.split(',')[0].split('.');
    rows.sort((a, b) => (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * (direction.startsWith('desc') ? -1 : 1));
  }
  const total = rows.length;
  const offset = Number(params.get('offset')) || 0;
  const range = /(\d+)-(\d+)/.exec(headers.range || '');
  const start = range ? Number(range[1]) : offset;
  const limit = params.get('limit') ? Number(params.get('limit')) : range ? Number(range[2]) - start + 1 : rows.length;
  rows = rows.slice(start, start + limit);
  return { rows: embedRows(table, rows, params.get('select') || '*'), total, start };
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const route = url.pathname;
  try {
    if (route === '/auth/v1/user') {
      if (!req.headers.authorization) return send(res, 401, { code: 401, error_code: 'no_authorization', msg: 'Missing authorization' });
      return send(res, 200, USER);
    }
    if (route === '/auth/v1/token') return send(res, 200, session());
    if (route === '/auth/v1/logout') { res.writeHead(204); res.end(); return; }
    if (route === '/auth/v1/settings') return send(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
    if (route.startsWith('/auth/v1/')) return send(res, 200, {});
    if (route === '/__qa/session') return send(res, 200, session());

    if (route.startsWith('/rest/v1/rpc/')) {
      const fn = route.slice('/rest/v1/rpc/'.length);
      const body = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
      const handler = rpcHandlers(db)[fn];
      if (!handler) { noteUnknown('rpc', fn); return send(res, 200, null); }
      return send(res, 200, await handler(body));
    }
    if (route.startsWith('/rest/v1/')) {
      const table = route.slice('/rest/v1/'.length);
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || '');
      if (req.method === 'GET' || req.method === 'HEAD') {
        const { rows, total, start } = select(table, url.searchParams, req.headers);
        const range = rows.length ? `${start}-${start + rows.length - 1}/${total}` : `*/${total}`;
        if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Range': range }); res.end(); return; }
        if (wantsObject) {
          if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
          return send(res, 200, rows[0], { 'Content-Range': range });
        }
        return send(res, 200, rows, { 'Content-Range': range });
      }
      const body = await readBody(req);
      db[table] ||= [];
      if (req.method === 'POST') {
        const inserted = (Array.isArray(body) ? body : [body]).map((row) => ({ id: row.id || `qa-${Math.random().toString(36).slice(2, 10)}`, created_at: new Date().toISOString(), ...row }));
        db[table].push(...inserted);
        return send(res, 201, wantsObject ? inserted[0] : inserted);
      }
      if (req.method === 'PATCH') {
        const { rows } = select(table, url.searchParams, req.headers);
        rows.forEach((row) => { const target = db[table].find((item) => item.id === row.id); if (target) Object.assign(target, body); });
        return send(res, 200, wantsObject ? rows[0] : rows);
      }
      if (req.method === 'DELETE') {
        const { rows } = select(table, url.searchParams, req.headers);
        db[table] = db[table].filter((item) => !rows.some((row) => row.id === item.id));
        res.writeHead(204); res.end(); return;
      }
    }
    if (route.startsWith('/storage/v1/')) return send(res, 200, {});
    if (route.startsWith('/functions/v1/')) return send(res, 200, {});
    return send(res, 404, { message: 'not found' });
  } catch (error) {
    console.error('mock error', route, error);
    return send(res, 500, { message: String(error) });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Supabase QA mock listening on http://127.0.0.1:${port}`));

// Local stand-in for Netlify: serves public/, routes /api/* to the function, rewrites /r/* to r.html,
// and replaces Netlify Blobs with an in-memory store that honours etags (onlyIfMatch).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const mem = new Map();
globalThis.__TEST_STORES__ = (name) => {
  if (!mem.has(name)) mem.set(name, new Map());
  const m = mem.get(name);
  const etag = () => crypto.randomBytes(6).toString('hex');
  return {
    async get(k, o = {}) { const v = m.get(k); if (!v) return null; return o.type === 'json' ? JSON.parse(v.data) : o.type === 'arrayBuffer' ? v.data : v.data; },
    async getWithMetadata(k, o = {}) { const v = m.get(k); if (!v) return null; return { data: o.type === 'json' ? JSON.parse(v.data) : v.data, etag: v.etag, metadata: v.metadata }; },
    async setJSON(k, d, o = {}) { const cur = m.get(k); if (o.onlyIfMatch && (!cur || cur.etag !== o.onlyIfMatch)) return { modified: false }; const e = etag(); m.set(k, { data: JSON.stringify(d), etag: e }); return { modified: true, etag: e }; },
    async set(k, d, o = {}) { const buf = Buffer.isBuffer(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d; m.set(k, { data: buf, etag: etag(), metadata: o.metadata }); return { modified: true }; },
    async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; }
  };
};

Object.assign(process.env, {
  APP_SECRET: 'test-secret', TEAM_PASSWORD: 'team', APPROVER_PASSWORD: 'lo', SITE_URL: 'http://localhost:' + (process.env.PORT || 8890)
}, process.env.EXTRA_ENV ? JSON.parse(process.env.EXTRA_ENV) : {});

const { default: api } = await import('../netlify/functions/api.mjs');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await api(new Request(url.href.replace('http://localhost', process.env.SITE_URL), { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), { ip: '127.0.0.1' });
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = url.pathname;
  if (p.startsWith('/r/')) p = '/r.html';
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT || 8890), () => console.log('listening', process.env.PORT || 8890));

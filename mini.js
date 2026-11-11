'use strict';
/* Tiny Express-compatible subset on top of Node's http module, so the lab needs NO npm install. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

function app() {
  const layers = [];
  const a = {
    disable() {},
    use(p, fn) { if (typeof p === 'function') { fn = p; p = ''; } layers.push({ method: null, path: p, prefix: true, fn }); },
    get(p, ...fns)    { fns.forEach(fn => layers.push({ method: 'GET',    path: p, fn })); },
    post(p, ...fns)   { fns.forEach(fn => layers.push({ method: 'POST',   path: p, fn })); },
    delete(p, ...fns) { fns.forEach(fn => layers.push({ method: 'DELETE', path: p, fn })); },
    listen(port, host, cb) { return http.createServer(handle).listen(port, host, cb); },
  };

  function handle(req, res) {
    const u = new URL(req.url, 'http://localhost');
    req.path = decodeURIComponent(u.pathname);
    req.query = Object.fromEntries(u.searchParams);
    req.ip = req.socket.remoteAddress;
    res.status = c => { res.statusCode = c; return res; };
    res.type = t => { res.setHeader('Content-Type', t === 'text/plain' ? 'text/plain; charset=utf-8' : t); return res; };
    res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = s => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(s); return res; };
    res.redirect = (code, url) => { if (typeof code === 'string') { url = code; code = 302; } res.statusCode = code; res.setHeader('Location', url); res.end(''); return res; };
    res.sendFile = f => fs.readFile(f, (e, d) => {
      if (e) { res.statusCode = 404; return res.end('Not found'); }
      res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(d);
    });
    let i = 0;
    const next = () => {
      while (i < layers.length) {
        const l = layers[i++];
        if (l.method && l.method !== req.method) continue;
        if (l.prefix ? !(l.path === '' || req.path === l.path || req.path.startsWith(l.path + '/')) : l.path !== req.path) continue;
        req.mount = l.prefix ? l.path : '';
        try { return l.fn(req, res, next); } catch (e) { res.statusCode = 500; return res.end('Server error'); }
      }
    };
    next();
  }
  return a;
}

app.json = ({ limit = 4096 } = {}) => (req, res, next) => {
  if (req.method !== 'POST') return next();
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > limit) { res.statusCode = 413; res.end(); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    try { req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch (e) { req.body = {}; }
    next();
  });
};

app.static = (dir) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  const rel = req.path.slice(req.mount.length);
  const file = path.normalize(path.join(dir, rel));
  if (!file.startsWith(path.resolve(dir) + path.sep)) return next();
  fs.stat(file, (e, st) => (e || !st.isFile()) ? next() : res.sendFile(file));
};

module.exports = app;

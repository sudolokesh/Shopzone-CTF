'use strict';
/*
 * ShopZone CTF - deliberately vulnerable training app.
 * Run ONLY on localhost or an isolated lab network.
 *
 * Intentional vulnerabilities:
 *   STARTER
 *   1. HTML comment on /about leaks a build token       -> htmlcomment
 *   2. X-Debug-Token response header on every request   -> xheader
 *   3. Base64-encoded coupon on /deals                  -> base64
 *
 *   EASY
 *   4. robots.txt discloses an internal path            -> robots
 *   5. Hidden endpoint found by directory fuzzing       -> fuzz
 *   6. /api/status?verbose=1 leaks debug info           -> verbose
 *   7. Default admin credentials (admin / admin123)     -> weakcreds
 *   8. HTTP verb tampering: DELETE /api/account         -> verbtamper
 *
 *   MEDIUM
 *   9.  IDOR on /api/orders?user_id=                    -> idor
 *   10. Client-supplied price in /api/buy               -> price
 *   11. Path traversal via /api/file?name=              -> traversal
 *   12. Mass assignment in POST /api/profile            -> massassign
 *   13. Open redirect bypass at /redirect?to=           -> redirect
 *
 *   HARD
 *   14. JWT forgery to reach /admin-dashboard           -> jwt
 *       JWT_MODE=none  → alg:none accepted
 *       JWT_MODE=weakkey → HS256, crackable secret
 */
const express = require('./mini');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const PORT     = parseInt(process.env.PORT, 10) || 3000;
const HOST     = process.env.HOST || '127.0.0.1';
const JWT_MODE = process.env.JWT_MODE === 'weakkey' ? 'weakkey' : 'none';
const SECRET   = JWT_MODE === 'weakkey' ? 'secret123' : crypto.randomBytes(32).toString('hex');

/* ---------- Flags (server-side only) ---------- */
const FLAGS = {
  htmlcomment: process.env.FLAG_HTML_COMMENT || 'CTF{v13w_s0urc3_1s_p0w3r}',
  xheader:     process.env.FLAG_X_HEADER     || 'CTF{http_h34d3rs_4r3_v1s1bl3}',
  base64:      process.env.FLAG_BASE64       || 'CTF{b4s364_1s_n0t_3ncrypt10n}',
  robots:      process.env.FLAG_ROBOTS       || 'CTF{r0b0ts_txt_leaks_paths}',
  fuzz:        process.env.FLAG_FUZZ         || 'CTF{h1dd3n_d3v_p0rt4l_f0und}',
  verbose:     process.env.FLAG_VERBOSE      || 'CTF{d3bug_p4r4m_l34k}',
  weakcreds:   process.env.FLAG_WEAK_CREDS   || 'CTF{d3f4ult_cr3ds_p4wn3d}',
  verbtamper:  process.env.FLAG_VERB         || 'CTF{http_v3rb_t4mp3r1ng}',
  idor:        process.env.FLAG_IDOR         || 'CTF{1d0r_0rd3r_1337_exposed}',
  price:       process.env.FLAG_PRICE        || 'CTF{pr1c3_tr0ll_cl13nt_trust}',
  traversal:   process.env.FLAG_TRAVERSAL    || 'CTF{p4th_tr4v3rs4l_0wns}',
  massassign:  process.env.FLAG_MASS_ASSIGN  || 'CTF{m4ss_4ss1gnm3nt_0wn3d}',
  redirect:    process.env.FLAG_REDIRECT     || 'CTF{0p3n_r3d1r3ct_byp4ss}',
  jwt:         process.env.FLAG_JWT          || 'CTF{jwt_r0l3_f0rg3ry_pwned}',
};

const CHALLENGES = [
  /* ---- Starter ---- */
  { id: 'htmlcomment', title: 'Secret Comment',       difficulty: 'Starter', category: 'Recon',          points: 25,
    hint: 'Browsers render HTML but hide some things. Try View Source (Ctrl+U) on the /about page.' },
  { id: 'xheader',     title: 'Header Inspector',     difficulty: 'Starter', category: 'Recon',          points: 30,
    hint: 'HTTP responses carry more than the page body. Open DevTools → Network tab → pick any request → look at Response Headers.' },
  { id: 'base64',      title: 'Coupon Cracker',       difficulty: 'Starter', category: 'Encoding',       points: 35,
    hint: 'Visit /deals. The member coupon looks scrambled — it uses a very common encoding, not real encryption.' },
  /* ---- Easy ---- */
  { id: 'robots',      title: 'Polite Robots',         difficulty: 'Easy',    category: 'Recon',          points: 75,
    hint: 'Sites tell crawlers where NOT to go. Read that file like an attacker.' },
  { id: 'fuzz',        title: 'Needle in a Haystack',  difficulty: 'Easy',    category: 'Recon',          points: 100,
    hint: 'Not every page is linked. Try a wordlist (gobuster / ffuf / dirb) against the site.' },
  { id: 'verbose',     title: 'Loud Server',           difficulty: 'Easy',    category: 'Recon',          points: 50,
    hint: 'Debug modes are often left on in production. Try adding ?verbose=1 to /api/status.' },
  { id: 'weakcreds',   title: 'Open Sesame',           difficulty: 'Easy',    category: 'Auth',           points: 60,
    hint: 'Default credentials are a classic mistake. Try logging in as admin with a common default password.' },
  { id: 'verbtamper',  title: 'Wrong Door',            difficulty: 'Easy',    category: 'Access Control', points: 65,
    hint: 'Servers react differently to different HTTP methods. Try a DELETE request to /api/account.' },
  /* ---- Medium ---- */
  { id: 'idor',        title: "Somebody Else's Order", difficulty: 'Medium',  category: 'Access Control', points: 150,
    hint: "Watch the requests the Orders page makes. Who decides whose orders you get?" },
  { id: 'price',       title: 'Bargain Hunter',        difficulty: 'Medium',  category: 'Business Logic', points: 125,
    hint: 'Buy something. Then look at exactly what your browser tells the server about the price.' },
  { id: 'traversal',   title: 'Going Up',              difficulty: 'Medium',  category: 'File Access',    points: 100,
    hint: '/api/file?name=products.json serves files. Can you escape the intended directory with ../ ?' },
  { id: 'massassign',  title: 'Field Trip',            difficulty: 'Medium',  category: 'Business Logic', points: 110,
    hint: 'POST /api/profile updates your profile. Try including unexpected fields like "role" in the JSON body.' },
  { id: 'redirect',    title: 'Double Agent',          difficulty: 'Medium',  category: 'Open Redirect',  points: 120,
    hint: '/redirect?to=/products sends you around the site. The check only looks at the first character — can you fool it?' },
  /* ---- Hard ---- */
  { id: 'jwt',         title: 'Crown Jewels',          difficulty: 'Hard',    category: 'Auth',           points: 200,
    hint: 'Your session token is not opaque. Decode it, then think about who actually verifies the signature.' },
];

const POINTS = Object.fromEntries(CHALLENGES.map(c => [c.id, c.points]));

/* ---------- Data ---------- */
const SEED_USERS = { rahul: 1, priya: 2, admin: 3, amit: 4 };
const PRODUCTS = [
  { id: 1, icon: '💻', name: 'Gaming Laptop',       price: 65000, desc: 'RTX 4060, 16GB RAM, 512GB SSD' },
  { id: 2, icon: '📱', name: 'Smartphone X12',      price: 28999, desc: '6.7" AMOLED, 108MP camera' },
  { id: 3, icon: '🎧', name: 'Wireless Headphones', price: 4500,  desc: 'ANC, 30hr battery' },
  { id: 4, icon: '⌨️', name: 'Mech Keyboard',       price: 6200,  desc: 'Cherry MX Red, RGB backlit' },
  { id: 5, icon: '🖥️', name: '4K Monitor 27"',      price: 32000, desc: 'IPS panel, 144Hz, USB-C' },
  { id: 6, icon: '🖱️', name: 'Gaming Mouse',        price: 2800,  desc: '16000 DPI, 6 programmable buttons' },
];
const ORDERS = [
  { id: 101, userId: 1, item: 'Gaming Laptop',       amount: 65000, date: '2024-10-12', status: 'Delivered' },
  { id: 102, userId: 1, item: 'Wireless Headphones', amount: 4500,  date: '2024-11-01', status: 'Shipped' },
  { id: 103, userId: 2, item: 'Smartphone X12',      amount: 28999, date: '2024-10-28', status: 'Delivered' },
  { id: 104, userId: 3, item: '4K Monitor 27"',      amount: 32000, date: '2024-09-15', status: 'Delivered' },
  { id: 105, userId: 3, item: 'Confidential Shipment', amount: 0,   date: '2024-11-01', status: 'Processing',
    note: FLAGS.idor },
  { id: 106, userId: 4, item: 'Mech Keyboard',       amount: 6200,  date: '2024-10-30', status: 'Pending' },
];
const dynamicUsers = new Map();
let nextUid = 5;
const profiles = new Map();   // uid -> { bio, display_name, role }
let nextOrderId = 107;

/* ---------- JWT ---------- */
const b64u     = b => Buffer.from(b).toString('base64url');
const fromB64u = s => Buffer.from(s, 'base64url').toString('utf8');

function signJwt(payload) {
  const h   = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p   = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function verifyJwt(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const header  = JSON.parse(fromB64u(parts[0]));
    const payload = JSON.parse(fromB64u(parts[1]));
    const alg     = String(header.alg || '');
    if (alg.toLowerCase() === 'none') {
      if (JWT_MODE !== 'none') return null;
    } else if (alg === 'HS256') {
      const expected = crypto.createHmac('sha256', SECRET).update(`${parts[0]}.${parts[1]}`).digest();
      const given    = Buffer.from(parts[2], 'base64url');
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    } else {
      return null;
    }
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function auth(req, _res, next) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token  = bearer || parseCookies(req).token;
  req.user = token ? verifyJwt(token) : null;
  next();
}
const requireLogin = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Authentication required' });

/* ---------- App ---------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: 4096 }));

/* STARTER #2 – X-Debug-Token header on every response */
app.use((_req, res, next) => {
  res.setHeader('X-Debug-Token', FLAGS.xheader);
  next();
});

app.use(auth);

/* Static assets */
app.use('/static', express.static(path.join(__dirname, 'public')));

/* STARTER #1 – /about: standalone HTML page with flag in source comment */
app.get('/about', (_req, res) => {
  res.type('text/html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>About – ShopZone</title>
<!--
  === ShopZone Platform Build Info ===
  build_id    : 2024.11.01-rc2
  deploy_env  : production-east
  review_token: ${FLAGS.htmlcomment}
  maintainer  : devops@shopzone.in
  TODO        : remove this block before next release
-->
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<nav>
  <a class="brand" href="/">Shop<span>Zone</span></a>
  <div class="links">
    <a href="/">Home</a>
    <a href="/products">Products</a>
    <a href="/deals">Deals</a>
    <a href="/orders">Orders</a>
    <a href="/account">Account</a>
    <a href="/flags">Flags</a>
    <a href="/scoreboard">Scoreboard</a>
    <a href="/customers">Reviews</a>
    <a class="on" href="/about">About</a>
  </div>
  <div class="right"><a style="color:#94a3b8;font-size:.82rem;text-decoration:none" href="/">← Back</a></div>
</nav>
<main>
  <h1>About ShopZone</h1>
  <p>India's fastest-growing electronics marketplace, trusted by over 1 million shoppers since 2019.</p>
  <div class="grid">
    <div class="card"><h2>🏢 Who we are</h2><p>ShopZone connects buyers with top electronics brands across India. We prioritise speed, reliability and customer satisfaction above all else.</p></div>
    <div class="card"><h2>🚀 Our mission</h2><p>Make premium electronics accessible to everyone — transparent pricing, no hidden fees, no surprises at checkout.</p></div>
    <div class="card"><h2>🛡️ Security</h2><p>We use industry-standard 256-bit TLS encryption for all transactions. Your data and payments are always protected.</p></div>
    <div class="card"><h2>📞 Contact us</h2><p>support@shopzone.in<br>1800-123-4567<br>Mon–Sat, 9 AM – 6 PM IST</p></div>
  </div>
</main>
<footer>© 2024 ShopZone Pvt. Ltd. · Training lab: for educational use only</footer>
</body>
</html>`);
});

/* SPA shell (index.html) served for all client-side routes */
const page = (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'));
['/', '/products', '/deals', '/orders', '/account', '/flags', '/scoreboard', '/customers'].forEach(r => app.get(r, page));

/* ---------- Public API ---------- */
app.get('/api/products', (_req, res) => res.json(PRODUCTS));

const CUSTOMER_QUOTES = {
  1: { quote: 'Fast delivery and great prices. My go-to for electronics!', stars: 5 },
  2: { quote: 'Smartphone arrived next day, exactly as described.', stars: 5 },
  3: { quote: 'Smooth checkout experience, will shop again.', stars: 4 },
  4: { quote: 'Great keyboard, excellent packaging.', stars: 5 },
};
app.get('/api/customers', (_req, res) => {
  const list = Object.entries(SEED_USERS).map(([username, uid]) => ({
    id: uid, name: username.charAt(0).toUpperCase() + username.slice(1),
    ...(CUSTOMER_QUOTES[uid] || { quote: 'Happy customer!', stars: 5 }),
  })).sort((a, b) => a.id - b.id);
  res.json(list);
});

/* STARTER #3 – /api/deals: member coupon is base64-encoded flag */
app.get('/api/deals', (_req, res) => {
  res.json({
    deals: [
      { title: '10% off Electronics', code: 'ELEC10', expires: '2024-12-31' },
      { title: 'Free shipping on orders over ₹999', code: 'SHIP999', expires: '2024-12-31' },
      { title: 'Extra 5% off on first order', code: 'FIRST5', expires: '2024-12-31' },
    ],
    memberCoupon: Buffer.from(FLAGS.base64).toString('base64'),
    couponNote: 'Decode this coupon to reveal your exclusive discount code.',
  });
});

/* EASY #3 – /api/status?verbose=1 leaks debug info */
app.get('/api/status', (_req, res) => {
  const base = { status: 'ok', uptime: Math.floor(process.uptime()), version: '2.0.0' };
  if (_req.query.verbose === '1' || _req.query.verbose === 'true') {
    base.debug = {
      node: process.version,
      build: '2024.11.01-rc2',
      env: 'production',
      flag: FLAGS.verbose,
    };
  }
  res.json(base);
});

/* ---------- Auth ---------- */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' ||
      !username.trim() || !password || username.length > 32 || password.length > 64) {
    return res.status(400).json({ error: 'Enter a username and password.' });
  }
  const name = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32) || 'user';
  let uid = SEED_USERS[name];
  if (!uid) {
    if (!dynamicUsers.has(name)) dynamicUsers.set(name, nextUid++);
    uid = dynamicUsers.get(name);
  }
  const now = Math.floor(Date.now() / 1000);

  /* EASY #4 – default admin credentials */
  if (name === 'admin' && password === 'admin123') {
    const token = signJwt({ uid, sub: 'admin', role: 'superadmin', iat: now, exp: now + 7200 });
    res.setHeader('Set-Cookie', `token=${token}; Path=/; SameSite=Lax; Max-Age=7200`);
    return res.json({ ok: true, user: { uid, username: 'admin', role: 'superadmin' }, flag: FLAGS.weakcreds });
  }

  const token = signJwt({ uid, sub: name, role: 'user', iat: now, exp: now + 7200 });
  res.setHeader('Set-Cookie', `token=${token}; Path=/; SameSite=Lax; Max-Age=7200`);
  res.json({ ok: true, user: { uid, username: name, role: 'user' } });
});

app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: { uid: req.user.uid, username: req.user.sub, role: req.user.role } });
});

/* ---------- Auth-required API ---------- */

/* EASY #5 – HTTP verb tampering: DELETE /api/account */
app.delete('/api/account', requireLogin, (req, res) => {
  res.json({
    ok: false,
    message: 'Account deletion is disabled in this training environment.',
    flag: FLAGS.verbtamper,
    note: 'HTTP verb tampering: endpoints that forget to restrict allowed methods can expose destructive or sensitive operations.',
  });
});

/* MEDIUM #1 – IDOR: ownership not checked */
app.get('/api/orders', requireLogin, (req, res) => {
  const requested = req.query.user_id !== undefined
    ? parseInt(req.query.user_id, 10) : req.user.uid;
  if (Number.isNaN(requested)) return res.status(400).json({ error: 'Invalid user_id' });
  // INTENTIONAL VULNERABILITY: should verify requested === req.user.uid
  res.json({ user_id: requested, orders: ORDERS.filter(o => o.userId === requested) });
});

/* MEDIUM #2 – client-supplied price */
app.post('/api/buy', requireLogin, (req, res) => {
  const b       = req.body || {};
  const product = PRODUCTS.find(p => p.id === parseInt(b.productId, 10));
  const qty     = parseInt(b.quantity, 10) || 1;
  const price   = Number(b.price);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (qty < 1 || qty > 5) return res.status(400).json({ error: 'Quantity must be 1-5.' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price.' });
  // INTENTIONAL VULNERABILITY: price should come from product.price, not the request
  const order   = { id: nextOrderId++, userId: req.user.uid, item: product.name, amount: price * qty,
                    date: new Date().toISOString().slice(0, 10), status: 'Processing' };
  const tampered = price < product.price;
  if (tampered) order.note = FLAGS.price;
  ORDERS.push(order);
  res.json({ ok: true, order, tampered,
    message: tampered
      ? `Order #${order.id} placed for ${product.name} at a price you chose. The shop just lost money!`
      : `Order #${order.id} placed for ${product.name}. Thank you!` });
});

/* MEDIUM #4 – mass assignment on profile update */
app.get('/api/profile', requireLogin, (req, res) => {
  const uid     = req.user.uid;
  const profile = profiles.get(uid) || { bio: '', display_name: req.user.sub, role: 'user' };
  res.json({ profile });
});

app.post('/api/profile', requireLogin, (req, res) => {
  const uid     = req.user.uid;
  const current = profiles.get(uid) || { bio: '', display_name: req.user.sub, role: 'user' };
  // INTENTIONAL VULNERABILITY: naively spreads all request body fields onto the profile
  const updated = { ...current, ...req.body };
  profiles.set(uid, updated);
  const tampered = updated.role && updated.role !== 'user';
  if (tampered) updated.flag = FLAGS.massassign;
  res.json({ ok: true, profile: updated });
});

/* ---------- Recon challenges ---------- */
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
`User-agent: *
Disallow: /api/
Disallow: /admin-dashboard
Disallow: /internal-notes
Disallow: /backup-2024.zip
`);
});

app.get('/internal-notes', (_req, res) => {
  res.type('text/plain').send(
`ShopZone internal notes (DO NOT PUBLISH)
-----------------------------------------
TODO: remove staging credentials from wiki
TODO: move admin panel behind VPN
Flag: ${FLAGS.robots}
`);
});

app.get('/dev-portal', (_req, res) => {
  res.type('text/plain').send(
`ShopZone Dev Portal (forgotten in production)
build: 2024.11.01-rc2
Flag: ${FLAGS.fuzz}
`);
});

/* ---------- Admin dashboard (JWT forgery) ---------- */
const denyPage = (code, msg) => `<!doctype html><meta charset="utf-8"><title>${code}</title>
<body style="font-family:system-ui;background:#0f172a;color:#f1f5f9;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-size:4rem;margin:0">${code}</h1><p style="color:#94a3b8">${msg}</p>
<a style="color:#60a5fa" href="/">Back to ShopZone</a></div></body>`;

app.get('/admin-dashboard', (req, res) => {
  if (!req.user) return res.status(401).send(denyPage(401, 'Please log in first.'));
  if (req.user.role !== 'admin') {
    return res.status(403).send(denyPage(403,
      `Forbidden. Admins only (your role: ${String(req.user.role).replace(/[<>&"]/g, '')}).`));
  }
  res.send(`<!doctype html><meta charset="utf-8"><title>Admin – ShopZone</title>
<body style="font-family:system-ui;background:#0f172a;color:#f1f5f9;max-width:720px;margin:40px auto;padding:0 20px">
<h1>Admin Dashboard</h1>
<p style="color:#94a3b8">Welcome, ${String(req.user.sub).replace(/[<>&"]/g, '')}. Users: 4 · Revenue: ₹1,36,500 · Pending: 6</p>
<div style="background:#450a0a;border:1px solid #991b1b;border-radius:8px;padding:16px;font-family:monospace">Flag: ${FLAGS.jwt}</div>
<p><a style="color:#60a5fa" href="/flags">Submit your flag →</a></p></body>`);
});

/* ---------- MEDIUM #3 – path traversal ---------- */
const FILES_DIR = path.join(__dirname, 'files');

app.get('/api/file', (req, res) => {
  const name = String(req.query.name || '');
  if (!name) return res.status(400).type('text/plain')
    .send('Missing parameter. Try: /api/file?name=products.json');
  // INTENTIONAL VULNERABILITY: path is not sanitised; ../ traversal is possible
  const filePath = path.join(FILES_DIR, name);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (_e) {
    res.status(404).json({ error: 'File not found.' });
  }
});

/* ---------- MEDIUM #5 – open redirect with double-slash bypass ---------- */
app.get('/redirect', (req, res) => {
  const to = String(req.query.to || '/');
  // INTENTIONAL VULNERABILITY: validates only the first character
  if (!to.startsWith('/')) {
    return res.status(400).type('text/plain')
      .send('Redirect target must be an internal path starting with /');
  }
  // Double-slash bypass: //evil.com starts with / but is an external URL
  if (to.startsWith('//') || to.startsWith('/\\')) {
    return res.type('text/plain').send(
      `Open redirect triggered!\nDestination: ${to}\nFlag: ${FLAGS.redirect}`);
  }
  res.redirect(302, to);
});

/* ---------- Flag submission & scoreboard ---------- */
const players = new Map();
const hits    = new Map();
const sanitizeName = s => String(s || '').trim().replace(/[^\w .-]/g, '').slice(0, 24);

app.get('/api/challenges', (req, res) => {
  const p = players.get(sanitizeName(req.query.player));
  res.json(CHALLENGES.map(c => ({ ...c, solved: !!(p && p.solved.has(c.id)) })));
});

app.post('/api/flags/submit', (req, res) => {
  const ip    = req.ip;
  const now   = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  recent.push(now); hits.set(ip, recent);

  const player    = sanitizeName(req.body && req.body.player);
  const submitted = String((req.body && req.body.flag) || '').trim();
  if (!player) return res.status(400).json({ error: 'Enter your name first.' });
  if (!submitted || submitted.length > 100) return res.status(400).json({ error: 'Enter a flag.' });

  const id = Object.keys(FLAGS).find(k => FLAGS[k] === submitted);
  if (!id) return res.json({ correct: false, message: 'Incorrect flag. Keep trying.' });

  if (!players.has(player)) players.set(player, { solved: new Set(), score: 0, last: now });
  const p = players.get(player);
  if (p.solved.has(id)) return res.json({
    correct: true, already: true, challenge: id, score: p.score,
    message: 'You already solved this one.' });
  p.solved.add(id); p.score += POINTS[id]; p.last = now;
  res.json({ correct: true, challenge: id, points: POINTS[id], score: p.score,
    solved: p.solved.size, total: CHALLENGES.length,
    message: `Correct! +${POINTS[id]} points.` });
});

app.get('/api/scoreboard', (_req, res) => {
  const rows = [...players.entries()]
    .map(([player, p]) => ({ player, score: p.score, solved: p.solved.size, last: p.last }))
    .sort((a, b) => b.score - a.score || a.last - b.last);
  res.json(rows);
});

app.use((_req, res) => res.status(404).send(denyPage(404, 'Page not found.')));

app.listen(PORT, HOST, () => {
  console.log(`ShopZone CTF running at http://${HOST}:${PORT}  (JWT_MODE=${JWT_MODE})`);
  if (HOST !== '127.0.0.1')
    console.log('WARNING: listening beyond localhost. Use only on an isolated lab network.');
});

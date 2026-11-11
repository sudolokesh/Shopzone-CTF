'use strict';
/* ShopZone front-end. Contains NO flags, NO user data and NO authorization logic. */
const view = document.getElementById('view');
const who = document.getElementById('who');
const authbtn = document.getElementById('authbtn');
let me = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const api = async (url, opts = {}) => {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  let data = {}; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
};
const player = () => localStorage.getItem('sz_player') || '';

async function refreshMe() {
  const { data } = await api('/api/me');
  me = data.user;
  who.textContent = me ? `${me.username} (${me.role})` : 'Guest';
  authbtn.textContent = me ? 'Logout' : 'Login';
}

authbtn.onclick = async () => {
  if (me) { await api('/api/logout', { method: 'POST' }); await refreshMe(); go('/'); }
  else go('/account');
};

function go(path) { history.pushState({}, '', path); render(); }
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-r], a.brand');
  if (a) { e.preventDefault(); go(a.getAttribute('href')); }
});
window.onpopstate = render;

const routes = {
  '/': async () => `
    <div class="hero">
      <div class="hero-badge">🛒 India's #1 Electronics Marketplace</div>
      <h1>Shop Smarter,<br><span class="gradient-text">Deliver Faster</span></h1>
      <p>Discover the best deals on electronics, gadgets, and accessories — trusted by over 1 million shoppers.</p>
      <a class="btn" href="/products" data-r style="text-decoration:none">Browse Products →</a>
    </div>
    <div class="stats-row">
      <div class="stat-item"><div class="stat-num gradient-text">1,200+</div><div class="stat-label">Products listed</div></div>
      <div class="stat-item"><div class="stat-num gradient-text">4.8★</div><div class="stat-label">Average rating</div></div>
      <div class="stat-item"><div class="stat-num gradient-text">24hr</div><div class="stat-label">Avg. delivery</div></div>
    </div>
    <div class="grid">
      <div class="feature-card">
        <div class="feature-icon">📦</div>
        <h3>Huge Catalog</h3>
        <p>Electronics, books, clothing and more from top brands.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🚚</div>
        <h3>Free Shipping</h3>
        <p>On all orders above ₹500. Same-day delivery in select cities.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🔒</div>
        <h3>Secure Checkout</h3>
        <p>256-bit SSL encryption on all transactions. Always safe.</p>
      </div>
    </div>`,

  '/products': async () => {
    const { data } = await api('/api/products');
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <h1>Products</h1>
      <span class="small">${data.length} items</span>
    </div>
    <p>Browse our catalog of top electronics and gadgets.</p>
    <div id="buymsg"></div>
    <div class="grid">${data.map(p => `
      <div class="prod">
        <div class="img">${p.icon}</div>
        <div class="in">
          <div class="name">${esc(p.name)}</div>
          <div class="price">${inr(p.price)}</div>
          <div class="small">${esc(p.desc)}</div>
          <div class="buy-btn">
            <button class="btn buy" data-id="${p.id}" data-price="${p.price}" style="width:100%">Buy now</button>
          </div>
        </div>
      </div>`).join('')}</div>`;
  },

  '/orders': async () => {
    if (!me) return `<h1>My Orders</h1><div class="alert info">Please <a href="/account" data-r style="color:inherit">log in</a> to see your orders.</div>`;
    // The id is sent as a query parameter: visible only in the Network tab, not in the UI.
    const { status, data } = await api(`/api/orders?user_id=${encodeURIComponent(me.uid)}`);
    if (status !== 200) return `<h1>My Orders</h1><div class="alert bad">${esc(data.error || 'Error')}</div>`;
    const color = { Delivered: 'var(--green)', Shipped: 'var(--accent)' };
    return `<h1>My Orders</h1><p>Your recent orders are listed below.</p>` +
      (data.orders.length ? data.orders.map(o => `
        <div class="order"><div class="hd"><span>Order <b>#${o.id}</b></span><span>${esc(o.date)}</span>
          <span class="st" style="color:${color[o.status] || '#d97706'}">${esc(o.status)}</span></div>
          <div class="bd"><b>${esc(o.item)}</b><br><span class="small">${o.amount ? inr(o.amount) : '—'}</span>
          ${o.note ? `<div class="note">${esc(o.note)}</div>` : ''}</div></div>`).join('')
        : `<div class="alert info">No orders yet.</div>`);
  },

  '/account': async () => {
    if (me) return `
    <div class="narrow">
      <h1>My Account</h1>
      <div class="card">
        <div style="display:flex;align-items:center;gap:16px;padding-bottom:18px;margin-bottom:4px;border-bottom:1px solid var(--border)">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--gradient);display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:#fff;flex-shrink:0">
            ${esc(me.username.charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="font-weight:700;font-size:1.05rem">${esc(me.username)}</div>
            <span class="diff-pill diff-${me.role === 'admin' || me.role === 'superadmin' ? 'hard' : 'easy'}" style="margin-top:4px;display:inline-block">${esc(me.role)}</span>
          </div>
        </div>
        <div class="row"><span>Username</span><span style="font-weight:600">${esc(me.username)}</span></div>
        <div class="row"><span>Role</span><span>${esc(me.role)}</span></div>
        <div class="row"><span>Member since</span><span>January 2024</span></div>
        <div class="row"><span>User ID</span><span style="font-family:monospace">${me.uid}</span></div>
        <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="/orders" data-r style="text-decoration:none">My Orders</a>
          <button class="btn outline" id="lo">Logout</button>
        </div>
      </div>
    </div>`;
    return `
    <div class="narrow">
      <h1>Sign In</h1>
      <p>Welcome back. Enter any credentials to log in to the training lab.</p>
      <div class="card">
        <div class="field"><label>Username</label><input id="u" autocomplete="off" placeholder="e.g. rahul, priya, admin"></div>
        <div class="field"><label>Password</label><input id="p" type="password" placeholder="Enter your password"></div>
        <div id="msg"></div>
        <button class="btn" id="go" style="width:100%">Sign In →</button>
        <p style="margin:14px 0 0;text-align:center;font-size:.78rem">🔓 Training lab: any username and password will work. Try common credentials.</p>
      </div>
    </div>`;
  },

  '/flags': async () => {
    const name = player();
    const { data: ch } = await api('/api/challenges?player=' + encodeURIComponent(name));
    const TIERS = [
      { key: 'Starter', label: '🟢 Starter', color: '#16a34a', bg: 'rgba(22,163,74,.12)' },
      { key: 'Easy',    label: '🔵 Easy',    color: '#2563eb', bg: 'rgba(37,99,235,.12)' },
      { key: 'Medium',  label: '🟠 Medium',  color: '#d97706', bg: 'rgba(217,119,6,.12)' },
      { key: 'Hard',    label: '🔴 Hard',    color: '#dc2626', bg: 'rgba(220,38,38,.12)' },
    ];
    const byDiff = {};
    TIERS.forEach(t => { byDiff[t.key] = []; });
    ch.forEach(c => { (byDiff[c.difficulty] || byDiff.Medium).push(c); });
    const totalSolved = ch.filter(c => c.solved).length;
    const totalScore  = ch.filter(c => c.solved).reduce((s, c) => s + c.points, 0);
    const diffClass = { Starter: 'starter', Easy: 'easy', Medium: 'medium', Hard: 'hard' };
    const sections = TIERS.map(t => {
      const list = byDiff[t.key];
      if (!list.length) return '';
      const tierSolved = list.filter(c => c.solved).length;
      const tierPts = list.filter(c => c.solved).reduce((s,c) => s + c.points, 0);
      const pct = list.length ? Math.round(tierSolved / list.length * 100) : 0;
      return `<div class="card" style="padding:20px 24px">
        <div class="section-header" style="margin-bottom:16px">
          <span class="diff-pill diff-${(diffClass[t.key] || 'easy')}">${esc(t.key)}</span>
          <h2 style="font-size:1rem;margin:0;flex:1">${esc(t.label.replace(/^[^ ]+ /, ''))}</h2>
          <div class="section-progress"><div class="section-progress-bar" style="width:${pct}%;background:${t.color}"></div></div>
          <span class="small" style="white-space:nowrap">${tierSolved}/${list.length} · ${tierPts} pts</span>
        </div>
        ${list.map(c => `
        <div class="chal">
          <div class="chal-left">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
              ${c.solved ? '<span style="color:var(--green);font-size:.9rem">✔</span>' : '<span style="color:var(--border2);font-size:.9rem">○</span>'}
              <b style="font-size:.92rem">${esc(c.title)}</b>
              <span class="tag">${esc(c.category)}</span>
            </div>
            <div class="small" style="padding-left:18px">💡 ${esc(c.hint)}</div>
          </div>
          <div class="chal-right">
            ${c.solved ? '<div class="done">Solved ✔</div>' : ''}
            <div class="small" style="margin-top:2px;font-weight:700;color:var(--fg2)">${c.points} pts</div>
          </div>
        </div>`).join('')}
      </div>`;
    }).join('');
    return `<h1>Submit Flags</h1>
      <p>Found a flag? Enter your name and the flag string to claim points.</p>
      <div class="card">
        <div class="field"><label>Your name</label><input id="pl" maxlength="24" value="${esc(name)}" placeholder="e.g. Team Alpha"></div>
        <div class="field"><label>Flag</label><input id="fl" autocomplete="off" placeholder="CTF{...}"></div>
        <div id="fm"></div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <button class="btn" id="sub">Verify Flag</button>
          ${totalSolved ? `<span class="small">Your progress: <b>${totalSolved}</b>/${ch.length} flags · <b>${totalScore}</b> pts</span>` : ''}
        </div>
      </div>
      ${sections}`;
  },

  '/deals': async () => {
    const { data } = await api('/api/deals');
    const coupon = data.memberCoupon || '';
    return `
    <h1>Deals &amp; Offers</h1>
    <p>Exclusive discounts and promotions for ShopZone members.</p>
    <div class="card" style="border-color:var(--accent);box-shadow:var(--shadow-accent)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="font-size:1.6rem">🎟️</div>
        <div>
          <h2 style="margin:0 0 2px">Your Member Coupon</h2>
          <span class="small">Redeem at checkout for an exclusive member-only discount</span>
        </div>
      </div>
      <div class="coupon-box">${esc(coupon)}</div>
      <p style="margin:10px 0 0;font-size:.8rem">${esc(data.couponNote || '')}</p>
    </div>
    <h2 style="margin:4px 0 16px">Active Promotions</h2>
    <div class="grid">${(data.deals || []).map(d => `
      <div class="deal-card">
        <div style="font-size:1.2rem;margin-bottom:10px">🏷️</div>
        <b style="font-size:.95rem">${esc(d.title)}</b>
        <div class="small" style="margin-top:8px">Code: <code style="background:var(--surface2);padding:2px 8px;border-radius:4px;font-family:monospace;color:var(--accent)">${esc(d.code)}</code></div>
        <div class="small" style="margin-top:4px">Valid until ${esc(d.expires)}</div>
      </div>`).join('')}</div>`;
  },

  '/customers': async () => {
    const { data } = await api('/api/customers');
    const stars = n => '<span style="color:#f59e0b">' + '★'.repeat(n) + '</span><span style="color:var(--border2)">' + '★'.repeat(5 - n) + '</span>';
    return `
    <h1>Customer Reviews</h1>
    <p>Real feedback from real ShopZone shoppers.</p>
    <div class="grid">${data.map(c => `
      <div class="feature-card" style="text-align:left">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:38px;height:38px;border-radius:50%;background:var(--gradient);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:.9rem;flex-shrink:0">
            ${esc(c.name.charAt(0))}
          </div>
          <div>
            <div style="font-weight:700;font-size:.9rem">${esc(c.name)}</div>
            <div class="small">Customer #${c.id}</div>
          </div>
        </div>
        <div style="margin-bottom:8px">${stars(c.stars)}</div>
        <div class="small" style="font-style:italic;line-height:1.5">"${esc(c.quote)}"</div>
      </div>`).join('')}</div>`;
  },

  '/scoreboard': async () => {
    const { data } = await api('/api/scoreboard');
    const medals = ['🥇', '🥈', '🥉'];
    const medalClass = ['medal-1', 'medal-2', 'medal-3'];
    return `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
      <h1 style="margin:0">Scoreboard</h1>
      <span class="small">${data.length} player${data.length !== 1 ? 's' : ''}</span>
    </div>
    <p>Live rankings. Points awarded per flag captured.</p>
    <div class="card" style="padding:0;overflow:hidden">
      <table>
        <thead><tr><th style="width:48px">#</th><th>Player</th><th>Flags</th><th>Score</th></tr></thead>
        <tbody>${data.length
          ? data.map((r, i) => `
          <tr>
            <td class="${medalClass[i] || ''}">${medals[i] || i + 1}</td>
            <td><b>${esc(r.player)}</b></td>
            <td><span class="tag" style="margin:0">${r.solved}</span></td>
            <td><b style="font-size:1rem">${r.score}</b> <span class="small">pts</span></td>
          </tr>`).join('')
          : '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--muted)">No solves yet — be the first! 🏆</td></tr>'}
        </tbody>
      </table>
    </div>`;
  },
};

const binders = {
  '/deals': () => {},
  '/products': () => {
    document.querySelectorAll('.buy').forEach(btn => btn.onclick = async () => {
      const box = document.getElementById('buymsg');
      if (!me) { go('/account'); return; }
      const { status, data } = await api('/api/buy', { method: 'POST',
        body: JSON.stringify({ productId: +btn.dataset.id, price: +btn.dataset.price, quantity: 1 }) });
      const ok = status === 200;
      box.innerHTML = `<div class="alert ${ok ? 'ok' : 'bad'}">${esc(ok ? data.message : data.error)}
        ${ok ? ' <a href="/orders" data-r style="color:inherit">View orders</a>' : ''}</div>`;
      window.scrollTo(0, 0);
    });
  },
  '/account': () => {
    const lo = document.getElementById('lo');
    if (lo) lo.onclick = () => authbtn.onclick();
    const btn = document.getElementById('go');
    if (!btn) return;
    const doLogin = async () => {
      const { status, data } = await api('/api/login', { method: 'POST',
        body: JSON.stringify({ username: document.getElementById('u').value, password: document.getElementById('p').value }) });
      if (status !== 200) { document.getElementById('msg').innerHTML = `<div class="alert bad">${esc(data.error)}</div>`; return; }
      await refreshMe(); render();
    };
    btn.onclick = doLogin;
    document.getElementById('p').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  },
  '/flags': () => {
    document.getElementById('sub').onclick = async () => {
      const pl = document.getElementById('pl').value.trim();
      const fl = document.getElementById('fl').value.trim();
      const fm = document.getElementById('fm');
      localStorage.setItem('sz_player', pl);
      const { status, data } = await api('/api/flags/submit', { method: 'POST', body: JSON.stringify({ player: pl, flag: fl }) });
      const cls = status !== 200 ? 'bad' : data.correct ? 'ok' : 'bad';
      fm.innerHTML = `<div class="alert ${cls}">${esc(data.message || data.error)}${data.correct && !data.already ? ` Total: ${data.score} pts (${data.solved}/${data.total} flags)` : ''}</div>`;
      if (data.correct) setTimeout(render, 1200);
    };
  },
};

async function render() {
  const path = location.pathname;
  document.querySelectorAll('.links a').forEach(a => a.classList.toggle('on', a.dataset.r === path));
  const fn = routes[path];
  if (!fn) { view.innerHTML = '<h1>404</h1><p>Page not found.</p>'; return; }
  view.innerHTML = await fn();
  if (binders[path]) binders[path]();
  window.scrollTo(0, 0);
}

refreshMe().then(render);

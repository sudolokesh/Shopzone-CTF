# ShopZone CTF (v2)

Deliberately vulnerable training app. **Run only on localhost or an isolated lab network.**

## Run
    node server.js                          # http://127.0.0.1:3000  (Node 18+, no npm install needed)
    JWT_MODE=weakkey node server.js         # harder JWT variant
    HOST=0.0.0.0 PORT=8080 node server.js   # classroom LAN (isolated network only)

Windows (PowerShell): `$env:JWT_MODE="weakkey"; node server.js`

Open it through the server URL (http://127.0.0.1:3000), not by double-clicking an HTML file.

## What changed from v1
- Flags exist only in `server.js`; they are never in the page source.
- `user_id` is not shown in the UI. The Orders page calls `/api/orders?user_id=N` (visible in DevTools > Network).
- Login accepts any username/password and issues a signed JWT cookie (`token`) with `role: user`.
- `/admin-dashboard` checks the JWT `role` on the server.
- `/flags` verifies submissions server-side; `/scoreboard` ranks players.

## Challenges (instructor answer key)
| Challenge | Pts | Solution |
|---|---|---|
| Polite Robots | 75 | `/robots.txt` lists `/internal-notes` |
| Needle in a Haystack | 100 | `gobuster dir -u http://127.0.0.1:3000 -w wordlist.txt` finds `/dev-portal` (not in robots.txt) |
| Somebody Else's Order | 150 | The **Reviews** page (`/customers`, public, no login) lists customer IDs 1-4, including "Admin" at ID 3. Log in, then request `/api/orders?user_id=3` (curl with the cookie, or DevTools "Edit and Resend") |
| Bargain Hunter | 125 | Click Buy, then in DevTools > Network see `POST /api/buy` carries `price`. Replay it with a lower price (e.g. `1`) via "Edit and Resend" or curl. The server trusts it and returns an order with the flag (view it under Orders) |
| Crown Jewels | 200 | Decode the `token` cookie and set `role` to `admin`. Default mode: `alg:none` with empty signature. `weakkey` mode: crack the HS256 secret (`secret123`, e.g. hashcat -m 16500 or jwt_tool) and re-sign. Then open `/admin-dashboard` |

Total: 650 points. Override flags with env vars `FLAG_ROBOTS`, `FLAG_FUZZ`, `FLAG_IDOR`, `FLAG_JWT`.

## Files
`server.js` (app) · `mini.js` (tiny HTTP router) · `public/` (front-end) · `wordlist.txt` (for fuzzing)

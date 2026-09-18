# Starlink Hotspot Voucher Management System

Voucher, sales and reporting management for a Starlink-powered MikroTik hotspot.

```
Starlink → MikroTik router → outdoor access point(s) → customers
```

MikroTik keeps doing what it is good at: hotspot authentication, user profiles,
bandwidth control, live sessions and accounting. This application manages the
business around it — voucher stock, generation and import, packages, sales,
sellers, locations, routers, reporting and audit — and synchronises with each
router over the RouterOS API.

**If this application is offline, hotspot customers keep signing in normally.**
Authentication never depends on the dashboard being reachable.

Design notes, schema relationships and RouterOS version considerations are in
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## Requirements

- Node.js 20+
- MongoDB 6 or 7
- A MikroTik router with the API service enabled (`/ip service enable api`)

## Getting started

```bash
npm install

cp server/.env.example server/.env
# Generate two real keys and paste them in:
openssl rand -hex 32   # -> ROUTER_SECRET_KEY
openssl rand -hex 32   # -> VOUCHER_SECRET_KEY
# Also set a long random JWT_SECRET.

npm run seed     # creates the packages, a "Main Site" location and one admin
npm run dev      # API on :4000, UI on :5173
```

The seeded administrator uses `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` from
`server/.env`. Change that password at first sign-in. Re-running the seed never
overwrites an existing administrator.

### Connecting your MikroTik

1. On the router, create a dedicated API user rather than reusing `admin`:
   ```
   /user group add name=voucher-api policy=api,read,write,test
   /user add name=voucher-api group=voucher-api password=<a long password>
   /ip service enable api
   ```
2. In the app: **Routers → Add router**, enter the host, port 8728 (or 8729 with
   TLS), and those credentials. The password is encrypted before storage and is
   never sent to the browser.
3. Press **Test**. On success the router's identity and RouterOS version appear.
4. Press **Sync** to pull the active list and accounting counters.

## Tests

```bash
npm test
```

Unit tests (parser, RouterOS wire format, durations, crypto, code generation)
run with no external services. The integration suite drives the real Express app
end to end and needs a MongoDB; it starts an in-memory server automatically, or
uses `MONGODB_TEST_URI` if you set it. Without a reachable database those tests
**skip** rather than fail.

```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/voucher_test npm test
```

## Importing existing vouchers

Import accepts the MikroTik command form you already have:

```
/ip hotspot user add name=D4BKB3UD password=D4BKB3UD profile="VOUCHER-24H-1CODE" limit-uptime=24h
```

as well as CSV and JSON. The file is parsed and validated in full, and you are
shown the counts before anything is written:

```
Found: 1,000    Valid: 995    Duplicates: 3    Invalid: 2
```

Only on confirmation are the valid rows inserted, under a traceable batch
reference such as `IMP-2026-00125`. Imports are never silently partial.

Only `/ip hotspot user add` is accepted, and only a fixed set of properties.
Imported text is parsed into structured fields — it is never executed, and never
reaches a shell.

## What this system does and does not claim

- **Live network state** (Active Users, the online count) is read directly from
  `/ip hotspot active` on each router. If a router is unreachable it is listed as
  degraded rather than being silently dropped from the totals.
- **Historical usage** comes from MikroTik accounting collected on a poll, so it
  is accurate to the sync interval and labelled as accounting data.
- A voucher that has never been synced reports **unknown**, not zero.
- Access points are inventory records. Most outdoor APs bridge traffic and expose
  nothing to query, so no per-AP statistics are invented.

## Security

- Operator passwords: bcrypt, one-way.
- Voucher and router passwords: AES-256-GCM at rest. A voucher password must be
  reproducible — it is printed on the card and pushed verbatim to
  `/ip hotspot user` — so hashing it is not possible. The tradeoff and its
  handling are set out in ARCHITECTURE.md section 8.
- Router credentials never leave the backend.
- JWT with expiry, role-based authorization, zod validation on every input,
  helmet, CORS allowlist, per-route rate limiting, Mongo operator stripping,
  audit logging, and errors that never leak a stack trace to a user.
- Passwords and router credentials are stripped from log output at every depth.

## Roles

| | Seller | Admin | Super admin |
|---|---|---|---|
| Sell vouchers, see own sales | ✓ | ✓ | ✓ |
| Manage vouchers, packages, sellers, routers | | ✓ | ✓ |
| Reports and audit log | | ✓ | ✓ |
| Create admins, delete routers and vouchers | | | ✓ |

---

## Deploying on Vercel

`vercel.json` builds the frontend as a static site and runs the API as a single
catch-all serverless function (`api/[...slug].ts`), which hands the request to
the same Express app used everywhere else.

### Environment variables

The same variables as any other host — `MONGODB_URI`, `JWT_SECRET`,
`ROUTER_SECRET_KEY`, `VOUCHER_SECRET_KEY`, `SEED_ADMIN_USERNAME`,
`SEED_ADMIN_PASSWORD` — plus one more:

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | Guards `/api/cron/sync`. Vercel sends it as `Authorization: Bearer <value>` on scheduled invocations. |

Set `CRON_SECRET` to a long random value (`openssl rand -hex 32`). Without it the
sync route refuses to run at all, rather than running unauthenticated.

Seeding has no shell on Vercel, so run it from your own machine with the
production `MONGODB_URI` exported:

```bash
cd server && MONGODB_URI="<your atlas string>" \
  ROUTER_SECRET_KEY=... VOUCHER_SECRET_KEY=... JWT_SECRET=... \
  SEED_ADMIN_USERNAME='<your admin username>' SEED_ADMIN_PASSWORD='<your admin password>' \
  NODE_ENV=production node dist/seed.js
```

### What serverless costs you here

Vercel has no long-running process, which this application did rely on. The
consequences, in order of how much they matter:

1. **Session history and usage accounting become cron-driven.** On a normal host
   a worker polls every router each minute and opens/closes `Session` records
   from the differences. On Vercel that worker cannot exist, so `/api/cron/sync`
   does one pass per scheduled invocation. **Vercel's cron granularity depends on
   your plan** — on Hobby it is effectively once per day, which makes session and
   usage figures close to worthless. Minute-level scheduling needs Pro. Check
   which you are on before relying on any usage number. The default schedule in
   `vercel.json` is every 5 minutes, which only takes effect on a plan that
   allows it.
2. **Rate limiting degrades.** `express-rate-limit` counts in memory, and each
   serverless instance has its own. The login throttle therefore limits per
   instance rather than globally. It still helps, but it is no longer a hard
   ceiling; a shared store (Redis) would be needed for that.
3. **Router connections are not pooled.** The pool keeps one connection per
   router alive across requests. On serverless each cold invocation reconnects,
   which adds a round trip over an already high-latency satellite link.
4. **Uploads are capped** at roughly 4.5 MB by the platform, so the import limit
   is set to 4 MB. A 10,000-line MikroTik command file is around 1 MB, so this is
   not a practical constraint.

None of this affects hotspot customers. MikroTik authenticates them regardless.

### Reaching the router still applies — more so

The CGNAT problem described in the Render section is unchanged: a cloud function
cannot dial into a router that has no inbound public address. If anything it is
worse on serverless, because there is no persistent process that could hold a
tunnel open. If you need Active Users, Sync and Push to work, run this on a host
that sits on the same network as the router, or on a VPS the router dials out to
over WireGuard.

---

## Deploying on Render

The repository includes `render.yaml`, which defines a single web service that
serves both the API and the interface. One service means no CORS configuration
and no separate static-site rewrites.

### Environment variables

Set these in the Render dashboard (`render.yaml` marks them `sync: false`, so
Render prompts for them on the first deploy):

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your Atlas connection string, **including the database name** |
| `ROUTER_SECRET_KEY` | `openssl rand -hex 32` |
| `VOUCHER_SECRET_KEY` | `openssl rand -hex 32` (a different one) |
| `SEED_ADMIN_USERNAME` | The first administrator's username |
| `SEED_ADMIN_PASSWORD` | A strong password, changed at first sign-in |

`JWT_SECRET` is generated by Render. `NODE_ENV`, `PORT` and the sync settings are
handled by the blueprint — Render supplies `PORT` itself, and the server uses it.

**The two encryption keys must never change.** Every router and voucher password
already stored is encrypted under them; rotating one makes those unreadable. The
server refuses to start in production if either is missing or malformed, rather
than falling back to a placeholder, so a missing variable fails the deploy
loudly instead of silently encrypting real credentials under a known key.

### Atlas connection string

Take the SRV string from Atlas and add the database name before the `?`:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/voucher_billing?retryWrites=true&w=majority
```

Without `/voucher_billing` the driver connects to `test`. If the password
contains `@`, `/`, `:` or `#`, percent-encode it. In Atlas under **Network
Access**, Render's outbound addresses are not fixed on the lower plans, so
either allow `0.0.0.0/0` (the database is still protected by its own
credentials) or use Render's static outbound IPs where your plan provides them.

### First deploy

1. Push this branch and point Render at the repository; it picks up `render.yaml`.
2. Fill in the variables above and deploy.
3. Seed the packages, the default location and the first administrator by
   running this once in the Render shell:
   ```bash
   cd server && node dist/seed.js
   ```
   It reads the same environment variables as the service. Re-running it never
   overwrites an existing administrator.
4. Sign in, change that password, then add your router.

The health check is `/health/live`, which reports only that the process is up.
`/health` additionally reports database connectivity; it is deliberately *not*
the health check path, so a brief Atlas blip does not cause Render to redeploy a
service that is otherwise healthy.

### Reaching the MikroTik from Render — read this before you rely on it

Everything that does not touch the router works on Render immediately: voucher
generation and import, packages, sales, sellers, locations, reporting, printing
and exports.

The features that *do* talk to the router — **Test, Sync, Push, Active Users**
and live usage figures — need the backend to open a TCP connection **to** the
router on port 8728. A Starlink standard/residential connection places the
router behind carrier-grade NAT, so it has no inbound public IPv4 address and a
cloud service cannot dial into it. Starlink does provide routable IPv6, but that
does not bridge the gap while Render's outbound path is IPv4.

Check your own plan first, then pick one of:

- **Run the management app on-site** (or on a machine on the same network as the
  router) and use Render only if you later add remote access. Simplest, and the
  local network path is faster than a satellite round trip anyway.
- **Have the router dial out to a VPN** — RouterOS 7 has a WireGuard client — and
  run this application on a small VPS that terminates that tunnel. The router
  initiates the connection, so CGNAT stops mattering.
- **A Starlink plan with a public IP** (the Priority/Business tiers offer this as
  an option), then port-forward 8728/8729 — and if you do, restrict it by source
  address and prefer `api-ssl` on 8729, because the plain API port should not be
  exposed to the open internet.

Until one of those is in place, the router-facing pages will show the router as
offline. That is the designed behaviour, not a failure: an unreachable router is
reported as degraded, the voucher and sales side keeps working, and — most
importantly — **hotspot customers keep authenticating against MikroTik the whole
time**, because that never depended on this application.

### A note on idle instances

The background sync worker only runs while an instance is running. On a plan
that spins down when idle, session history and usage figures will have gaps for
the periods the service was asleep. If accurate accounting matters, use a plan
that stays warm.

## Layout

```
server/   Express + TypeScript API, Mongoose models, MikroTik service, sync worker
client/   React + TypeScript + Vite + Tailwind, white-and-black interface
```

The interface is a single monochrome theme — white background, black text — which
is also what makes voucher cards print cleanly on any printer.

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

## Layout

```
server/   Express + TypeScript API, Mongoose models, MikroTik service, sync worker
client/   React + TypeScript + Vite + Tailwind, white-and-black interface
```

The interface is a single monochrome theme — white background, black text — which
is also what makes voucher cards print cleanly on any printer.

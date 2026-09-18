# Starlink Hotspot Voucher Management System — Architecture

MikroTik stays the authority for hotspot authentication, bandwidth control and live
session state. This application is a management plane on top of it: vouchers,
packages, sales, sellers, reporting, and synchronisation. If this app goes down,
hotspot customers keep authenticating against MikroTik exactly as before.

---

## 1. Project structure

```
voucher-billing/
├── server/                        # Node + TypeScript + Express API
│   ├── src/
│   │   ├── config/                # env loading, mongo connection, logger
│   │   ├── models/                # Mongoose schemas (no business logic)
│   │   ├── services/
│   │   │   ├── mikrotik/          # RouterOS API client, pool, credential crypto
│   │   │   ├── parser/            # MikroTik command / CSV / JSON parsers
│   │   │   ├── voucherGenerator.ts
│   │   │   ├── voucherImporter.ts
│   │   │   ├── syncService.ts     # router <-> mongo reconciliation
│   │   │   ├── dashboardService.ts
│   │   │   └── auditService.ts
│   │   ├── controllers/           # thin: validate -> service -> respond
│   │   ├── routes/                # REST surface
│   │   ├── middleware/            # auth, rbac, validation, errors, rate limit
│   │   ├── workers/               # background sync loop
│   │   ├── utils/
│   │   └── tests/
└── client/                        # React + TypeScript + Vite + Tailwind
    └── src/
        ├── api/                   # the ONLY place fetch() is called
        ├── components/            # shared UI primitives
        ├── pages/                 # one file per nav item
        ├── hooks/
        └── lib/
```

Rule enforced throughout: models hold no business logic, controllers hold no
MikroTik calls, and the frontend never learns a router credential.

---

## 2. Collections and relationships

| Collection    | Purpose | Key links |
|---------------|---------|-----------|
| `users`       | Admins / sellers, password hashed with bcrypt | `locationId` |
| `locations`   | Physical hotspot sites | parent of routers, APs, vouchers |
| `routers`     | MikroTik devices, password encrypted at rest (AES-256-GCM) | `locationId` |
| `accesspoints`| APs behind a router (may expose little data) | `locationId`, `routerId` |
| `packages`    | Sellable plans mapped to a MikroTik profile | — |
| `vouchers`    | The core record | `packageId`, `routerId`, `locationId`, `importBatchId`, `sellerId`, `saleId` |
| `sessions`    | Historical, append-only session/accounting records | `voucherId`, `routerId`, `locationId` |
| `sales`       | One sale per voucher handover | `voucherId`, `packageId`, `sellerId`, `locationId` |
| `importbatches`| Provenance + summary of every bulk import | `createdBy` |
| `auditlogs`   | Who did what, when | `userId` |

```
Location 1─* Router 1─* AccessPoint
Location 1─* Voucher *─1 Package
Voucher  1─* Session          (append-only history)
Voucher  1─1 Sale *─1 Seller(User)
ImportBatch 1─* Voucher
```

A voucher's `status` in Mongo is a *management* state (AVAILABLE / ACTIVE /
EXPIRED / USED / DISABLED). Whether a customer is on the network *right now* is
answered only by `/ip/hotspot/active` on the router.

---

## 3. MikroTik integration

- Single isolated layer: `services/mikrotik/`. Nothing else opens a socket.
- `RouterOsClient` speaks the binary RouterOS API (port 8728, or 8729 with TLS)
  and exposes typed verbs: `testConnection`, `identity`, `health`, `listProfiles`,
  `addHotspotUser`, `getHotspotUser`, `updateHotspotUser`, `disableHotspotUser`,
  `removeHotspotUser`, `listActive`, `disconnectActive`, `listUsersWithAccounting`.
- `RouterPool` caches one connection per router with a TTL, so the dashboard does
  **one** round trip per router per refresh instead of one per widget.
- Router passwords are stored encrypted (`ROUTER_SECRET_KEY`, AES-256-GCM) and
  decrypted only in memory inside this layer.
- Every call is wrapped so an offline or unauthenticated router degrades to a
  typed `RouterUnavailableError` — the UI shows "router offline", never a stack trace.
- Writes are queued in batches (default 100 users per flush) so pushing 1,000
  generated vouchers does not stall the API process.

### RouterOS version notes (not invented — these are the real differences)

- **API port**: 8728 plaintext, 8729 api-ssl. The `api` service must be enabled
  (`/ip service enable api`). This is unchanged from v6 through v7.
- **v6 vs v7 path syntax**: the binary API uses `/ip/hotspot/user/add` style
  sentences in both, but v7 renamed some REST paths. We use the binary API
  everywhere to avoid that divergence.
- **REST API** (`/rest/...`) exists only in **RouterOS v7**. We do not depend on it.
- **`limit-uptime` / `limit-bytes-total`** are properties of `/ip/hotspot/user` in
  both v6 and v7. Per-user accounting counters (`bytes-in`, `bytes-out`,
  `uptime`) are only populated when `/ip hotspot user profile` has accounting
  left at its default (`yes`). If an operator disables accounting we cannot
  report historical usage and the UI says so rather than showing zeros as fact.
- **`.id` values are not stable across reboots** in v6, so we key on `name`
  (the voucher username) and treat `.id` as a per-connection handle only.

---

## 4. Voucher import parser

The importer never touches a shell. Flow:

1. Upload (multer, memory storage, size-capped).
2. Detect format: `.txt` (RouterOS commands), `.csv`, `.json`.
3. **TXT**: each line is tokenised by a small RouterOS-sentence lexer that handles
   quoted values (`profile="VOUCHER-24H-1CODE"`). The result must match the
   whitelist — command path `/ip hotspot user add` only, and properties only from
   `{name, password, profile, limit-uptime, limit-bytes-total, comment, server, disabled}`.
   Anything else is an *invalid row with a reason*, never executed.
4. Validate: name present, charset-safe, uptime parseable (`1d2h30m`), no duplicates
   inside the file, no collisions with existing `vouchers.code`.
5. Produce a **preview** persisted as an `ImportBatch` in `PENDING` state, holding
   counts plus the parsed rows.
6. Admin confirms → bulk `insertMany(..., {ordered:false})` in chunks of 500,
   batch flipped to `COMPLETED` with final counts. Nothing is written before
   confirmation, so there is never a silent partial import.

---

## 5. API surface

`POST /api/auth/login|logout|me` · `GET/POST /api/vouchers` ·
`POST /api/vouchers/generate` · `POST /api/vouchers/import/preview|:batchId/confirm` ·
`GET /api/vouchers/:id` · `PATCH /api/vouchers/:id` · `POST /api/vouchers/:id/disable` ·
`GET /api/vouchers/:id/sessions` · `GET /api/vouchers/export` ·
`GET /api/active-users` · `POST /api/active-users/:id/disconnect` ·
`GET/POST /api/packages` · `GET/POST /api/sales` · `GET /api/reports/*` ·
`GET/POST /api/routers` · `POST /api/routers/:id/test|sync` ·
`GET/POST /api/locations` · `GET/POST /api/access-points` ·
`GET/POST /api/sellers` · `GET /api/dashboard` · `GET /api/audit-logs`

Every mutating route: zod schema validation → RBAC check → service → audit log.

---

## 6. Real-time vs historical data

**Real-time** (`GET /api/active-users`): read straight from `/ip/hotspot/active` on
each enabled router, merged and annotated with the matching voucher. Marked
`source: "router"` in the response. If a router is unreachable it appears in a
`degraded[]` array — we never silently return a shorter list.

**Historical** (`sessions`): the background worker polls every router on an
interval. It diffs the active list against the previous poll:
- new username → open a `Session`
- vanished username → close it, writing final `uptime`, `bytes-in`, `bytes-out`
  read from `/ip/hotspot/user` accounting counters.
Closed sessions are never overwritten. Because this is poll-based, usage is
accurate to the poll interval and the API labels totals `source: "accounting"`
with `lastSyncedAt`; a voucher never synced reports `null`, not `0`.

---

## 7. Implementation phases

1. Setup, Mongo, auth, models ✔
2. Voucher generation, import, listing, details ✔
3. MikroTik service, routers, active users, disconnect ✔
4. Session/accounting worker ✔
5. Packages, sales, sellers ✔
6. Dashboard, reports, charts ✔
7. Locations, access points, multi-router ✔
8. Printing, CSV export, audit logs, hardening ✔

---

## 8. Security posture and the password tradeoff

MikroTik hotspot vouchers must be reproducible: the printed card has to show the
code a customer types, and the same value is pushed to `/ip hotspot user`. A
one-way hash cannot satisfy that. So voucher passwords are stored **encrypted
with AES-256-GCM** under `VOUCHER_SECRET_KEY`, decrypted only when printing or
pushing to a router, and never in an API list response. Operator passwords are a
different case entirely and are bcrypt-hashed one-way. Router credentials use the
same envelope encryption as vouchers under a separate key.

Also in place: helmet, CORS allowlist, per-route rate limiting, zod validation on
every input, `mongo-sanitize` against operator injection, JWT with expiry,
audit logging of every sensitive action, and an error handler that returns
human-readable messages while stack traces go only to the server log.

---

## 9. Performance

Server-side pagination everywhere (`page`/`limit`, capped at 200). Indexes exactly
as listed in the brief and no more. Bulk writes chunked. Dashboard aggregates via
a single `$facet` pipeline plus one pooled router call. Designed for 100k+
vouchers and a long session history.

---

## 10. UI

Strict monochrome: white background, black text, grey hairline borders. No colour
accents, no dark mode. Responsive down to phone width, because the operator will
often manage this from a handset.

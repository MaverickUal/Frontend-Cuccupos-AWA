# Codebase Summary

CuccuPOS — a coffee-shop point-of-sale web app for staff. React + TypeScript SPA backed by Firebase (Authentication + Realtime Database).

This file describes **how the code is organised**. For what the system *does* and the rules that govern it, see [`system_summary.md`](./system_summary.md). For the database schema and security rules, see [`src/lib/firebase_structure.md`](./src/lib/firebase_structure.md).

---

## Stack

| Concern | Choice | Version |
|---|---|---|
| UI | React | 18.3 |
| Language | TypeScript (strict) | 5.6 |
| Build / dev server | Vite | 5.4 |
| Routing | React Router | 6.28 |
| Styling | Tailwind CSS | 3.4 |
| Components | shadcn/ui (Radix primitives) | — |
| Charts | Recharts | 2.13 |
| Icons | lucide-react | 0.460 |
| Toasts | sonner | 1.7 |
| Backend | Firebase Auth + RTDB | 13.0 |
| Backend (privileged) | Cloud Functions (Node 20) | v2 callable |
| Validation | Zod | 4.6 |
| Tests | Vitest | 2.1 |

~7,350 lines of TypeScript/TSX across 56 source files, of which ~1,610 are tests (10 suites, 200 cases).

---

## Layout

```
├── .env.example          Template for Firebase web config (safe to commit)
├── index.html            Vite entry
├── vite.config.ts        React plugin + "@" → src/ alias
├── vitest.config.ts      Test runner, TZ pinned to UTC
├── components.json       shadcn/ui config
├── database.rules.json   Deployed RTDB rules — source of truth
├── firebase.json         Points at the rules, functions and hosting
│
├── functions/            Cloud Functions (privileged operations)
│   └── src/index.ts      refundOrder, createCashier, setCashierEnabled
│
└── src/
    ├── main.tsx          Router + StoreProvider + Toaster mount
    ├── App.tsx           Route table and role guards
    ├── types.ts          Shared contracts — doubles as the API shape
    ├── index.css         Tailwind layers + olive/cream CSS variables
    ├── vite-env.d.ts     Vite client types (enables import.meta.env)
    │
    ├── store/AppStore.tsx    React context: the single source of truth for pages
    ├── lib/
    │   ├── actions.ts        Every RTDB + Auth call — 31 exports
    │   ├── functionsClient.ts Callables to the Cloud Functions
    │   ├── stats.ts          Date ranges, bucketing, sorting, aggregates
    │   ├── finance.ts        Gross / refunds / net, refundable amount
    │   ├── discounts.ts      Discount maths + statutory basis and open assumptions
    │   ├── duplicates.ts     Product-name normalization + duplicate detection
    │   ├── receipt.ts        Pure single-transaction receipt model + filenames
    │   ├── roles.ts          "admin" → Owner/Manager, "cashier" → Cashier
    │   ├── format.ts         Peso/date formatting + orderNo()
    │   ├── utils.ts          cn() class merger
    │   ├── __tests__/        10 suites, 200 tests
    │   └── firebase_structure.md   Data model + rules + deployment notes
    │
    ├── components/
    │   ├── AppShell.tsx      Sidebar, header, notification bell, logout
    │   ├── RangePicker.tsx   Shared period selector (dashboard + reports)
    │   ├── DiscountPicker.tsx  PWD / Senior Citizen selector
    │   ├── RefundDialog.tsx  Owner/Manager refund with confirmation
    │   ├── ReceiptDialog.tsx  Print + PDF export for one transaction
    │   ├── StatusBadge.tsx   Order status → colour
    │   ├── QuantityStepper.tsx  +/- plus a typed quantity field
    │   ├── MenuImage.tsx     Image with placeholder fallback
    │   ├── Logo.tsx          Placeholder mark
    │   └── ui/               10 shadcn primitives
    │
    ├── pages/
    │   ├── auth/             Login, Register, AuthLayout
    │   ├── customer/         Order (cart + checkout), History
    │   └── admin/            Dashboard, Orders, Menu, Cashiers, Reports
    │
    └── data/seed.ts       Reference seed data (menu, roles)
```

---

## Architecture

Data flows one way and stops at three layers:

```
  page component
      │  useStore()
      ▼
  AppStore (React context)          ← the only state pages see
      │
      ├──────────────► lib/actions.ts          RTDB + Auth
      │                        │
      │                        ▼
      │                 Firebase Auth + Realtime Database
      │
      └──────────────► lib/functionsClient.ts  → Cloud Functions (Admin SDK)
```

**Pages never import Firebase.** That constraint is what made the backend swap possible: the original `localStorage` mock was replaced wholesale without touching a single page's data access.

Privileged operations take a second path through `functionsClient.ts`, because refunds, account creation and account disabling need the Admin SDK and an atomic transaction. Those calls bypass the security rules by design — which is exactly why `orders/.../refunds` is `".write": false` for every client.

### Pure logic modules

`stats.ts`, `finance.ts`, `discounts.ts`, `duplicates.ts`, `receipt.ts` and `roles.ts` have no Firebase import at all. That is what makes the test suite fast and deterministic — no emulator, no credentials. `parseQty` is the one tested export in `components/`, deliberately kept next to the input that uses it.

### Layer 1 — `lib/actions.ts`

Every RTDB and auth call, 31 exports grouped as menu / orders / auth / users. Conventions:

- **Mutations** return `{ success, message, data }`; callers check `success` and surface `message`.
- **Reads** come in pairs: `getX()` for a one-shot fetch and `getXOnce()` — no wait, the pairs are `getXOnce()` (promise) and `getX(callback)` (live subscription returning an unsubscribe function).
- Writes are Zod-validated before hitting the database.
- Queries use `query(ref, orderByChild, equalTo, limitToFirst)` where they apply (menu lookups by name/category).

Two Firebase SDK details the code encodes:

- `set()` for single primitives (`update()` in v9+ throws unless passed an object).
- `flattenOrders()` normalises two shapes into one array, so pages can't tell an admin feed from a cashier feed.

### Layer 2 — `store/AppStore.tsx`

A context holding `users`, `menu`, `orders`, cart, and `currentUser`. Subscriptions are **role-scoped** and re-established when the signed-in user changes:

| Identity | Subscribes to |
|---|---|
| Menu (always) | `/menu` — publicly readable |
| Admin | `/orders` (whole tree) and `/users` |
| Cashier | `/orders/<ownUid>` only |

Cart state stays local to React — it is never persisted.

Exposes `authReady`, which the route guards use to avoid redirecting before Firebase Auth has resolved.

### Layer 3 — pages

Presentational. Each consumes `useStore()` and holds only view-local state (search text, open dialogs, selected period).

---

## Routes

| Path | Guard | Page |
|---|---|---|
| `/login`, `/register` | signed out | Auth |
| `/order` | cashier | Cart + cash checkout with discount |
| `/history` | cashier | Own orders, status tracker, reorder |
| `/admin/dashboard` | admin | KPIs + sales chart + best sellers, cashier filter |
| `/admin/orders` | admin | Order board, status flow, cancel, refund |
| `/admin/menu` | admin | Menu CRUD, sold-out toggle |
| `/admin/cashiers` | admin | Cashier list, create/disable accounts |
| `/admin/reports` | admin | Period report, gross/refunds/net, CSV, print |
| `*` | — | Redirect to home or `/login` |

Guards live in `App.tsx`: `RequireRole`, `PublicOnly`, `RootRedirect`, all gated on `authReady`.

---

## Conventions

- **Path alias** — `@/` maps to `src/` (declared in both `vite.config.ts` and `tsconfig.json`).
- **Types are the contract** — `src/types.ts` mirrors the database exactly. `Order.items` is a `Record<string, OrderItem>`, not an array, because RTDB returns objects.
- **Formatting** — always through `lib/format.ts` (`peso`, `formatDateTime`, `formatDate`, `orderNo`). Raw `toLocaleString` calls in JSX are a smell.
- **Styling** — Tailwind utilities plus `cn()` for conditional classes. Theme colours are CSS variables at the top of `index.css`; there is no dark mode.
- **Icons** — lucide-react only.
- **Money** — rounded to 2 decimals (`money()` in the store, `round2` in the pure modules) to avoid float drift. Never accept a total from a caller; recompute it.
- **Testing** — `npm test` runs 200 unit tests over the pure modules (`stats`, `finance`, `discounts`, `duplicates`, `receipt`, `roles`), the quantity parser, the dashboard filter logic and the order schema. `npm run test:tz` re-runs them in four timezones, because date logic is the most likely thing to break.
- **Where the split is** — the browser owns reads and ordinary writes; Cloud Functions own anything privileged (refunds, account creation, account disabling). If a change needs the Admin SDK or an atomic multi-node check, it belongs in `functions/`, not `actions.ts`.

---

## Things to know before changing things

1. **Orders are nested at `/orders/<customerId>/<orderId>`.** Not stylistic — RTDB rules don't cascade, so a flat collection forces either admin-only reads or leaking every customer's orders. See the rationale in `firebase_structure.md`.
2. **Security rules are the real access control.** The UI hides things, but the database enforces them. Changing the data shape usually means changing `database.rules.json`.
3. **Single-field writes need `set()`, not `update()`.** `update()` throws on a primitive in Firebase v9+.
4. **Order numbers are client-generated** (`ORD-MVC26YJ9`, `makeDisplayId()`). A shared counter would need customers to write to `/counters`, which can't be made safe.
5. **Money is recomputed, never trusted.** `orderSchema` re-derives subtotal, discount and total from the line items and rejects anything that doesn't reconcile. Change the maths in `discounts.ts`, not in the caller.
6. **The discount rate is verified; the eligibility evidence is not.** `DISCOUNT_RATE = 0.2` matches RA 10754 Sec. 32(a)(1) (PWD) and RA 7432 Sec. 5(a) as amended (Senior Citizen), both of which cover a coffee shop. The app does not record the ID proof the law requires to claim the discount as a tax deduction — see the header of `discounts.ts`.
7. **Refunds and cashier disabling now use the client SDK.** They run through `lib/actions.ts` and RTDB rules; Cloud Functions are optional. Client-side checks remain advisory.
8. **The admin feed arrives grouped by cashier**, not chronologically. `sortByCreatedAtDesc` in the store is what fixes the ordering — don't assume `orders` is already sorted at the data layer.
9. **`parseDayInput` rejects impossible dates deliberately.** Re-adding plain `new Date(y, m, d)` reintroduces the silent Feb 31 → Mar 3 bug.
10. **The rules in the repo may be behind what's deployed.** Compare `database.rules.json` with the Firebase console before debugging an access error.

---

## Running it

```bash
npm install
cp .env.example .env.local    # then fill in the Firebase values
npm run dev                   # http://localhost:5173
npm run build                 # tsc --noEmit && vite build
npm test                      # 200 unit tests
npm run test:tz               # same suite across four timezones
```

Build requires zero type errors. The bundle is ~1.29 MB (350 kB gzipped) with no code splitting — Firebase and Recharts dominate it.
# CuccuPOS Frontend

React + TypeScript + Vite + Tailwind CSS + shadcn/ui, backed by **Firebase** (Auth + Realtime Database + Cloud Functions).

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm test           # unit tests (Vitest)
```

## Configuration
Copy `.env.example` to `.env.local` and fill in your Firebase web app values:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_DATABASE_URL=
```
Security rules, the data structure, and the seeding steps live in [`src/lib/firebase_structure.md`](src/lib/firebase_structure.md).

## Deploying the backend

Three operations cannot run from the browser and live in Cloud Functions under `functions/`:

| Function | Why |
|---|---|
| `refundOrder` | Refund validation must be atomic, and the approving admin must come from the verified session |
| `createCashier` | Creating another user's sign-in account needs the Admin SDK |
| `setCashierEnabled` | Disabling an account also needs the Admin SDK, and doesn't cascade to the database |

```bash
npm run deploy:rules      # publish database.rules.json
npm run deploy:functions  # build + deploy functions/
npm run emulators         # local Auth + RTDB + Functions
```

**Refunds and cashier account management do not work until the functions are deployed.** The UI says so plainly instead of pretending the action succeeded.

## Accounts

Staff accounts are created by an Owner/Manager from `/admin/cashiers`, or by
signing up at `/register` — new sign-ups get the **cashier** role. The first
administrator has to be promoted by hand in the Firebase console
(`users/<uid>/role` → `admin`); the app deliberately provides no way to do it.

No credentials are committed to this repository.

## Routes
Only staff sign in — customers are walk-ins and never get accounts.

| Path | Who | What |
|------|-----|------|
| `/login`, `/register` | public | Auth |
| `/order` | cashier | Browse menu, cart, cash checkout with discount and change |
| `/history` | cashier | Own orders, live status, order again |
| `/admin/dashboard` | owner/manager | KPIs + sales chart + best sellers, filterable by cashier |
| `/admin/orders` | owner/manager | Order board, status flow, cancel, refund |
| `/admin/menu` | owner/manager | Add/edit/delete items, sold-out toggle |
| `/admin/cashiers` | owner/manager | Cashier list, create account, disable access |
| `/admin/reports` | owner/manager | Period report, gross/refunds/net, CSV, print |

## Roles
| Value in DB | Shown as | Can do |
|-------------|----------|--------|
| `admin` | Owner/Manager | Everything, including menu, refunds and reports |
| `cashier` | Cashier | Take orders, record cash, apply discounts, see own history |

The `role` values live in `users/<uid>/role` and are enforced by the security
rules in `database.rules.json`. There is deliberately no way to promote an
account to `admin` from the UI.

## Where the data lives
`src/lib/actions.ts` holds **every** database and auth call and returns
`{ success, message, data }` for mutations. Pages never touch Firebase directly —
they go through `useStore()` from `src/store/AppStore.tsx`, which keeps React
state in sync via `onValue` listeners and hands orders over newest-first.

Pure logic lives in modules with no Firebase dependency: `stats.ts` (date ranges,
bucketing, sorting), `discounts.ts` (discount maths), `finance.ts` (gross /
refunds / net). These are what the test suite covers.

Types are in `src/types.ts` and double as the API contract. Zod schemas in
`actions.ts` recompute and reject any monetary value that doesn't reconcile.

## Business rules in the UI
- Cart quantity is clamped to **1–99**. The minus button disables at 1; the trash icon removes an item.
- Sold-out items can't be added to the cart.
- Checkout is still a mock payment: a short "processing" step, then the order is created as `pending`.
- PWD and Senior Citizen discounts are selectable at checkout. **The rate and eligibility rules are unverified assumptions** — see the header of `src/lib/discounts.ts` before going live.
- Refunds are partial-capable, never exceed what was paid, and keep the original order intact.
- Cancelled orders are excluded from all sales figures and cannot be refunded.
- A cashier only ever reads their own orders; only an admin can change order status, refund, or edit the menu.
- Nobody can edit their own role, and an admin cannot disable their own account.

## Testing
```bash
npm test         # 110 unit tests
npm run test:tz  # re-runs them across four timezones
```
Covers date-range boundaries and ordering, timezone handling, order sorting,
discount and change arithmetic, refund validation, and cashier filtering.

## Assets
- Put drink photos in `public/menu/` using the file names in `src/data/seed.ts`. A placeholder shows if one is missing.
- Swap the placeholder logo in `src/components/Logo.tsx` for your real mark.
- Theme colours are CSS variables at the top of `src/index.css`.

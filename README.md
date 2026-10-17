# CuccuPOS Frontend

React + TypeScript + Vite + Tailwind CSS + shadcn/ui, backed by **Firebase** (Auth + Realtime Database).

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Configuration
Copy your Firebase web app credentials into `.env.local`:
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

## Demo accounts
| Role          | Email                | Password     |
|---------------|----------------------|--------------|
| Cashier       | customer@cuccu.test  | password123  |
| Owner/Manager | admin@cuccu.test     | admin123     |

You can also register a new customer from `/register`.

## Routes
Only staff sign in — customers are walk-ins and never get accounts.

| Path | Who | What |
|------|-----|------|
| `/login`, `/register` | public | Auth |
| `/order` | cashier | Browse menu, cart, cash checkout with change |
| `/history` | cashier | Past orders, live status, order again |
| `/admin/dashboard` | owner/manager | KPIs, 7-day sales, best sellers, kitchen queue |
| `/admin/orders` | owner/manager | Order board, status flow, cancel |
| `/admin/menu` | owner/manager | Add/edit/delete items, sold-out toggle |
| `/admin/cashiers` | owner/manager | Cashier list with order count and last order |
| `/admin/reports` | owner/manager | Period report, CSV export, print/PDF |

## Roles
| Value in DB | Shown as | Can do |
|-------------|----------|--------|
| `admin` | Owner/Manager | Everything, including menu and reports |
| `cashier` | Cashier | Take orders, record cash, see own order history |

The `role` values live in `users/<uid>/role` and are enforced by the security
rules in [`src/lib/firebase_structure.md`](src/lib/firebase_structure.md).

## Where the data lives
`src/lib/actions.ts` holds **every** database and auth call, and returns
`{ success, message, data }` for mutations. Pages never touch Firebase directly —
they all go through `useStore()` from `src/store/AppStore.tsx`, which keeps React
state in sync with the RTDB using `onValue` listeners.

Types are in `src/types.ts` and double as the API contract. Zod schemas in
`actions.ts` validate writes before they reach the database.

## Business rules in the UI
- Cart quantity is clamped to **1–99**. The minus button disables at 1; the trash icon removes an item.
- Sold-out items can't be added to the cart.
- Checkout is still a mock: a short fake "processing" step, then the order is created as `pending`.
- Cancelled orders are excluded from all sales figures.
- A cashier only ever reads their own orders; only an admin can change order status or edit the menu.

## Assets
- Put drink photos in `public/menu/` using the file names in `src/data/seed.ts`. A placeholder shows if one is missing.
- Swap the placeholder logo in `src/components/Logo.tsx` for your real mark.
- Theme colours are CSS variables at the top of `src/index.css`.

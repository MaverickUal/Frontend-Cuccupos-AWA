# CuccuPOS Frontend

React + TypeScript + Vite + Tailwind CSS + shadcn/ui. **Frontend only.** All data is mocked.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Demo accounts
| Role     | Email                | Password     |
|----------|----------------------|--------------|
| Customer | customer@cuccu.test  | password123  |
| Admin    | admin@cuccu.test     | admin123     |

You can also register a new customer from `/register`. The login page has "Demo accounts" buttons; delete that block when the backend is connected.

## Routes
| Path | Who | What |
|------|-----|------|
| `/login`, `/register` | public | Auth |
| `/order` | customer | Browse menu, cart, mock checkout |
| `/history` | customer | Past orders, live status, order again |
| `/admin/dashboard` | admin | KPIs, 7-day sales, best sellers, kitchen queue |
| `/admin/orders` | admin | Order board, status flow, cancel |
| `/admin/menu` | admin | Add/edit/delete items, sold-out toggle |
| `/admin/customers` | admin | Customer list with spend and order count |
| `/admin/reports` | admin | Period report, CSV export, print/PDF |

## Where the backend plugs in
`src/store/AppStore.tsx` is the **only** mock data layer. Every page calls `useStore()`.
Replace each function (`login`, `register`, `placeOrder`, `updateOrderStatus`, `saveMenuItem`, …) with an API call
(React Query works well) and the pages keep working. Types are in `src/types.ts`; use them as the API contract.
Seed data lives in `src/data/seed.ts`. Demo data is saved in `localStorage` (key `cuccupos:v1`); clear it to reset.

## Business rules in the UI
- Cart quantity is clamped to **1–99**. The minus button disables at 1; the trash icon removes an item.
- Sold-out items can't be added to the cart.
- Checkout is a mock: a short fake "processing" step, then the order is created as `pending`.
- Cancelled orders are excluded from all sales figures.

## Assets
- Put drink photos in `public/menu/` using the file names in `src/data/seed.ts`. A placeholder shows if one is missing.
- Swap the placeholder logo in `src/components/Logo.tsx` for your real mark.
- Theme colours are CSS variables at the top of `src/index.css`.

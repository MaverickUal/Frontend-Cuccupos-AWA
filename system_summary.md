# System Summary

CuccuPOS — a coffee-shop point-of-sale system for staff. This file describes **what the system does and the rules it obeys**. For code organisation see [`codebase_summary.md`](./codebase_summary.md). For the database schema and security rules see [`src/lib/firebase_structure.md`](./src/lib/firebase_structure.md).

---

## What it is

A single-page web app used by shop staff during trading hours. There is no customer-facing site and no server: customers are walk-ins who pay at the counter, so nobody outside the shop ever signs in.

Two staff roles:

| Role in DB | Shown as | Does |
|---|---|---|
| `cashier` | Cashier | Takes orders, records cash, sees only their own order history |
| `admin` | Owner/Manager | Everything: dashboard, orders, menu, cashiers, reports |

---

## The transaction

The core loop, and the only thing a cashier does all day:

1. **Build the order** — tap `+` on drinks. Sold-out items can't be added.
2. **Enter the cash received** — typed, or one tap from the quick amounts (Exact, ₱200, ₱500, ₱1,000).
3. **Review** — the checkout modal shows the total, the cash tendered, and **the change**, before anything is committed.
4. **Confirm** — the order lands as `pending` and the kitchen is notified.
5. **Owner/Manager advances it**: `pending → preparing → ready → completed`, or `cancelled`.

Order numbers are human-readable (`ORD-MVC26YJ9`) for reading across a counter. The change is repeated on the success screen — *"Return ₱195 change to the customer"* — so it can't be misread.

### Cash only

There is one payment method. The dropdown that used to offer GCash and Card is gone. Every order records `cashTendered` and `changeGiven`, which lets the owner reconcile the drawer at close:

```
Sales collected (cash)   ₱290
Less change given out    ₱0
Less refunds             ₱0
Net in drawer            ₱290
```

### Discounts

PWD and Senior Citizen concessions can be applied at checkout. The cashier selects
one; the screen then shows **subtotal → discount → total → cash → change** before
anything is committed. The order stores `subtotal`, `discountType`,
`discountAmount` and `total` so the arithmetic can be audited later.

> **The rate and eligibility rules are unresolved.** `DISCOUNT_RATE` is set to 20%
> as a configurable placeholder and has **not** been verified against Philippine
> requirements. No ID verification is implemented — the cashier asserts
> eligibility and the reason is stored on the order. All four assumptions are
> listed in the header of `src/lib/discounts.ts`. **Confirm them with the business
> owner before going live.**

### Refunds

An Owner/Manager can refund an order fully or partially from the order details
dialog. The dialog shows the amount already refunded and the remaining refundable
balance, requires a reason, and asks for confirmation. Refunds cannot exceed what
was paid, duplicates are rejected, and the original order is never deleted.

Refunds are recorded **only after cash has actually been handed back** — the
write happens in a Cloud Function transaction, not optimistically in the UI.

---

## Screens

| Screen | Purpose |
|---|---|
| **Dashboard** | Sales/order/average for a chosen period, sales chart, best sellers, recent orders — filterable by cashier |
| **Orders** | Every order newest-first with status filters and search; advance status, cancel, view details, refund |
| **Menu** | Add, edit, delete items; sold-out toggle |
| **Cashiers** | Each cashier's order count and last order; create accounts, disable access |
| **Reports** | Period report — gross / refunds / net, chart, category split, top items, refund audit, CSV export, print/PDF |
| **Order** (cashier) | Menu browse, cart, cash checkout with discount |
| **History** (cashier) | Own orders newest-first, live status bar, reorder |

### Filtering the dashboard by cashier

The Owner/Manager can scope the whole dashboard to one cashier. The selector is
populated from user records and matches on the cashier's **user id**, never the
display name, so two cashiers sharing a name cannot have their histories merged.
KPIs, the sales chart, best sellers and recent orders all follow the selection
together with the date range. Cancelled orders still contribute nothing.

### The period picker

Dashboard and Reports share one control (`RangePicker`), so they behave identically:

| Choice | Chart buckets |
|---|---|
| Today | **by hour** — `12am, 1am, …` |
| Last 7 days | by day |
| Last 30 days | by day |
| Custom range | by day, from/to date pickers for any past dates |

Choosing today (including via Custom) switches to hourly automatically. KPIs and percentage deltas follow the same window, comparing against the immediately preceding period of equal length. Empty buckets render as real zeroes rather than being squeezed out of the axis.

---

## Business rules

| Rule | Where it's enforced |
|---|---|
| Cart quantity is 1–99 | `QuantityStepper` disables at the bounds; store clamps |
| Sold-out items cannot be ordered | Client checks `available`; store rejects |
| Orders always start `pending` | `orderSchema` and the security rules both reject any other status at creation |
| Cancelled orders count as zero everywhere | `validOrders()` filters them out of all sales figures |
| Cancelled orders cannot be refunded | Refund function rejects them |
| Orders are never deleted | Cancelled or refunded, to preserve the sales record |
| Cashier sees only their own orders | Path scoping + security rules |
| Only admins change menu or order status | Security rules |
| Only admins approve refunds | Cloud Function re-reads the caller's role |
| Refunds never exceed what was paid | Atomic check in the refund function |
| Only admins create or disable accounts | Cloud Functions |
| A user cannot change their own role | `role` validation rule |
| Nobody self-promotes to admin | `role` validation rule, and there is no UI to do it |
| An admin cannot disable their own account | Guarded in the function and the UI |
| Discount applied at most once | Recomputed from line items, never accepted from the caller |

---

## Data model

Three top-level nodes. Full detail in `firebase_structure.md`.

```
users/<uid>                 name, email, role, createdAt, disabled?
menu/<itemId>               name, price, description, category, tag, image, available
orders/<customerId>/<id>    customerId, customerName, displayId, items{}, subtotal?,
                            discountType?, discountAmount?, total, paymentMethod,
                            cashTendered?, changeGiven?, refunds{}, refundedTotal?,
                            status, createdAt, note?
```

Every field marked `?` is optional, so orders written before a feature existed
still load and still appear in reports.

Three decisions worth knowing:

**Orders are nested under the customer id.** RTDB security rules don't cascade, and they can't filter per query result. A flat `/orders` collection would force a choice between "only admins can read it" and "every cashier reads everyone's orders". Nesting sidesteps both: a cashier reads `/orders/<ownUid>`, an admin reads the whole tree.

**Order items are a map keyed by menu item id**, not an array — RTDB returns objects, and the key gives O(1) lookup.

**Refunds are appended to the order, never written over it.** `orders/<id>/refunds/<refundId>` holds one record per refund with amount, reason, timestamp and the approving admin. No client can write there at all; only the Cloud Function's Admin SDK can, which is what makes the audit trail trustworthy. The order's own `total` and `createdAt` are never modified.

---

## Security model

Firebase Auth owns credentials; the RTDB stores no passwords. Access is decided by the database rules, not the UI.

| Resource | Public | Cashier | Admin |
|---|---|---|---|
| `menu` | read | read | read + write |
| `orders` | — | read/write own subtree | read + write all |
| `orders/…/refunds` | — | — | **no client access at all** |
| `users` | — | read/write own profile | read + write all |

Validation lives in the rules too: prices must be positive, order totals positive, item quantities 1–99, and an order's `customerId` must match the path it sits under.

Refunds are deliberately `".write": false` for every client. They can only be written by the Cloud Function's Admin SDK, which bypasses the rules — that is precisely what makes the refund record trustworthy, since no browser code can fabricate one.

**The rules are the security boundary.** Hiding a button in React protects nothing.

---

## Known gaps

Stated plainly rather than buried:

1. **Prices are still client-supplied.** The schema now recomputes subtotal, discount and total from the line items and rejects a mismatch, and the rules cap quantity at 1–99 — but nothing checks `items[].price` against the live menu. A modified client could send `price: 1` for a ₱80 drink. Closing this properly means computing orders server-side in a Cloud Function, which would move order creation off the current path. **Not acceptable once real money is involved; acceptable while payment is a mock.**

2. **The discount rate is unverified.** 20% is a configurable placeholder, not a confirmed legal rate. No ID verification is implemented. See `src/lib/discounts.ts`.

3. **Cloud Functions are written but not deployed.** Refunds and cashier account management exist and compile, but are inert until `npm run deploy:functions` runs. Until then the UI reports the feature as unavailable rather than simulating it.

4. **An admin can still demote themselves.** The rules stop a cashier self-promoting and the account-management function refuses self-disabling, but an admin editing their own `role` directly is allowed by the rules. There is no UI that does it, so it only matters if someone edits the database by hand.

5. **No integration or emulator tests.** The pure logic is covered by 110 unit tests, but the Cloud Functions and the security rules are only verified by compiling and by manual browser checks against the live database.

6. **Orders never paginate properly.** The board caps at 100 rows and says so; older orders are still reachable by search.

7. **No offline support.** Losing connection mid-shift means losing the cart and failing checkouts.

---

## Accounts

No credentials are stored in this repository. Staff accounts come from three
places:

| Source | Resulting role |
|---|---|
| Sign-up at `/register` | `cashier` |
| Created by an Owner/Manager at `/admin/cashiers` | `cashier` |
| Hand-edited in the Firebase console | `admin` — the only way to make an administrator |

New accounts register at `/register` with the `cashier` role. An Owner/Manager can
also create cashier accounts from `/admin/cashiers`, which goes through a Cloud
Function because creating another user's sign-in needs the Admin SDK. Promoting
someone to `admin` has to be done by hand in the Firebase console — the rules
deliberately prevent the app from granting it.

---

## Deploying

Static build — any static host works (Firebase Hosting, Vercel, Netlify).

```bash
npm run build               # → dist/ (static frontend)
npm run deploy:rules        # publish database.rules.json
npm run deploy:functions    # build + deploy the Cloud Functions
```

The frontend is a static bundle and can go on any static host. The two deploy
commands are separate and both are required — the static build alone will not
make refunds or account management work.

Set the `VITE_FIREBASE_*` environment variables on the host; see `.env.example`. Because the values are baked in at build time, rebuild when they change.

Editing `database.rules.json` locally changes nothing until it is published.
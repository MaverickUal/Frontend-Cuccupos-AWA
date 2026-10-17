# CuccuPOS — Firebase Realtime Database Structure

## Overview

This document describes the Firebase Realtime Database (RTDB) data model and security rules for the CuccuPOS system. It replaces the current mock `localStorage` layer (`src/store/AppStore.tsx`) with a real backend while keeping the same TypeScript contracts (`src/types.ts`).

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Firebase Auth for authentication** | Passwords are never stored in the database. Firebase Auth handles email/password sign-in, and the RTDB stores only profile data. |
| **Users keyed by Firebase Auth UID** | The `users` node uses the Firebase Auth UID as the key, not a custom ID. This simplifies security rules and avoids a separate lookup. |
| **Orders keyed by customer, then push ID** | `/orders/<customerId>/<pushId>`. Nesting by customer is what lets a cashier read only their own orders under non-cascading RTDB rules. A client-generated `displayId` (`ORD-…`) is stored alongside for staff to read out. |
| **Menu is publicly readable** | Customers browse the menu before logging in. Only admins can modify it. |
| **Order items stored as a map** | RTDB handles objects better than arrays. Each item is keyed by `menuItemId` for O(1) lookup. |
| **No cascading deletes** | Orders are never deleted — they are cancelled (status change) to preserve sales records. |

---

## Data Structure

```json
{
  "users": {
    "<firebaseAuthUid>": {
      "name": "Cashier name",
      "email": "cashier@example.com",
      "role": "cashier",
      "createdAt": "2026-01-05T00:00:00.000Z"
    }
  },

  "menu": {
    "m_1": {
      "name": "Iced Americano",
      "price": 80,
      "description": "Pure espresso with chilled water.",
      "category": "Coffee",
      "tag": null,
      "image": "/menu/iced-americano.jpg",
      "available": true
    },
    "m_2": {
      "name": "Classic Milk Tea",
      "price": 95,
      "description": "Smooth and creamy milk tea.",
      "category": "Milk Tea",
      "tag": null,
      "image": "/menu/classic-milk-tea.jpg",
      "available": true
    },
    "m_6": {
      "name": "Matcha",
      "price": 105,
      "description": "Premium matcha with fresh milk.",
      "category": "Others",
      "tag": "Non-coffee",
      "image": "/menu/matcha.jpg",
      "available": true
    }
  },

  "orders": {
    "<customerUid>": {
      "-Nabc123def456": {
        "customerId": "<customerUid>",
        "customerName": "Juan Dela Cruz",
        "displayId": "ORD-MJ2K9XQ",
        "items": {
          "m_1": {
            "menuItemId": "m_1",
            "name": "Iced Americano",
            "price": 80,
            "qty": 2,
            "category": "Coffee"
          },
          "m_6": {
            "menuItemId": "m_6",
            "name": "Matcha",
            "price": 105,
            "qty": 1,
            "category": "Others"
          }
        },
        "total": 265,
        "paymentMethod": "Cash",
        "status": "pending",
        "createdAt": "2026-01-10T08:30:00.000Z",
        "note": "Less ice"
      }
    }
  }
}
```

---

## Node Details

### `users/<uid>`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `email` | string | Email (for display; Firebase Auth handles actual auth) |
| `role` | `"cashier"` \| `"admin"` | Role-based access control. `admin` is the owner/manager; `cashier` takes orders at the counter. |
| `createdAt` | string (ISO 8601) | Account creation timestamp |

> **Note:** The `password` field from the current mock `User` type is intentionally omitted. Firebase Auth manages credentials. The `email` here is for display and profile lookup only.

### `menu/<itemId>`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Item name |
| `price` | number | Price in PHP (must be > 0) |
| `description` | string | Short description |
| `category` | `"Coffee"` \| `"Milk Tea"` \| `"Frappe"` \| `"Others"` | Menu category |
| `tag` | string \| null | Optional badge (e.g. `"Non-coffee"` for Others category) |
| `image` | string \| null | Path or URL to item image |
| `available` | boolean | Whether the item can be ordered |

### `orders/<customerId>/<pushId>`

| Field | Type | Description |
|-------|------|-------------|
| `customerId` | string | Firebase Auth UID of the customer. Redundant with the path by design: the rules cross-check the two so a mismatched body is rejected, and admin views read the field without a lookup. |
| `customerName` | string | Denormalized for display (avoids a join) |
| `displayId` | string | Human-readable order number, e.g. `ORD-MJ2K9XQ` |
| `items` | map | Order line items keyed by `menuItemId` |
| `total` | number | Order total in PHP |
| `paymentMethod` | `"Cash"` \| `"GCash"` \| `"Card"` | Payment method |
| `status` | `"pending"` \| `"preparing"` \| `"ready"` \| `"completed"` \| `"cancelled"` | Order status |
| `createdAt` | string (ISO 8601) | Order placement timestamp |
| `note` | string \| null | Optional kitchen note |

#### `orders/<customerId>/<pushId>/items/<menuItemId>`

| Field | Type | Description |
|-------|------|-------------|
| `menuItemId` | string | Reference to `menu/<itemId>` |
| `name` | string | Denormalized item name at time of order |
| `price` | number | Denormalized price at time of order |
| `qty` | number | Quantity (1–99) |
| `category` | string | Denormalized category |

### `orders/<customerId>/<pushId>/displayId`

A human-readable order number generated on the client at creation time, e.g.
`ORD-MJ2K9XQ`. It exists purely so staff can read an order number over the counter;
the push key remains the real identifier.

---

## Deploying these rules

The rules live in **`database.rules.json`** at the repo root (the source of truth).
The copy below is kept for reference. Deploy with:

```bash
npm run deploy:rules      # firebase deploy --only database
```

A local file edit does **not** change the deployed rules — the console must be
published (or the command above run) for anything here to take effect.

---

## Security Rules

> **Why orders are nested under the customer id.** RTDB rules do **not** cascade
> downward, and they cannot be written per-result for a query. A `.read` on
> `/orders/$orderId` does **not** grant read on `/orders`, so a flat `/orders`
> collection forces an all-or-nothing choice: either only admins can read the
> collection (cashiers see nothing), or everyone reads everyone's orders.
> Storing orders at `/orders/<customerId>/<orderId>` avoids the conflict — a
> cashier reads `/orders/<ownUid>` via the child rule, an admin reads all of
> `/orders` via the parent rule, and neither can reach the other's data.

```json
{
  "rules": {
    "users": {
      ".read": "auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin'",
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('users/' + auth.uid + '/role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === $uid || root.child('users/' + auth.uid + '/role').val() === 'admin')",
        "role": {
          ".validate": "newData.isString() && (newData.val() === 'cashier' || root.child('users/' + auth.uid + '/role').val() === 'admin')"
        },
        "email": {
          ".validate": "newData.isString() && (newData.val() === auth.token.email || root.child('users/' + auth.uid + '/role').val() === 'admin')"
        },
        ".validate": "newData.hasChildren(['name', 'email', 'role', 'createdAt'])"
      }
    },
    "menu": {
      ".read": true,
      "$itemId": {
        ".write": "auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin'",
        ".validate": "newData.hasChildren(['name', 'price', 'description', 'category', 'available']) && newData.child('price').isNumber() && newData.child('price').val() > 0 && newData.child('available').isBoolean()"
      }
    },
    "orders": {
      ".read": "auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin'",
      "$customerId": {
        ".read": "auth != null && (auth.uid === $customerId || root.child('users/' + auth.uid + '/role').val() === 'admin')",
        "$orderId": {
          ".write": "auth != null && ((!data.exists() && auth.uid === $customerId && newData.child('customerId').val() === $customerId && newData.child('status').val() === 'pending') || (data.exists() && root.child('users/' + auth.uid + '/role').val() === 'admin'))",
          ".validate": "newData.hasChildren(['customerId', 'customerName', 'items', 'total', 'paymentMethod', 'status', 'createdAt']) && newData.child('customerId').val() === $customerId && newData.child('total').isNumber() && newData.child('total').val() > 0",
          "subtotal": {
            ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 0)"
          },
          "discountType": {
            ".validate": "!newData.exists() || newData.val() === 'none' || newData.val() === 'pwd' || newData.val() === 'senior'"
          },
          "discountAmount": {
            ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 0)"
          },
          "items": {
            "$itemKey": {
              ".validate": "newData.hasChildren(['menuItemId', 'name', 'price', 'qty', 'category']) && newData.child('qty').val() >= 1 && newData.child('qty').val() <= 99 && newData.child('price').isNumber() && newData.child('price').val() > 0"
            }
          },
          "refunds": {
            "$refundId": {
              ".write": false,
              ".validate": false
            }
          }
        }
      }
    }
  }
}
```

### Why `orders/.../refunds` is unwritable from any client

`".write": false` means the **Admin SDK in a Cloud Function is the only writer** —
the rules are bypassed by `firebase-admin`, which is exactly why the refund
transaction can be trusted. No browser client, however modified, can fabricate a
refund or inflate `refundedTotal`.

---

## Backend functions

Three operations cannot be done safely from a browser and live in
`functions/src/index.ts`:

| Function | Why it needs a server |
|----------|-----------------------|
| `refundOrder` | The "amount remaining" check must be atomic (two refunds could otherwise both pass), and `approvedBy` must come from the verified session rather than client input. |
| `createCashier` | Creating an Authentication user for somebody else needs the Admin SDK. |
| `setCashierEnabled` | Disabling an Authentication account also needs the Admin SDK, and does not cascade to the database. |

Every function re-reads the caller's role from the database rather than trusting
the ID token, so a token issued before a role change cannot grant access.

Deploy with:

```bash
npm run deploy:functions
```

**Until these are deployed, the refund and account-management buttons will report
that they are unavailable.** They will not simulate success or imply that cash was
returned.

> `.validate` cascades to descendants, which is why `items` is nested under the
> order and validated without repeating the parent check. `.read` and `.write`
> are the opposite — they never cascade, which is the whole reason the structure
> above nests by customer.

> `.indexOn` is intentionally absent: with orders nested under the customer id, a
> server-side `orderByChild` would compare whole customers instead of individual
> orders. The admin UI already receives every order and filters in memory, and a
> cashier only ever reads their own small set.

### Why `set`, not `update`, for single values

Firebase v9+ rejects `update(ref, value)` unless `value` is an object
(`values argument must be an object containing the children to replace`).
Single-field writes such as an order's `status` or a menu item's `available` use
`set()` in `src/lib/actions.ts`.

### Why there is no `counters` node

The first draft generated `displayId` (`ORD-1001`) from a shared counter at
`/counters/orders`. That cannot be made safe: a customer must read the counter to
increment it, and granting every customer write access to a shared counter lets one
customer reset everyone's order numbers. The order number is now generated on the
client from a timestamp (`makeDisplayId()` in `src/lib/actions.ts`), which needs no
extra permissions and stays unique and sortable. If you later move order creation to
a Cloud Function, that function can own a counter safely.

### Privilege escalation guard

A user may write their own profile, so without help they could set their own
`role` to `admin` and inherit every admin capability. The `role` `.validate` rule
above pins it to `cashier` unless the writer is *already* an admin. The `email`
field is likewise locked to the caller's own auth token email.

> **Known gap:** this does not stop an admin from changing *their own* role, so a
> mis-click in a future role-management screen could demote the only admin and
> lock the shop out of its dashboard (the app would then be reachable only by
> editing `users/<uid>/role` in the Firebase console). If you add a role editor,
> either disable the control on your own row in the UI or extend the rule with a
> `auth.uid === $uid` branch that requires the role to be unchanged.

---

## Security Rules Explained

### `users/<uid>`

| Operation | Rule |
|-----------|------|
| **Read (parent)** | Only admins can read the whole `users` node (needed for the Users page). |
| **Read (child)** | A user can read their own profile. An admin can read any profile. |
| **Write** | A user can create/update their own profile. An admin can create/update any profile. |
| **Validate** | Must have `name`, `email`, `role`, and `createdAt`. `role` is pinned to `cashier` unless the writer is already an admin, and `email` is pinned to the caller's own auth token. |

### `menu/<itemId>`

| Operation | Rule |
|-----------|------|
| **Read** | **Public** — anyone (including unauthenticated visitors) can read the menu. |
| **Write** | Only admins can add, edit, or delete menu items. |
| **Validate** | Must have `name`, `price`, `description`, `category`, and `available` fields. |

### `orders/<customerId>/<orderId>`

| Operation | Rule |
|-----------|------|
| **Read (parent)** | Only admins can read the whole `orders` node. |
| **Read (subtree)** | A customer can read `/orders/<their own uid>`. An admin can read anyone's. |
| **Write (create)** | An authenticated user can create an order under their own uid, and the body's `customerId` **must** equal that uid with `status` `pending`. |
| **Write (update)** | Only admins can update an existing order (e.g. status `pending` → `preparing`). |
| **Write (delete)** | Only admins can delete an order (though the app uses status `cancelled` instead of deletion). |
| **Validate** | Must have `customerId`, `customerName`, `items`, `total`, `paymentMethod`, `status`, and `createdAt`. `customerId` must match the path, `total` must be a positive number, and each item's `qty` must be 1–99. |

---

## Business Rules Enforced

| Business Rule | How It's Enforced |
|---------------|-------------------|
| Cart quantity clamped to 1–99 | Client-side validation in `QuantityStepper` and `AppStore`. Server-side: `.validate` on order items. |
| Sold-out items can't be ordered | Client-side check in `addToCart`. Server-side: validate `menu/<id>/available` is `true` at order creation (requires a Cloud Function for full enforcement). |
| Orders start as `pending` | Client sets `status: "pending"` on create. |
| Cancelled orders excluded from sales | `validOrders()` in `src/lib/stats.ts` filters out `status === "cancelled"`. |
| Only admins can change order status | Security rules: only admins can update existing orders. |
| Customers only see their own orders | Orders are nested at `/orders/<customerId>/`, so a cashier's read of their own subtree is the only one the rules grant them. |
| Passwords are never stored in DB | Firebase Auth handles authentication. The `users` node contains no password field. |

---

## Indexes

For efficient querying, add these indexes in the Firebase console:

```json
{
  "orders": {
    ".indexOn": ["customerId", "status", "createdAt"]
  }
}
```

| Index | Use Case |
|-------|----------|
| `customerId` | Fetch all orders for a specific customer |
| `status` | Filter orders by status, e.g. everything still `pending` |
| `createdAt` | Sort orders by date (reports, history) |

---

## Re-seeding / Resetting

The frontend is already wired to Firebase, so there is no migration left to do.

**Menu** — import the Sample Data below into Realtime Database → Data. `/menu` is
publicly readable, so this needs no special rules.

**Demo accounts** — create the sign-ins from `/register` in the app (which writes
`role: "cashier"` correctly through the rules), then promote the owner/manager by
hand, because only an admin may write an `admin` role and nobody can grant it to
themselves:

```
Realtime Database → Data → users/<uid>/role → "admin"
```

**To reset from inside the app**, an admin can call `resetDemoData()` in
`src/lib/actions.ts`, which restores the menu and clears orders using admin rights.

---

## Sample Data (Seed)

```json
{
  "users": {
    "<firebaseAuthUid>": {
      "name": "Owner/Manager",
      "email": "owner@example.com",
      "role": "admin",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    "<anotherFirebaseAuthUid>": {
      "name": "Cashier name",
      "email": "cashier@example.com",
      "role": "cashier",
      "createdAt": "2026-01-05T00:00:00.000Z"
    }
  },
  "menu": {
    "m_1": { "name": "Iced Americano", "price": 80, "description": "Pure espresso with chilled water.", "category": "Coffee", "tag": null, "image": "/menu/iced-americano.jpg", "available": true },
    "m_2": { "name": "Classic Milk Tea", "price": 95, "description": "Smooth and creamy milk tea.", "category": "Milk Tea", "tag": null, "image": "/menu/classic-milk-tea.jpg", "available": true },
    "m_3": { "name": "Spanish Latte", "price": 100, "description": "Espresso with condensed milk.", "category": "Coffee", "tag": null, "image": "/menu/spanish-latte.jpg", "available": true },
    "m_4": { "name": "Wintermelon Milk Tea", "price": 100, "description": "Refreshing wintermelon flavor.", "category": "Milk Tea", "tag": null, "image": "/menu/wintermelon-milk-tea.jpg", "available": true },
    "m_5": { "name": "Caramel Macchiato", "price": 100, "description": "Espresso with vanilla syrup, and caramel drizzle", "category": "Coffee", "tag": null, "image": "/menu/caramel-macchiato.jpg", "available": true },
    "m_6": { "name": "Matcha", "price": 105, "description": "Premium matcha with fresh milk.", "category": "Others", "tag": "Non-coffee", "image": "/menu/matcha.jpg", "available": true },
    "m_7": { "name": "Mocha Frappe", "price": 110, "description": "Blended coffee and chocolate topped with whipped cream", "category": "Frappe", "tag": null, "image": "/menu/mocha-frappe.jpg", "available": true },
    "m_8": { "name": "Taro Milk Tea", "price": 95, "description": "Creamy taro with fresh milk and tapioca pearls", "category": "Milk Tea", "tag": null, "image": "/menu/taro-milk-tea.jpg", "available": true },
    "m_9": { "name": "Java Chip Frappe", "price": 110, "description": "Blended coffee with chocolate chips.", "category": "Frappe", "tag": null, "image": "/menu/java-chip-frappe.jpg", "available": true },
    "m_10": { "name": "Caramel Frappe", "price": 110, "description": "Rich caramel flavor with whipped cream.", "category": "Frappe", "tag": null, "image": "/menu/caramel-frappe.jpg", "available": true }
  }
}
```

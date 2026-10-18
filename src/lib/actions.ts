/**
 * Firebase RTDB CRUD Operations
 * All database interactions go through these functions.
 * Follows the format: { success, message, data } for mutations.
 */
import { initializeApp } from "firebase/app"
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  get,
  onValue,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
  runTransaction,
} from "firebase/database"
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth"
import { z } from "zod"
import { computeDiscount } from "@/lib/discounts"
import { findConflictingMenuItems } from "@/lib/duplicates"
import type { MenuItem } from "@/types"
import { applyRefund } from "@/lib/refunds"

// ---------------------------------------------------------------------------
// Firebase initialization
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

const app = initializeApp(firebaseConfig)
const database = getDatabase(app)
const auth = getAuth(app)

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------
const menuRef = ref(database, "menu")
const ordersRef = ref(database, "orders")
const usersRef = ref(database, "users")

/**
 * Build a human-readable order number without a counter node.
 * A counter would require read+write access to /counters/orders for every customer,
 * which security rules cannot safely grant. Timestamps give unique, sortable IDs instead.
 */
export const makeDisplayId = () => "ORD-" + Date.now().toString(36).toUpperCase()

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Discounts and refunds — validated against the same maths the UI shows, so a
// tampered client cannot persist numbers the calculator would never produce.
// ---------------------------------------------------------------------------

export const orderSchema = z
  .object({
    customerId: z.string().min(1, "Customer ID is required"),
    customerName: z.string().min(1, "Customer name is required"),
    items: z.record(
      z.string(),
      z.object({
        menuItemId: z.string(),
        name: z.string(),
        price: z.number().nonnegative(),
        qty: z.number().min(1).max(99),
        category: z.string(),
      })
    ),
    subtotal: z.number().nonnegative().optional(),
    discountType: z.enum(["none", "pwd", "senior"]).optional(),
    discountAmount: z.number().nonnegative().optional(),
    total: z.number().positive("Total must be positive"),
    paymentMethod: z.literal("Cash"),
    cashTendered: z.number().nonnegative("Cash tendered cannot be negative").optional(),
    changeGiven: z.number().nonnegative("Change cannot be negative").optional(),
    // New orders must start pending; the database rules require this too, so a
    // client cannot create an order that is already completed or cancelled.
    status: z.literal("pending"),
    createdAt: z.string(),
    note: z.string().nullable().optional(),
  })
  .superRefine((o, ctx) => {
    // Recompute the money. Anything that doesn't match is rejected outright.
    const lines = Object.values(o.items)
    const expected = computeDiscount(
      lines.map((l) => ({ category: l.category, qty: l.qty, price: l.price })),
      o.discountType ?? "none"
    )
    const r2 = (n: number) => Math.round(n * 100) / 100

    if (o.subtotal !== undefined && r2(o.subtotal) !== r2(expected.subtotal)) {
      ctx.addIssue({ code: "custom", message: "Subtotal does not match the line items.", path: ["subtotal"] })
    }
    if (o.total !== r2(expected.total)) {
      ctx.addIssue({ code: "custom", message: "Total does not match the discount calculation.", path: ["total"] })
    }
    const statedDiscount = o.discountAmount ?? 0
    if (r2(statedDiscount) !== r2(expected.amount)) {
      ctx.addIssue({ code: "custom", message: "Discount amount is not valid.", path: ["discountAmount"] })
    }
    if (o.cashTendered !== undefined && o.cashTendered + 0.004 < expected.total) {
      ctx.addIssue({ code: "custom", message: "Cash tendered does not cover the total.", path: ["cashTendered"] })
    }
    if (o.changeGiven !== undefined) {
      const expectedChange = r2((o.cashTendered ?? 0) - expected.total)
      if (r2(o.changeGiven) !== expectedChange) {
        ctx.addIssue({ code: "custom", message: "Change does not match the tender.", path: ["changeGiven"] })
      }
    }
  })

export const menuItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().positive("Price must be greater than 0"),
  description: z.string().min(1, "Description is required"),
  category: z.enum(["Coffee", "Milk Tea", "Frappe", "Others"]),
  tag: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  available: z.boolean(),
})

export const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain a capital letter")
    .regex(/[a-z]/, "Must contain a small letter")
    .regex(/[^A-Za-z0-9]/, "Must contain a special character")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

// ===========================================================================
// MENU CRUD
// ===========================================================================

/**
 * Add a new menu item (push)
 *
 * Duplicate names are refused here, at the data-access layer, rather than only in the
 * form: a second caller cannot slip past the UI check. The rule and its limits live in
 * src/lib/duplicates.ts.
 */
export const addMenuItem = async (itemData: z.infer<typeof menuItemSchema>) => {
  try {
    const validation = menuItemSchema.safeParse(itemData)
    if (!validation.success) {
      return {
        success: false,
        message: validation.error.issues[0]?.message || "Invalid menu item data",
      }
    }

    const existing = await getMenuItemsOnce()
    const clashes = findConflictingMenuItems(existing, validation.data.name, validation.data.category)
    if (clashes.length > 0) {
      return {
        success: false,
        message: `A ${validation.data.category} product named "${validation.data.name}" already exists. Edit or rename it instead of adding a second one.`,
      }
    }

    const newItemRef = push(menuRef, validation.data)
    return {
      success: true,
      message: "Menu item added successfully",
      data: { id: newItemRef.key, ...validation.data },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Get all menu items in real-time (onValue)
 * Returns an unsubscribe function.
 *
 * Uses `val()` rather than `snapshot.forEach()` for the same reason as getMenuItemsOnce:
 * the priority-index traversal behind `forEach` can return a truncated child list, which
 * would silently hide products from the menu and from duplicate review.
 */
export const getMenuItems = (callback: (items: MenuItem[]) => void) => {
  try {
    const unsubscribe = onValue(menuRef, (snapshot) => {
      const raw = (snapshot.val() ?? {}) as Record<string, any>
      callback(Object.entries(raw).map(([id, value]) => ({ id, ...(value as object) })) as MenuItem[])
    })
    return unsubscribe
  } catch (error: any) {
    console.log(error)
    return () => {}
  }
}

/**
 * Get all menu items once (get)
 *
 * Reads through `val()` rather than `snapshot.forEach()`. The two are equivalent for
 * well-formed nodes, but the priority-index traversal behind `forEach` can hand back a
 * short list, whereas `val()` returns the whole node. This sits on the duplicate check's
 * path, so a truncated read there would mean a missed collision.
 */
export const getMenuItemsOnce = async (): Promise<MenuItem[]> => {
  const snapshot = await get(menuRef)
  const raw = (snapshot.val() ?? {}) as Record<string, any>
  return Object.entries(raw).map(([id, value]) => ({ id, ...(value as object) })) as MenuItem[]
}

/**
 * Query menu item by name (simple query)
 */
export const getMenuItemByName = async (name: string) => {
  const itemQuery = query(
    menuRef,
    orderByChild("name"),
    equalTo(name),
    limitToFirst(1)
  )
  const snapshot = await get(itemQuery)
  return snapshot.exists()
}

/**
 * Query menu items by category
 */
export const getMenuItemsByCategory = async (category: string) => {
  const categoryQuery = query(
    menuRef,
    orderByChild("category"),
    equalTo(category)
  )
  const snapshot = await get(categoryQuery)
  const itemsArray: any[] = []
  snapshot.forEach((snap) => {
    const itemData = snap.val()
    const id = snap.key
    itemsArray.push({ id, ...itemData })
  })
  return itemsArray
}

/**
 * Update a menu item
 *
 * Renaming into a name that already exists in the same category is refused. The item
 * being edited is excluded, so saving an unchanged product never flags itself, and
 * changing only the price/description never triggers a check at all.
 */
export const updateMenuItem = async (id: string, itemData: Partial<z.infer<typeof menuItemSchema>>) => {
  try {
    const name = itemData.name
    const category = itemData.category
    if (name !== undefined && category !== undefined) {
      const existing = await getMenuItemsOnce()
      const clashes = findConflictingMenuItems(existing, name, category, id)
      if (clashes.length > 0) {
        return {
          success: false,
          message: `A ${category} product named "${name}" already exists. Pick a different name or edit that item instead.`,
        }
      }
    }

    const updateReference = ref(database, `menu/${id}`)
    await update(updateReference, itemData as any)
    return {
      success: true,
      message: "Menu item updated successfully",
      data: { id, ...itemData },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Delete a menu item
 */
export const deleteMenuItem = async (id: string) => {
  try {
    const deleteReference = ref(database, `menu/${id}`)
    await remove(deleteReference)
    return {
      success: true,
      message: "Menu item deleted successfully",
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Toggle menu item availability
 */
export const toggleAvailability = async (id: string, currentAvailability: boolean) => {
  try {
    const updateReference = ref(database, `menu/${id}/available`)
    // `set`, not `update`: Firebase v9+ requires an object for update().
    await set(updateReference, !currentAvailability)
    return {
      success: true,
      message: `Item ${!currentAvailability ? "available" : "sold out"}`,
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

// ===========================================================================
// ORDER CRUD
// ===========================================================================

/**
 * Place a new order (push)
 *
 * Orders are nested under their customer: /orders/<customerId>/<pushId>.
 * That nesting is what lets a cashier read only their own orders. RTDB rules do
 * not cascade, so a query on /orders is judged by the rule on /orders itself —
 * there is no way to express "every order whose customerId is me" as a query
 * permission. Scoping by path sidesteps it: a cashier reads /orders/<ownUid>,
 * which the child rule can grant, while an admin reads all of /orders.
 */
export const placeOrder = async (orderData: z.infer<typeof orderSchema>) => {
  try {
    const validation = orderSchema.safeParse(orderData)
    if (!validation.success) {
      return {
        success: false,
        message: validation.error.issues[0]?.message || "Invalid order data",
      }
    }

    // displayId is generated locally so customers never need
    // read/write access to a shared counter node.
    const displayId = makeDisplayId()
    const orderRef = push(ref(database, `orders/${validation.data.customerId}`), {
      ...validation.data,
      displayId,
    })

    return {
      success: true,
      message: "Order placed successfully",
      data: { id: orderRef.key, displayId, ...validation.data },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Flatten either shape into a list of orders that carry their own id.
 *
 * The admin feed reads /orders, which is one level deeper now, so it arrives as
 * { [customerId]: { [orderId]: order } }. The cashier feed reads
 * /orders/<uid> and arrives already flat. Both become the same array shape so
 * pages need no special casing.
 */
function flattenOrders(value: any, depth: "flat" | "byCustomer"): any[] {
  const out: any[] = []
  if (!value) return out

  if (depth === "flat") {
    Object.entries(value).forEach(([id, order]: [string, any]) => out.push({ id, ...order }))
    return out
  }

  Object.entries(value).forEach(([customerId, orders]: [string, any]) => {
    if (!orders) return
    Object.entries(orders).forEach(([id, order]: [string, any]) =>
      out.push({ id, customerId, ...order })
    )
  })
  return out
}

/**
 * Get orders in real-time (onValue)
 *
 *   - omit `customerId` for the admin-wide feed (reads /orders)
 *   - pass a customerId to read just that customer's orders
 *
 * Returns an unsubscribe function.
 */
export const getOrders = (callback: (orders: any[]) => void, customerId?: string | null) => {
  try {
    const scoped = !!customerId
    const target = scoped ? ref(database, `orders/${customerId}`) : ordersRef

    const unsubscribe = onValue(target, (snapshot) => {
      callback(flattenOrders(snapshot.val(), scoped ? "flat" : "byCustomer"))
    })
    return unsubscribe
  } catch (error: any) {
    console.log(error)
    return () => {}
  }
}

/**
 * Get orders once (get) — mirrors `getOrders` scoping rules.
 */
export const getOrdersOnce = async (customerId?: string | null) => {
  const scoped = !!customerId
  const target = scoped ? ref(database, `orders/${customerId}`) : ordersRef
  const snapshot = await get(target)
  return flattenOrders(snapshot.val(), scoped ? "flat" : "byCustomer")
}

/**
 * Get orders by customer ID
 */
export const getOrdersByCustomer = async (customerId: string) => {
  const snapshot = await get(ref(database, `orders/${customerId}`))
  return flattenOrders(snapshot.val(), "flat")
}

/**
 * Get orders by status (admin feed, filtered client-side)
 *
 * Not a server query on purpose: orders are nested one level by customer, so
 * `orderByChild("status")` at /orders would compare whole customers rather than
 * individual orders. The admin already holds the full list, so filtering it here
 * is both correct and cheap.
 */
export const getOrdersByStatus = async (status: string) => {
  const orders = await getOrdersOnce()
  return orders.filter((o) => o.status === status)
}

/**
 * Update order status
 */
export const updateOrderStatus = async (customerId: string, id: string, status: string) => {
  try {
    const updateReference = ref(database, `orders/${customerId}/${id}/status`)
    // `set`, not `update`: Firebase v9+ requires an object for update().
    await set(updateReference, status)
    return {
      success: true,
      message: `Order ${id} status updated to ${status}`,
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Delete an order
 */
export const deleteOrder = async (customerId: string, id: string) => {
  try {
    const deleteReference = ref(database, `orders/${customerId}/${id}`)
    await remove(deleteReference)
    return {
      success: true,
      message: "Order deleted successfully",
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

// ===========================================================================
// AUTH
// ===========================================================================

/**
 * Login with email and password
 */
export const loginUser = async (email: string, password: string) => {
  try {
    if (!email.trim() || !password) {
      return { success: false, message: "Email and password are required" }
    }

    const cred = await signInWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid

    // Fetch user profile from RTDB
    const profileSnap = await get(ref(database, `users/${uid}`))
    if (!profileSnap.exists()) {
      return { success: false, message: "User profile not found" }
    }

    const userData = profileSnap.val()

    // A disabled account is refused at sign-in even if the Firebase credentials are
    // still valid. `setCashierEnabled` also sets an auth custom claim, but that claim
    // is only refreshed on a new token, so the database flag is the reliable check.
    if (userData.disabled === true) {
      await signOut(auth)
      return {
        success: false,
        message: "This account has been disabled. Ask the Owner/Manager to re-enable it.",
      }
    }

    // Reject a profile whose role is missing or unrecognised. Without this, a
    // cast would turn any string into a "valid" user and the app would quietly
    // treat a broken record as a cashier.
    if (userData.role !== "admin" && userData.role !== "cashier") {
      await signOut(auth)
      return {
        success: false,
        message: "Your account role is not set correctly. Ask the Owner/Manager to fix it.",
      }
    }

    return {
      success: true,
      message: "Login successful",
      data: { id: uid, ...userData },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Register a new user
 */
export const registerUser = async (name: string, email: string, password: string) => {
  try {
    if (!name.trim()) {
      return { success: false, message: "Name is required" }
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return { success: false, message: "Enter a valid email address" }
    }
    if (password.length < 8) {
      return { success: false, message: "Password must be at least 8 characters" }
    }

    // Create Firebase Auth user
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid

    // Create user profile in RTDB
    const profile = {
      name: name.trim(),
      email: email.trim(),
      role: "cashier",
      createdAt: new Date().toISOString(),
    }
    await set(ref(database, `users/${uid}`), profile)

    return {
      success: true,
      message: "Account created successfully",
      data: { id: uid, ...profile },
    }
  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      return { success: false, message: "An account with this email already exists" }
    }
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Logout current user
 */
export const logoutUser = async () => {
  try {
    await signOut(auth)
    return { success: true, message: "Logged out successfully" }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Subscribe to auth state changes
 * Returns an unsubscribe function.
 */
export const onAuthChange = (callback: (user: any | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const uid = firebaseUser.uid
      const profileSnap = await get(ref(database, `users/${uid}`))
      if (profileSnap.exists()) {
        callback({ id: uid, ...profileSnap.val() })
      } else {
        callback(null)
      }
    } else {
      callback(null)
    }
  })
}

// ===========================================================================
// USER MANAGEMENT (Admin)
// ===========================================================================

/**
 * Get all users in real-time (onValue)
 * Returns an unsubscribe function.
 */
export const getUsers = (callback: (users: any[]) => void) => {
  try {
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const usersArray: any[] = []
      snapshot.forEach((snap) => {
        const userData = snap.val()
        const id = snap.key
        const userWithId = { id, ...userData }
        usersArray.push(userWithId)
      })
      callback(usersArray)
    })
    return unsubscribe
  } catch (error: any) {
    console.log(error)
    return () => {}
  }
}

/**
 * Subscribe to a single user profile in real time.
 * Used to honour the `disabled` flag on active sessions.
 */
export const subscribeUserProfile = (uid: string, callback: (profile: any | null) => void) => {
  const r = ref(database, `users/${uid}`)
  const unsubscribe = onValue(r, (snapshot) => {
    callback(snapshot.exists() ? { id: uid, ...snapshot.val() } : null)
  })
  return unsubscribe
}

/**
 * Get all users once (get)
 */
export const getUsersOnce = async () => {
  const snapshot = await get(usersRef)
  const usersArray: any[] = []
  snapshot.forEach((snap) => {
    const userData = snap.val()
    const id = snap.key
    const userWithId = { id, ...userData }
    usersArray.push(userWithId)
  })
  return usersArray
}

/**
 * Update user profile
 */
export const updateUser = async (id: string, userData: any) => {
  try {
    const updateReference = ref(database, `users/${id}`)
    await update(updateReference, userData)
    return {
      success: true,
      message: "User updated successfully",
      data: { id, ...userData },
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Delete a user.
 *
 * Retained only for a user who has no orders and no refunds; the UI routes staff
 * removal through `disableCashier` in functionsClient instead, because deleting
 * the RTDB profile would orphan their past orders and would not touch their
 * Authentication account anyway. See functions/src/index.ts.
 */
export const deleteUser = async (id: string) => {
  try {
    const deleteReference = ref(database, `users/${id}`)
    await remove(deleteReference)
    return {
      success: true,
      message: "User deleted successfully",
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

/**
 * Enable/disable a cashier through the RTDB profile flag.
 *
 * This blocks access to CuccuPOS (login checks, active sessions and the
 * security rules all honour `disabled`) but does NOT disable the underlying
 * Firebase Authentication account, which must be managed separately in the
 * Firebase Console if desired.
 */
export const setCashierEnabled = async (uid: string, enabled: boolean) => {
  try {
    const actor = auth.currentUser
    if (!actor) return { success: false, message: "Sign in to continue." }
    if (actor.uid === uid) return { success: false, message: "You cannot disable your own account." }

    const actorSnap = await get(ref(database, `users/${actor.uid}`))
    if (!actorSnap.exists() || actorSnap.val()?.role !== "admin") {
      return { success: false, message: "Only an Owner/Manager can perform this action." }
    }
    if (actorSnap.val()?.disabled === true) {
      return { success: false, message: "This account is disabled." }
    }

    const targetSnap = await get(ref(database, `users/${uid}`))
    if (!targetSnap.exists()) return { success: false, message: "That account no longer exists." }
    if (targetSnap.val()?.role === "admin") {
      return { success: false, message: "This account is an Owner/Manager. Use a dedicated administrator flow for those." }
    }

    await update(ref(database, `users/${uid}`), {
      disabled: enabled,
      reenabledAt: enabled ? new Date().toISOString() : null,
    })
    return { success: true, message: enabled ? "Account re-enabled" : "Account disabled" }
  } catch (error: any) {
    return { success: false, message: error?.message || "Could not update the account." }
  }
}

/**
 * Cashier accounts are no longer created through a Cloud Function.
 *
 * New cashiers self-register at `/register` (which always writes the `cashier`
 * role through the security rules). An Owner/Manager who needs to provision an
 * account directly can do so manually in the Firebase Console: create the
 * Authentication user, then create the matching `/users/<uid>` profile with
 * `role: "cashier"`. See `MANUAL_SETUP_AND_DEPLOYMENT.md`.
 */
export const createCashierAccount = async (_name: string, _email: string, _password: string) => ({
  success: false,
  message:
    "Automatic cashier creation is disabled. Ask the cashier to register at /register, or create the account manually in the Firebase Console.",
})

/**
 * Locate the (customerId, order) pair for an order id. Admins can read the whole
 * tree; cashiers never reach this path because refunds are admin-only.
 */
async function locateOrder(orderId: string, customerId?: string | null): Promise<{ customerId: string } | null> {
  if (customerId) {
    const snap = await get(ref(database, `orders/${customerId}/${orderId}`))
    if (snap.exists()) return { customerId }
    return null
  }
  const snap = await get(ref(database, "orders"))
  const byCustomer = (snap.val() ?? {}) as Record<string, Record<string, any>>
  for (const [cid, bucket] of Object.entries(byCustomer)) {
    if (bucket && bucket[orderId]) return { customerId: cid }
  }
  return null
}

/**
 * Issue a refund through an RTDB transaction on the individual order record.
 *
 * The remaining-amount check runs inside the transaction so two concurrent
 * refunds can never both pass. `approvedBy` is taken from the signed-in session,
 * not from caller input. The original order fields are preserved; only the
 * refund audit record and the cached `refundedTotal` are appended/updated.
 *
 * Success is reported only after Firebase acknowledges the write.
 */
export const refundOrder = async (
  orderId: string,
  amount: number,
  reason: string,
  customerId?: string | null
) => {
  try {
    if (!orderId?.trim()) return { success: false, message: "Order id is required." }
    if (!reason || reason.trim().length < 3) {
      return { success: false, message: "A refund reason of at least 3 characters is required." }
    }
    const requested = Math.round(Number(amount) * 100) / 100
    if (!Number.isFinite(requested) || requested <= 0) {
      return { success: false, message: "Refund amount must be greater than zero." }
    }

    const user = auth.currentUser
    if (!user) return { success: false, message: "Sign in to continue." }

    const profileSnap = await get(ref(database, `users/${user.uid}`))
    if (!profileSnap.exists()) return { success: false, message: "No user profile found for this session." }
    const profile = profileSnap.val()
    if (profile?.role !== "admin") return { success: false, message: "Only an Owner/Manager can perform this action." }
    if (profile?.disabled === true) return { success: false, message: "This account is disabled." }

    const located = await locateOrder(orderId, customerId)
    if (!located) return { success: false, message: "Order not found." }
    const { customerId: cid } = located
    const orderRef = ref(database, `orders/${cid}/${orderId}`)

    const approvedBy = { uid: user.uid, name: String(profile?.name ?? "") }
    const result = await runTransaction(
      orderRef,
      (current: any) => {
        if (!current) return current
        const updated = applyRefund(current as any, { amount: requested, reason }, approvedBy)
        return { ...current, ...updated, id: current.id ?? orderId }
      },
      { applyLocally: false }
    )

    if (!result.committed) {
      return { success: false, message: "Refund could not be applied. Please try again." }
    }
    return { success: true, message: "Refund recorded", data: { orderId, amount: requested } }
  } catch (error: any) {
    return { success: false, message: error?.message || "Refund failed." }
  }
}

// ===========================================================================
// SEED / RESET
// ===========================================================================

/**
 * Reset demo data to seed values
 */
export const resetDemoData = async () => {
  try {
    const seedMenuData: Record<string, any> = {
      m_1: { name: "Iced Americano", price: 80, description: "Pure espresso with chilled water.", category: "Coffee", tag: null, image: "/menu/iced-americano.jpg", available: true },
      m_2: { name: "Classic Milk Tea", price: 95, description: "Smooth and creamy milk tea.", category: "Milk Tea", tag: null, image: "/menu/classic-milk-tea.jpg", available: true },
      m_3: { name: "Spanish Latte", price: 100, description: "Espresso with condensed milk.", category: "Coffee", tag: null, image: "/menu/spanish-latte.jpg", available: true },
      m_4: { name: "Wintermelon Milk Tea", price: 100, description: "Refreshing wintermelon flavor.", category: "Milk Tea", tag: null, image: "/menu/wintermelon-milk-tea.jpg", available: true },
      m_5: { name: "Caramel Macchiato", price: 100, description: "Espresso with vanilla syrup, and caramel drizzle", category: "Coffee", tag: null, image: "/menu/caramel-macchiato.jpg", available: true },
      m_6: { name: "Matcha", price: 105, description: "Premium matcha with fresh milk.", category: "Others", tag: "Non-coffee", image: "/menu/matcha.jpg", available: true },
      m_7: { name: "Mocha Frappe", price: 110, description: "Blended coffee and chocolate topped with whipped cream", category: "Frappe", tag: null, image: "/menu/mocha-frappe.jpg", available: true },
      m_8: { name: "Taro Milk Tea", price: 95, description: "Creamy taro with fresh milk and tapioca pearls", category: "Milk Tea", tag: null, image: "/menu/taro-milk-tea.jpg", available: true },
      m_9: { name: "Java Chip Frappe", price: 110, description: "Blended coffee with chocolate chips.", category: "Frappe", tag: null, image: "/menu/java-chip-frappe.jpg", available: true },
      m_10: { name: "Caramel Frappe", price: 110, description: "Rich caramel flavor with whipped cream.", category: "Frappe", tag: null, image: "/menu/caramel-frappe.jpg", available: true },
    }

    // Reset menu
    await set(menuRef, seedMenuData)

    // Reset orders
    await set(ordersRef, null)

    return { success: true, message: "Demo data reset successfully" }
  } catch (error: any) {
    return {
      success: false,
      message: error.message,
    }
  }
}

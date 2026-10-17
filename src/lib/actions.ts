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
} from "firebase/database"
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth"
import { z } from "zod"

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
export const menuItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().positive("Price must be greater than 0"),
  description: z.string().min(1, "Description is required"),
  category: z.enum(["Coffee", "Milk Tea", "Frappe", "Others"]),
  tag: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  available: z.boolean(),
})

export const orderSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  customerName: z.string().min(1, "Customer name is required"),
  items: z.record(
    z.string(),
    z.object({
      menuItemId: z.string(),
      name: z.string(),
      price: z.number(),
      qty: z.number().min(1).max(99),
      category: z.string(),
    })
  ),
  total: z.number().positive("Total must be positive"),
  paymentMethod: z.literal("Cash"),
  cashTendered: z.number().nonnegative("Cash tendered cannot be negative").optional(),
  changeGiven: z.number().nonnegative("Change cannot be negative").optional(),
  status: z.enum(["pending", "preparing", "ready", "completed", "cancelled"]),
  createdAt: z.string(),
  note: z.string().nullable().optional(),
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
 */
export const getMenuItems = (callback: (items: any[]) => void) => {
  try {
    const unsubscribe = onValue(menuRef, (snapshot) => {
      const itemsArray: any[] = []
      snapshot.forEach((snap) => {
        const itemData = snap.val()
        const id = snap.key
        const itemWithId = { id, ...itemData }
        itemsArray.push(itemWithId)
      })
      callback(itemsArray)
    })
    return unsubscribe
  } catch (error: any) {
    console.log(error)
    return () => {}
  }
}

/**
 * Get all menu items once (get)
 */
export const getMenuItemsOnce = async () => {
  const snapshot = await get(menuRef)
  const itemsArray: any[] = []
  snapshot.forEach((snap) => {
    const itemData = snap.val()
    const id = snap.key
    const itemWithId = { id, ...itemData }
    itemsArray.push(itemWithId)
  })
  return itemsArray
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
 */
export const updateMenuItem = async (id: string, itemData: Partial<z.infer<typeof menuItemSchema>>) => {
  try {
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
 * Delete a user
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

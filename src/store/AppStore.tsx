/**
 * FIREBASE DATA LAYER.
 * All data is read from and written to Firebase RTDB via src/lib/actions.ts.
 * State is kept in React and synced with Firebase using onValue listeners.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import type { CartLine, DiscountType, MenuItem, Order, OrderStatus, PaymentMethod, User } from "@/types"
import { computeDiscount, type DiscountBreakdown } from "@/lib/discounts"
import { sortByCreatedAtDesc } from "@/lib/stats"
import {
  getMenuItems,
  getOrders,
  getUsers,
  onAuthChange,
  loginUser,
  registerUser,
  logoutUser,
  placeOrder as placeOrderAction,
  updateOrderStatus as updateOrderStatusAction,
  addMenuItem as addMenuItemAction,
  updateMenuItem as updateMenuItemAction,
  deleteMenuItem as deleteMenuItemAction,
  toggleAvailability as toggleAvailabilityAction,
  resetDemoData as resetDemoDataAction,
  refundOrder as refundOrderAction,
  setCashierEnabled as setCashierEnabledAction,
  createCashierAccount as createCashierAction,
} from "@/lib/actions"

export const MAX_QTY = 99

export interface ResolvedCartLine {
  item: MenuItem
  qty: number
}
export type AuthResult = { ok: true; user: User } | { ok: false; error: string }
export type MenuInput = Omit<MenuItem, "id"> & { id?: string }

interface Store {
  currentUser: User | null
  users: User[]
  menu: MenuItem[]
  orders: Order[]
  cartLines: ResolvedCartLine[]
  cartCount: number
  cartTotal: number
  loading: boolean
  /** True once Firebase Auth has reported whether anyone is signed in. */
  authReady: boolean
  // auth
  login: (email: string, password: string) => Promise<AuthResult>
  register: (name: string, email: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
  // cart (customer)
  addToCart: (menuItemId: string) => void
  setQty: (menuItemId: string, qty: number) => void
  removeFromCart: (menuItemId: string) => void
  clearCart: () => void
  reorder: (order: Order) => void
  placeOrder: (cashTendered: number, note?: string, discountType?: DiscountType) => Promise<Order | null>
  /** Client-side preview of the discount for the current cart. Never persisted directly. */
  previewDiscount: (type: DiscountType) => DiscountBreakdown
  /** Issues a refund through the backend. */
  refundOrder: (orderId: string, amount: number, reason: string) => Promise<{ success: boolean; message: string }>
  /** Enables/disables a cashier through the backend. */
  setCashierEnabled: (uid: string, enabled: boolean) => Promise<{ success: boolean; message: string }>
  /** Creates a cashier account through the backend. Always the cashier role. */
  createCashier: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string }>
  // admin
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>
  saveMenuItem: (item: MenuInput) => Promise<{ success: boolean; message: string }>
  deleteMenuItem: (id: string) => Promise<{ success: boolean; message: string }>
  toggleAvailability: (id: string) => Promise<{ success: boolean; message: string }>
  resetDemoData: () => Promise<{ success: boolean; message: string }>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)

  // Menu is publicly readable, so it is always subscribed.
  // Auth state drives the identity of the current user.
  useEffect(() => {
    const unsubMenu = getMenuItems((items) => {
      setMenu(items)
      setLoading(false)
    })

    const unsubAuth = onAuthChange((user) => {
      setCurrentUser(user)
      // Route guards wait on this so a hard refresh on a deep link doesn't get
      // bounced to /login (and then to the home page) before auth has resolved.
      setAuthReady(true)
    })

    return () => {
      unsubMenu?.()
      unsubAuth?.()
    }
  }, [])

  // Orders and users are role-scoped, so they re-subscribe whenever the
  // signed-in user changes. Admins get the full feed; a cashier only ever
  // reads their own orders (query) and never the customer list.
  const userId = currentUser?.id ?? null
  const isAdmin = currentUser?.role === "admin"

  useEffect(() => {
    if (!userId) {
      setOrders([])
      setUsers([])
      return
    }

    const unsubOrders = getOrders(setOrders, isAdmin ? null : userId)
    const unsubUsers = isAdmin ? getUsers(setUsers) : null

    if (!isAdmin) setUsers(currentUser ? [currentUser] : [])

    return () => {
      unsubOrders?.()
      unsubUsers?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin])

  const cartLines = useMemo<ResolvedCartLine[]>(
    () =>
      cart.flatMap((l) => {
        const item = menu.find((m) => m.id === l.menuItemId)
        return item ? [{ item, qty: l.qty }] : []
      }),
    [cart, menu]
  )
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0)
  const cartTotal = cartLines.reduce((s, l) => s + l.qty * l.item.price, 0)

  /**
   * Newest first, applied once here so every screen that reads `orders` gets the
   * same order. The admin feed arrives grouped by customer (see flattenOrders in
   * actions.ts), so without this the board looks randomly sequenced.
   */
  const sortedOrders = useMemo(() => sortByCreatedAtDesc(orders), [orders])

  const login = async (email: string, password: string): Promise<AuthResult> => {
    const result = await loginUser(email, password)
    if (result.success && result.data) {
      const user = { ...result.data, role: result.data.role as User["role"] }
      setCurrentUser(user)
      return { ok: true, user }
    }
    return { ok: false, error: result.message }
  }

  const register = async (name: string, email: string, password: string): Promise<AuthResult> => {
    const result = await registerUser(name, email, password)
    if (result.success && result.data) {
      const user = { ...result.data, role: result.data.role as User["role"] }
      setCurrentUser(user)
      return { ok: true, user }
    }
    return { ok: false, error: result.message }
  }

  const logout = async () => {
    await logoutUser()
    setCurrentUser(null)
    setCart([])
  }

  const addToCart = (id: string) =>
    setCart((prev) => {
      const item = menu.find((m) => m.id === id)
      if (!item || !item.available) return prev
      const existing = prev.find((l) => l.menuItemId === id)
      const newCart = existing
        ? prev.map((l) => (l.menuItemId === id ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l))
        : [...prev, { menuItemId: id, qty: 1 }]
      return newCart
    })

  const setQty = (id: string, qty: number) =>
    setCart((prev) =>
      prev.map((l) => (l.menuItemId === id ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, Math.floor(qty) || 1)) } : l))
    )

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((l) => l.menuItemId !== id))
  const clearCart = () => setCart([])

  const reorder = (order: Order) =>
    setCart((prev) => {
      let newCart = [...prev]
      Object.values(order.items).forEach((oi: any) => {
        const m = menu.find((x) => x.id === oi.menuItemId)
        if (!m || !m.available) return
        const ex = newCart.find((l) => l.menuItemId === oi.menuItemId)
        if (ex) newCart = newCart.map((l) => (l === ex ? { ...l, qty: Math.min(l.qty + oi.qty, MAX_QTY) } : l))
        else newCart.push({ menuItemId: oi.menuItemId, qty: oi.qty })
      })
      return newCart
    })

  /** Round to 2 decimals so peso maths never drifts on floats (0.1 + 0.2). */
  const money = (n: number) => Math.round(n * 100) / 100

  const placeOrder = async (
    cashTendered: number,
    note?: string,
    discountType: DiscountType = "none"
  ): Promise<Order | null> => {
    if (!currentUser || cartLines.length === 0) return null

    // The discount is recomputed from the cart here rather than accepted from the
    // caller, so the persisted total always matches the line items.
    const breakdown = computeDiscount(
      cartLines.map((l) => ({ category: l.item.category, qty: l.qty, price: l.item.price })),
      discountType
    )
    const tendered = money(cashTendered)
    const changeGiven = money(tendered - breakdown.total)

    if (tendered + 0.004 < breakdown.total) {
      toast.error("Cash received does not cover the total.")
      return null
    }

    const orderData = {
      customerId: currentUser.id,
      customerName: currentUser.name,
      items: cartLines.reduce((acc, l) => {
        acc[l.item.id] = {
          menuItemId: l.item.id,
          name: l.item.name,
          price: l.item.price,
          qty: l.qty,
          category: l.item.category,
        }
        return acc
      }, {} as Record<string, any>),
      subtotal: breakdown.subtotal,
      discountType: breakdown.type,
      discountAmount: breakdown.amount,
      total: breakdown.total,
      paymentMethod: "Cash" as PaymentMethod,
      cashTendered: tendered,
      changeGiven,
      // New orders always start pending; the backend rules enforce it too.
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      note: note || null,
    }

    const result = await placeOrderAction(orderData)
    if (result.success) {
      setCart([])
      return result.data as Order
    }
    return null
  }

  const updateOrderStatus = async (id: string, status: OrderStatus) => {
    const order = orders.find((o) => o.id === id)
    if (!order) return
    await updateOrderStatusAction(order.customerId, id, status)
  }

  const saveMenuItem = async (input: MenuInput) => {
    if (input.id) {
      const { id, ...rest } = input
      return updateMenuItemAction(id, rest)
    }
    return addMenuItemAction(input as any)
  }

  const deleteMenuItem = async (id: string) => {
    return deleteMenuItemAction(id)
  }

  const toggleAvailability = async (id: string) => {
    const item = menu.find((m) => m.id === id)
    if (!item) return { success: false, message: "Item not found" }
    return toggleAvailabilityAction(id, item.available)
  }

  const previewDiscount = (type: DiscountType): DiscountBreakdown =>
    computeDiscount(
      cartLines.map((l) => ({ category: l.item.category, qty: l.qty, price: l.item.price })),
      type
    )

  const refundOrder = async (orderId: string, amount: number, reason: string) =>
    refundOrderAction(orderId, amount, reason)

  const setCashierEnabled = async (uid: string, enabled: boolean) =>
    setCashierEnabledAction(uid, enabled)

  const createCashier = async (name: string, email: string, password: string) =>
    createCashierAction(name, email, password)

  const resetDemoData = async () => {
    return resetDemoDataAction()
  }

  const value: Store = {
    currentUser,
    users,
    menu,
    orders: sortedOrders,
    cartLines,
    cartCount,
    cartTotal,
    loading,
    authReady,
    login,
    register,
    logout,
    addToCart,
    setQty,
    removeFromCart,
    clearCart,
    reorder,
    placeOrder,
    previewDiscount,
    refundOrder,
    setCashierEnabled,
    createCashier,
    updateOrderStatus,
    saveMenuItem,
    deleteMenuItem,
    toggleAvailability,
    resetDemoData,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>")
  return ctx
}

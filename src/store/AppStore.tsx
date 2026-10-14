/**
 * MOCK DATA LAYER.
 * Everything the UI reads or writes goes through `useStore()`. State is kept in React and
 * persisted to localStorage so the demo survives a refresh. When the backend is ready,
 * replace the bodies of these functions with API calls and leave the pages untouched.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { CartLine, MenuItem, Order, OrderStatus, PaymentMethod, User } from "@/types"
import { generateSeedOrders, seedMenu, seedUsers } from "@/data/seed"

export const MAX_QTY = 99
const STORAGE_KEY = "cuccupos:v1"

interface Data {
  users: User[]
  menu: MenuItem[]
  orders: Order[]
  cart: CartLine[]
  sessionUserId: string | null
}

function freshData(): Data {
  return { users: seedUsers, menu: seedMenu, orders: generateSeedOrders(), cart: [], sessionUserId: null }
}

function load(): Data {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Data
  } catch {
    /* ignore corrupt storage */
  }
  return freshData()
}

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
  // auth
  login: (email: string, password: string) => AuthResult
  register: (name: string, email: string, password: string) => AuthResult
  logout: () => void
  // cart (customer)
  addToCart: (menuItemId: string) => void
  setQty: (menuItemId: string, qty: number) => void
  removeFromCart: (menuItemId: string) => void
  clearCart: () => void
  reorder: (order: Order) => void
  placeOrder: (paymentMethod: PaymentMethod, note?: string) => Order | null
  // admin
  updateOrderStatus: (id: string, status: OrderStatus) => void
  saveMenuItem: (item: MenuInput) => void
  deleteMenuItem: (id: string) => void
  toggleAvailability: (id: string) => void
  resetDemoData: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage full or blocked */
    }
  }, [data])

  const currentUser = useMemo(() => data.users.find((u) => u.id === data.sessionUserId) ?? null, [data.users, data.sessionUserId])

  const cartLines = useMemo<ResolvedCartLine[]>(
    () =>
      data.cart.flatMap((l) => {
        const item = data.menu.find((m) => m.id === l.menuItemId)
        return item ? [{ item, qty: l.qty }] : []
      }),
    [data.cart, data.menu]
  )
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0)
  const cartTotal = cartLines.reduce((s, l) => s + l.qty * l.item.price, 0)

  const login: Store["login"] = (email, password) => {
    const user = data.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password)
    if (!user) return { ok: false, error: "Incorrect email or password." }
    setData((d) => ({ ...d, sessionUserId: user.id }))
    return { ok: true, user }
  }

  const register: Store["register"] = (name, email, password) => {
    if (data.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()))
      return { ok: false, error: "An account with this email already exists." }
    const user: User = {
      id: `u_${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      password,
      role: "customer",
      createdAt: new Date().toISOString(),
    }
    setData((d) => ({ ...d, users: [...d.users, user], sessionUserId: user.id }))
    return { ok: true, user }
  }

  const logout = () => setData((d) => ({ ...d, sessionUserId: null, cart: [] }))

  const addToCart: Store["addToCart"] = (id) =>
    setData((d) => {
      const item = d.menu.find((m) => m.id === id)
      if (!item || !item.available) return d
      const existing = d.cart.find((l) => l.menuItemId === id)
      const cart = existing
        ? d.cart.map((l) => (l.menuItemId === id ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l))
        : [...d.cart, { menuItemId: id, qty: 1 }]
      return { ...d, cart }
    })

  // Quantity can never go below 1. Use removeFromCart to take an item out.
  const setQty: Store["setQty"] = (id, qty) =>
    setData((d) => ({
      ...d,
      cart: d.cart.map((l) => (l.menuItemId === id ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, Math.floor(qty) || 1)) } : l)),
    }))

  const removeFromCart: Store["removeFromCart"] = (id) => setData((d) => ({ ...d, cart: d.cart.filter((l) => l.menuItemId !== id) }))
  const clearCart = () => setData((d) => ({ ...d, cart: [] }))

  const reorder: Store["reorder"] = (order) =>
    setData((d) => {
      let cart = [...d.cart]
      order.items.forEach((oi) => {
        const m = d.menu.find((x) => x.id === oi.menuItemId)
        if (!m || !m.available) return
        const ex = cart.find((l) => l.menuItemId === oi.menuItemId)
        if (ex) cart = cart.map((l) => (l === ex ? { ...l, qty: Math.min(l.qty + oi.qty, MAX_QTY) } : l))
        else cart.push({ menuItemId: oi.menuItemId, qty: oi.qty })
      })
      return { ...d, cart }
    })

  const placeOrder: Store["placeOrder"] = useCallback(
    (paymentMethod, note) => {
      if (!currentUser || cartLines.length === 0) return null
      const order: Order = {
        id: `ORD-${1001 + data.orders.length}`,
        customerId: currentUser.id,
        customerName: currentUser.name,
        items: cartLines.map((l) => ({ menuItemId: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty, category: l.item.category })),
        total: cartTotal,
        paymentMethod,
        status: "pending",
        createdAt: new Date().toISOString(),
        note,
      }
      setData((d) => ({ ...d, orders: [order, ...d.orders], cart: [] }))
      return order
    },
    [currentUser, cartLines, cartTotal, data.orders.length]
  )

  const updateOrderStatus: Store["updateOrderStatus"] = (id, status) =>
    setData((d) => ({ ...d, orders: d.orders.map((o) => (o.id === id ? { ...o, status } : o)) }))

  const saveMenuItem: Store["saveMenuItem"] = (input) =>
    setData((d) => {
      const tag = input.category === "Others" ? "Non-coffee" : undefined
      if (input.id) return { ...d, menu: d.menu.map((m) => (m.id === input.id ? ({ ...m, ...input, tag } as MenuItem) : m)) }
      const item: MenuItem = { ...input, id: `m_${Date.now()}`, tag }
      return { ...d, menu: [...d.menu, item] }
    })

  const deleteMenuItem: Store["deleteMenuItem"] = (id) =>
    setData((d) => ({ ...d, menu: d.menu.filter((m) => m.id !== id), cart: d.cart.filter((l) => l.menuItemId !== id) }))

  const toggleAvailability: Store["toggleAvailability"] = (id) =>
    setData((d) => ({ ...d, menu: d.menu.map((m) => (m.id === id ? { ...m, available: !m.available } : m)) }))

  const resetDemoData = () => setData({ ...freshData(), sessionUserId: data.sessionUserId })

  const value: Store = {
    currentUser, users: data.users, menu: data.menu, orders: data.orders,
    cartLines, cartCount, cartTotal,
    login, register, logout, addToCart, setQty, removeFromCart, clearCart, reorder, placeOrder,
    updateOrderStatus, saveMenuItem, deleteMenuItem, toggleAvailability, resetDemoData,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>")
  return ctx
}

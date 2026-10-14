import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Loader2, Plus, Search, ShoppingBag, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MenuImage } from "@/components/MenuImage"
import { QuantityStepper } from "@/components/QuantityStepper"
import { useStore } from "@/store/AppStore"
import { peso } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Category, Order, PaymentMethod } from "@/types"

const FILTERS: ("All" | Category)[] = ["All", "Coffee", "Milk Tea", "Frappe", "Others"]
const PAYMENTS: { value: PaymentMethod; hint: string }[] = [
  { value: "Cash", hint: "Pay at the counter when you pick up." },
  { value: "GCash", hint: "Mock only. No real GCash payment is made." },
  { value: "Card", hint: "Mock only. No card details are collected." },
]

function CartPanel({ payment, onPaymentChange, onCheckout }: { payment: PaymentMethod; onPaymentChange: (p: PaymentMethod) => void; onCheckout: () => void }) {
  const { cartLines, cartTotal, setQty, removeFromCart } = useStore()
  return (
    <Card className="flex max-h-[calc(100vh-11rem)] flex-col p-5 shadow-md">
      <h2 className="text-xl font-bold">Current Order</h2>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {cartLines.length === 0 && (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            <ShoppingBag className="size-6" />
            Your order is empty. Tap + on a drink to add it.
          </div>
        )}
        {cartLines.map(({ item, qty }) => (
          <div key={item.id} className="flex gap-3 rounded-xl border p-2.5 shadow-sm">
            <MenuImage src={item.image} alt={item.name} className="size-16 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-bold">{item.name}</p>
                <button onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.name}`} className="text-muted-foreground transition-colors hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="text-sm font-bold">{peso(item.price * qty)}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <QuantityStepper value={qty} onChange={(n) => setQty(item.id, n)} />
                <Badge variant="tag">{item.tag ?? item.category}</Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3 border-t pt-4">
        <div className="flex items-center justify-between text-muted-foreground"><span>Subtotal</span><span className="font-bold">{peso(cartTotal)}</span></div>
        <div className="flex items-center justify-between text-lg font-bold"><span>Total</span><span>{peso(cartTotal)}</span></div>
        <div className="space-y-1.5">
          <Label>Payment Method</Label>
          <Select value={payment} onValueChange={(v) => onPaymentChange(v as PaymentMethod)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button className="w-full" size="lg" disabled={cartLines.length === 0} onClick={onCheckout}>Checkout</Button>
      </div>
    </Card>
  )
}

type Phase = "review" | "processing" | "done"

function CheckoutDialog({ open, onOpenChange, payment }: { open: boolean; onOpenChange: (o: boolean) => void; payment: PaymentMethod }) {
  const { cartLines, cartTotal, placeOrder } = useStore()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>("review")
  const [note, setNote] = useState("")
  const [placed, setPlaced] = useState<Order | null>(null)

  useEffect(() => {
    if (open) return
    const t = setTimeout(() => { setPhase("review"); setNote(""); setPlaced(null) }, 200)
    return () => clearTimeout(t)
  }, [open])

  function pay() {
    setPhase("processing")
    // Mock payment: replace this timeout with the real payment/order API call.
    setTimeout(() => {
      const order = placeOrder(payment, note.trim() || undefined)
      if (order) { setPlaced(order); setPhase("done") } else { setPhase("review"); toast.error("Your order is empty.") }
    }, 1400)
  }

  const hint = PAYMENTS.find((p) => p.value === payment)?.hint

  return (
    <Dialog open={open} onOpenChange={(o) => { if (phase !== "processing") onOpenChange(o) }}>
      <DialogContent>
        {phase === "done" && placed ? (
          <div className="grid justify-items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-14 text-primary" />
            <DialogTitle>Order placed</DialogTitle>
            <DialogDescription>Your order <b className="text-foreground">{placed.id}</b> was sent to the kitchen. We'll mark it ready when it's done.</DialogDescription>
            <div className="w-full rounded-xl bg-muted p-3 text-sm">
              {placed.items.map((i) => <div key={i.menuItemId} className="flex justify-between py-0.5"><span>{i.qty} × {i.name}</span><span>{peso(i.qty * i.price)}</span></div>)}
              <div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Total ({placed.paymentMethod})</span><span>{peso(placed.total)}</span></div>
            </div>
            <DialogFooter className="w-full">
              <Button variant="outline" onClick={() => { onOpenChange(false); navigate("/history") }}>View history</Button>
              <Button onClick={() => onOpenChange(false)}>Order more</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Checkout</DialogTitle>
              <DialogDescription>Review your order before sending it to the kitchen.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
              {cartLines.map(({ item, qty }) => <div key={item.id} className="flex justify-between"><span>{qty} × {item.name}</span><span>{peso(qty * item.price)}</span></div>)}
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{peso(cartTotal)}</span></div>
            </div>
            <div className="text-sm"><span className="font-semibold">Payment:</span> {payment}<p className="text-xs text-muted-foreground">{hint}</p></div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note for the kitchen (optional)</Label>
              <Input id="note" placeholder="Less ice, no sugar…" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} disabled={phase === "processing"} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === "processing"}>Back</Button>
              <Button onClick={pay} disabled={phase === "processing" || cartLines.length === 0}>
                {phase === "processing" ? <><Loader2 className="animate-spin" /> Processing…</> : `Confirm & send to kitchen`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function OrderPage() {
  const { menu, addToCart, cartCount, cartTotal } = useStore()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<"All" | Category>("All")
  const [payment, setPayment] = useState<PaymentMethod>("Cash")
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  const items = useMemo(
    () => menu.filter((m) => (category === "All" || m.category === category) && m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [menu, search, category]
  )

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search menu items" className="pl-9" placeholder="Search menu items…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Menu categories">
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={category === f}
                onClick={() => setCategory(f)}
                className={cn("rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors", category === f ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-accent")}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">No drinks match "{search}". Try a different name or category.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className={cn("flex gap-3 p-3 shadow-sm", !item.available && "opacity-60")}>
                <MenuImage src={item.image} alt={item.name} className="size-24 shrink-0 rounded-xl sm:size-28" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="font-bold leading-tight">{item.name}</h3>
                  <p className="mt-1 font-bold">{peso(item.price)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    {item.available ? <Badge variant="tag">{item.tag ?? item.category}</Badge> : <Badge variant="destructive">Sold out</Badge>}
                    <Button size="icon" variant="secondary" className="size-8 rounded-lg" disabled={!item.available} onClick={() => addToCart(item.id)} aria-label={`Add ${item.name} to order`}>
                      <Plus />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <aside className="sticky top-0 hidden w-80 shrink-0 xl:block">
        <CartPanel payment={payment} onPaymentChange={setPayment} onCheckout={() => setCheckoutOpen(true)} />
      </aside>

      {/* Mobile / tablet cart button */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-3 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-xl lg:bottom-6 xl:hidden"
        >
          <ShoppingBag className="size-5" /> {cartCount} {cartCount === 1 ? "item" : "items"} · {peso(cartTotal)}
        </button>
      )}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">Current order</DialogTitle>
          <CartPanel payment={payment} onPaymentChange={setPayment} onCheckout={() => { setCartOpen(false); setCheckoutOpen(true) }} />
        </DialogContent>
      </Dialog>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} payment={payment} />
    </div>
  )
}

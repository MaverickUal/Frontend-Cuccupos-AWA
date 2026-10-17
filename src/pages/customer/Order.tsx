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
import { MenuImage } from "@/components/MenuImage"
import { QuantityStepper } from "@/components/QuantityStepper"
import { useStore } from "@/store/AppStore"
import { orderNo, peso } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Category, Order } from "@/types"

const FILTERS: ("All" | Category)[] = ["All", "Coffee", "Milk Tea", "Frappe", "Others"]

/** Common peso notes/coins, plus an "exact" shortcut, to save the cashier typing. */
const QUICK_TENDER = [20, 50, 100, 200, 500, 1000]

const money = (n: number) => Math.round(n * 100) / 100

interface Tender {
  /** Raw input text, so the field can be empty or mid-typing. */
  raw: string
  amount: number
  change: number
  /** Enough cash to cover the bill? */
  sufficient: boolean
}

function useTender(raw: string, total: number): Tender {
  const amount = money(parseFloat(raw) || 0)
  return { raw, amount, change: money(amount - total), sufficient: amount >= total && amount > 0 }
}

function CashTendered({
  tender,
  onChange,
  total,
  idPrefix,
}: {
  tender: Tender
  onChange: (v: string) => void
  total: number
  idPrefix: string
}) {
  const quick = [total, ...QUICK_TENDER.filter((v) => v > total)]
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-tender`}>Cash tendered</Label>
      <Input
        id={`${idPrefix}-tender`}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        placeholder="0.00"
        value={tender.raw}
        onChange={(e) => onChange(e.target.value)}
        className="tabular-nums"
      />
      <div className="flex flex-wrap gap-1.5">
        {quick.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(String(v))}
            className="rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors hover:bg-accent"
          >
            {v === total ? "Exact" : peso(v)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChangeRow({ tender, total }: { tender: Tender; total: number }) {
  const short = !tender.sufficient
  return (
    <div className="flex items-center justify-between text-lg font-bold">
      <span>Change</span>
      <span className={cn("tabular-nums", short && "text-destructive")}>
        {short ? `Short by ${peso(Math.abs(tender.change))}` : peso(tender.change)}
      </span>
    </div>
  )
}

function CartPanel({
  tender,
  onTenderChange,
  onCheckout,
}: {
  tender: Tender
  onTenderChange: (v: string) => void
  onCheckout: () => void
}) {
  const { cartLines, cartTotal, setQty, removeFromCart } = useStore()
  const canCheckout = cartLines.length > 0 && tender.sufficient
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
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-bold tabular-nums">{peso(cartTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular-nums">{peso(cartTotal)}</span>
        </div>
        {cartLines.length > 0 && (
          <CashTendered tender={tender} onChange={onTenderChange} total={cartTotal} idPrefix="panel" />
        )}
        {cartLines.length > 0 && <ChangeRow tender={tender} total={cartTotal} />}
        <Button className="w-full" size="lg" disabled={!canCheckout} onClick={onCheckout}>
          Checkout
        </Button>
        {cartLines.length > 0 && !tender.sufficient && (
          <p className="text-center text-xs text-muted-foreground">Enter the cash received to continue.</p>
        )}
      </div>
    </Card>
  )
}

type Phase = "review" | "processing" | "done"

function CheckoutDialog({
  open,
  onOpenChange,
  tender,
  onTenderChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tender: Tender
  onTenderChange: (v: string) => void
}) {
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

  async function pay() {
    setPhase("processing")
    // Mock payment delay, then place order via Firebase
    await new Promise((r) => setTimeout(r, 1400))
    const order = await placeOrder(tender.amount, note.trim() || undefined)
    if (order) { setPlaced(order); setPhase("done") } else { setPhase("review"); toast.error("Your order is empty.") }
  }

  const exact = tender.change === 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (phase !== "processing") onOpenChange(o) }}>
      <DialogContent>
        {phase === "done" && placed ? (
          <div className="grid justify-items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-14 text-primary" />
            <DialogTitle>Order placed</DialogTitle>
            <DialogDescription>
              Your order <b className="text-foreground">{orderNo(placed)}</b> was sent to the kitchen.
              {typeof placed.changeGiven === "number" && placed.changeGiven > 0 && (
                <> Return <b className="text-foreground">{peso(placed.changeGiven)}</b> change to the customer.</>
              )}
            </DialogDescription>
            <div className="w-full rounded-xl bg-muted p-3 text-sm">
              {Object.values(placed.items).map((i) => <div key={i.menuItemId} className="flex justify-between py-0.5"><span>{i.qty} × {i.name}</span><span>{peso(i.qty * i.price)}</span></div>)}
              <div className="mt-2 space-y-0.5 border-t pt-2">
                <div className="flex justify-between"><span>Total</span><span>{peso(placed.total)}</span></div>
                <div className="flex justify-between"><span>Cash tendered</span><span>{peso(placed.cashTendered ?? 0)}</span></div>
                <div className="flex justify-between font-bold"><span>Change</span><span>{peso(placed.changeGiven ?? 0)}</span></div>
              </div>
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
              <DialogDescription>Confirm the cash received and the change before sending to the kitchen.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
              {cartLines.map(({ item, qty }) => <div key={item.id} className="flex justify-between"><span>{qty} × {item.name}</span><span>{peso(qty * item.price)}</span></div>)}
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums">{peso(cartTotal)}</span></div>
            </div>
            <CashTendered tender={tender} onChange={onTenderChange} total={cartTotal} idPrefix="dialog" />
            <div className="rounded-xl border-2 border-dashed p-3">
              <div className="flex items-center justify-between text-xl font-bold">
                <span>Change due</span>
                <span className={cn("tabular-nums", !tender.sufficient && "text-destructive")}>
                  {tender.sufficient ? peso(tender.change) : `Short by ${peso(Math.abs(tender.change))}`}
                </span>
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {tender.sufficient
                  ? exact ? "Exact amount — no change needed." : `Hand ${peso(tender.change)} back to the customer.`
                  : "Cash received does not cover the total yet."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note for the kitchen (optional)</Label>
              <Input id="note" placeholder="Less ice, no sugar…" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} disabled={phase === "processing"} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === "processing"}>Back</Button>
              <Button onClick={pay} disabled={phase === "processing" || cartLines.length === 0 || !tender.sufficient}>
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
  const [tenderRaw, setTenderRaw] = useState("")
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  const tender = useTender(tenderRaw, cartTotal)

  const items = useMemo(
    () => menu.filter((m) => (category === "All" || m.category === category) && m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [menu, search, category]
  )

  // Reset the tender whenever the cart empties — the store clears the cart after
  // a successful order, so this wipes the stale amount between sales. Cancelling
  // the dialog deliberately keeps both the cart and the tender.
  useEffect(() => {
    if (cartCount === 0) setTenderRaw("")
  }, [cartCount])

  function startCheckout() {
    setCheckoutOpen(true)
  }

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
        <CartPanel tender={tender} onTenderChange={setTenderRaw} onCheckout={startCheckout} />
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
          <CartPanel tender={tender} onTenderChange={setTenderRaw} onCheckout={() => { setCartOpen(false); startCheckout() }} />
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        tender={tender}
        onTenderChange={setTenderRaw}
      />
    </div>
  )
}
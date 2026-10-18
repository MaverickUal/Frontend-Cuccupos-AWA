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
import { DiscountPicker } from "@/components/DiscountPicker"
import { useStore } from "@/store/AppStore"
import { orderNo, peso } from "@/lib/format"
import { changeFor, type DiscountType } from "@/lib/discounts"
import { cn } from "@/lib/utils"
import type { Category, Order } from "@/types"

const FILTERS: ("All" | Category)[] = ["All", "Coffee", "Milk Tea", "Frappe", "Others"]

/** Common peso notes/coins, plus an "exact" shortcut, to save the cashier typing. */
const QUICK_TENDER = [20, 50, 100, 200, 500, 1000]

const money = (n: number) => Math.round(n * 100) / 100

interface Tender {
  raw: string
  amount: number
  change: number
  sufficient: boolean
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

/** Subtotal → discount → payable. Shown wherever a total appears at checkout. */
function MoneySummary({
  breakdown,
  change,
  sufficient,
}: {
  breakdown: { subtotal: number; discountAmount?: number; amount: number; total: number; type: DiscountType }
  change: number
  sufficient: boolean
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span className="tabular-nums">{peso(breakdown.subtotal)}</span>
      </div>
      {breakdown.amount > 0 && (
        <div className="flex justify-between font-semibold text-emerald-700">
          <span>Discount</span>
          <span className="tabular-nums">−{peso(breakdown.amount)}</span>
        </div>
      )}
      <div className="flex justify-between border-t pt-1 text-base font-bold">
        <span>Total</span>
        <span className="tabular-nums">{peso(breakdown.total)}</span>
      </div>
      <div className="flex justify-between text-lg font-bold">
        <span>Change</span>
        <span className={cn("tabular-nums", !sufficient && "text-destructive")}>
          {sufficient ? peso(change) : `Short by ${peso(Math.abs(change))}`}
        </span>
      </div>
    </div>
  )
}

function CartPanel({
  tenderRaw,
  onTenderChange,
  onCheckout,
  discountType,
  onDiscountChange,
}: {
  tenderRaw: string
  onTenderChange: (v: string) => void
  onCheckout: () => void
  discountType: DiscountType
  onDiscountChange: (t: DiscountType) => void
}) {
  const { cartLines, setQty, removeFromCart, previewDiscount } = useStore()
  const breakdown = previewDiscount(discountType)
  // Derived here rather than passed in, so the panel and the dialog can never
  // disagree about the change.
  const tender = useMemo(() => {
    const amount = money(parseFloat(tenderRaw) || 0)
    const { change, sufficient } = changeFor(amount, breakdown.total)
    return { raw: tenderRaw, amount, change, sufficient }
  }, [tenderRaw, breakdown.total])
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
        {cartLines.length > 0 && (
          <DiscountPicker
            value={discountType}
            onChange={onDiscountChange}
            discountAmount={breakdown.amount}
            idPrefix="panel"
          />
        )}
        {cartLines.length > 0 && (
          <MoneySummary breakdown={breakdown} change={tender.change} sufficient={tender.sufficient} />
        )}
        {cartLines.length > 0 && (
          <CashTendered tender={tender} onChange={onTenderChange} total={breakdown.total} idPrefix="panel" />
        )}
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
  tenderRaw,
  onTenderChange,
  discountType,
  onDiscountChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tenderRaw: string
  onTenderChange: (v: string) => void
  discountType: DiscountType
  onDiscountChange: (t: DiscountType) => void
}) {
  const { cartLines, previewDiscount, placeOrder } = useStore()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>("review")
  const [note, setNote] = useState("")
  const [placed, setPlaced] = useState<Order | null>(null)

  const breakdown = previewDiscount(discountType)
  const tender = useMemo(() => {
    const amount = money(parseFloat(tenderRaw) || 0)
    const { change, sufficient } = changeFor(amount, breakdown.total)
    return { raw: tenderRaw, amount, change, sufficient }
  }, [tenderRaw, breakdown.total])

  useEffect(() => {
    if (open) return
    const t = setTimeout(() => { setPhase("review"); setNote(""); setPlaced(null) }, 200)
    return () => clearTimeout(t)
  }, [open])

  async function pay() {
    setPhase("processing")
    // Mock payment delay, then place order via Firebase
    await new Promise((r) => setTimeout(r, 1400))
    const order = await placeOrder(tender.amount, note.trim() || undefined, discountType)
    if (order) { setPlaced(order); setPhase("done") } else { setPhase("review"); toast.error("Order could not be placed. Please try again.") }
  }

  const exact = tender.sufficient && tender.change === 0

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
                <div className="flex justify-between"><span>Subtotal</span><span>{peso(placed.subtotal ?? placed.total)}</span></div>
                {(placed.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between"><span>Discount</span><span>−{peso(placed.discountAmount ?? 0)}</span></div>
                )}
                <div className="flex justify-between font-bold"><span>Total</span><span>{peso(placed.total)}</span></div>
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
            </div>
            <DiscountPicker
              value={discountType}
              onChange={onDiscountChange}
              discountAmount={breakdown.amount}
              idPrefix="dialog"
              disabled={phase === "processing"}
            />
            <div className="rounded-xl border-2 border-dashed p-3">
              <MoneySummary breakdown={breakdown} change={tender.change} sufficient={tender.sufficient} />
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {tender.sufficient
                  ? exact ? "Exact amount — no change needed." : `Hand ${peso(tender.change)} back to the customer.`
                  : "Cash received does not cover the total yet."}
              </p>
            </div>
            <CashTendered tender={tender} onChange={onTenderChange} total={breakdown.total} idPrefix="dialog" />
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
  const { menu, addToCart, cartCount } = useStore()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<"All" | Category>("All")
  const [tenderRaw, setTenderRaw] = useState("")
  const [discountType, setDiscountType] = useState<DiscountType>("none")
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  const items = useMemo(
    () => menu.filter((m) => (category === "All" || m.category === category) && m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [menu, search, category]
  )

  // Reset the tender and discount whenever the cart empties — the store clears the
  // cart after a successful order, so this wipes stale values between sales.
  // Cancelling the dialog deliberately keeps both.
  useEffect(() => {
    if (cartCount === 0) {
      setTenderRaw("")
      setDiscountType("none")
    }
  }, [cartCount])

  const cartLinesCount = cartCount

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

      {/*
        The desktop and mobile panels both render a live tender field. They are
        separate instances so each keeps its own input focus.
      */}
      <aside className="sticky top-0 hidden w-80 shrink-0 xl:block">
        <CartPanel
          tenderRaw={tenderRaw}
          onTenderChange={setTenderRaw}
          onCheckout={() => setCheckoutOpen(true)}
          discountType={discountType}
          onDiscountChange={setDiscountType}
        />
      </aside>

      {cartLinesCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-3 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-xl lg:bottom-6 xl:hidden"
        >
          <ShoppingBag className="size-5" /> {cartCount} {cartCount === 1 ? "item" : "items"}
        </button>
      )}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">Current order</DialogTitle>
          <CartPanel
            tenderRaw={tenderRaw}
            onTenderChange={setTenderRaw}
            onCheckout={() => { setCartOpen(false); setCheckoutOpen(true) }}
            discountType={discountType}
            onDiscountChange={setDiscountType}
          />
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        tenderRaw={tenderRaw}
        onTenderChange={setTenderRaw}
        discountType={discountType}
        onDiscountChange={setDiscountType}
      />
    </div>
  )
}
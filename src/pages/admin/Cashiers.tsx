import { useMemo, useState, type FormEvent } from "react"
import { Loader2, Search, ShieldOff, ShieldCheck, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useStore } from "@/store/AppStore"
import { formatDate } from "@/lib/format"

interface Row {
  id: string
  name: string
  email?: string
  orders: number
  last?: string
  disabled: boolean
}

export default function AdminCashiers() {
  const { users, orders, currentUser, createCashier, setCashierEnabled } = useStore()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    // Cashiers are the non-admin staff accounts; the owner/manager is excluded.
    users
      .filter((u) => u.role === "cashier")
      .forEach((u) =>
        map.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          orders: 0,
          disabled: (u as { disabled?: boolean }).disabled === true,
        })
      )
    // Orders placed by a since-removed account still surface, so the audit trail
    // is never silently shortened.
    orders.forEach((o) => {
      const r = map.get(o.customerId) ?? { id: o.customerId, name: o.customerName, orders: 0, disabled: false }
      if (o.status !== "cancelled") r.orders += 1
      if (!r.last || o.createdAt > r.last) r.last = o.createdAt
      map.set(o.customerId, r)
    })
    const q = search.trim().toLowerCase()
    return [...map.values()]
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .sort((a, b) => Number(a.disabled) - Number(b.disabled) || b.orders - a.orders)
  }, [users, orders, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.filter((r) => !r.disabled).length} active · {rows.filter((r) => r.disabled).length} disabled
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search cashiers" className="pl-9" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus /> Add cashier
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cashier</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead>Last order</TableHead>
              <TableHead className="text-right">Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No cashiers found.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const isSelf = r.id === currentUser?.id
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">
                    <span className="flex items-center gap-2">
                      {r.name}
                      {isSelf && <Badge variant="secondary">You</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{r.email ?? <Badge variant="secondary">No account</Badge>}</TableCell>
                  <TableCell>
                    {r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="secondary">Active</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-muted-foreground">{r.last ? formatDate(r.last) : "No orders yet"}</TableCell>
                  <TableCell className="text-right">
                    {r.email ? (
                      <Switch
                        checked={!r.disabled}
                        disabled={isSelf}
                        onCheckedChange={(on) => setCashierEnabled(r.id, on)}
                        aria-label={`${r.disabled ? "Re-enable" : "Disable"} ${r.name}`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Disabling a cashier blocks sign-in but keeps their orders and refunds intact for the audit trail.
        You can't disable your own account, so the shop always keeps an administrator.
      </p>

      <CreateCashierDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createCashier} />
    </div>
  )
}

function CreateCashierDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string }>
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function reset() {
    setForm({ name: "", email: "", password: "", confirm: "" })
    setError("")
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (form.name.trim().length < 2) return setError("Enter the cashier's full name.")
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Enter a valid email address.")
    if (form.password.length < 8) return setError("Password must be at least 8 characters.")
    if (form.password !== form.confirm) return setError("Passwords don't match.")

    setBusy(true)
    const res = await onCreate(form.name.trim(), form.email.trim(), form.password)
    setBusy(false)
    if (!res.success) return setError(res.message)
    toast.success(res.message)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="size-5" /> Add cashier</DialogTitle>
          <DialogDescription>
            Creates a sign-in account with the Cashier role. New accounts cannot be made administrators.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cname">Full name</Label>
            <Input id="cname" autoComplete="off" value={form.name} onChange={set("name")} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cemail">Email</Label>
            <Input id="cemail" type="email" autoComplete="off" value={form.email} onChange={set("email")} disabled={busy} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cpass">Password</Label>
              <Input id="cpass" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cconfirm">Confirm password</Label>
              <Input id="cconfirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} disabled={busy} />
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Requires the backend functions to be deployed
            (<code className="rounded bg-muted px-1">firebase deploy --only functions</code>).
          </p>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <><Loader2 className="animate-spin" /> Creating…</> : "Create cashier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useStore } from "@/store/AppStore"
import { formatDate } from "@/lib/format"

interface Row {
  id: string
  name: string
  email?: string
  orders: number
  last?: string
}

export default function AdminCashiers() {
  const { users, orders } = useStore()
  const [search, setSearch] = useState("")

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    // Cashiers are the non-admin staff accounts; the owner/manager is excluded.
    users.filter((u) => u.role === "cashier").forEach((u) => map.set(u.id, { id: u.id, name: u.name, email: u.email, orders: 0 }))
    orders.forEach((o) => {
      const r = map.get(o.customerId) ?? { id: o.customerId, name: o.customerName, orders: 0 }
      if (o.status !== "cancelled") r.orders += 1
      if (!r.last || o.createdAt > r.last) r.last = o.createdAt
      map.set(o.customerId, r)
    })
    const q = search.trim().toLowerCase()
    return [...map.values()].filter((r) => !q || r.name.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)).sort((a, b) => b.orders - a.orders)
  }, [users, orders, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{rows.length} cashier{rows.length === 1 ? "" : "s"}</p>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search cashiers" className="pl-9" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Cashier</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Orders</TableHead><TableHead>Last order</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">No cashiers found.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">{r.name}</TableCell>
                <TableCell>{r.email ?? <Badge variant="secondary">No account</Badge>}</TableCell>
                <TableCell className="text-right">{r.orders}</TableCell>
                <TableCell className="text-muted-foreground">{r.last ? formatDate(r.last) : "No orders yet"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
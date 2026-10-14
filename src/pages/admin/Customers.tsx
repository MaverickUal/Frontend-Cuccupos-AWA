import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useStore } from "@/store/AppStore"
import { formatDate, peso } from "@/lib/format"

interface Row { id: string; name: string; email?: string; orders: number; spent: number; last?: string }

export default function AdminCustomers() {
  const { users, orders } = useStore()
  const [search, setSearch] = useState("")

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    users.filter((u) => u.role === "customer").forEach((u) => map.set(u.id, { id: u.id, name: u.name, email: u.email, orders: 0, spent: 0 }))
    orders.forEach((o) => {
      const r = map.get(o.customerId) ?? { id: o.customerId, name: o.customerName, orders: 0, spent: 0 }
      if (o.status !== "cancelled") { r.orders += 1; r.spent += o.total }
      if (!r.last || o.createdAt > r.last) r.last = o.createdAt
      map.set(o.customerId, r)
    })
    const q = search.trim().toLowerCase()
    return [...map.values()].filter((r) => !q || r.name.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)).sort((a, b) => b.spent - a.spent)
  }, [users, orders, search])

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search customers" className="pl-9" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Total spent</TableHead><TableHead>Last order</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No customers found.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">{r.name}</TableCell>
                <TableCell>{r.email ?? <Badge variant="secondary">No account</Badge>}</TableCell>
                <TableCell className="text-right">{r.orders}</TableCell>
                <TableCell className="text-right font-semibold">{peso(r.spent)}</TableCell>
                <TableCell className="text-muted-foreground">{r.last ? formatDate(r.last) : "No orders yet"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

import { useState, type FormEvent } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MenuImage } from "@/components/MenuImage"
import { useStore } from "@/store/AppStore"
import { peso } from "@/lib/format"
import type { Category, MenuItem } from "@/types"

const CATEGORIES: Category[] = ["Coffee", "Milk Tea", "Frappe", "Others"]

function ItemForm({ item, onDone }: { item: MenuItem | null; onDone: () => void }) {
  const { saveMenuItem } = useStore()
  const [name, setName] = useState(item?.name ?? "")
  const [price, setPrice] = useState(item ? String(item.price) : "")
  const [category, setCategory] = useState<Category>(item?.category ?? "Coffee")
  const [description, setDescription] = useState(item?.description ?? "")
  const [image, setImage] = useState(item?.image ?? "")
  const [available, setAvailable] = useState(item?.available ?? true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = Number(price)
    if (!name.trim()) return setError("Enter a name for the item.")
    if (!Number.isFinite(p) || p <= 0) return setError("Enter a price greater than 0.")
    setSaving(true)
    const result = await saveMenuItem({ id: item?.id, name: name.trim(), price: p, category, description: description.trim(), image: image.trim() || undefined, available })
    setSaving(false)
    if (!result.success) return setError(result.message)
    toast.success(item ? "Item updated" : "Item added")
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="mname">Name</Label><Input id="mname" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="mprice">Price (₱)</Label><Input id="mprice" type="number" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="mdesc">Description</Label><Input id="mdesc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="mimg">Image path or URL (optional)</Label><Input id="mimg" placeholder="/menu/matcha.jpg" value={image} onChange={(e) => setImage(e.target.value)} /></div>
      <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
        <Label htmlFor="mavail">Available to order</Label>
        <Switch id="mavail" checked={available} onCheckedChange={setAvailable} />
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : item ? "Save changes" : "Add item"}</Button>
      </DialogFooter>
    </form>
  )
}

export default function AdminMenu() {
  const { menu, toggleAvailability, deleteMenuItem } = useStore()
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{menu.length} items · {menu.filter((m) => !m.available).length} sold out</p>
        <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus /> Add item</Button>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Price</TableHead><TableHead>Available</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {menu.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <MenuImage src={m.image} alt={m.name} className="size-11 shrink-0 rounded-lg" />
                    <div className="min-w-0"><p className="font-semibold">{m.name}</p><p className="max-w-[18rem] truncate text-xs text-muted-foreground">{m.description}</p></div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="tag">{m.tag ?? m.category}</Badge></TableCell>
                <TableCell className="text-right font-semibold">{peso(m.price)}</TableCell>
                <TableCell><Switch checked={m.available} onCheckedChange={() => toggleAvailability(m.id)} aria-label={`${m.name} available`} /></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => { setEditing(m); setOpen(true) }}><Pencil /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${m.name}`} onClick={() => { if (confirm(`Delete ${m.name}? Past orders keep their record.`)) { deleteMenuItem(m.id); toast.success("Item deleted") } }}><Trash2 className="text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
            <DialogDescription>Changes show up on the customer menu right away.</DialogDescription>
          </DialogHeader>
          <ItemForm item={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

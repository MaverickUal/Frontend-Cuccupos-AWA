import { useRef, useState } from "react"
import { Download, Printer } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { peso } from "@/lib/format"
import { buildReceipt, receiptFilename, SHOP_NAME } from "@/lib/receipt"
import type { Order } from "@/types"

/**
 * Prints and exports one transaction.
 *
 * Printing uses a dedicated stylesheet (`receipt.css`, loaded by index.html) that hides
 * everything except `.receipt-sheet`. So the printed output is this transaction alone,
 * with no nav, no buttons and no neighbouring rows — and printing mutates nothing.
 */
export function ReceiptDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  // Held in a ref so the PDF path never needs the DOM node; the print path grabs it
  // at click time, which is the only moment it is guaranteed to exist.
  const sheetRef = useRef<HTMLDivElement>(null)

  if (!order) return null
  // Narrowed into a local so the closures below keep the non-null type.
  const current: Order = order
  const r = buildReceipt(current)

  function print() {
    if (!sheetRef.current) return
    // Give the browser a frame to lay the sheet out before it snapshots it.
    requestAnimationFrame(() => window.print())
  }

  async function downloadPdf() {
    setBusy(true)
    try {
      // Imported lazily: jspdf is a few hundred KB and nothing else in the app needs it,
      // so it should not sit in the initial bundle for staff who never export a receipt.
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ])
      const autoTable = (autoTableModule as any).default

      // 80mm is the common thermal receipt width. Tall/short page is chosen from the
      // content so a long order isn't clipped onto a second page unexpectedly.
      const doc = new jsPDF({ unit: "mm", format: [80, 297] })
      const W = 80
      const pad = 5
      let y = 10

      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.text(r.shopName, W / 2, y, { align: "center" })
      y += 5
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.text(r.heading, W / 2, y, { align: "center" })
      y += 6

      const line = (label: string, value: string, opts: { bold?: boolean } = {}) => {
        doc.setFont("helvetica", opts.bold ? "bold" : "normal")
        doc.text(label, pad, y)
        doc.text(value, W - pad, y, { align: "right" })
        y += 4.5
      }

      doc.setFontSize(7.5)
      line("Order", r.orderNumber, { bold: true })
      line("Date", r.dateTimeText)
      line("Cashier", r.cashierName)
      line("Status", r.status)
      y += 2

      autoTable(doc, {
        startY: y,
        margin: { left: pad, right: pad },
        theme: "plain",
        styles: { fontSize: 7.5, cellPadding: 1, overflow: "linebreak" },
        head: [["Item", "Qty", "Amount"]],
        headStyles: { fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 34 },
          1: { cellWidth: 9, halign: "right" },
          2: { cellWidth: 27, halign: "right" },
        },
        body: r.lines.map((l) => [l.name, String(l.qty), peso(l.lineTotal)]),
      })
      y = (doc as any).lastAutoTable.finalY + 4

      doc.setFontSize(7.5)
      line("Subtotal", peso(r.subtotal))
      if (r.discountAmount > 0) line(r.discountLabel, `-${peso(r.discountAmount)}`)
      line("TOTAL", peso(r.total), { bold: true })
      line("Payment", r.paymentMethod)
      if (typeof r.cashTendered === "number") line("Cash tendered", peso(r.cashTendered))
      if (typeof r.changeGiven === "number") line("Change given", peso(r.changeGiven))

      if (r.refunds.length > 0) {
        y += 3
        doc.setFont("helvetica", "bold")
        doc.text("REFUNDS", pad, y)
        y += 4
        doc.setFont("helvetica", "normal")
        for (const ref of r.refunds) {
          line(`  ${new Date(ref.createdAt).toLocaleString("en-PH")}`, `-${peso(ref.amount)}`)
          if (ref.reason) {
            doc.setFontSize(6.5)
            doc.text(`    ${ref.reason}`, pad, y)
            y += 3.5
            doc.setFontSize(7.5)
          }
        }
        line("Refunded total", `-${peso(r.refundedTotal)}`, { bold: true })
        line("Remaining refundable", peso(r.remainingRefundable))
      }

      y += 5
      doc.setFontSize(6.5)
      doc.text("Thank you! Please come again.", W / 2, y, { align: "center" })

      doc.save(receiptFilename(current))
      toast.success("Receipt downloaded")
    } catch (err) {
      // Never claim a download that did not happen.
      console.error(err)
      toast.error("Could not generate the PDF. Use Print and choose “Save as PDF” instead.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction receipt</DialogTitle>
          <DialogDescription>
            {r.orderNumber} · {r.dateTimeText}. Printing or downloading affects this transaction only.
          </DialogDescription>
        </DialogHeader>

        {/* This node is what the print stylesheet exposes. Everything else on the page
            is hidden by `receipt.css` while printing. */}
        <div ref={sheetRef} className="receipt-sheet max-h-[52vh] overflow-y-auto rounded-lg border bg-white p-5 text-slate-900">
          <ReceiptBody order={order} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={print}>
            <Printer /> Print
          </Button>
          <Button type="button" disabled={busy} onClick={downloadPdf}>
            <Download /> {busy ? "Preparing…" : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The on-screen receipt. Shared by the print dialog. */
export function ReceiptBody({ order }: { order: Order }) {
  const r = buildReceipt(order)
  return (
    <div className="font-mono text-[11px] leading-snug">
      <div className="text-center">
        <p className="text-sm font-bold tracking-wide">{r.shopName}</p>
        <p className="text-[10px] uppercase tracking-widest">{r.heading}</p>
      </div>

      <dl className="mt-3 space-y-0.5 border-y border-slate-300 py-2">
        <Row label="Order" value={r.orderNumber} bold />
        <Row label="Date" value={r.dateTimeText} />
        <Row label="Cashier" value={r.cashierName} />
        <Row label="Status" value={r.status} />
      </dl>

      <table className="mt-2 w-full">
        <thead>
          <tr className="border-b border-slate-300 text-[10px] uppercase">
            <th className="pb-1 text-left font-bold">Item</th>
            <th className="pb-1 text-right font-bold">Qty</th>
            <th className="pb-1 text-right font-bold">Unit</th>
            <th className="pb-1 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={`${l.name}-${i}`} className="align-top">
              <td className="py-0.5 pr-1">{l.name}</td>
              <td className="py-0.5 text-right tabular-nums">{l.qty}</td>
              <td className="py-0.5 text-right tabular-nums">{peso(l.unitPrice)}</td>
              <td className="py-0.5 text-right tabular-nums">{peso(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-2 space-y-0.5 border-t border-slate-300 pt-2">
        <Row label="Subtotal" value={peso(r.subtotal)} />
        {r.discountAmount > 0 && (
          <Row label={r.discountLabel} value={`-${peso(r.discountAmount)}`} />
        )}
        <Row label="Total" value={peso(r.total)} bold />
        <Row label="Payment" value={r.paymentMethod} />
        {typeof r.cashTendered === "number" && (
          <Row label="Cash tendered" value={peso(r.cashTendered)} />
        )}
        {typeof r.changeGiven === "number" && (
          <Row label="Change given" value={peso(r.changeGiven)} />
        )}
      </dl>

      {r.refunds.length > 0 && (
        <div className="mt-2 border-t border-slate-300 pt-2">
          <p className="font-bold uppercase">Refunds</p>
          {r.refunds.map((ref) => (
            <div key={ref.id} className="mt-1">
              <div className="flex justify-between gap-2">
                <span>{new Date(ref.createdAt).toLocaleString("en-PH")}</span>
                <span className="tabular-nums">-{peso(ref.amount)}</span>
              </div>
              {ref.reason && <p className="text-[10px] text-slate-600">{ref.reason}</p>}
              {ref.approvedByName && (
                <p className="text-[10px] text-slate-600">Approved by {ref.approvedByName}</p>
              )}
            </div>
          ))}
          <div className="mt-1 flex justify-between font-bold">
            <span>Refunded total</span>
            <span className="tabular-nums">-{peso(r.refundedTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Remaining refundable</span>
            <span className="tabular-nums">{peso(r.remainingRefundable)}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[10px]">Thank you! Please come again.</p>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className={bold ? "font-bold" : ""}>{label}</dt>
      <dd className={`tabular-nums ${bold ? "font-bold" : ""}`}>{value}</dd>
    </div>
  )
}

export { SHOP_NAME }
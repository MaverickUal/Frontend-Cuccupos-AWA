import { Minus, Plus } from "lucide-react"
import { MAX_QTY } from "@/store/AppStore"

/** Quantity is clamped to 1..MAX_QTY. It can never drop below 1, so removing an item is a separate action. */
export function QuantityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-input bg-background">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className="grid size-7 place-items-center transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="size-3" />
      </button>
      <span className="w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= MAX_QTY}
        onClick={() => onChange(value + 1)}
        className="grid size-7 place-items-center transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3" />
      </button>
    </div>
  )
}

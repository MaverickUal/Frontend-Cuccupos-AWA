import { useEffect, useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { MAX_QTY } from "@/store/AppStore"

/**
 * Quantity is clamped to 1..MAX_QTY. It can never drop below 1, so removing an item is a separate action.
 *
 * The middle cell is a real text input so a cashier can type a quantity instead of tapping
 * "+" repeatedly. Typing only updates local draft state; the cart is touched on commit
 * (blur or Enter). That keeps a mid-edit empty string from silently deleting the cart line
 * or committing a stray value, and it means Escape can always revert.
 */
export function QuantityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const editing = useRef(false)
  const committed = useRef(value)

  // Re-sync from the store whenever the cart changes underneath us (reorder, line
  // removed, another component changed it). Skipped while a keystroke is in flight so
  // a half-typed value is never clobbered.
  useEffect(() => {
    if (editing.current) return
    committed.current = value
    setDraft(String(value))
    setInvalid(false)
  }, [value])

  /** The quantity the cart should step from: the typed value if valid, else the last good one. */
  function base(): number {
    if (!editing.current) return committed.current
    return parseQty(draft) ?? committed.current
  }

  function commit() {
    editing.current = false
    const next = parseQty(draft)
    if (next === null) {
      // Unparseable: revert to the last known-good cart value rather than guessing.
      setDraft(String(committed.current))
      setInvalid(true)
      return
    }
    setInvalid(false)
    committed.current = next
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  /**
   * The buttons must not blur the input first: blur fires before click, which would run
   * commit() with the old value and then apply +/- to a stale base. Blocking mousedown
   * keeps focus in the field so a typed-but-uncommitted value can be stepped from.
   */
  function bump(delta: number) {
    const next = Math.max(1, Math.min(MAX_QTY, base() + delta))
    editing.current = false
    committed.current = next
    setDraft(String(next))
    setInvalid(false)
    if (next !== value) onChange(next)
  }

  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-input bg-background">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= 1 && !editing.current}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => bump(-1)}
        className="grid size-7 place-items-center transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="size-3" />
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Quantity"
        aria-invalid={invalid || undefined}
        value={draft}
        onFocus={(e) => {
          editing.current = true
          e.currentTarget.select()
        }}
        onChange={(e) => {
          // Digits only, bounded to two characters so 100+ cannot even be typed.
          setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
            inputRef.current?.blur()
          } else if (e.key === "Escape") {
            e.preventDefault()
            editing.current = false
            setDraft(String(committed.current))
            setInvalid(false)
            inputRef.current?.blur()
          }
        }}
        className={`w-10 border-x border-input bg-transparent text-center text-sm font-bold tabular-nums outline-none focus:bg-accent/50 ${invalid ? "text-destructive" : ""}`}
      />
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= MAX_QTY && !editing.current}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => bump(1)}
        className="grid size-7 place-items-center transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3" />
      </button>
    </div>
  )
}

/**
 * Turns typed text into a legal quantity, or null when the input makes no sense.
 * Leading zeros are tolerated ("07" -> 7); anything with no usable digit is rejected.
 * Values above MAX_QTY clamp down rather than being refused, matching how the
 * increment button behaves at the ceiling.
 */
export function parseQty(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed || !/\d/.test(trimmed)) return null
  const n = parseInt(trimmed, 10)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.min(MAX_QTY, n))
}
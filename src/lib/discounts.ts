/**
 * Discount rules for PWD and Senior Citizen.
 *
 * ---------------------------------------------------------------------------
 * UNRESOLVED ASSUMPTIONS — the business owner must confirm these before launch.
 * ---------------------------------------------------------------------------
 * 1. RATE. `DISCOUNT_RATE` is set to 0.20 (20%). This is the commonly cited
 *    figure for Philippine PWD/Senior Citizen concessions, but it is NOT verified
 *    here and the correct rate depends on the establishment category, current
 *    legislation, and whether the seller holds a certificate of accreditation.
 *    Change this one constant once confirmed; nothing else hardcodes a rate.
 * 2. ELIGIBILITY. This module does NOT verify that the buyer actually holds a
 *    valid PWD/Senior Citizen ID. No such verification exists in the codebase and
 *    inventing one would be worse than omitting it. The cashier asserts
 *    eligibility and the reason is stored on the order as an audit trail.
 * 3. SCOPE. The discount is applied to the food subtotal. This assumes every item
 *    in the cart is discount-eligible. If the shop sells non-eligible items
 *    (e.g. take-away packaging, or goods with their own rules), they must be
 *    marked and excluded via `ELIGIBLE_CATEGORIES` below.
 * 4. STACKING. Only one discount may apply per order; PWD and Senior Citizen are
 *    never combined.
 *
 * All monetary values are PHP pesos.
 */

export const DISCOUNT_TYPES = ["none", "pwd", "senior"] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

export const DISCOUNT_LABELS: Record<DiscountType, string> = {
  none: "No discount",
  pwd: "PWD",
  senior: "Senior Citizen",
}

/** Unverified — see assumption 1 above. */
export const DISCOUNT_RATE = 0.2

/**
 * Assumption 3. `null` means "every category is eligible", which is the
 * current behaviour. Narrow it to e.g. ["Coffee", "Milk Tea"] if some items
 * must be excluded.
 */
export const ELIGIBLE_CATEGORIES: readonly string[] | null = null

export const MIN_DISCOUNTABLE_AMOUNT = 1

export interface DiscountableLine {
  category: string
  qty: number
  price: number
}

export interface DiscountBreakdown {
  type: DiscountType
  /** Sum of all line items before any discount. */
  subtotal: number
  /** Portion of the subtotal eligible for a discount. */
  eligibleSubtotal: number
  rate: number
  /** Amount taken off. Never negative, never more than the eligible subtotal. */
  amount: number
  /** What the customer actually pays: subtotal - amount. */
  total: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Whether a category qualifies for a discount.
 *
 * The `allowed` parameter is typed rather than read from the const directly: a
 * `const` initialised to `null` gets narrowed to the literal type `null`, which
 * would make the list branch unreachable to TypeScript.
 */
export function isDiscountableCategory(
  category: string,
  allowed: readonly string[] | null = ELIGIBLE_CATEGORIES
): boolean {
  return allowed === null || allowed.includes(category)
}

export function eligibleSubtotalOf(lines: DiscountableLine[]): number {
  return round2(
    lines.reduce(
      (sum, l) => sum + (isDiscountableCategory(l.category) ? l.qty * l.price : 0),
      0
    )
  )
}

/**
 * Compute a discount from line items.
 *
 * Deterministic and side-effect free: the same lines and type always produce the
 * same numbers, and the result is internally consistent (amount <= eligible <= subtotal,
 * total = subtotal - amount).
 */
export function computeDiscount(lines: DiscountableLine[], type: DiscountType): DiscountBreakdown {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.qty * l.price, 0))
  const eligibleSubtotal = eligibleSubtotalOf(lines)

  if (type === "none" || eligibleSubtotal < MIN_DISCOUNTABLE_AMOUNT) {
    return { type: "none", subtotal, eligibleSubtotal, rate: 0, amount: 0, total: subtotal }
  }

  // Floor to the cent so the discount can never exceed the eligible subtotal.
  const amount = Math.min(round2(eligibleSubtotal * DISCOUNT_RATE), eligibleSubtotal)
  const total = round2(subtotal - amount)

  return {
    type,
    subtotal,
    eligibleSubtotal,
    rate: DISCOUNT_RATE,
    amount,
    total: Math.max(0, total),
  }
}

/**
 * Cash change for a given tender.
 *
 * `cash < 0` is treated as no cash entered. The returned `sufficient` flag is what
 * the checkout screen uses to block confirming an underpayment.
 */
export function changeFor(cash: number, total: number) {
  const tendered = round2(cash)
  const payable = round2(total)
  const change = round2(tendered - payable)
  return { tendered, payable, change, sufficient: tendered > 0 && tendered >= payable }
}
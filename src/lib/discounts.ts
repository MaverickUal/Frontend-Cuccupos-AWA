/**
 * Discount rules for PWD and Senior Citizen.
 *
 * ---------------------------------------------------------------------------
 * VERIFIED AGAINST PRIMARY SOURCES (checked October 2026)
 * ---------------------------------------------------------------------------
 * The 20% rate is not a guess. It is the statutory minimum for both concessions:
 *
 *   - PWD: RA 10754 Sec. 32(a) grants "at least twenty percent (20%) discount and
 *     exemption from the value-added tax (VAT), if applicable", and 32(a)(1)
 *     explicitly covers "restaurants and recreation centers". The IRR of RA 9442
 *     Sec. 6.1(b) extends this to a restaurant's "food drinks, beverages, dessert
 *     and other consumable items served by the establishments including value
 *     meals and other similar food counters, fast food, cooked food and short
 *     orders including take-outs" — which covers a coffee shop's drinks. The rule is
 *     a floor, not a cap: a business may grant more.
 *   - Senior Citizen: RA 7432 Sec. 5(a), as amended by RA 9994 and restated in
 *     RA 11916, grants the same 20% discount plus VAT exemption.
 *
 * Two statutory rules the code deliberately does NOT implement, because both are
 * operational/legal decisions for the owner, not software defaults:
 *
 *   - NO DOUBLE DISCOUNTING. RA 10754 IRR Sec. 12 and the DOT/DTI circulars state
 *     that a person who is both PWD and senior may use EITHER ID for the single
 *     20% discount, never both. This module enforces one discount per order, so
 *     the prohibition holds by construction.
 *   - PROMOTIONAL DISCOUNTS. Where an establishment already runs a promo, the
 *     buyer takes whichever is more favourable, not both. This app has no promo
 *     engine, so there is nothing to reconcile today; revisit if promos are added.
 *
 * Note this app discounts the full pre-VAT amount and does not model VAT at all.
 * VAT exemption is a separate BIR bookkeeping matter for the owner.
 *
 * ---------------------------------------------------------------------------
 * STILL UNRESOLVED — confirm with the business owner before launch
 * ---------------------------------------------------------------------------
 * 1. ELIGIBILITY / PROOF OF ID. The law conditions the concession on proof of
 *    entitlement: a PWD ID, barangay/city ID or passport, and a senior citizen ID.
 *    RA 10754 IRR Sec. 12 further requires that the establishment's sales records
 *    carry the concession holder's NAME, ID NUMBER and TIN if the discount is
 *    claimed as a tax deduction. This application records none of that: the
 *    cashier asserts eligibility and only the discount type is stored on the
 *    order. Collecting and retaining ID details is a policy and privacy decision
 *    for the owner, and the app must not be described as compliant until it is.
 * 2. SCOPE. The discount is applied to the whole food subtotal, which assumes every
 *    item is eligible. RA 10754 does restrict use to "the exclusive use and
 *    enjoyment" of the buyer. If any item should be excluded, list its category in
 *    `ELIGIBLE_CATEGORIES` below.
 * 3. STACKING. Only one discount applies per order; PWD and Senior are never
 *    combined. This matches the statute, so it is a rule rather than an open
 *    question.
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

/**
 * The statutory minimum concession for both PWD and Senior Citizen.
 * Verified against RA 10754 Sec. 32(a)(1), the IRR of RA 9442 Sec. 6.1(b), and
 * RA 7432 Sec. 5(a) as amended — see the header note. This is a floor the law
 * grants, so raising it is always permitted.
 */
export const DISCOUNT_RATE = 0.2

/**
 * Assumption 2 above. `null` means "every category is eligible", which is the
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
/**
 * Display helpers for the two staff roles.
 *
 * The database stores the raw value ("admin" / "cashier"); these are the labels the
 * UI shows. Kept in one place so a role is never described two different ways in two
 * different screens.
 *
 * `roleLabel` deliberately returns "Unknown" for anything unrecognised rather than
 * defaulting to "Cashier". Showing an account with a missing or corrupt role as a
 * cashier would quietly mislabel a real administrator — the QA spec calls this out
 * specifically.
 */

/** "admin" -> "Owner/Manager", "cashier" -> "Cashier". */
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "admin":
      return "Owner/Manager"
    case "cashier":
      return "Cashier"
    default:
      return "Unknown"
  }
}

/** True only for an exact "cashier" match. Used to decide staff-facing capabilities. */
export function isCashier(role: string | null | undefined): boolean {
  return role === "cashier"
}

/** True only for an exact "admin" match. */
export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin"
}
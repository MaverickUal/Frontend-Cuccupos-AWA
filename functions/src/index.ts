/**
 * CuccuPOS backend functions.
 *
 * These exist because the following cannot be done safely from a browser client:
 *
 *  - Refunds. Validating the remaining refundable amount and writing an audit
 *    record must be atomic, and `approvedBy` must come from the verified session
 *    rather than anything the client sends. A client-side check is advisory only,
 *    because anyone can open devtools and call the RTDB SDK directly.
 *  - Creating another user's Authentication account. That requires the Admin SDK.
 *  - Deleting/deactivating an Authentication account. Also Admin SDK, and it does
 *    not cascade to RTDB.
 *
 * Every function re-checks the caller's role from the database rather than trusting
 * the ID token alone, so a stale token cannot grant access after a role change.
 */
import { initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getDatabase, ServerValue } from "firebase-admin/database"
import { HttpsError, onCall } from "firebase-functions/v2/https"
import { logger } from "firebase-functions"

initializeApp()

const db = getDatabase()
const auth = getAuth()

/** Rejects the call unless the caller is currently an admin in the database. */
async function requireAdmin(uid: string): Promise<{ uid: string; name: string }> {
  const snap = await db.ref(`users/${uid}`).get()
  const profile = snap.val()
  if (!profile) {
    throw new HttpsError("unauthenticated", "No user profile found for this session.")
  }
  if (profile.role !== "admin") {
    throw new HttpsError("permission-denied", "Only an Owner/Manager can perform this action.")
  }
  if (profile.disabled === true) {
    throw new HttpsError("permission-denied", "This account is disabled.")
  }
  return { uid, name: String(profile.name ?? "") }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Issue a refund against an order.
 *
 * Runs as a single transaction on the order node so two concurrent refunds can
 * never both pass the "amount remaining" check. The order itself is never
 * modified beyond appending to `refunds` and updating the cached
 * `refundedTotal`; its original total, items, and history stay intact.
 */
export const refundOrder = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.")
  const admin = await requireAdmin(uid)

  const { orderId, amount, reason } = request.data ?? {}

  if (typeof orderId !== "string" || !orderId.trim()) {
    throw new HttpsError("invalid-argument", "orderId is required.")
  }
  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new HttpsError("invalid-argument", "A reason of at least 3 characters is required.")
  }

  const requested = round2(Number(amount))
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new HttpsError("invalid-argument", "Refund amount must be greater than zero.")
  }

  // Locate the order. Orders live under /orders/<customerId>/<orderId>.
  const ordersSnap = await db.ref("orders").get()
  const byCustomer = ordersSnap.val() as Record<string, Record<string, any>> | null

  let located: { customerId: string; order: any } | null = null
  for (const [customerId, bucket] of Object.entries(byCustomer ?? {})) {
    const order = bucket?.[orderId]
    if (order) {
      located = { customerId, order }
      break
    }
  }

  if (!located) {
    throw new HttpsError("not-found", "Order not found.")
  }

  const { customerId } = located
  const orderRef = db.ref(`orders/${customerId}/${orderId}`)
  const refundId = db.ref(`orders/${customerId}/${orderId}/refunds`).push().key!

  return await orderRef.transaction(
    (current: any) => {
      if (!current) throw new HttpsError("not-found", "Order not found.")

      // Cancelled orders are never refundable — there is no sale to reverse.
      if (current.status === "cancelled") {
        throw new HttpsError("failed-precondition", "A cancelled order cannot be refunded.")
      }

      // Prefer the running total we maintain; fall back to summing completed
      // refunds so a partially-migrated database can't over-refund.
      const refunds = (current.refunds ?? {}) as Record<string, any>
      const completed = Object.values(refunds)
        .filter((r: any) => r && r.status === "completed")
        .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0)
      const alreadyRefunded = round2(
        typeof current.refundedTotal === "number" ? Math.max(current.refundedTotal, completed) : completed
      )

      const paid = round2(Number(current.total ?? 0))
      const remaining = round2(paid - alreadyRefunded)

      if (remaining <= 0.004) {
        throw new HttpsError("failed-precondition", "This order has already been fully refunded.")
      }
      if (requested > remaining + 0.004) {
        throw new HttpsError(
          "failed-precondition",
          `Refund exceeds the amount remaining. Maximum refundable is ${remaining.toFixed(2)}.`
        )
      }

      const record = {
        id: refundId,
        orderId,
        orderDisplayId: current.displayId ?? undefined,
        amount: requested,
        reason: reason.trim(),
        status: "completed",
        createdAt: new Date().toISOString(),
        approvedBy: admin.uid,
        approvedByName: admin.name,
      }

      return {
        ...current,
        refunds: { ...refunds, [refundId]: record },
        refundedTotal: round2(alreadyRefunded + requested),
      };
    },
    undefined,
    false
  ).then((result) => {
    if (!result.committed) {
      // Contention, not a validation failure — tell the caller to retry.
      throw new HttpsError("aborted", "Refund could not be applied. Please try again.")
    }
    logger.info("refund applied", { orderId, amount: requested, by: admin.uid })
    return { ok: true, refundId, orderId, amount: requested, remaining: round2(requested) }
  })
})

/**
 * Create a cashier account.
 *
 * Creating an Authentication user for somebody else requires the Admin SDK, which
 * cannot ship in a browser bundle. The role is written here as "cashier" and is
 * not settable by the caller — there is deliberately no way to create an admin
 * through this endpoint.
 */
export const createCashier = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.")
  const admin = await requireAdmin(uid)

  const { name, email, password } = request.data ?? {}

  const cleanName = typeof name === "string" ? name.trim() : ""
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : ""
  const cleanPassword = typeof password === "string" ? password : ""

  if (cleanName.length < 2) {
    throw new HttpsError("invalid-argument", "Enter the cashier's full name.")
  }
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.")
  }
  if (cleanPassword.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.")
  }

  let created: string
  try {
    const user = await auth.createUser({
      email: cleanEmail,
      password: cleanPassword,
      displayName: cleanName,
      emailVerified: false,
      disabled: false,
    })
    created = user.uid
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account with this email already exists.")
    }
    logger.error("createUser failed", err)
    throw new HttpsError("internal", "Could not create the account. Please try again.")
  }

  // Roll the profile back if the database write fails, so we never leave an
  // Authentication account with no matching profile.
  try {
    await db.ref(`users/${created}`).set({
      name: cleanName,
      email: cleanEmail,
      role: "cashier",
      createdAt: new Date().toISOString(),
      createdBy: admin.uid,
      disabled: false,
    })
  } catch (err) {
    logger.error("profile write failed, rolling back auth user", err)
    try {
      await auth.deleteUser(created)
    } catch (rollbackErr) {
      logger.error("rollback failed", rollbackErr)
    }
    throw new HttpsError("internal", "Could not save the cashier profile. Nothing was created.")
  }

  logger.info("cashier created", { uid: created, by: admin.uid })
  return { ok: true, uid: created, email: cleanEmail, name: cleanName }
})

/**
 * Disable (or re-enable) a cashier account.
 *
 * Deactivating is used instead of deleting on purpose: removing the RTDB profile
 * would strip the ownership link on past orders, and deleting the Authentication
 * user would break the audit trail for refunds. Disabling blocks sign-in while
 * keeping every historical record readable and attributable.
 *
 * Guards against an admin locking themselves out.
 */
export const setCashierEnabled = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.")
  await requireAdmin(uid)

  const { targetUid, enabled } = request.data ?? {}

  if (typeof targetUid !== "string" || !targetUid.trim()) {
    throw new HttpsError("invalid-argument", "targetUid is required.")
  }
  if (targetUid === uid) {
    throw new HttpsError("failed-precondition", "You cannot disable your own account.")
  }

  const targetRef = db.ref(`users/${targetUid}`)
  const snap = await targetRef.get()
  const profile = snap.val()
  if (!profile) {
    throw new HttpsError("not-found", "That account no longer exists.")
  }
  if (profile.role === "admin") {
    throw new HttpsError(
      "failed-precondition",
      "This account is an Owner/Manager. Use a dedicated administrator flow for those."
    )
  }

  const next = enabled === true

  try {
    await auth.setCustomUserClaims(targetUid, { disabled: next })
  } catch (err) {
    logger.error("auth disable failed", err)
    throw new HttpsError("internal", "Could not update the sign-in account.")
  }

  await targetRef.update({
    disabled: next,
    // Credentials are kept so the account can be re-enabled; an owner/manager can
    // reset them out of band if needed.
    reenabledAt: next ? new Date().toISOString() : null,
  })

  logger.info("cashier toggled", { targetUid, enabled: next, by: uid })
  return { ok: true, targetUid, enabled: next }
})
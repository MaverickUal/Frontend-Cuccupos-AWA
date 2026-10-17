/**
 * Duplicate-product detection for the admin menu.
 *
 * Matching rule (deliberately narrow, so genuine variants are never blocked):
 *   two items collide when their normalized names AND their categories are equal.
 *
 * Normalization folds exactly the three accidental-typo classes the QA spec calls
 * for -- case, leading/trailing whitespace, and repeated internal whitespace (plus
 * Unicode NFKC so a stray non-breaking space or full-width letter still matches).
 *
 * What it deliberately does NOT fold:
 *   - hyphens vs spaces ("Iced-Latte" vs "Iced Latte") -- could be a real variant
 *   - the `tag` badge -- it is a marketing label ("New", "Best Seller"), not a
 *     product identity, so two items tagged differently are still the same drink
 *   - price -- a re-priced drink is still a duplicate if the name and category match
 *
 * Category is part of the key on purpose: this menu model has no variant/size
 * field, so the only structured way to say "these are different products" is the
 * category. Items sharing a name across categories are surfaced separately as
 * advisory (non-blocking) so an admin can eyeball them without the tool
 * second-guessing a deliberate classification.
 */

export type DuplicateLike = {
  id: string
  name: string
  category: string
}

/**
 * Canonical form used for comparison. Not a display value -- use the item's own
 * `name` everywhere the user actually sees text.
 */
export function normalizeMenuName(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function key(name: string, category: string): string {
  return `${normalizeMenuName(name)}::${category.trim().toLowerCase()}`
}

export interface DuplicateGroup {
  /** Normalized name + category, for React keys. */
  key: string
  /** Original casing of the first item in the group, for display. */
  label: string
  category: string
  items: DuplicateLike[]
}

/**
 * Hard duplicates: same normalized name within the same category. These are what
 * `saveMenuItem` refuses to create.
 */
export function findDuplicateGroups(items: DuplicateLike[]): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateLike[]>()
  for (const item of items) {
    const k = key(item.name, item.category)
    const bucket = buckets.get(k)
    if (bucket) bucket.push(item)
    else buckets.set(k, [item])
  }

  const groups: DuplicateGroup[] = []
  for (const [k, group] of buckets) {
    if (group.length < 2) continue
    groups.push({
      key: k,
      label: group[0].name,
      category: group[0].category,
      items: group,
    })
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Items that a new/edited name would collide with. `excludeId` is the item being
 * edited, so saving an unchanged product does not flag itself.
 */
export function findConflictingMenuItems(
  items: DuplicateLike[],
  name: string,
  category: string,
  excludeId?: string
): DuplicateLike[] {
  const target = key(name, category)
  return items.filter((i) => key(i.name, i.category) === target && i.id !== excludeId)
}

export interface CrossCategoryMatch {
  name: string
  items: DuplicateLike[]
}

/**
 * Same normalized name, different categories. Advisory only -- shown to the admin
 * as something to review, never used to block a save.
 */
export function findCrossCategoryNameMatches(items: DuplicateLike[]): CrossCategoryMatch[] {
  const buckets = new Map<string, DuplicateLike[]>()
  for (const item of items) {
    const n = normalizeMenuName(item.name)
    const bucket = buckets.get(n)
    if (bucket) bucket.push(item)
    else buckets.set(n, [item])
  }

  const matches: CrossCategoryMatch[] = []
  for (const [n, group] of buckets) {
    const categories = new Set(group.map((g) => g.category.trim().toLowerCase()))
    if (group.length < 2 || categories.size < 2) continue
    matches.push({ name: group[0].name, items: group })
  }
  return matches.sort((a, b) => a.name.localeCompare(b.name))
}
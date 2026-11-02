import { z } from 'zod'
import { sortKey } from '@tuner/shared'

/**
 * What this browser remembers. An external store rather than React state: the
 * player, the hotkeys and the panels all read it, and it has to survive a
 * reload.
 *
 * Nothing here is catalog data — that lives in Postgres now. This is only the
 * things that are true of this viewer: what they starred, what they watched,
 * and how they last left the panel.
 */

const KEY = 'tuner.v3'
const RECENT_MAX = 40

const filtersSchema = z.object({
  country: z.string().default(''),
  language: z.string().default(''),
  category: z.array(z.string()).default([]),
  minHeight: z.number().int().default(0),
  liveOnly: z.boolean().default(false),
  playableOnly: z.boolean().default(true),
  matchedOnly: z.boolean().default(false),
})

export type Filters = z.infer<typeof filtersSchema>

export const BLANK_FILTERS: Filters = filtersSchema.parse({})

const prefsSchema = z.object({
  favorites: z.array(z.string()).default([]),
  recent: z.array(z.string()).default([]),
  filters: filtersSchema.default(BLANK_FILTERS),
  sort: sortKey.default('name'),
  /** Admin token, held here so the panel is usable across reloads. */
  adminToken: z.string().default(''),
  /** Stream token, when the deployment requires one. */
  streamToken: z.string().default(''),
  /** Move to the next source automatically when one fails. */
  autoNext: z.boolean().default(true),
  /** Retry through the server when a direct fetch fails. */
  autoProxy: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(1),
})

export type Prefs = z.infer<typeof prefsSchema>

const blank = (): Prefs => prefsSchema.parse({})

/**
 * Stored preferences are parsed, not trusted. A build that renamed a field
 * leaves the old shape behind, and a partially valid object is more useful
 * than a thrown error on a cold start.
 */
function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return blank()
    const parsed = prefsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : blank()
  } catch {
    // Private mode, blocked storage, or a corrupted entry.
    return blank()
  }
}

let state = read()
const listeners = new Set<() => void>()

function commit() {
  // A new object each time, so useSyncExternalStore sees the change.
  state = { ...state }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Quota or private mode: the session still works, it just will not persist.
  }
  for (const listener of listeners) listener()
}

export const prefs = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  snapshot: () => state,

  set(patch: Partial<Prefs>) {
    state = { ...state, ...patch }
    commit()
  },

  setFilters(patch: Partial<Filters>) {
    state.filters = { ...state.filters, ...patch }
    commit()
  },

  resetFilters() {
    state.filters = { ...BLANK_FILTERS }
    commit()
  },

  isFavorite: (id: string) => state.favorites.includes(id),

  /** Returns whether it is now starred, so the caller can react immediately. */
  toggleFavorite(id: string) {
    const starred = state.favorites.includes(id)
    state.favorites = starred
      ? state.favorites.filter((x) => x !== id)
      : [id, ...state.favorites]
    commit()
    return !starred
  },

  addRecent(id: string) {
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, RECENT_MAX)
    commit()
  },

  clear() {
    state = blank()
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing to remove.
    }
    commit()
  },
}

/** How many filters are narrowing the lineup, for the panel's reset affordance. */
export function activeFilterCount(f: Filters) {
  return (
    (f.country ? 1 : 0) +
    (f.language ? 1 : 0) +
    f.category.length +
    (f.minHeight ? 1 : 0) +
    (f.liveOnly ? 1 : 0) +
    (f.matchedOnly ? 1 : 0) +
    // `playableOnly` defaults on, so it only counts when turned off.
    (f.playableOnly ? 0 : 1)
  )
}

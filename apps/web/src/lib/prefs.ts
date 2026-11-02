import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { z } from 'zod'
import { sortKey } from '@tuner/shared'

/**
 * What this browser remembers: the country and language you picked, the rest
 * of the filters, what you starred, what you watched, and the two tokens.
 *
 * Nothing here is catalog data — that lives in Postgres now. This is only what
 * is true of this viewer, which is why it is the one thing still kept client
 * side.
 */

const STORAGE_KEY = 'tuner'
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

/**
 * The persisted shape, as a schema rather than a type.
 *
 * Stored state is input from an earlier build of this application, which is to
 * say input we do not control — a renamed field or a half-written entry should
 * degrade to the default for that field, not throw on a cold start.
 */
const persistedSchema = z.object({
  filters: filtersSchema.default(BLANK_FILTERS),
  sort: sortKey.default('name'),
  favorites: z.array(z.string()).default([]),
  recent: z.array(z.string()).default([]),
  /** Admin token, held here so the operator panel survives a reload. */
  adminToken: z.string().default(''),
  /** Stream token, when the deployment requires one. */
  streamToken: z.string().default(''),
  /** Move to the next source automatically when one fails. */
  autoNext: z.boolean().default(true),
  /** Retry through the server when a direct fetch fails. */
  autoProxy: z.boolean().default(true),
})

export type Persisted = z.infer<typeof persistedSchema>

const BLANK: Persisted = persistedSchema.parse({})

interface Actions {
  set: (patch: Partial<Persisted>) => void
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  toggleFavorite: (id: string) => boolean
  isFavorite: (id: string) => boolean
  addRecent: (id: string) => void
  clear: () => void
}

export type PrefsState = Persisted & Actions

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      ...BLANK,

      set: (patch) => set(patch),

      setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),

      resetFilters: () => set({ filters: { ...BLANK_FILTERS } }),

      isFavorite: (id) => get().favorites.includes(id),

      toggleFavorite: (id) => {
        const starred = get().favorites.includes(id)
        set((state) => ({
          favorites: starred ? state.favorites.filter((x) => x !== id) : [id, ...state.favorites],
        }))
        return !starred
      },

      addRecent: (id) =>
        set((state) => ({
          recent: [id, ...state.recent.filter((x) => x !== id)].slice(0, RECENT_MAX),
        })),

      clear: () => set({ ...BLANK }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Private mode and blocked storage both throw; the session still works,
      // it just will not persist.
      storage: createJSONStorage(() => localStorage),
      // Actions are not state, so they are not written to localStorage.
      partialize: (state): Persisted => ({
        filters: state.filters,
        sort: state.sort,
        favorites: state.favorites,
        recent: state.recent,
        adminToken: state.adminToken,
        streamToken: state.streamToken,
        autoNext: state.autoNext,
        autoProxy: state.autoProxy,
      }),
      /**
       * Everything that comes back off disk is validated. A field that no
       * longer parses falls back to its default rather than poisoning the
       * store, and an entry from a build before this one simply loses the
       * fields it never had.
       */
      merge: (stored, current) => {
        const parsed = persistedSchema.safeParse(stored)
        return { ...current, ...(parsed.success ? parsed.data : BLANK) }
      },
    },
  ),
)

/**
 * The store's actions, for callers that are not components — the playback hook
 * recording a channel in history, for instance.
 */
export const prefs = {
  get state() {
    return usePrefsStore.getState()
  },
  set: (patch: Partial<Persisted>) => usePrefsStore.getState().set(patch),
  setFilters: (patch: Partial<Filters>) => usePrefsStore.getState().setFilters(patch),
  resetFilters: () => usePrefsStore.getState().resetFilters(),
  toggleFavorite: (id: string) => usePrefsStore.getState().toggleFavorite(id),
  isFavorite: (id: string) => usePrefsStore.getState().isFavorite(id),
  addRecent: (id: string) => usePrefsStore.getState().addRecent(id),
  clear: () => usePrefsStore.getState().clear(),
}

/**
 * The persisted values, without the actions.
 *
 * `useShallow` so a component re-renders when one of these changes rather than
 * on every store write — selecting the whole state object would defeat the
 * point of a store.
 */
export function usePrefs(): Persisted {
  return usePrefsStore(
    useShallow((state) => ({
      filters: state.filters,
      sort: state.sort,
      favorites: state.favorites,
      recent: state.recent,
      adminToken: state.adminToken,
      streamToken: state.streamToken,
      autoNext: state.autoNext,
      autoProxy: state.autoProxy,
    })),
  )
}

/** How many filters are narrowing the list, for the panel's reset affordance. */
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

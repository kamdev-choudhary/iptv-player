/**
 * Everything Tuner remembers, all of it in this browser only.
 *
 * An external store rather than React state: the player, the keyboard
 * shortcuts and the grid all read it, and it has to survive a reload.
 */
import { BLANK_FILTERS, type Channel, type Filters, type SortKey } from './types'

const KEY = 'tuner.v2'
const LEGACY_KEY = 'tuner.v1'
const RECENT_MAX = 40

export interface Settings {
  proxy: string
  autoProxy: boolean
  autoNext: boolean
}

export interface Playlist {
  name: string
  channels: Channel[]
}

export interface Persisted {
  favorites: string[]
  recent: string[]
  playlists: Record<string, Playlist>
  settings: Settings
  /** How the wall was last narrowed down, so it comes back as you left it. */
  filters: Filters
  sort: SortKey
}

const blank = (): Persisted => ({
  favorites: [],
  recent: [],
  playlists: {},
  settings: { proxy: '', autoProxy: false, autoNext: true },
  // An https page cannot load a plain http stream, so that filter starts on.
  filters: { ...BLANK_FILTERS, hideInsecure: location.protocol === 'https:' },
  sort: 'name',
})

function read(): Persisted {
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<Persisted>
      const base = blank()
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...parsed.settings },
        filters: { ...base.filters, ...parsed.filters },
      }
    } catch {
      // Private mode, or a corrupted entry — carry on without memory.
    }
  }
  return blank()
}

let state = read()
const listeners = new Set<() => void>()

function commit() {
  // A new object each time, so useSyncExternalStore sees the change.
  state = { ...state }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Quota or private mode: the session still works, it just won't persist.
  }
  for (const fn of listeners) fn()
}

export const store = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  snapshot: () => state,

  get settings() {
    return state.settings
  },

  setSettings(patch: Partial<Settings>) {
    state.settings = { ...state.settings, ...patch }
    commit()
  },

  get filters() {
    return state.filters
  },

  setFilters(patch: Partial<Filters>) {
    state.filters = { ...state.filters, ...patch }
    commit()
  },

  resetFilters() {
    // The https filter is about what this page can load, not a preference.
    state.filters = { ...BLANK_FILTERS, hideInsecure: state.filters.hideInsecure }
    commit()
  },

  get sort() {
    return state.sort
  },

  setSort(sort: SortKey) {
    state.sort = sort
    commit()
  },

  get favorites() {
    return state.favorites
  },

  isFavorite: (id: string) => state.favorites.includes(id),

  /** Returns the new state, so a caller can react without re-reading. */
  toggleFavorite(id: string) {
    const at = state.favorites.indexOf(id)
    state.favorites =
      at === -1
        ? [id, ...state.favorites]
        : state.favorites.filter((x) => x !== id)
    commit()
    return at === -1
  },

  get recent() {
    return state.recent
  },

  addRecent(id: string) {
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, RECENT_MAX)
    commit()
  },

  get playlists() {
    return state.playlists
  },

  addPlaylist(name: string, channels: Channel[]) {
    const id = `pl:${Date.now().toString(36)}`
    state.playlists = { ...state.playlists, [id]: { name, channels } }
    commit()
    return id
  },

  removePlaylist(id: string) {
    const next = { ...state.playlists }
    delete next[id]
    state.playlists = next
    commit()
  },

  clear() {
    state = blank()
    for (const key of [KEY, LEGACY_KEY]) {
      try {
        localStorage.removeItem(key)
      } catch {
        // Nothing to remove.
      }
    }
    commit()
  },
}

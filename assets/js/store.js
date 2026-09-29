/** Everything Tuner remembers, all of it in this browser only. */

const KEY = 'tuner.v1'
const RECENT_MAX = 40

const blank = () => ({
  favorites: [],
  recent: [],
  playlists: {},
  settings: { proxy: '', autoProxy: false, autoNext: true }
})

function read () {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank()
  } catch {
    return blank() // private mode, or a corrupted entry — carry on without memory
  }
}

let state = read()

function commit () {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota or private mode */ }
}

export const store = {
  get settings () { return { ...state.settings } },

  set (patch) {
    state.settings = { ...state.settings, ...patch }
    commit()
  },

  get favorites () { return state.favorites },
  isFavorite: id => state.favorites.includes(id),

  /** Returns the new state so callers can update a button without re-reading. */
  toggleFavorite (id) {
    const at = state.favorites.indexOf(id)
    if (at === -1) state.favorites.unshift(id)
    else state.favorites.splice(at, 1)
    commit()
    return at === -1
  },

  get recent () { return state.recent },

  addRecent (id) {
    state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, RECENT_MAX)
    commit()
  },

  get playlists () { return state.playlists },

  addPlaylist (name, channels) {
    const id = `pl:${Date.now().toString(36)}`
    state.playlists[id] = { name, channels }
    commit()
    return id
  },

  removePlaylist (id) {
    delete state.playlists[id]
    commit()
  },

  clear () {
    state = blank()
    try { localStorage.removeItem(KEY) } catch { /* nothing to remove */ }
  }
}

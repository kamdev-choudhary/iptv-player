import { store } from './store.js'
import { parseM3U } from './m3u.js'
import { Player, REASONS } from './player.js'

const PAGE = 60          // channels rendered per scroll batch
const HUES = ['--bar-cyan', '--bar-yellow', '--bar-green', '--bar-magenta', '--bar-red', '--bar-blue']

const $ = sel => document.querySelector(sel)
const el = {
  q: $('#q'), hint: $('#q-hint'), grid: $('#grid'), count: $('#count'), empty: $('#empty'),
  sentinel: $('#sentinel'), sort: $('#sort'), rail: $('#rail'), lib: $('#lib'),
  playlists: $('#playlists'), built: $('#built'), tpl: $('#tpl-card'),
  screen: $('#screen'), video: $('#video'), cardHead: $('#card-head'), cardBody: $('#card-body'),
  cardAct: $('#card-act'), now: $('#now'), nowLogo: $('#now-logo'), nowName: $('#now-name'),
  nowMeta: $('#now-meta'), fav: $('#fav'), nextSource: $('#next-source'),
  sourceWrap: $('#source-wrap'), sourcePick: $('#source-pick'), levelWrap: $('#level-wrap'), levelPick: $('#level-pick'), pip: $('#pip'),
  country: $('#f-country'), language: $('#f-language'), quality: $('#f-quality'), cats: $('#f-categories'),
  geo: $('#f-geo'), parttime: $('#f-parttime'), unmatched: $('#f-unmatched'),
  insecure: $('#f-insecure'), insecureWrap: $('#f-insecure-wrap')
}

const db = {
  channels: [], byId: new Map(), sources: Object.create(null),
  countries: {}, categories: {}, languages: {}, ready: false
}

const ui = {
  view: 'all', playlist: null, query: '', sort: 'name',
  cats: new Set(), results: [], shown: 0, tuning: null
}

const now = { channel: null, index: 0, sources: [], usedProxy: false }

const player = new Player(el.video, { onLevels: showLevels })

/* ── helpers ──────────────────────────────────────────────── */

const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const countryName = code => db.countries[code]?.[0] || code || ''
const flag = code => db.countries[code]?.[1] || ''

function hueFor (name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return HUES[h % HUES.length]
}

function initials (name) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

/** Sources for a channel: from the lazy-loaded index, or inline for playlists. */
const sourcesFor = ch => ch.s || db.sources[ch.i] || []

function qualityLabel (ch) {
  return ch.q ? `${ch.q}p` : '—'
}

/* ── load ─────────────────────────────────────────────────── */

async function boot () {
  restoreSettings()
  wire()

  let index
  try {
    index = await (await fetch('data/channels.json')).json()
  } catch {
    el.count.textContent = 'Channel list unavailable'
    el.empty.hidden = false
    el.empty.textContent = 'The channel list could not be loaded. Check your connection and reload.'
    return
  }

  Object.assign(db, {
    channels: index.channels,
    countries: index.countries,
    categories: index.categories,
    languages: index.languages
  })

  for (const c of index.channels) {
    db.byId.set(c.i, c)
    // One folded haystack per channel keeps searching 11k rows instant.
    c._h = fold([c.n, ...(c.a || []), countryName(c.c), (c.g || []).map(g => db.categories[g] || g).join(' ')].join(' '))
  }

  buildFilterOptions()
  el.built.textContent = new Date(index.generated).toLocaleDateString(undefined, { dateStyle: 'medium' })
  el.built.dateTime = index.generated

  readHash()
  refresh()

  // The bigger half of the data only matters once someone presses play.
  fetch('data/sources.json')
    .then(r => r.json())
    .then(payload => {
      db.sources = payload.sources
      db.ready = true
      if (ui.tuning) { const c = ui.tuning; ui.tuning = null; openChannel(c) }
    })
    .catch(() => { el.hint.textContent = 'Stream list unavailable — reload to try again' })
}

function buildFilterOptions () {
  const counts = new Map()
  for (const c of db.channels) if (c.c) counts.set(c.c, (counts.get(c.c) || 0) + 1)

  const countryOpts = [...counts.entries()]
    .sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])))
    .map(([code, n]) => `<option value="${code}">${flag(code)} ${countryName(code)} (${n})</option>`)
  el.country.insertAdjacentHTML('beforeend', countryOpts.join(''))

  const langCounts = new Map()
  for (const c of db.channels) for (const l of c.l || []) langCounts.set(l, (langCounts.get(l) || 0) + 1)
  const langOpts = [...langCounts.entries()]
    .filter(([, n]) => n > 2)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `<option value="${code}">${db.languages[code] || code} (${n})</option>`)
  el.language.insertAdjacentHTML('beforeend', langOpts.join(''))

  el.cats.innerHTML = Object.entries(db.categories)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) =>
      `<button type="button" class="chip" data-cat="${id}" aria-pressed="false" style="--hue:var(${hueFor(name)})">${name}</button>`)
    .join('')
}

/* ── search and filter ────────────────────────────────────── */

/** Higher is a better match; 0 drops the channel. */
function score (ch, tokens) {
  const name = fold(ch.n)
  let total = 0
  for (const t of tokens) {
    if (name.startsWith(t)) total += 100
    else if (name.includes(` ${t}`)) total += 70
    else if (name.includes(t)) total += 45
    else if (ch._h.includes(t)) total += 20
    else return 0
  }
  return total
}

function pool () {
  if (ui.view === 'favorites') return store.favorites.map(id => db.byId.get(id)).filter(Boolean)
  if (ui.view === 'recent') return store.recent.map(id => db.byId.get(id)).filter(Boolean)
  if (ui.view === 'playlist') return store.playlists[ui.playlist]?.channels || []
  return db.channels
}

function passes (ch) {
  const f = ui
  if (el.country.value && ch.c !== el.country.value) return false
  if (el.language.value && !(ch.l || []).includes(el.language.value)) return false
  if (+el.quality.value && (ch.q || 0) < +el.quality.value) return false
  if (f.cats.size && !(ch.g || []).some(g => f.cats.has(g))) return false
  if (el.unmatched.checked && ch.u) return false
  if (el.insecure.checked && ch.x) return false
  if (el.geo.checked || el.parttime.checked) {
    const src = sourcesFor(ch)
    // Before sources arrive these two filters cannot be judged, so nothing is hidden.
    if (src.length) {
      const allTagged = want => src.every(s => (s.b || []).includes(want))
      if (el.geo.checked && allTagged('Geo-blocked')) return false
      if (el.parttime.checked && allTagged('Not 24/7')) return false
    }
  }
  return true
}

function refresh () {
  const tokens = fold(ui.query).split(/\s+/).filter(Boolean)
  let list = pool().filter(passes)

  if (tokens.length) {
    list = list
      .map(ch => ({ ch, s: score(ch, tokens) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.ch.n.localeCompare(b.ch.n))
      .map(x => x.ch)
  } else if (ui.view !== 'recent' && ui.view !== 'favorites') {
    list = sortList(list)
  }

  ui.results = list
  ui.shown = 0
  el.grid.replaceChildren()
  paint()

  const n = list.length
  el.count.textContent = n
    ? `${n.toLocaleString()} ${n === 1 ? 'channel' : 'channels'}`
    : 'No matches'
  el.empty.hidden = n > 0
  if (!n) el.empty.textContent = emptyCopy()
  updateCounts()
}

function sortList (list) {
  const by = ui.sort
  if (by === 'quality') return [...list].sort((a, b) => (b.q || 0) - (a.q || 0) || a.n.localeCompare(b.n))
  if (by === 'sources') return [...list].sort((a, b) => (b.k || 0) - (a.k || 0) || a.n.localeCompare(b.n))
  return list
}

function emptyCopy () {
  if (ui.view === 'favorites') return 'Nothing saved yet. Use the heart on any channel to keep it here.'
  if (ui.view === 'recent') return 'Channels you watch will collect here.'
  if (ui.query) return `Nothing matches “${ui.query}”. Try a shorter word, or clear the filters.`
  return 'No channels match these filters.'
}

function updateCounts () {
  const set = (k, v) => { const n = document.querySelector(`[data-count="${k}"]`); if (n) n.textContent = v || '' }
  set('all', db.channels.length.toLocaleString())
  set('favorites', store.favorites.length || '')
  set('recent', store.recent.length || '')
}

/* ── grid ─────────────────────────────────────────────────── */

function paint () {
  const slice = ui.results.slice(ui.shown, ui.shown + PAGE)
  if (!slice.length) return
  const frag = document.createDocumentFragment()
  for (const ch of slice) frag.append(cell(ch))
  el.grid.append(frag)
  ui.shown += slice.length
}

function cell (ch) {
  const node = el.tpl.content.cloneNode(true)
  const li = node.querySelector('.cell')
  const art = node.querySelector('.cell__art')
  const img = art.querySelector('img')

  li.dataset.id = ch.i
  if (now.channel?.i === ch.i) li.classList.add('is-live')

  art.style.setProperty('--hue', `var(${hueFor(ch.n)})`)
  if (ch.o) {
    img.src = ch.o
    img.addEventListener('error', () => { art.dataset.mono = initials(ch.n) }, { once: true })
  } else {
    art.dataset.mono = initials(ch.n)
  }

  node.querySelector('.cell__name').textContent = ch.n
  node.querySelector('.cell__name').title = ch.n
  const bits = [flag(ch.c), qualityLabel(ch), ch.k > 1 ? `${ch.k} sources` : null].filter(Boolean)
  node.querySelector('.cell__meta').textContent = bits.join(' · ')

  const hit = node.querySelector('.cell__hit')
  hit.setAttribute('aria-label', `Watch ${ch.n}`)
  hit.addEventListener('click', () => openChannel(ch))

  const fav = node.querySelector('.cell__fav')
  fav.setAttribute('aria-pressed', String(store.isFavorite(ch.i)))
  fav.addEventListener('click', e => {
    e.stopPropagation()
    fav.setAttribute('aria-pressed', String(store.toggleFavorite(ch.i)))
    updateCounts()
    if (ui.view === 'favorites') refresh()
    if (now.channel?.i === ch.i) syncFavButton()
  })

  return node
}

/* ── player ───────────────────────────────────────────────── */

function setCard (state, head, body, actions = []) {
  el.screen.dataset.state = state
  el.cardHead.textContent = head
  el.cardBody.textContent = body
  el.cardAct.replaceChildren()
  el.cardAct.hidden = !actions.length
  for (const a of actions) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = a.primary ? 'btn btn--go' : 'btn'
    b.textContent = a.label
    b.addEventListener('click', a.run)
    el.cardAct.append(b)
  }
}

function openChannel (ch) {
  if (!ch.s && !db.ready) {
    // Someone pressed play before sources.json landed; queue it.
    ui.tuning = ch
    setCard('tuning', 'Tuning', `Loading the source list for ${ch.n}…`)
    el.screen.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    return
  }

  now.channel = ch
  now.sources = sourcesFor(ch)
  now.usedProxy = false
  store.addRecent(ch.i)
  updateCounts()

  history.replaceState(null, '', `#c=${encodeURIComponent(ch.i)}`)
  document.title = `${ch.n} — Tuner`

  for (const node of el.grid.querySelectorAll('.cell.is-live')) node.classList.remove('is-live')
  el.grid.querySelector(`.cell[data-id="${CSS.escape(ch.i)}"]`)?.classList.add('is-live')

  showNow()
  el.screen.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  tune(0)
}

function showNow () {
  const ch = now.channel
  el.now.hidden = false
  el.nowLogo.hidden = !ch.o
  if (ch.o) {
    el.nowLogo.onerror = () => { el.nowLogo.hidden = true }
    el.nowLogo.src = ch.o
  } else {
    el.nowLogo.removeAttribute('src')
  }
  el.nowName.textContent = ch.n

  const meta = [
    ch.c ? `${flag(ch.c)} ${countryName(ch.c)}` : null,
    (ch.g || []).map(g => db.categories[g] || g).join(', ') || null,
    (ch.l || []).map(l => db.languages[l] || l).slice(0, 2).join(', ') || null
  ].filter(Boolean)
  el.nowMeta.textContent = meta.join('  ·  ')

  el.sourcePick.replaceChildren()
  now.sources.forEach((s, i) => {
    const o = document.createElement('option')
    o.value = String(i)
    const notes = [s.q, s.f, ...(s.b || []), s.x ? 'http' : null, s.d ? 'DASH' : null, s.h ? 'needs headers' : null]
    o.textContent = `${i + 1}. ${notes.filter(Boolean).join(' · ') || 'source'}`
    el.sourcePick.append(o)
  })
  el.sourceWrap.hidden = now.sources.length < 2
  el.nextSource.hidden = now.sources.length < 2
  syncFavButton()
  showLevels([])
}

function syncFavButton () {
  const on = store.isFavorite(now.channel.i)
  el.fav.setAttribute('aria-pressed', String(on))
  el.fav.textContent = on ? 'Saved' : 'Save'
}

function showLevels (levels) {
  const real = levels.filter(l => l.height)
  el.levelWrap.hidden = real.length < 2
  el.levelPick.replaceChildren()
  if (real.length < 2) return
  const auto = document.createElement('option')
  auto.value = '-1'
  auto.textContent = 'Auto'
  el.levelPick.append(auto)
  for (const l of real.sort((a, b) => b.height - a.height)) {
    const o = document.createElement('option')
    o.value = String(l.i)
    o.textContent = `${l.height}p`
    el.levelPick.append(o)
  }
}

async function tune (index, { proxy = '' } = {}) {
  const ch = now.channel
  const source = now.sources[index]
  if (!source) return
  now.index = index
  el.sourcePick.value = String(index)

  const label = now.sources.length > 1 ? ` — source ${index + 1} of ${now.sources.length}` : ''
  setCard('tuning', 'Tuning', `Connecting to ${ch.n}${label}.`)

  try {
    await player.start(source, { proxy })
    if (now.channel !== ch) return
    el.screen.dataset.state = 'live'
    el.hint.textContent = ''
  } catch (err) {
    if (now.channel !== ch) return
    handleFailure(err.reason || 'network', index, proxy)
  }
}

function handleFailure (reason, index, usedProxy) {
  const info = REASONS[reason] || REASONS.network
  const settings = store.settings
  const remaining = now.sources.length - index - 1

  // A proxy only helps where the browser, not the stream, is the obstacle.
  const proxyHelps = ['cors', 'insecure', 'network', 'timeout', 'forbidden'].includes(reason)
  if (settings.autoProxy && settings.proxy && proxyHelps && !usedProxy) {
    tune(index, { proxy: settings.proxy })
    return
  }
  if (settings.autoNext && remaining > 0) {
    tune(index + 1)
    return
  }

  const actions = []
  if (remaining > 0) {
    actions.push({ label: `Try source ${index + 2}`, primary: true, run: () => tune(index + 1) })
  }
  if (settings.proxy && proxyHelps && !usedProxy) {
    actions.push({ label: 'Retry through proxy', run: () => tune(index, { proxy: settings.proxy }) })
  }
  if (!settings.proxy && reason === 'cors') {
    actions.push({ label: 'Set up a proxy', run: () => $('#settings-sheet').showModal() })
  }
  actions.push({ label: 'Retry', run: () => tune(index, { proxy: usedProxy }) })

  const tail = remaining > 0
    ? ` ${remaining} other ${remaining === 1 ? 'source' : 'sources'} listed for this channel.`
    : ' This was the last source listed.'
  setCard('dead', info.head, info.body + tail, actions)
}

/* ── playlists ────────────────────────────────────────────── */

function renderPlaylists () {
  const entries = Object.entries(store.playlists)
  el.playlists.hidden = !entries.length
  el.playlists.replaceChildren()
  for (const [id, pl] of entries) {
    const li = document.createElement('li')
    li.style.display = 'flex'
    li.style.alignItems = 'center'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'lib__item'
    btn.dataset.view = 'playlist'
    btn.dataset.playlist = id
    btn.innerHTML = `<span></span><span class="lib__n">${pl.channels.length}</span>`
    btn.firstChild.textContent = pl.name
    btn.addEventListener('click', () => selectView('playlist', id))

    const drop = document.createElement('button')
    drop.type = 'button'
    drop.className = 'lib__drop'
    drop.title = `Remove ${pl.name}`
    drop.textContent = '✕'
    drop.addEventListener('click', () => {
      for (const c of pl.channels) db.byId.delete(c.i)
      store.removePlaylist(id)
      renderPlaylists()
      if (ui.playlist === id) selectView('all')
    })

    li.append(btn, drop)
    el.playlists.append(li)
  }
}

function adoptPlaylist (name, channels) {
  const id = store.addPlaylist(name, channels)
  for (const c of channels) {
    c._h = fold([c.n, countryName(c.c), (c.g || []).join(' ')].join(' '))
    db.byId.set(c.i, c)
  }
  renderPlaylists()
  selectView('playlist', id)
}

async function loadPlaylist () {
  const err = $('#p-err')
  const file = $('#p-file').files?.[0]
  const url = $('#p-url').value.trim()
  err.hidden = true

  try {
    let text, name
    if (file) {
      text = await file.text()
      name = file.name.replace(/\.(m3u8?|txt)$/i, '')
    } else if (url) {
      const { proxy } = store.settings
      const res = await fetch(url).catch(() =>
        proxy ? fetch(proxy + encodeURIComponent(url)) : Promise.reject(new Error('blocked')))
      if (!res.ok) throw new Error(`The server answered ${res.status}.`)
      text = await res.text()
      name = new URL(url).hostname
    } else {
      throw new Error('Choose a file or paste a playlist URL.')
    }

    const channels = parseM3U(text)
    adoptPlaylist(name || 'My playlist', channels)
    $('#playlist-sheet').close()
    $('#p-url').value = ''
    $('#p-file').value = ''
  } catch (e) {
    err.hidden = false
    err.textContent = e.message === 'blocked'
      ? "That host doesn't allow browsers from other sites to read the playlist. Download the file and load it here, or set a proxy in Settings."
      : e.message
  }
}

/* ── views, routing, events ───────────────────────────────── */

function selectView (view, playlist = null) {
  ui.view = view
  ui.playlist = playlist
  for (const b of document.querySelectorAll('.lib__item')) {
    const on = b.dataset.view === view && (view !== 'playlist' || b.dataset.playlist === playlist)
    b.classList.toggle('is-on', on)
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current')
  }
  refresh()
}

function readHash () {
  const m = /[#&]c=([^&]+)/.exec(location.hash)
  if (!m) return
  const ch = db.byId.get(decodeURIComponent(m[1]))
  if (ch) openChannel(ch)
}

function restoreSettings () {
  const s = store.settings
  $('#s-proxy').value = s.proxy
  $('#s-autoproxy').checked = s.autoProxy
  $('#s-autonext').checked = s.autoNext
  // On an https page this filter is the difference between a working list and a broken one.
  if (location.protocol === 'https:') el.insecure.checked = true
  else el.insecureWrap.hidden = true
}

function debounce (fn, ms) {
  let t
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}

function wire () {
  const onSearch = debounce(() => { ui.query = el.q.value.trim(); refresh() }, 120)
  el.q.addEventListener('input', onSearch)

  el.sort.addEventListener('change', () => { ui.sort = el.sort.value; refresh() })
  for (const c of [el.country, el.language, el.quality, el.geo, el.parttime, el.unmatched, el.insecure]) {
    c.addEventListener('change', refresh)
  }

  el.cats.addEventListener('click', e => {
    const chip = e.target.closest('[data-cat]')
    if (!chip) return
    const id = chip.dataset.cat
    const on = ui.cats.has(id)
    if (on) ui.cats.delete(id); else ui.cats.add(id)
    chip.setAttribute('aria-pressed', String(!on))
    refresh()
  })

  el.lib.addEventListener('click', e => {
    const btn = e.target.closest('[data-view]')
    if (btn) selectView(btn.dataset.view)
  })

  $('#reset').addEventListener('click', () => {
    el.country.value = ''
    el.language.value = ''
    el.quality.value = '0'
    for (const box of [el.geo, el.parttime, el.unmatched]) box.checked = false
    ui.cats.clear()
    for (const chip of el.cats.querySelectorAll('[data-cat]')) chip.setAttribute('aria-pressed', 'false')
    el.q.value = ''
    ui.query = ''
    refresh()
  })

  $('#toggle-filters').addEventListener('click', e => {
    const open = el.rail.classList.toggle('is-open')
    e.currentTarget.setAttribute('aria-expanded', String(open))
  })

  el.nextSource.addEventListener('click', () => {
    const next = (now.index + 1) % now.sources.length
    tune(next)
  })
  el.sourcePick.addEventListener('change', () => tune(+el.sourcePick.value))
  el.levelPick.addEventListener('change', () => player.setLevel(+el.levelPick.value))
  el.fav.addEventListener('click', () => {
    store.toggleFavorite(now.channel.i)
    syncFavButton()
    updateCounts()
    el.grid.querySelector(`.cell[data-id="${CSS.escape(now.channel.i)}"] .cell__fav`)
      ?.setAttribute('aria-pressed', String(store.isFavorite(now.channel.i)))
    if (ui.view === 'favorites') refresh()
  })

  el.pip.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await el.video.requestPictureInPicture()
    } catch { el.hint.textContent = 'Picture in picture is unavailable here' }
  })

  $('#open-settings').addEventListener('click', () => $('#settings-sheet').showModal())
  $('#open-playlist').addEventListener('click', () => $('#playlist-sheet').showModal())
  $('#p-load').addEventListener('click', loadPlaylist)

  $('#settings-sheet').addEventListener('close', () => {
    store.set({
      proxy: $('#s-proxy').value.trim(),
      autoProxy: $('#s-autoproxy').checked,
      autoNext: $('#s-autonext').checked
    })
  })

  $('#wipe').addEventListener('click', () => {
    store.clear()
    restoreSettings()
    renderPlaylists()
    selectView('all')
    el.hint.textContent = 'Saved channels, history and playlists cleared'
  })

  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) paint()
  }, { rootMargin: '700px' }).observe(el.sentinel)

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)
    if (e.key === '/' && !typing) { e.preventDefault(); el.q.focus(); el.q.select() }
    if (e.key === 'Escape' && e.target === el.q) { el.q.value = ''; ui.query = ''; refresh() }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return
    if (!now.channel) return
    if (e.key === 'n') { e.preventDefault(); el.nextSource.click() }
    if (e.key === 'm') { e.preventDefault(); el.video.muted = !el.video.muted }
    if (e.key === 'f') { e.preventDefault(); el.video.requestFullscreen?.() }
    if (e.key === ' ') { e.preventDefault(); el.video.paused ? el.video.play() : el.video.pause() }
  })

  window.addEventListener('hashchange', readHash)
  renderPlaylists()
}

boot()

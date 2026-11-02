import { useEffect } from 'react'

export type Hotkeys = Record<string, (event: KeyboardEvent) => void>

/** True when the keystroke belongs to whatever the person is typing in. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Keyboard control for the panel. A single listener rather than one per
 * component, so two handlers can never both answer the same key.
 *
 * Keys are matched as `key` or `mod+key`, lower-cased.
 */
export function useHotkeys(keys: Hotkeys, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const name = event.key.toLowerCase()
      const handler = keys[mod ? `mod+${name}` : name]
      if (!handler) return
      // While typing, only the modifier combinations and Escape get through.
      if (isTyping(event.target) && !mod && name !== 'escape') return
      event.preventDefault()
      handler(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keys, enabled])
}

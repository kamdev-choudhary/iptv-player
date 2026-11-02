import { useCallback, useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'focusin'] as const

/**
 * True while someone is around, false once they have stopped moving.
 *
 * What the player's overlay hangs on: controls drawn over a picture have to
 * get out of the way of the picture, and the only signal for "still watching"
 * rather than "window still open" is movement.
 *
 * The listeners are attached to a node rather than returned as React handlers,
 * because a pointer-move handler on a non-interactive element is exactly the
 * kind of thing that should not look like an interaction.
 */
export function useActivity<T extends HTMLElement>(timeoutMs = 2600) {
  const ref = useRef<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState(true)

  /** Call from an event — a menu closing, say — to restart the countdown. */
  const wake = useCallback(() => {
    setActive(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setActive(false), timeoutMs)
  }, [timeoutMs])

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Fired from real events, so this is not a render-time state change.
    for (const event of ACTIVITY_EVENTS) {
      node.addEventListener(event, wake, { passive: true })
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) node.removeEventListener(event, wake)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [wake])

  return { ref, active, wake }
}

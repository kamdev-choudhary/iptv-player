import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pointer movement only. A tap is deliberately not in here: on a touch screen
 * it is the one gesture available, and it belongs to showing and hiding the
 * controls rather than to keeping them awake.
 */
const ACTIVITY_EVENTS = ['pointermove', 'focusin'] as const

/**
 * True while someone is around, false once they have stopped moving.
 *
 * What the player's overlay hangs on: controls drawn over a picture have to
 * get out of the way of the picture, and the only passive signal for "still
 * watching" rather than "window still open" is movement.
 *
 * The listeners are attached to a node rather than returned as React handlers,
 * because a pointer-move handler on a non-interactive element is exactly the
 * kind of thing that should not look like an interaction.
 */
export function useActivity<T extends HTMLElement>(timeoutMs = 2600) {
  const ref = useRef<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState(true)

  /** Show, and restart the countdown. Call from an event, such as a menu closing. */
  const wake = useCallback(() => {
    setActive(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setActive(false), timeoutMs)
  }, [timeoutMs])

  /** What a tap on the picture does: reveal the controls, or get them out of the way. */
  const toggle = useCallback(() => {
    setActive((shown) => {
      if (timer.current) clearTimeout(timer.current)
      if (!shown) timer.current = setTimeout(() => setActive(false), timeoutMs)
      return !shown
    })
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

  return { ref, active, wake, toggle }
}

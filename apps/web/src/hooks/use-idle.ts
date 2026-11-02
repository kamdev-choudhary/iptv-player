import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * True while someone is around, false once they have stopped moving.
 *
 * What the player's overlay is hung on: controls drawn over a picture have to
 * get out of the way of the picture, and the only signal for "still watching
 * rather than still here" is movement. Held at true whenever `pinned` is set,
 * so a menu left open does not vanish under the cursor.
 */
export function useActivity(timeoutMs = 2600, pinned = false) {
  const [active, setActive] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wake = useCallback(() => {
    setActive(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setActive(false), timeoutMs)
  }, [timeoutMs])

  useEffect(() => {
    if (pinned && timer.current) clearTimeout(timer.current)
    if (pinned) setActive(true)
  }, [pinned])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return { active: active || pinned, wake }
}

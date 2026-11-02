import { useEffect, useState } from 'react'

/**
 * Holds a value still for a moment. Search goes to Postgres on every change,
 * so a keystroke should not become a query.
 */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}

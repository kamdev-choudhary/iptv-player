import { useEffect, useState } from 'react'

/** Lags a fast-changing value, so an 11k-row re-query runs once per pause. */
export function useDebounced<T>(value: T, ms = 140) {
  const [slow, setSlow] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSlow(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return slow
}

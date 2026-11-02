import { useSyncExternalStore } from 'react'
import { prefs, type Prefs } from '@/lib/prefs.ts'

/** Subscribes a component to the persisted preferences. */
export function usePrefs(): Prefs {
  return useSyncExternalStore(prefs.subscribe, prefs.snapshot, prefs.snapshot)
}

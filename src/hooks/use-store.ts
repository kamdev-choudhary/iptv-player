import { useSyncExternalStore } from 'react'
import { store, type Persisted } from '@/lib/store'

/** Subscribes to the persisted store. Re-renders on any write. */
export function usePersisted(): Persisted {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
}

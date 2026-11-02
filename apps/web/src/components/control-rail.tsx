import { forwardRef } from 'react'
import { Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { Button, Input, Readout, Select } from '@tuner/ui'
import { SORT_KEYS, type Facets, type SortKey } from '@tuner/shared'

/**
 * The top rail. Search, sort, and the one number worth having on screen at all
 * times: how much of the catalog answered the last probe. A catalog of public
 * streams is roughly half dead at any moment, and showing that plainly is more
 * useful than a count that implies everything works.
 */

const SORT_LABEL: Record<SortKey, string> = {
  name: 'Name',
  quality: 'Resolution',
  sources: 'Most sources',
  live: 'Most live',
}

export interface ControlRailProps {
  search: string
  onSearch: (value: string) => void
  sort: SortKey
  onSort: (sort: SortKey) => void
  facets: Facets | undefined
  onOpenSettings: () => void
  onToggleFilters: () => void
}

export const ControlRail = forwardRef<HTMLInputElement, ControlRailProps>(function ControlRail(
  { search, onSearch, sort, onSort, facets, onOpenSettings, onToggleFilters },
  searchRef,
) {
  const liveShare =
    facets && facets.sourceCount > 0
      ? Math.round((facets.liveSourceCount / facets.sourceCount) * 100)
      : null

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-rail bg-panel px-3">
      <a
        href="#lineup"
        className="flex items-center gap-2 text-section leading-none text-readout"
        aria-label="Tuner"
      >
        <span aria-hidden className="size-2.5 rounded-pill bg-signal" />
        <span className="font-medium tracking-tight">Tuner</span>
      </a>

      <div className="relative ml-2 min-w-0 max-w-md flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-etch"
        />
        <Input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search channels"
          aria-label="Search channels"
          className="pl-7"
        />
      </div>

      <Select
        aria-label="Sort lineup"
        className="hidden w-36 sm:block"
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        options={SORT_KEYS.map((key) => ({ value: key, label: SORT_LABEL[key] }))}
      />

      {/* A plain statement of what works, not a badge pretending otherwise. */}
      <p className="ml-auto hidden items-baseline gap-1.5 lg:flex">
        <Readout
          value={facets ? facets.liveSourceCount.toLocaleString() : '—'}
          tone="live"
        />
        <span className="text-micro text-etch">
          of {facets ? facets.sourceCount.toLocaleString() : '—'} sources live
          {liveShare === null ? '' : ` (${liveShare}%)`}
        </span>
      </p>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleFilters}
        aria-label="Filters"
        className="xl:hidden"
      >
        <SlidersHorizontal className="size-4" />
      </Button>

      <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="Settings">
        <Settings2 className="size-4" />
      </Button>
    </header>
  )
})

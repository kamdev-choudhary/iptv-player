import type { RefObject } from 'react'
import { Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Input } from '@tuner/ui'

/**
 * The top bar: a mark, a search field, and two ways in. Nothing else.
 *
 * Counts, sort order and filters all used to live here. They are real, but
 * they are not what someone opening a television wants first, and a bar that
 * carries five controls makes the picture below it feel like a detail.
 */
export interface TopBarProps {
  searchRef: RefObject<HTMLInputElement | null>
  search: string
  onSearch: (value: string) => void
  /** Shown beside the filter button so a narrowed lineup is never a mystery. */
  activeFilters: number
  onOpenFilters: () => void
  onOpenSettings: () => void
}

export function TopBar({
  searchRef,
  search,
  onSearch,
  activeFilters,
  onOpenFilters,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <a
        href="#lineup"
        className="flex items-center gap-2 text-section leading-none"
        aria-label="Tuner"
      >
        <span aria-hidden className="size-2.5 rounded-pill bg-signal" />
        <span className="font-medium tracking-tight">Tuner</span>
      </a>

      <div className="relative mx-auto w-full min-w-0 max-w-sm">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search channels"
          aria-label="Search channels"
          className="h-9 rounded-pill pl-9"
        />
      </div>

      <Button variant="ghost" size="sm" onClick={onOpenFilters} className="shrink-0">
        <SlidersHorizontal />
        <span className="hidden md:inline">Filters</span>
        {activeFilters > 0 ? <Badge variant="signal">{activeFilters}</Badge> : null}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="shrink-0"
      >
        <Settings2 />
      </Button>
    </header>
  )
}

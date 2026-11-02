import { Settings2, SlidersHorizontal } from 'lucide-react'
import { Badge, Button } from '@tuner/ui'

/**
 * A title bar: the mark, and the two things that open over the page.
 *
 * Search used to sit here in the middle, which put it nearer the picture than
 * the list it actually filters. It lives at the top of the channel list now,
 * where what it does needs no explaining.
 */
export interface TopBarProps {
  /** Shown beside the filter button so a narrowed list is never a mystery. */
  activeFilters: number
  onOpenFilters: () => void
  onOpenSettings: () => void
}

export function TopBar({ activeFilters, onOpenFilters, onOpenSettings }: TopBarProps) {
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

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="sm" onClick={onOpenFilters}>
          <SlidersHorizontal />
          <span className="hidden sm:inline">Filters</span>
          {activeFilters > 0 ? <Badge variant="signal">{activeFilters}</Badge> : null}
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={onOpenSettings} aria-label="Settings">
          <Settings2 />
        </Button>
      </div>
    </header>
  )
}

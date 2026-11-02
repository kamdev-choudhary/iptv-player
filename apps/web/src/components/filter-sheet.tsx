import {
  Button,
  Check,
  Field,
  PanelSelect,
  Rule,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TallyCount,
} from '@tuner/ui'
import { SORT_KEYS, type Facets, type SortKey } from '@tuner/shared'
import { activeFilterCount, prefs, type Filters } from '@/lib/prefs.ts'

/**
 * Filters, behind a button.
 *
 * These used to be a permanent third column. They are useful perhaps once a
 * session, and the picture is useful continuously — so they sit in a panel
 * that slides over when asked and gets out of the way afterwards.
 */

const RESOLUTIONS = [
  { value: '360', label: '360p and up' },
  { value: '480', label: '480p and up' },
  { value: '720', label: '720p and up' },
  { value: '1080', label: '1080p and up' },
  { value: '2160', label: '4K only' },
]

const SORT_LABEL: Record<SortKey, string> = {
  name: 'Name',
  quality: 'Resolution',
  sources: 'Most sources',
  live: 'Most live',
}

export type LibraryView = 'all' | 'starred' | 'recent'

export interface FilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: Filters
  sort: SortKey
  facets: Facets | undefined
  view: LibraryView
  starredCount: number
  recentCount: number
  onView: (view: LibraryView) => void
}

export function FilterSheet({
  open,
  onOpenChange,
  filters,
  sort,
  facets,
  view,
  starredCount,
  recentCount,
  onView,
}: FilterSheetProps) {
  const active = activeFilterCount(filters)
  const dead = facets ? Math.max(0, facets.sourceCount - facets.liveSourceCount) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[21rem] gap-0">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the channel list. Kept for next time.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <Tabs value={view} onValueChange={(next) => onView(next as LibraryView)}>
            <TabsList className="w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="starred">
                Starred
                {starredCount ? <span className="tabular opacity-70">{starredCount}</span> : null}
              </TabsTrigger>
              <TabsTrigger value="recent">
                Recent
                {recentCount ? <span className="tabular opacity-70">{recentCount}</span> : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {view === 'all' ? (
            <>
              <Field label="Country" htmlFor="filter-country">
                <PanelSelect
                  id="filter-country"
                  placeholder="Anywhere"
                  value={filters.country}
                  onValueChange={(country) => prefs.setFilters({ country })}
                  options={(facets?.countries ?? []).map((c) => ({
                    value: c.code,
                    label: `${c.extra ?? ''} ${c.name}`.trim(),
                    count: c.count,
                  }))}
                />
              </Field>

              <Field label="Language" htmlFor="filter-language">
                <PanelSelect
                  id="filter-language"
                  placeholder="Any language"
                  value={filters.language}
                  onValueChange={(language) => prefs.setFilters({ language })}
                  options={(facets?.languages ?? []).map((l) => ({
                    value: l.code,
                    label: l.name,
                    count: l.count,
                  }))}
                />
              </Field>

              <Field label="Category" htmlFor="filter-category">
                <PanelSelect
                  id="filter-category"
                  placeholder="Any category"
                  value={filters.category[0] ?? ''}
                  onValueChange={(value) => prefs.setFilters({ category: value ? [value] : [] })}
                  options={(facets?.categories ?? []).map((c) => ({
                    value: c.code,
                    label: c.name,
                    count: c.count,
                  }))}
                />
              </Field>

              <Field label="Minimum resolution" htmlFor="filter-quality">
                <PanelSelect
                  id="filter-quality"
                  placeholder="Any resolution"
                  value={filters.minHeight ? String(filters.minHeight) : ''}
                  onValueChange={(value) => prefs.setFilters({ minHeight: Number(value) || 0 })}
                  options={RESOLUTIONS}
                />
              </Field>

              <Field label="Sort by" htmlFor="filter-sort">
                <PanelSelect
                  id="filter-sort"
                  value={sort}
                  onValueChange={(value) => prefs.set({ sort: (value || 'name') as SortKey })}
                  options={SORT_KEYS.map((key) => ({ value: key, label: SORT_LABEL[key] }))}
                />
              </Field>

              <div>
                <Rule>Hide what will not play</Rule>
                <Check
                  id="filter-live"
                  label="Confirmed live only"
                  checked={filters.liveOnly}
                  onChange={(liveOnly) => prefs.setFilters({ liveOnly })}
                />
                <Check
                  id="filter-playable"
                  label="Channels with nothing playable"
                  checked={filters.playableOnly}
                  onChange={(playableOnly) => prefs.setFilters({ playableOnly })}
                />
                <Check
                  id="filter-matched"
                  label="Unidentified streams"
                  checked={filters.matchedOnly}
                  onChange={(matchedOnly) => prefs.setFilters({ matchedOnly })}
                />
              </div>

              {active > 0 ? (
                <Button variant="panel" size="sm" onClick={() => prefs.resetFilters()}>
                  Clear {active} {active === 1 ? 'filter' : 'filters'}
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-small text-muted-foreground">
              {view === 'starred'
                ? 'Channels you have starred, newest first.'
                : 'Channels you have watched, most recent first.'}
            </p>
          )}

          {/* The honest summary of a public catalog: how much of it answered
              the last probe. No static build could show this. */}
          <div className="mt-auto pt-2">
            <Rule>Last probe</Rule>
            {facets ? (
              <>
                <TallyCount state="live" label="Live sources" count={facets.liveSourceCount} />
                <TallyCount state="fault" label="Not answering" count={dead} />
                <p className="pt-2 text-micro text-muted-foreground">
                  {facets.lastHealthCheckAt
                    ? `Checked ${new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(facets.lastHealthCheckAt))}`
                    : 'No probe has run yet. Start one from Settings.'}
                </p>
              </>
            ) : (
              <p className="text-micro text-muted-foreground">Waiting for the server.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

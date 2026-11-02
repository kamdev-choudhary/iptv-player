import { Button, Check, Field, Rule, Select, TallyCount } from '@tuner/ui'
import type { Facets } from '@tuner/shared'
import { activeFilterCount, prefs, type Filters } from '@/lib/prefs.ts'

/**
 * The filter panel, which is also the status panel.
 *
 * The state tallies at the bottom are not decoration: they are the honest
 * summary of a public catalog — how much of it answered the last probe, and
 * how much of it only plays through the server. That number is the thing a
 * static build could never show, so it gets a permanent place here.
 */

const RESOLUTIONS = [
  { value: '360', label: '360p and up' },
  { value: '480', label: '480p and up' },
  { value: '720', label: '720p and up' },
  { value: '1080', label: '1080p and up' },
  { value: '2160', label: '4K only' },
]

export interface FilterPanelProps {
  filters: Filters
  facets: Facets | undefined
  view: 'all' | 'starred' | 'recent'
  starredCount: number
  recentCount: number
  onView: (view: 'all' | 'starred' | 'recent') => void
}

export function FilterPanel({
  filters,
  facets,
  view,
  starredCount,
  recentCount,
  onView,
}: FilterPanelProps) {
  const active = activeFilterCount(filters)
  const dead = facets ? Math.max(0, facets.sourceCount - facets.liveSourceCount) : 0

  return (
    <aside
      aria-label="Filters"
      className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-rail bg-panel px-3 py-3"
    >
      <nav className="flex gap-1" aria-label="View">
        {(
          [
            ['all', 'All', null],
            ['starred', 'Starred', starredCount],
            ['recent', 'Recent', recentCount],
          ] as const
        ).map(([key, label, count]) => (
          <Button
            key={key}
            size="sm"
            variant={view === key ? 'primary' : 'ghost'}
            onClick={() => onView(key)}
            aria-pressed={view === key}
            className="flex-1"
          >
            {label}
            {count ? <span className="tabular text-micro opacity-70">{count}</span> : null}
          </Button>
        ))}
      </nav>

      {view === 'all' ? (
        <>
          <Field label="Country" htmlFor="filter-country">
            <Select
              id="filter-country"
              placeholder="Anywhere"
              value={filters.country}
              onChange={(e) => prefs.setFilters({ country: e.target.value })}
              options={(facets?.countries ?? []).map((c) => ({
                value: c.code,
                label: `${c.extra ?? ''} ${c.name}`.trim(),
                count: c.count,
              }))}
            />
          </Field>

          <Field label="Language" htmlFor="filter-language">
            <Select
              id="filter-language"
              placeholder="Any language"
              value={filters.language}
              onChange={(e) => prefs.setFilters({ language: e.target.value })}
              options={(facets?.languages ?? []).map((l) => ({
                value: l.code,
                label: l.name,
                count: l.count,
              }))}
            />
          </Field>

          <Field label="Category" htmlFor="filter-category">
            <Select
              id="filter-category"
              placeholder="Any category"
              value={filters.category[0] ?? ''}
              onChange={(e) =>
                prefs.setFilters({ category: e.target.value ? [e.target.value] : [] })
              }
              options={(facets?.categories ?? []).map((c) => ({
                value: c.code,
                label: c.name,
                count: c.count,
              }))}
            />
          </Field>

          <Field label="Minimum resolution" htmlFor="filter-quality">
            <Select
              id="filter-quality"
              placeholder="Any resolution"
              value={filters.minHeight ? String(filters.minHeight) : ''}
              onChange={(e) => prefs.setFilters({ minHeight: Number(e.target.value) || 0 })}
              options={RESOLUTIONS}
            />
          </Field>

          <div>
            <Rule>Narrow by state</Rule>
            <Check
              label="Confirmed live only"
              checked={filters.liveOnly}
              onChange={(liveOnly) => prefs.setFilters({ liveOnly })}
            />
            <Check
              label="Hide channels with nothing playable"
              checked={filters.playableOnly}
              onChange={(playableOnly) => prefs.setFilters({ playableOnly })}
            />
            <Check
              label="Hide unidentified streams"
              checked={filters.matchedOnly}
              onChange={(matchedOnly) => prefs.setFilters({ matchedOnly })}
            />
          </div>

          {active > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => prefs.resetFilters()}>
              Clear {active} {active === 1 ? 'filter' : 'filters'}
            </Button>
          ) : null}
        </>
      ) : (
        <p className="text-small text-etch">
          {view === 'starred'
            ? 'Channels you have starred, newest first.'
            : 'Channels you have watched, most recent first.'}
        </p>
      )}

      <div className="mt-auto">
        <Rule>Last probe</Rule>
        {facets ? (
          <>
            <TallyCount state="live" label="Live sources" count={facets.liveSourceCount} />
            <TallyCount state="fault" label="Not answering" count={dead} />
            <TallyCount state="off" label="Channels" count={facets.channelCount} />
            <p className="pt-2 text-micro text-etch/80">
              {facets.lastHealthCheckAt
                ? `Checked ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(facets.lastHealthCheckAt))}`
                : 'No probe has run yet. Start one from Settings.'}
            </p>
          </>
        ) : (
          <p className="text-micro text-etch">Waiting for the server.</p>
        )}
      </div>
    </aside>
  )
}

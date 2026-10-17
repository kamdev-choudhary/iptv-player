import { Clock, Heart, Radio, RotateCcw, Trash2, Tv } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { hueFor, type Catalog } from '@/lib/channels'
import type { Filters, LibraryView } from '@/lib/types'
import type { Playlist } from '@/lib/store'

export interface FacetCounts {
  countries: [string, number][]
  languages: [string, number][]
}

export interface AppSidebarProps {
  catalog: Catalog
  facets: FacetCounts
  view: LibraryView
  playlistId: string | null
  playlists: Record<string, Playlist>
  counts: { all: number; favorites: number; recent: number }
  filters: Filters
  activeFilters: number
  pageIsHttps: boolean
  onSelectView: (view: LibraryView, playlist?: string | null) => void
  onRemovePlaylist: (id: string) => void
  onChangeFilters: (patch: Partial<Filters>) => void
  onResetFilters: () => void
}

const QUALITIES = [
  { value: '0', label: 'Any quality' },
  { value: '480', label: '480p and up' },
  { value: '720', label: '720p and up' },
  { value: '1080', label: '1080p and up' },
]

export function AppSidebar({
  catalog,
  facets,
  view,
  playlistId,
  playlists,
  counts,
  filters,
  activeFilters,
  pageIsHttps,
  onSelectView,
  onRemovePlaylist,
  onChangeFilters,
  onResetFilters,
}: AppSidebarProps) {
  const categories = Object.entries(catalog.index?.categories ?? {}).sort((a, b) =>
    a[1].localeCompare(b[1]),
  )
  const playlistEntries = Object.entries(playlists)

  return (
    <Sidebar>
      <SidebarHeader className="px-2 pt-3">
        <SidebarGroupLabel>Library</SidebarGroupLabel>
        <SidebarMenu>
          <LibraryItem
            icon={<Tv />}
            label="All channels"
            count={counts.all}
            active={view === 'all'}
            onClick={() => onSelectView('all')}
          />
          <LibraryItem
            icon={<Heart />}
            label="Saved"
            count={counts.favorites}
            active={view === 'favorites'}
            onClick={() => onSelectView('favorites')}
          />
          <LibraryItem
            icon={<Clock />}
            label="Recent"
            count={counts.recent}
            active={view === 'recent'}
            onClick={() => onSelectView('recent')}
          />
        </SidebarMenu>

        {playlistEntries.length > 0 ? (
          <>
            <SidebarGroupLabel className="mt-2">Your playlists</SidebarGroupLabel>
            <SidebarMenu>
              {playlistEntries.map(([id, pl]) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={view === 'playlist' && playlistId === id}
                    onClick={() => onSelectView('playlist', id)}
                  >
                    <Radio />
                    <span className="truncate">{pl.name}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    showOnHover
                    aria-label={`Remove ${pl.name}`}
                    onClick={() => onRemovePlaylist(id)}
                  >
                    <Trash2 />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </>
        ) : null}
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupLabel>Narrow it down</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2.5 px-1">
            <Field label="Country" htmlFor="f-country">
              <Select
                value={filters.country || 'any'}
                onValueChange={(v) => onChangeFilters({ country: v === 'any' ? '' : v })}
              >
                <SelectTrigger id="f-country" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="any">Anywhere</SelectItem>
                  {facets.countries.map(([code, n]) => (
                    <SelectItem key={code} value={code}>
                      {catalog.index?.countries[code]?.[1]} {catalog.index?.countries[code]?.[0]}{' '}
                      <span className="text-muted-foreground">({n})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Language" htmlFor="f-language">
              <Select
                value={filters.language || 'any'}
                onValueChange={(v) => onChangeFilters({ language: v === 'any' ? '' : v })}
              >
                <SelectTrigger id="f-language" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="any">Any language</SelectItem>
                  {facets.languages.map(([code, n]) => (
                    <SelectItem key={code} value={code}>
                      {catalog.index?.languages[code] || code}{' '}
                      <span className="text-muted-foreground">({n})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Minimum quality" htmlFor="f-quality">
              <Select
                value={String(filters.quality)}
                onValueChange={(v) => onChangeFilters({ quality: Number(v) })}
              >
                <SelectTrigger id="f-quality" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITIES.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Category</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-wrap gap-1.5 px-1 pt-0.5">
            {categories.map(([id, name]) => {
              const on = filters.categories.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChangeFilters({
                      categories: on
                        ? filters.categories.filter((c) => c !== id)
                        : [...filters.categories, id],
                    })
                  }
                  style={{ '--hue': hueFor(name) } as React.CSSProperties}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
                    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                    on
                      ? 'hue-bg hue-text border-transparent font-medium'
                      : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Leave out</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2.5 px-1 pt-0.5">
            <Toggle
              id="f-geo"
              label="Geo-blocked sources"
              checked={filters.hideGeoBlocked}
              onChange={(v) => onChangeFilters({ hideGeoBlocked: v })}
            />
            <Toggle
              id="f-parttime"
              label="Part-time channels"
              checked={filters.hidePartTime}
              onChange={(v) => onChangeFilters({ hidePartTime: v })}
            />
            <Toggle
              id="f-unmatched"
              label="Unverified listings"
              checked={filters.hideUnmatched}
              onChange={(v) => onChangeFilters({ hideUnmatched: v })}
            />
            {pageIsHttps ? (
              <Toggle
                id="f-insecure"
                label="Sources this page can't load"
                hint="This page is served over https, which may not fetch a plain http stream."
                checked={filters.hideInsecure}
                onChange={(v) => onChangeFilters({ hideInsecure: v })}
              />
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button
          variant="ghost"
          size="sm"
          disabled={!activeFilters}
          onClick={onResetFilters}
          className="justify-start"
        >
          <RotateCcw className="size-4" />
          {activeFilters
            ? `Clear ${activeFilters} ${activeFilters === 1 ? 'filter' : 'filters'}`
            : 'No filters set'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

function LibraryItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} onClick={onClick}>
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
      {count > 0 ? (
        <SidebarMenuBadge className="readout">{count.toLocaleString()}</SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <div className="grid gap-0.5 leading-none">
        <Label htmlFor={id} className="text-xs leading-snug font-normal">
          {label}
        </Label>
        {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}

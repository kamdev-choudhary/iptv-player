import { useMemo, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChannelLogo } from '@/components/channel-logo'
import { countryName, flagOf, runQuery, type Catalog } from '@/lib/channels'
import { BLANK_FILTERS, type Channel } from '@/lib/types'

/**
 * The fast path: type a few letters, press Enter, the channel tunes in. It is
 * deliberately not the same job as the header field, which narrows the wall
 * you are browsing rather than picking one channel out of it.
 */
export function CommandPalette({
  open,
  onOpenChange,
  catalog,
  recent,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: Catalog
  recent: Channel[]
  onPick: (ch: Channel) => void
}) {
  const [term, setTerm] = useState('')

  const results = useMemo(() => {
    if (!catalog.index) return []
    if (!term.trim()) return recent.slice(0, 8)
    return runQuery({
      pool: catalog.index.channels,
      query: term,
      filters: BLANK_FILTERS,
      sort: 'name',
      catalog,
      preserveOrder: true,
    }).slice(0, 25)
  }, [term, catalog, recent])

  const heading = term.trim() ? 'Channels' : recent.length ? 'Pick up where you left off' : ''

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setTerm('')
      }}
      title="Jump to a channel"
      description="Type a channel name, then press Enter to tune it in."
      // The ranking already comes from runQuery; cmdk must not re-sort it.
      commandProps={{ shouldFilter: false }}
      className="sm:max-w-xl"
    >
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder="Type a channel name, country or category…"
      />
      <CommandList className="max-h-[22rem]">
        <CommandEmpty>
          {term.trim()
            ? `Nothing matches “${term.trim()}”. Try a shorter word.`
            : 'Type to find a channel. Enter tunes it in.'}
        </CommandEmpty>
        {results.length > 0 ? (
          <CommandGroup heading={heading}>
            {results.map((ch) => (
              <CommandItem
                key={ch.i}
                value={ch.i}
                onSelect={() => {
                  onPick(ch)
                  onOpenChange(false)
                  setTerm('')
                }}
                className="gap-3"
              >
                <ChannelLogo channel={ch} className="size-8 shrink-0 rounded-sm p-1" />
                <span className="min-w-0 flex-1 truncate font-medium">{ch.n}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {flagOf(catalog, ch.c)} {countryName(catalog, ch.c)}
                </span>
                {ch.q ? <span className="readout text-muted-foreground shrink-0">{ch.q}p</span> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}

import { ListPlus, Search, Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorBars } from '@/components/color-bars'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'
import type { Phase } from '@/hooks/use-playback'

export interface AppHeaderProps {
  query: string
  phase: Phase
  searchRef: React.Ref<HTMLInputElement>
  onQueryChange: (value: string) => void
  onOpenPalette: () => void
  onOpenPlaylist: () => void
  onOpenSettings: () => void
}

export function AppHeader({
  query,
  phase,
  searchRef,
  onQueryChange,
  onOpenPalette,
  onOpenPlaylist,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <header className="bg-background/85 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-2 sm:gap-3 sm:px-4">
        <SidebarTrigger className="size-9" />

        <a href="#channels" className="flex shrink-0 items-center gap-2">
          {/* The bars at their largest, and the only place they carry the name. */}
          <ColorBars phase={phase} className="h-6 w-7 rounded-[3px]" />
          <span className="ident hidden text-lg leading-none font-bold sm:inline">Tuner</span>
        </a>

        <div className="relative mx-auto flex w-full max-w-xl items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by channel, country or category"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search channels"
            className={cn(
              'h-9 pl-9 pr-16',
              '[&::-webkit-search-cancel-button]:appearance-none',
            )}
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 size-7"
              onClick={() => onQueryChange('')}
            >
              <X className="size-3.5" />
              <span className="sr-only">Clear search</span>
            </Button>
          ) : (
            <kbd className="readout text-muted-foreground bg-muted pointer-events-none absolute right-2 hidden rounded-sm border px-1.5 py-1 sm:block">
              /
            </kbd>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 lg:hidden"
                onClick={onOpenPalette}
              >
                <Search className="size-4" />
                <span className="sr-only">Jump to a channel</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Jump to a channel</TooltipContent>
          </Tooltip>

          <Button variant="ghost" size="sm" className="hidden lg:flex" onClick={onOpenPalette}>
            Jump to
            <kbd className="readout bg-muted ml-1 rounded-sm border px-1.5 py-1">⌘K</kbd>
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9" onClick={onOpenPlaylist}>
                <ListPlus className="size-4" />
                <span className="sr-only">Add a playlist</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add your own M3U playlist</TooltipContent>
          </Tooltip>

          <ModeToggle />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9" onClick={onOpenSettings}>
                <Settings className="size-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}

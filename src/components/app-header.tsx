import { ListPlus, MoreVertical, Search, Settings } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorBars } from '@/components/color-bars'
import { ModeToggle } from '@/components/mode-toggle'
import type { Phase } from '@/hooks/use-playback'

export interface AppHeaderProps {
  phase: Phase
  onOpenPalette: () => void
  onOpenPlaylist: () => void
  onOpenSettings: () => void
}

export function AppHeader({
  phase,
  onOpenPalette,
  onOpenPlaylist,
  onOpenSettings,
}: AppHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <header className="bg-background/90 sticky top-0 z-30 border-b-2 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-2 sm:gap-3 sm:px-3">
        <SidebarTrigger className="size-9 shrink-0" />

        <a href="#top" className="flex shrink-0 items-center gap-2">
          {/* The bars at their largest, and the only place they carry the name. */}
          <ColorBars phase={phase} className="h-6 w-7 rounded-[3px]" />
          <span className="ident hidden text-lg leading-none font-bold sm:inline">Tuner</span>
        </a>

        {/* Searching narrows the lineup, so that field lives with the lineup.
            What is left here jumps straight to one channel. */}
        <div className="flex-1" />

        {/* Everything collapses into one menu once the bar gets tight. */}
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenPalette}
            className="text-muted-foreground w-56 justify-start gap-2 font-normal lg:w-64"
          >
            <Search className="size-4" />
            Jump to a channel
            <kbd className="readout bg-background ml-auto rounded-sm border px-1.5 py-1">⌘K</kbd>
          </Button>
          <IconAction label="Add your own M3U playlist" onClick={onOpenPlaylist}>
            <ListPlus className="size-4" />
          </IconAction>
          <ModeToggle />
          <IconAction label="Settings" onClick={onOpenSettings}>
            <Settings className="size-4" />
          </IconAction>
        </div>

        <div className="flex shrink-0 items-center gap-1 md:hidden">
          <Button variant="ghost" size="icon" className="size-9" onClick={onOpenPalette}>
            <Search className="size-4" />
            <span className="sr-only">Jump to a channel</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9">
                <MoreVertical className="size-4" />
                <span className="sr-only">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onOpenPlaylist}>
                <ListPlus className="size-4" />
                Add a playlist
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
              >
                <Settings className="size-4 opacity-0" />
                Switch to {resolvedTheme === 'light' ? 'dark' : 'daylight'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpenSettings}>
                <Settings className="size-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" onClick={onClick}>
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

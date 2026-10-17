import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Dark is the resting state — this is a thing for watching television in a
 * dim room — but a daylight theme is here for anyone who wants it.
 */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme !== 'light'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          <span className="sr-only">Switch to {dark ? 'daylight' : 'dark'} theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {dark ? 'daylight' : 'dark'}</TooltipContent>
    </Tooltip>
  )
}

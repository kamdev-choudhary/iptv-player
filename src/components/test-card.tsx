import { Button } from '@/components/ui/button'
import { ColorBars } from '@/components/color-bars'
import { cn } from '@/lib/utils'
import type { CardAction, Phase } from '@/hooks/use-playback'

/**
 * The off-air slide. A real test card rather than a spinner: it is the one
 * place in the interface that gets to be loud, and it carries the whole
 * explanation of why a stream is not playing.
 */
export function TestCard({
  phase,
  head,
  body,
  actions,
  compact = false,
}: {
  phase: Phase
  head: string
  body: string
  actions: CardAction[]
  /** The resting slate, before a channel has been picked. */
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'scanlines absolute inset-0 grid place-items-center overflow-hidden',
        'bg-[#0a0d14] text-center',
        compact ? 'px-4 py-3' : 'px-5 py-6',
      )}
    >
      <ColorBars
        phase={phase}
        className={cn('absolute inset-x-0 top-0', compact ? 'h-1.5' : 'h-[7%] min-h-2')}
      />
      <ColorBars
        phase={phase}
        className={cn('absolute inset-x-0 bottom-0', compact ? 'h-1.5' : 'h-[3%] min-h-1.5')}
      />
      {phase === 'tuning' || phase === 'waiting' ? <span className="rolling" /> : null}

      {/* The centre plate, the way a card carries its station caption. */}
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-lg border border-white/12 bg-black/60',
          compact ? 'px-4 py-2.5' : 'px-5 py-4',
        )}
      >
        <p
          className={cn(
            'ident font-semibold text-balance text-white',
            compact ? 'text-base' : 'text-lg sm:text-xl',
            phase === 'dead' && 'text-[var(--bar-red)]',
            phase === 'live' && 'text-[var(--bar-cyan)]',
          )}
        >
          {head}
        </p>
        {body ? (
          <p
            className={cn(
              'mx-auto max-w-[52ch] leading-relaxed text-white/65',
              compact ? 'mt-1 text-xs' : 'mt-2 text-sm',
            )}
          >
            {body}
          </p>
        ) : null}

        {actions.length > 0 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {actions.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={a.primary ? 'default' : 'secondary'}
                onClick={a.run}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

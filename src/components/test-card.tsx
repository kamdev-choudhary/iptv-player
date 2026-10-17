import { Button } from '@/components/ui/button'
import { TestPattern } from '@/components/test-pattern'
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
}: {
  phase: Phase
  head: string
  body: string
  actions: CardAction[]
}) {
  return (
    <div
      className={cn(
        'scanlines absolute inset-0 grid place-items-center overflow-hidden',
        'bg-[#0a0d14] px-5 py-6 text-center',
      )}
    >
      <TestPattern phase={phase} />
      {phase === 'tuning' || phase === 'waiting' ? <span className="rolling" /> : null}

      {/* The centre plate, the way a card carries its station caption. */}
      <div
        className="relative z-10 w-full max-w-md rounded-lg border border-white/15 bg-black/85 px-5 py-4 backdrop-blur-md" 
      >
        <p
          className={cn(
            'ident text-lg font-semibold text-balance text-white sm:text-xl',
            phase === 'dead' && 'text-[var(--bar-red)]',
            phase === 'live' && 'text-[var(--bar-cyan)]',
          )}
        >
          {head}
        </p>
        {body ? (
          <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-white/65">{body}</p>
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

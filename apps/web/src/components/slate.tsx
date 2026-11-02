import { Button } from '@tuner/ui'
import type { HealthReason } from '@tuner/shared'
import type { StageAction } from '@/hooks/use-playback.ts'

/**
 * What the stage shows when there is no picture.
 *
 * Quiet on purpose. An earlier version drew a full broadcast test card —
 * alignment grid, geometry circle, colour bars — which was a costume: loud
 * enough to be the most eye-catching thing on the page, and saying nothing the
 * sentence underneath did not already say. What is left is a soft pool of
 * light behind the message, so the panel reads as waiting rather than broken.
 */
export function Slate({
  head,
  body,
  reason,
  actions,
  tuning,
}: {
  head: string
  body: string
  reason: HealthReason | null
  actions: StageAction[]
  tuning: boolean
}) {
  return (
    <div className="relative flex size-full items-center justify-center overflow-hidden px-6 py-8">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(70% 90% at 50% 45%, #1b2028 0%, #12151a 45%, #0b0d11 100%)',
        }}
      />

      <div className="relative w-full max-w-[42ch] text-center">
        <h2 className="text-display leading-tight text-balance">{head}</h2>
        {body ? (
          <p className="mx-auto mt-2 text-small leading-relaxed text-balance text-muted-foreground">
            {body}
          </p>
        ) : null}

        {tuning ? (
          <output
            className="mx-auto mt-6 block h-0.5 w-28 overflow-hidden rounded-pill bg-rail"
            aria-label="Connecting"
          >
            <span className="block h-full w-1/3 animate-[slate-sweep_1.4s_ease-in-out_infinite] rounded-pill bg-signal" />
          </output>
        ) : null}

        {actions.length > 0 ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.primary ? 'default' : 'panel'}
                size="sm"
                onClick={action.run}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {/* The machine-readable cause, for someone who wants to grep a log. */}
        {reason && reason !== 'ok' ? (
          <p className="tabular mt-6 text-micro text-muted-foreground/50">{reason}</p>
        ) : null}
      </div>
    </div>
  )
}

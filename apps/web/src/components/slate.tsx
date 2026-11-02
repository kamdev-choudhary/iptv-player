import { Button } from '@tuner/ui'
import type { HealthReason } from '@tuner/shared'
import type { StageAction } from '@/hooks/use-playback.ts'

/**
 * What the stage shows when there is no picture.
 *
 * A station with nothing to broadcast puts up a test card, and so does this —
 * an alignment grid and a geometry circle, nothing more. There is no content
 * here for it to compete with, which is the only reason it is allowed at all;
 * an earlier version also drew colour bars and a greyscale staircase, which
 * was a costume rather than a signal.
 */

function Pattern() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <pattern id="slate-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0v10" fill="none" stroke="currentColor" strokeWidth="0.3" />
        </pattern>
      </defs>

      <g className="text-rail">
        <rect width="160" height="90" fill="url(#slate-grid)" />
        {/* A true circle reads as an oval if the picture is being stretched. */}
        <circle cx="80" cy="45" r="34" fill="none" stroke="currentColor" strokeWidth="0.4" />
        <path d="M80 8v74M23 45h114" stroke="currentColor" strokeWidth="0.3" />
      </g>
    </svg>
  )
}

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
    <div className="relative flex size-full items-center justify-center overflow-hidden bg-[#101316] p-6">
      <Pattern />

      <div className="relative w-full max-w-[46ch] text-center">
        <h2 className="text-display leading-tight">{head}</h2>
        {body ? (
          <p className="mx-auto mt-2 text-small leading-relaxed text-muted-foreground">{body}</p>
        ) : null}

        {tuning ? (
          <output
            className="mx-auto mt-5 block h-0.5 w-32 overflow-hidden rounded-pill bg-rail"
            aria-label="Connecting"
          >
            <span className="block h-full w-1/3 animate-[slate-sweep_1.4s_ease-in-out_infinite] bg-signal" />
          </output>
        ) : null}

        {actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
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

        {reason ? (
          <p className="tabular mt-5 text-micro text-muted-foreground/60">{reason}</p>
        ) : null}
      </div>
    </div>
  )
}

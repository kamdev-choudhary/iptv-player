import { Button } from '@tuner/ui'
import type { HealthReason } from '@tuner/shared'
import type { StageAction } from '@/hooks/use-playback.ts'

/**
 * What the stage shows when there is no picture.
 *
 * This is the one place in the interface allowed to be bold. A station that
 * has nothing to broadcast puts up a test card, and so does this: a real
 * alignment pattern with the reason set into the slate, rather than a dialog
 * box apologising. The pattern is drawn, not decorative — the circle and grid
 * are the ones an engineer would use to check geometry, which is the right
 * reference for a panel that exists to tell you what is wrong.
 */

/** Drawn once as a `<defs>` grid, so the markup stays small. */
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
          <path d="M10 0H0v10" fill="none" stroke="#2a2f36" strokeWidth="0.4" />
        </pattern>
      </defs>

      <rect width="160" height="90" fill="#101316" />
      <rect width="160" height="90" fill="url(#slate-grid)" />

      {/* Geometry check: a true circle reads as an oval if the picture is stretched. */}
      <circle cx="80" cy="45" r="36" fill="none" stroke="#2a2f36" strokeWidth="0.5" />
      <circle cx="80" cy="45" r="24" fill="none" stroke="#2a2f36" strokeWidth="0.4" />
      <path d="M80 5v80M20 45h120" stroke="#2a2f36" strokeWidth="0.4" />

      {/* A greyscale staircase, for checking levels. */}
      <g>
        {['#16191d', '#2a2f36', '#4a525c', '#6d7681', '#8c949e', '#b9c0c7', '#e8eaed'].map(
          (fill, i) => (
            <rect key={fill} x={44 + i * 10} y="78" width="10" height="6" fill={fill} />
          ),
        )}
      </g>

      {/* The first four SMPTE bars, dimmed — a nod, not a costume. */}
      <g opacity="0.5">
        {['#55d6e3', '#d9a33a', '#46c27b', '#9d86e0'].map((fill, i) => (
          <rect key={fill} x={44 + i * 17.5} y="6" width="17.5" height="4" fill={fill} />
        ))}
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
    <div className="relative size-full overflow-hidden bg-[#101316]">
      <Pattern />

      {/* The slate itself: a plate over the pattern, as an ident caption would be. */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-[52ch] border  bg-background/92 px-5 py-4 backdrop-blur-[2px]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-display leading-tight text-foreground">{head}</h2>
            {reason ? (
              <span className="tabular text-micro text-muted-foreground">{reason}</span>
            ) : null}
          </div>

          {body ? (
            <p className="mt-2 text-small leading-relaxed text-muted-foreground">{body}</p>
          ) : null}

          {tuning ? (
            <output
              className="mt-4 block h-0.5 w-full overflow-hidden bg-rail"
              aria-label="Connecting"
            >
              <div className="h-full w-1/3 animate-[slate-sweep_1.4s_ease-in-out_infinite] bg-signal" />
            </output>
          ) : null}

          {actions.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.primary ? 'primary' : 'panel'}
                  size="sm"
                  onClick={action.run}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes slate-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}

import { cn } from '@/lib/utils'
import type { Phase } from '@/hooks/use-playback'

/**
 * A real SMPTE colour-bar card, in its three authentic bands: seven bars over
 * a reverse-blue row over the PLUGE strip. It is what a channel shows when it
 * has nothing to broadcast, which is exactly this screen's job.
 *
 * The chroma is the state readout — grey-ish at rest, full colour once frames
 * are flowing, drained toward red when a source has died.
 */

const BARS = ['#b9bec9', '#c7c34a', '#4dc9e8', '#4fbf78', '#c44fb0', '#d9524a', '#4f6ad4']

// Reverse blue row: blue, black, magenta, black, cyan, black, grey.
const REVERSE = ['#4f6ad4', '#0a0c10', '#c44fb0', '#0a0c10', '#4dc9e8', '#0a0c10', '#b9bec9']

export function TestPattern({ phase, className }: { phase: Phase; className?: string }) {
  const chroma = phase === 'live' ? 1 : phase === 'dead' ? 0.12 : 0.72
  const dim = phase === 'live' ? 1 : 0.5

  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 flex flex-col', className)}
      style={{
        filter: `saturate(${chroma}) brightness(${dim})`,
        transition: 'filter 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      <div className="flex min-h-0 flex-[62]">
        {BARS.map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      <div className="flex min-h-0 flex-[9]">
        {REVERSE.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>

      {/* PLUGE: -I, white, +Q, black, then the three sub-black steps that a
          monitor's brightness used to be set against. */}
      <div className="flex min-h-0 flex-[29]">
        <span className="flex-[5]" style={{ background: '#17314f' }} />
        <span className="flex-[5]" style={{ background: '#cfd3da' }} />
        <span className="flex-[5]" style={{ background: '#3b1f63' }} />
        <span className="flex-[5]" style={{ background: '#0a0c10' }} />
        <span className="flex-[1]" style={{ background: '#05070a' }} />
        <span className="flex-[1]" style={{ background: '#0a0c10' }} />
        <span className="flex-[1]" style={{ background: '#121620' }} />
        <span className="flex-[3]" style={{ background: '#0a0c10' }} />
      </div>
    </div>
  )
}

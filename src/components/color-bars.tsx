import { cn } from '@/lib/utils'
import type { Phase } from '@/hooks/use-playback'

/** The seven SMPTE bars, in broadcast order. */
const BARS = [
  'var(--bar-grey)',
  'var(--bar-yellow)',
  'var(--bar-cyan)',
  'var(--bar-green)',
  'var(--bar-magenta)',
  'var(--bar-red)',
  'var(--bar-blue)',
] as const

/**
 * The identity, and a state readout at the same time: the bars sit grey while
 * there is nothing to watch, come up to full chroma once frames are flowing,
 * and collapse toward red when a source has died.
 */
export function ColorBars({
  phase = 'idle',
  className,
  orientation = 'vertical',
}: {
  phase?: Phase
  className?: string
  orientation?: 'vertical' | 'horizontal'
}) {
  const chroma = phase === 'live' ? 1 : phase === 'dead' ? 0.12 : 0.85
  const dim = phase === 'live' ? 1 : 0.84

  return (
    <div
      aria-hidden
      className={cn('flex overflow-hidden', orientation === 'vertical' ? 'flex-row' : 'flex-col', className)}
    >
      {BARS.map((bar, i) => (
        <span
          key={i}
          className="flex-1 transition-[filter,opacity] duration-700 ease-out"
          style={{
            background: phase === 'dead' && i !== 5 ? 'var(--bar-grey)' : bar,
            filter: `saturate(${chroma}) brightness(${dim})`,
            // A staggered strike, so going live reads as one gesture.
            transitionDelay: `${i * 45}ms`,
          }}
        />
      ))}
    </div>
  )
}
